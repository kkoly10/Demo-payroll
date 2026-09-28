import type { ControlResult, DemoState } from "../types";
import { approvalReady, preparationReady, visibleIssues } from "../reconciliation";
import { evidenceKey, isGood } from "./model";
export function readiness(state: DemoState, results: ControlResult[]) {
  const key=evidenceKey(state.dataset);
  const unverified=state.actions.filter(a=>!["verified","invalidated","failed"].includes(a.status));
  const ready=approvalReady(results) && unverified.filter(a=>a.kind!=="closeout").length===0;
  const approved=ready && state.externalApproval===key;
  const submitted=approved && state.externalSubmission===key;
  const unavailable=results.some(c=>c.state==="unavailable");
  return { ready, approved, submitted, unverified, label: state.externalSubmission && !submitted ? "Submitted evidence needs review (demo)" : state.closed && submitted ? "Payroll closeout verified (demo)" : submitted ? "Submitted externally (demo)" : approved ? "Approved externally (demo)" : unavailable ? "Current evidence required" : ready ? "Ready for Paylocity approval" : "Payroll needs review" };
}
export function processStages(state: DemoState, results: ControlResult[]) {
  const d=state.dataset, gate=readiness(state,results), issues=visibleIssues(results);
  const prepIssues=issues.filter(c=>["raken-jonas","inputs-jonas"].includes(c.boundary));
  const finalIssues=issues.filter(c=>c.boundary==="jonas-paylocity");
  const reportPass=results.find(c=>c.id==="reports-jonas")?.state==="passed";
  return [
    { id:"inputs", title:"Inputs and period", status:results.filter(c=>c.boundary==="readiness" && c.sources?.some(s=>["raken","inputs"].includes(s))).every(isGood)?"Evidence received":"Review inputs", detail:"Raken time, salary / leave inputs, per-diem tracker and pay setup; one company and pay period.", automation:"Read and match evidence", human:"Source approvals remain required" },
    { id:"preparation", title:"Payroll preparation", status:prepIssues.length?`${prepIssues.length} need review`:preparationReady(d)?"Inputs validated":"Awaiting evidence", detail:"Employee identity, job-specific cost codes, pay types and documented adjustments. Source values stay intact.", automation:state.policy.preparation==="automatic"?"Prepare validated inputs automatically (demo)":"Preview prepared inputs", human:"Payroll decides ambiguous adjustments" },
    { id:"jonas", title:"Jonas payroll and controls", status:d.snapshots.jonas.health==="not-loaded"?"Not loaded":reportPass?"Report evidence available":"Updated reports required", detail:"Jonas input, error scan, deductions/taxes, Payroll Audit Report, Pay Journal and TIMEIMPORT. These are simulated source reports, not calculations performed here.", automation:"Supported import / execution to be confirmed", human:"Review proposed input before handoff" },
    { id:"transfer", title:"Transfer to Paylocity", status:d.snapshots.paylocity.health==="not-loaded"?"Not loaded":d.snapshots.paylocity.health==="current"?"Batch evidence received":"Current evidence required", detail:"Track preparation, import receipt and destination read-back separately. A successful request alone is not proof of a correct payroll.", automation:state.policy.transfer==="approval"?"Approval-gated handoff (demo)":state.policy.transfer==="preview"?"Prepare a transfer preview":"Manual handoff", human:"Transfer authorization is not payroll approval" },
    { id:"reconciliation", title:"Final reconciliation", status:gate.ready?"Required controls verified":finalIssues.length?`${finalIssues.length} final-payroll issues`:"Awaiting verified evidence", detail:"Jonas Pay Journal ↔ Paylocity Pre Process Payroll Register, plus expected employee / check completeness. Totals supplement employee-level controls.", automation:"Compare all applicable employees and components", human:"Investigate differences; no automatic winner" },
    { id:"approval", title:"Approve payroll", status:gate.approved?"External approval recorded (demo)":gate.ready?"Human decision required":"Waiting for reconciliation", detail:"Payroll reviews and approves the open batches in Paylocity. This application does not perform that approval.", automation:"Human required", human:"Separate human approval in Paylocity" },
    { id:"submission", title:"Submit payroll", status:gate.submitted?"External submission recorded (demo)":gate.approved?"Human submission required":"Waiting for approval", detail:"Review Paylocity audit findings and submit in Paylocity. No submit-payroll write path exists in this demo.", automation:"Human required", human:"Separate human submission in Paylocity" },
    { id:"closeout", title:"Jonas closeout", status:state.closed?"Closeout verified (demo)":gate.submitted?"Closeout can begin":"Waiting for submission", detail:"Accrual and Cost Allocation reports, End of Payroll Update, then completion notification. Only simulated closeout evidence is recorded here.", automation:state.policy.closeout==="approval"?"Approval-gated closeout preview":"Guided manual closeout", human:"Payroll controls closing the period" },
  ];
}
