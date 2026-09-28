import type { DemoDataset, Employee, EvidenceSource, Metric, PayrollLine, Value } from "../types";
import { PREP_METRICS, valueAt } from "./model";
import { makeLine } from "../../data/demo";

export function inputSource(e: Employee, metric: Metric): EvidenceSource {
  return e.role !== "Salary" && ["regular","overtime","pto","holiday","costCode"].includes(metric) ? "raken" : "inputs";
}
export function preparedValue(d: DemoDataset, e: Employee, metric: Metric): { raw: Value; value: Value; rule?: string; source: EvidenceSource; valid: boolean } {
  const source = inputSource(e,metric);
  const raw = valueAt(d, source, e.id, metric);
  if (metric === "regular" && d.rules.foreman40.includes(e.id) && e.role === "Foreman" && raw === 38) {
    return { raw, value: 40, source, valid: true, rule: "Illustrative approved foreman adjustment · 38 → 40 hours. Original time retained; confirm production eligibility with B&S." };
  }
  if (metric === "costCode") {
    const mapping = d.rules.approvedCostMappings[e.id];
    const rawCode = typeof raw === "string" ? raw.split(":").slice(1).join(":") : "";
    if (mapping && mapping.from === rawCode && mapping.job === e.job && d.rules.validCostCodes[e.job]?.includes(mapping.to)) {
      return { raw, value: `${e.job}:${mapping.to}`, source, valid: true, rule: `${mapping.reason} · ${mapping.by}. Source code retained; mapped only for payroll preparation.` };
    }
    return { raw, value: raw, source, valid: !!rawCode && !!d.rules.validCostCodes[e.job]?.includes(rawCode) };
  }
  return { raw, value: raw, source, valid: raw !== null };
}
export function preparedLines(d: DemoDataset): PayrollLine[] {
  return d.employees.filter(e=>e.expectedPay).flatMap(e => PREP_METRICS.flatMap(metric => {
    const p = preparedValue(d,e,metric);
    if (!p.valid || p.value === null) return [];
    const value = metric === "costCode" ? String(p.value).split(":").slice(1).join(":") : p.value;
    return [makeLine(e,"jonas",metric,value)];
  }));
}
