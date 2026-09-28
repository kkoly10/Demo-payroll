import type { ControlResult, DemoDataset, Employee, EvidenceSource, Metric, SourceFilter } from "./types";
import { FINAL_METRICS, METRICS, PREP_METRICS, SOURCE_LABELS, evidenceIds, fmt, inScope, isGood, sourceUsable, valueAt } from "./payroll/model";
import { preparedValue } from "./payroll/preparation";
import { REPORTS } from "../data/demo";

const make = (d: DemoDataset, fields: Partial<ControlResult> & Pick<ControlResult,"id"|"title"|"boundary"|"state">): ControlResult => ({
  severity: "info", detail: "", fromLabel: "", toLabel: "", from: null, expected: null, actual: null,
  evidenceIds: evidenceIds(d), ...fields,
});

export function reconcile(d: DemoDataset): ControlResult[] {
  const out: ControlResult[] = [];
  for (const source of ["raken","inputs","jonas","paylocity"] as EvidenceSource[]) {
    const s = d.snapshots[source];
    const usable = sourceUsable(d,source);
    const loaded = s.health !== "not-loaded";
    out.push(make(d, {
      id: `source-${source}`, boundary: "readiness", sources: [source], title: `${SOURCE_LABELS[source]} evidence`,
      state: usable ? "passed" : loaded ? "unavailable" : "pending", severity: usable ? "info" : "critical",
      detail: !loaded ? "Not loaded yet; comparisons are not ready, not failed checks." : !usable ? "Evidence is unavailable, incomplete, stale, or outside this payroll period. Last-known values are for reference only." : `Current synthetic snapshot ${s.id}; correct payroll period.`,
      fromLabel: SOURCE_LABELS[source], toLabel: "Payroll run", from: s.periodId, expected: d.run.periodId, actual: s.periodId,
    }));
    if (!loaded) continue;
    const lineIds = s.lines.map(l=>l.id);
    const invalidChecks = s.checks.some(c => !d.employees.some(e=>e.id===c.employeeId) || c.periodId!==d.run.periodId);
    const invalid = invalidChecks || new Set(lineIds).size !== lineIds.length || s.lines.some(l =>
      !d.employees.some(e=>e.id===l.employeeId) || !l.sourceEmployeeId ||
      !d.run.jonasPeriods.includes(l.periodId) ||
      (typeof l.value === "number" && (!Number.isFinite(l.value) || l.value < 0 || (METRICS[l.metric].unit === "money" && !Number.isInteger(l.value))))
    );
    out.push(make(d, { id: `integrity-${source}`, boundary: "readiness", sources: [source], title: `${SOURCE_LABELS[source]} record integrity`, state: invalid ? "review" : "passed", severity: "critical", detail: invalid ? "Duplicate, unknown, wrong-period, or invalid source lines must be investigated before proceeding." : "No duplicate line identifiers or invalid records in this snapshot." }));
    if (source === "jonas" || source === "paylocity") {
      const validReports = REPORTS[source].every(name => s.reports.some(r => r.name === name && r.revision === s.revision && r.result === "passed"));
      out.push(make(d, { id: `reports-${source}`, boundary:"readiness", sources:[source], title: `${SOURCE_LABELS[source]} report evidence`, state: validReports ? "passed" : "unavailable", severity:"critical", detail: validReports ? "Required report snapshots accompany this source revision. Their cross-system findings are evaluated separately." : "Updated source reports are needed. Earlier report versions cannot verify changed payroll data." }));
    }
  }
  for (const e of d.employees) {
    for (const source of ["raken","jonas","paylocity"] as const) {
      const applicable = source !== "raken" || e.role !== "Salary";
      const id = e.ids[source];
      const lines = d.snapshots[source].lines.filter(l=>l.employeeId===e.id);
      const valid = !!id && d.employees.filter(other=>other.ids[source]===id).length===1 && lines.every(l=>l.sourceEmployeeId===id);
      out.push(make(d, { id:`${e.id}-identity-${source}`, employeeId:e.id, boundary:"readiness", sources:[source], title:`${SOURCE_LABELS[source]} employee mapping`, state:!applicable?"not-applicable":valid?"passed":"review", severity:"critical", detail:!applicable?"This salary path does not require a Raken worker.":valid?`Explicit identity: ${id}. No name-based matching.`:"Missing, duplicate, or inconsistent cross-system employee identity. Do not compare by name." }));
    }
    if (!e.expectedPay) {
      const unexpected = d.snapshots.paylocity.checks.some(c=>c.employeeId===e.id);
      out.push(make(d, { id:`${e.id}-pay-expected`, employeeId:e.id, boundary:"jonas-paylocity", state:unexpected?"review":"not-applicable", severity:"critical", title:"Pay-run inclusion", detail:unexpected?"An explicitly excluded employee has a check. Investigate before approval.":"Explicitly excluded from this synthetic pay run." }));
      continue;
    }
    if (e.role !== "Salary") {
      const approval = d.rules.sourceApprovals[e.id];
      out.push(make(d, { id:`${e.id}-source-approval`, employeeId:e.id, boundary:"raken-jonas", title:"Supervisor approval", state:approval?"passed":"review", severity:"warning", detail:approval?`${approval.by} · ${approval.at}. Demo approval provenance only.`:"Required time approval is missing. Matching hours do not replace supervisor judgment." }));
    }
    for (const metric of PREP_METRICS) out.push(preparationControl(d,e,metric));
    const p = d.snapshots.paylocity;
    const checks = p.checks.filter(c=>c.employeeId===e.id);
    const loaded = p.health !== "not-loaded";
    const ready = sourceUsable(d,"paylocity") && sourceUsable(d,"jonas");
    const duplicates = new Set(checks.map(c=>c.id)).size !== checks.length || checks.filter(c=>c.category==="regular").length>1;
    out.push(make(d, { id:`${e.id}-check`, employeeId:e.id, boundary:"jonas-paylocity", title: duplicates ? "Possible duplicate check" : loaded && ready && !checks.length ? "Missing Paylocity check" : "Paylocity check completeness", state:!loaded?"pending":!ready?"unavailable":!checks.length||duplicates?"review":"passed", severity:"critical", fromLabel:"Expected employee", toLabel:"Paylocity", from:1, expected:1, actual:checks.length,
      detail:!loaded?"Paylocity has not been loaded yet. A check is not yet expected at this stage.":!ready?"Current source evidence is required to assess check completeness.":duplicates?"Multiple regular checks or duplicate identifiers found. Supplemental checks are assessed separately.":!checks.length?"This employee is expected to be paid, but no Paylocity check is present.":`${checks.length} check(s) represented, including any identified supplemental check.`,
    }));
    for (const metric of FINAL_METRICS) {
      const a=valueAt(d,"jonas",e.id,metric), b=valueAt(d,"paylocity",e.id,metric);
      const missing = a===null || b===null;
      // Compare earning/deduction codes as well as sums; equal totals can hide misclassification.
      const signature = (source:"jonas"|"paylocity") => {
        const values = new Map<string, number>();
        for (const l of d.snapshots[source].lines.filter(l=>l.employeeId===e.id && l.metric===metric)) values.set(l.code,(values.get(l.code)??0)+Number(l.value));
        return JSON.stringify([...values.entries()].sort(([x],[y])=>x.localeCompare(y)));
      };
      const codeMismatch = ["deductions","perDiemTaxed","perDiemNonTaxed","pto","holiday"].includes(metric) && signature("jonas")!==signature("paylocity");
      const matches = !missing && a===b && !codeMismatch;
      const notYet = !loaded || d.snapshots.jonas.health==="not-loaded" || (ready && !checks.length);
      out.push(make(d, { id:`${e.id}-final-${metric}`, employeeId:e.id, boundary:"jonas-paylocity", metric, title:`${METRICS[metric].label}${matches?" comparison":missing?" missing data":" mismatch"}`,
        state:notYet?"pending":!ready?"unavailable":matches?"passed":"review", severity:"warning", fromLabel:"Jonas Pay Journal", toLabel:"Paylocity Pre Process Register", from:a,expected:a,actual:b,
        detail:notYet?"Awaiting a loaded check and current reports; not treated as a zero value.":!ready?"Last-known values shown for reference; current evidence is required.":codeMismatch && a===b?"Totals agree, but earning/deduction code allocations differ. Investigate the underlying lines.":`Jonas: ${fmt(a,metric)} · Paylocity: ${fmt(b,metric)}. ${matches?"Compared values agree.":"The disagreement identifies the handoff to investigate, not which system is correct."}`,
      }));
    }
  }
  return out;
}

function preparationControl(d: DemoDataset, e: Employee, metric: Metric): ControlResult {
  const prep = preparedValue(d,e,metric);
  const boundary = prep.source === "raken" ? "raken-jonas" : "inputs-jonas";
  const j=valueAt(d,"jonas",e.id,metric);
  const available=sourceUsable(d,prep.source);
  const jonasLoaded=d.snapshots.jonas.health!=="not-loaded";
  const invalid=available && !prep.valid;
  const same=prep.valid && prep.value===j;
  return make(d, { id:`${e.id}-prep-${metric}`, employeeId:e.id, boundary, metric,
    title:invalid && metric==="costCode"?"Cost-code mapping needs review":`${METRICS[metric].label} preparation`,
    state:!available?"unavailable":invalid?"review":!jonasLoaded?"pending":!sourceUsable(d,"jonas")?"unavailable":same?(prep.rule?"expected":"passed"):"review",
    severity:"warning", fromLabel:SOURCE_LABELS[prep.source], toLabel:"Jonas", from:prep.raw,expected:prep.value,actual:j,rule:prep.rule,
    detail:invalid?"The source value cannot be prepared safely. Confirm a valid job-specific mapping or correct the input.":!jonasLoaded?"Payroll-ready value prepared; waiting for Jonas evidence to verify the handoff.":prep.rule?prep.rule:`${SOURCE_LABELS[prep.source]} expected ${fmt(prep.value,metric)}; Jonas ${fmt(j,metric)}. ${same?"Compared values agree.":"Investigate before deciding which record should change."}`,
  });
}
export function visibleIssues(results: ControlResult[]): ControlResult[] {
  return results.filter(c=>c.state==="review" || (!c.employeeId && c.state==="unavailable"))
    .sort((a,b)=>Number(b.severity==="critical")-Number(a.severity==="critical") || a.title.localeCompare(b.title));
}
export function employeeState(results: ControlResult[], id: string, scope: SourceFilter="all"): { label:string; state:ControlResult["state"] } {
  const relevant=results.filter(c=>c.employeeId===id && inScope(c,scope));
  const actual=scope==="all"?relevant:relevant.filter(c=>c.boundary===scope);
  if (!actual.length || actual.every(c=>c.state==="not-applicable")) return {label:"Not applicable",state:"not-applicable"};
  if (relevant.some(c=>c.state==="review")) return {label:"Needs review",state:"review"};
  if (relevant.some(c=>c.state==="unavailable")) return {label:"Cannot verify",state:"unavailable"};
  if (relevant.some(c=>c.state==="pending")) return {label:"Awaiting evidence",state:"pending"};
  if (relevant.some(c=>c.state==="expected")) return {label:"Verified adjustment",state:"expected"};
  return {label:"Reconciled",state:"passed"};
}
export function preparationReady(d: DemoDataset): boolean {
  if (!sourceUsable(d,"raken") || !sourceUsable(d,"inputs")) return false;
  const controls=reconcile(d);
  return !controls.some(c => (c.boundary==="raken-jonas" || c.boundary==="inputs-jonas" || (c.boundary==="readiness" && !c.sources?.includes("paylocity"))) && ["review","unavailable"].includes(c.state)) &&
    d.employees.filter(e=>e.expectedPay).every(e=>PREP_METRICS.every(m=>preparedValue(d,e,m).valid));
}
export function approvalReady(results: ControlResult[]): boolean { return results.length>0 && results.every(isGood); }
export { fmt, inScope, isGood, sourceUsable, valueAt } from "./payroll/model";
