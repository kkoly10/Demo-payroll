import type { Boundary, ControlResult, DemoDataset, EvidenceSource, Metric, PayrollLine, SourceFilter, SourceSnapshot, Value } from "../types";

export const SOURCES = ["raken", "jonas", "paylocity"] as const;
export const SOURCE_LABELS: Record<EvidenceSource, string> = { raken: "Raken", jonas: "Jonas", paylocity: "Paylocity", inputs: "Payroll inputs" };
export const BOUNDARY_LABELS: Record<Boundary, string> = {
  "raken-jonas": "Raken → Jonas", "inputs-jonas": "Payroll inputs → Jonas",
  "jonas-paylocity": "Jonas → Paylocity", readiness: "Data readiness",
};
export const METRICS: Record<Metric, { label: string; unit: "hours" | "money" | "code"; code: string }> = {
  regular: { label: "Regular hours", unit: "hours", code: "H" },
  overtime: { label: "Overtime", unit: "hours", code: "OT" },
  pto: { label: "PTO", unit: "hours", code: "H04" },
  holiday: { label: "Holiday", unit: "hours", code: "H05" },
  perDiemTaxed: { label: "Taxable per diem", unit: "money", code: "E12" },
  perDiemNonTaxed: { label: "Non-taxed per diem", unit: "money", code: "N03" },
  deductions: { label: "Deductions", unit: "money", code: "DEMO-DED" },
  rate: { label: "Pay rate", unit: "money", code: "DEMO-RATE" },
  costCode: { label: "Cost allocation", unit: "code", code: "LAB" },
};
export const FINAL_METRICS: Metric[] = ["regular", "overtime", "pto", "holiday", "perDiemTaxed", "perDiemNonTaxed", "deductions", "rate"];
export const PREP_METRICS: Metric[] = [...FINAL_METRICS, "costCode"];
export const MONEY_METRICS: Metric[] = ["rate", "deductions", "perDiemTaxed", "perDiemNonTaxed"];
export const isGood = (c: ControlResult) => ["passed", "expected", "not-applicable"].includes(c.state);
export const isIssue = (c: ControlResult) => ["review", "unavailable"].includes(c.state);
export function inScope(c: ControlResult, scope: SourceFilter): boolean {
  if (scope === "all") return true;
  if (c.boundary !== "readiness") return c.boundary === scope;
  const relevant = scope === "raken-jonas" ? ["raken", "jonas"] : ["jonas", "paylocity"];
  return !c.sources || c.sources.some(s => relevant.includes(s));
}
export const evidenceKey = (d: DemoDataset) => [...Object.values(d.snapshots).map(s => `${s.id}:${s.health}:${s.periodId}`), `rules:${d.rules.revision}`].join("|");
export const evidenceIds = (d: DemoDataset) => [...Object.values(d.snapshots).map(s => s.id), `rules-v${d.rules.revision}`];
export const employeeLines = (s: SourceSnapshot, id: string) => s.lines.filter(l => l.employeeId === id);
export function valueOf(lines: PayrollLine[], metric: Metric): Value {
  const matching = lines.filter(l => l.metric === metric);
  if (!matching.length) return null;
  if (metric === "costCode") return [...new Set(matching.map(l => `${l.job}:${l.value}`))].sort().join(", ");
  if (metric === "rate") {
    const unique = [...new Set(matching.map(l => l.value))];
    return unique.length === 1 ? unique[0] : unique.map(v => String(v)).sort().join(" / ");
  }
  return matching.every(l => typeof l.value === "number") ? matching.reduce((n, l) => n + Number(l.value), 0) : null;
}
export function valueAt(d: DemoDataset, source: EvidenceSource, id: string, metric: Metric): Value {
  const snapshot = d.snapshots[source];
  if (snapshot.health === "not-loaded") return null;
  if (source === "paylocity" && !snapshot.checks.some(c => c.employeeId === id)) return null;
  return valueOf(employeeLines(snapshot, id), metric);
}
export function fmt(value: Value, metric?: Metric): string {
  if (value === null) return "No data";
  if (typeof value === "string") return value;
  if (metric && METRICS[metric].unit === "money") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value) + (metric && METRICS[metric].unit === "hours" ? " h" : "");
}
export function sourceUsable(d: DemoDataset, source: EvidenceSource): boolean {
  const s = d.snapshots[source];
  return s.health === "current" && s.periodId === d.run.periodId && s.lines.every(l => d.run.jonasPeriods.includes(l.periodId));
}
export function totals(d: DemoDataset, source: "jonas" | "paylocity", metric: Metric): Value {
  if (!sourceUsable(d, source)) return null;
  return d.employees.filter(e => e.expectedPay).reduce((sum, e) => {
    const v = valueAt(d, source, e.id, metric);
    return sum + (typeof v === "number" ? v : 0);
  }, 0);
}
