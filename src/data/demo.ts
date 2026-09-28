import type { DemoDataset, Employee, EvidenceSource, Metric, PayrollLine, Scenario, SourceSnapshot } from "../lib/types";
import { METRICS } from "../lib/payroll/model";

const firstNames = [
  "Marcus","Emily","David","Sarah","James","Olivia","Anthony","Rachel","Steven","Monica",
  "Daniel","Priya","Jordan","Natalie","Andre","Maya","Christopher","Lauren","Victor","Alicia",
  "Thomas","Erica","Michael","Jasmine","Robert","Nicole","Kevin","Brianna","Samuel","Dana",
  "Jonathan","Felicia","Isaiah","Camille","Eric","Tanya","George","Monique","Ryan","Kiara",
  "Patrick","Vanessa","Terrence","Sofia","Caleb","Denise","Aaron","Whitney","Malcolm","Grace",
  "Noah","Elena"
];

const lastNames = [
  "Reed","Carter","Miles","Brooks","Cole","Bennett","Grant","Foster","Price","Hayes",
  "Wright","Patel","Morgan","Clark","Lewis","Diaz","Hall","Young","Turner","Scott",
  "Adams","King","Green","Hill","Baker","Rivera","Nelson","Campbell","Mitchell","Parker",
  "Evans","Edwards","Collins","Stewart","Morris","Rogers","Cook","Ward","Cooper","Bailey",
  "Bell","Murphy","Richardson","Cox","Howard","Torres","Peterson","Gray","Ramirez","James",
  "Watson","Wood"
];

export const SCENARIOS: Record<Scenario, { label: string; description: string }> = {
  review: { label: "Payroll review · 7 exceptions", description: "A payroll already prepared in Jonas and loaded into Paylocity. Seven issues remain; a foreman adjustment is correctly explained." },
  preparation: { label: "Preparation and transfer", description: "Start before Jonas and Paylocity are loaded. Preview payroll inputs, then demonstrate supported handoffs under the selected automation policy." },
  ready: { label: "Ready for human approval", description: "All required demo controls pass, including a documented upstream transformation. Payroll has not been approved or submitted." },
  deductions: { label: "Deduction discrepancy", description: "An additional deduction mismatch illustrates a final-payroll control beyond hours." },
  multiple: { label: "Two issues for one employee", description: "An upstream and a downstream discrepancy coexist. Resolving one must not hide the other." },
  stale: { label: "Paylocity unavailable", description: "Last available data remains inspectable, but approval readiness must be withheld." },
  "wrong-period": { label: "Wrong-period evidence", description: "A report for the wrong period cannot support this run, even when its numbers match." },
  unapproved: { label: "Time awaiting supervisor", description: "Matching numbers are insufficient when required source approval is missing." },
};
export const INITIAL_TIME = "2026-09-28T12:09:00.000Z";
export const PERIOD = "2026-09-26";
export const REPORTS: Record<EvidenceSource, string[]> = {
  raken: ["Time Card by Worker"], inputs: ["Salary / leave input", "Per-diem tracker", "Approved pay setup (illustrative)"],
  jonas: ["Calculate Deductions & Taxes", "Payroll Audit Report", "Pay Journal", "TIMEIMPORT"],
  paylocity: ["No Pay Prior To Process", "Pre Process Payroll Register"],
};
const codes = ["1000", "1100", "1200", "1400", "2100"];
export function makeLine(e: Employee, source: EvidenceSource, metric: Metric, value: number | string): PayrollLine {
  return {
    id: `${source}-${e.id}-${metric}`, employeeId: e.id,
    sourceEmployeeId: source === "inputs" ? `INPUT-${e.id}` : e.ids[source] ?? "",
    periodId: PERIOD, workDate: PERIOD, batchId: `${source}-weekly-demo`,
    metric, value, code: METRICS[metric].code, job: e.job,
  };
}
export function buildDemoDataset(scenario: Scenario = "review"): DemoDataset {
  const employees: Employee[] = firstNames.map((name, i) => ({
    id: `EMP-${1001+i}`, name: `${name} ${lastNames[i]}`,
    role: i === 4 ? "Foreman" : i % 9 === 0 ? "Salary" : i % 6 === 0 ? "Driver" : "Field",
    expectedPay: true, ids: { raken: i % 9 === 0 ? null : `R-${180+i}`, jonas: `${180+i}`.padStart(5,"0"), paylocity: `P-${180+i}` },
    job: `30${11+i%8}`,
  }));
  const makeSnapshot = (source: EvidenceSource, i: number): SourceSnapshot => ({
    id: `${source}-v1`, source, revision: 1, periodId: PERIOD, capturedAt: `2026-09-28T12:0${4+i}:00.000Z`, health: "current",
    lines: [], checks: [], reports: REPORTS[source].map(name => ({ name, revision: 1, result: "passed" })),
  });
  const snapshots: Record<EvidenceSource, SourceSnapshot> = { raken: makeSnapshot("raken",0), jonas: makeSnapshot("jonas",1), paylocity: makeSnapshot("paylocity",2), inputs: makeSnapshot("inputs",3) };
  const d: DemoDataset = {
    run: { id: "DEMO-WKLY-20260926", company: "B&S · synthetic payroll", periodId: PERIOD, periodLabel: "Sep 20 – Sep 26, 2026", checkDate: "2026-10-02", jonasPeriods: [PERIOD] },
    employees, snapshots,
    rules: { revision: 1, foreman40: ["EMP-1005"], sourceApprovals: {}, approvedCostMappings: {}, validCostCodes: {} },
  };
  for (const [i,e] of employees.entries()) {
    const pto = e.role === "Salary" || e.id === "EMP-1031" ? 8 : 0;
    const values: Record<Metric, number | string> = {
      regular: 40-pto, overtime: e.role === "Salary" || e.role === "Foreman" ? 0 : i % 4 === 0 ? 4 : 0,
      pto, holiday: 0, perDiemTaxed: e.role === "Field" && i % 8 === 1 ? 12500 : 0,
      perDiemNonTaxed: e.role === "Field" && i % 8 === 5 ? 25000 : 0,
      deductions: 4500 + i % 3 * 1250, rate: 2450 + i % 12 * 125, costCode: codes[i%codes.length],
    };
    if (e.id === "EMP-1003") values.overtime = 8;
    if (e.id === "EMP-1016") values.rate = 3125;
    if (e.id === "EMP-1024") values.perDiemNonTaxed = 30000;
    d.rules.validCostCodes[e.job] = [...codes];
    for (const metric of Object.keys(values) as Metric[]) {
      snapshots.jonas.lines.push(makeLine(e,"jonas",metric,values[metric]));
      snapshots.paylocity.lines.push(makeLine(e,"paylocity",metric,values[metric]));
      const timeOrCode = ["regular","overtime","pto","holiday","costCode"].includes(metric);
      if (e.role !== "Salary" && timeOrCode) {
        snapshots.raken.lines.push(makeLine(e,"raken",metric,e.role === "Foreman" && metric === "regular" ? 38 : values[metric]));
      }
      // Supporting payroll inputs are not invented Raken values.
      if (!timeOrCode || e.role === "Salary") snapshots.inputs.lines.push(makeLine(e,"inputs",metric,values[metric]));
    }
    snapshots.paylocity.checks.push({ id: `CHECK-${e.id}`, employeeId: e.id, batchId: "paylocity-weekly-demo", periodId: PERIOD, category: "regular" });
    if (e.role !== "Salary") d.rules.sourceApprovals[e.id] = { by: "Supervisor Demo User", at: "2026-09-28T11:45:00.000Z" };
  }
  const set = (source: EvidenceSource, id: string, metric: Metric, value: number | string) => {
    const line = snapshots[source].lines.find(l => l.employeeId===id && l.metric===metric);
    if (line) line.value = value;
  };
  set("raken","EMP-1011","costCode","9999");
  if (scenario === "ready") {
    d.rules.approvedCostMappings["EMP-1011"] = {
      from: "9999", to: "1000", job: employees.find(e => e.id === "EMP-1011")!.job,
      reason: "Synthetic job catalog mapping confirmed before payroll preparation.", by: "Payroll Demo User",
    };
    d.rules.revision = 2;
  } else if (scenario === "preparation") {
    for (const source of ["jonas","paylocity"] as const) {
      snapshots[source].lines = []; snapshots[source].checks = []; snapshots[source].reports = []; snapshots[source].health = "not-loaded";
    }
  } else {
    snapshots.paylocity.checks = snapshots.paylocity.checks.filter(c => c.employeeId !== "EMP-1007");
    snapshots.paylocity.lines = snapshots.paylocity.lines.filter(l => l.employeeId !== "EMP-1007");
    set("paylocity","EMP-1040","regular",38);
    set("paylocity","EMP-1003","overtime",6);
    set("paylocity","EMP-1031","pto",0);
    set("paylocity","EMP-1024","perDiemNonTaxed",0);
    set("paylocity","EMP-1016","rate",3075);
  }
  if (scenario === "deductions") set("paylocity","EMP-1002","deductions",2500);
  if (scenario === "multiple") { set("raken","EMP-1003","regular",38); set("paylocity","EMP-1003","regular",36); }
  if (scenario === "stale") snapshots.paylocity.health = "unavailable";
  if (scenario === "wrong-period") snapshots.paylocity.periodId = "2026-09-19";
  if (scenario === "unapproved") delete d.rules.sourceApprovals["EMP-1002"];
  return d;
}
