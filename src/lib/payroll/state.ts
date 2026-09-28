import type { ActionKind, ActionProposal, AutomationPolicy, DemoState, EvidenceSource, PayrollLine, Scenario, SourceName } from "../types";
import { buildDemoDataset, INITIAL_TIME, REPORTS } from "../../data/demo";
import { preparationReady, reconcile, sourceUsable, visibleIssues } from "../reconciliation";
import { evidenceIds, evidenceKey, METRICS, valueAt } from "./model";
import { preparedLines } from "./preparation";
import { readiness } from "./workflow";

export const DEFAULT_POLICY: AutomationPolicy = { collection:"automatic", preparation:"preview", transfer:"manual", corrections:"manual", closeout:"manual" };
export function createState(scenario: Scenario = "review"): DemoState {
  const dataset=buildDemoDataset(scenario);
  return { dataset,history:[],scenario,policy:{...DEFAULT_POLICY},actions:[],outcome:"normal",closed:false,notice:"",audit:[{
    id:"event-1",at:INITIAL_TIME,actor:"Demo system",type:"Evidence loaded",detail:"Synthetic source snapshots loaded; comparison results calculated. No live systems connected.",evidenceIds:evidenceIds(dataset),
  }] };
}
export type DemoAction =
  | {type:"RESET"; scenario?:Scenario; at:string}
  | {type:"POLICY"; policy:AutomationPolicy; at:string}
  | {type:"OUTCOME"; outcome:DemoState["outcome"]; at:string}
  | {type:"NOTICE"; text:string}
  | {type:"REVIEW"; controlId:string; note:string; at:string}
  | {type:"PROPOSE"; controlId?:string; kind:ActionKind; target?:EvidenceSource; note:string; costCode?:string; at:string}
  | {type:"AUTHORIZE"|"EXECUTE"|"VERIFY"|"EXTERNAL_UPDATE"|"CANCEL"; id:string; at:string}
  | {type:"REFRESH"; source?:EvidenceSource; at:string}
  | {type:"EXTERNAL_APPROVAL"|"EXTERNAL_SUBMISSION"|"EXTERNAL_CLOSEOUT"; at:string}
  | {type:"EXPORT"; format:string; at:string};

function event(state:DemoState, at:string, type:string, detail:string, action?:ActionProposal, employeeId?:string): DemoState {
  return {...state,audit:[{id:`event-${state.audit.length+1}`,at,actor:type.startsWith("External")?"Payroll Demo User (external step)":"Payroll Demo User",type,detail,employeeId:employeeId??action?.employeeId,actionId:action?.id,changes:action?.changes,evidenceIds:evidenceIds(state.dataset)},...state.audit],notice:detail};
}
function failure(state:DemoState, detail:string):DemoState { return {...state,notice:detail}; }
export function actionMode(state:DemoState, kind:ActionKind) {
  return kind==="closeout"?state.policy.closeout:kind==="jonas-input"||kind==="paylocity-transfer"?state.policy.transfer:state.policy.corrections;
}
function propose(state:DemoState, action:Extract<DemoAction,{type:"PROPOSE"}>): DemoState {
  const d=state.dataset;
  if (state.externalSubmission && action.kind!=="closeout") return failure(state,"This demo run has recorded external submission. Reset the scenario to demonstrate pre-submission changes.");
  if (action.note.trim().length<6) return failure(state,"Record the finding or handoff reason before preparing a change.");
  const results=reconcile(d);
  const control=results.find(c=>c.id===action.controlId);
  let target:EvidenceSource=action.target??"paylocity";
  let payloadLines:PayrollLine[]=[];
  const changes:ActionProposal["changes"]=[];
  let title="";
  let createCheck=false;
  const e=d.employees.find(e=>e.id===control?.employeeId);
  if (action.kind==="mapping") {
    if (!control || control.state!=="review" || control.metric!=="costCode" || !e) return failure(state,"Only an open cost-code control can receive a reviewed mapping.");
    const code=action.costCode;
    if (!code || !d.rules.validCostCodes[e.job]?.includes(code)) return failure(state,"Choose a code verified in this synthetic job's Jonas catalog.");
    target="inputs"; title=`Confirm payroll cost mapping for ${e.name}`;
    changes.push({employeeId:e.id,metric:"costCode",before:control.from,after:`${e.job}:${code}`});
  } else if (action.kind==="correction") {
    if (!control || control.state!=="review" || !e) return failure(state,"This control no longer needs a correction. Review current evidence.");
    if (control.id===`${e.id}-check`) {
      if (d.snapshots.paylocity.checks.some(c=>c.employeeId===e.id)) return failure(state,"Possible duplicate checks require investigation, not automatic deletion or replacement.");
      target="paylocity"; createCheck=true;
      payloadLines=d.snapshots.jonas.lines.filter(l=>l.employeeId===e.id);
      title=`Create the missing check for ${e.name}`;
    } else if (control.metric) {
      const metric=control.metric;
      if (control.boundary==="jonas-paylocity") {
        if (target!=="jonas" && target!=="paylocity") return failure(state,"Choose the system that Payroll determined needs correction.");
        const confirmed=target==="paylocity"?"jonas":"paylocity";
        if (!sourceUsable(d,confirmed)) return failure(state,"The confirmed source must have current evidence.");
        payloadLines=d.snapshots[confirmed].lines.filter(l=>l.employeeId===e.id && l.metric===metric);
      } else {
        if (target==="jonas") payloadLines=preparedLines(d).filter(l=>l.employeeId===e.id && l.metric===metric);
        else if (target==="raken" && control.boundary==="raken-jonas" && !control.rule) payloadLines=d.snapshots.jonas.lines.filter(l=>l.employeeId===e.id && l.metric===metric);
        else return failure(state,"This decision needs a confirmed payroll input or approved mapping; the tool cannot invent authority.");
      }
      title=`Correct ${METRICS[metric].label.toLowerCase()} in ${target==="jonas"?"Jonas":target==="raken"?"Raken":"Paylocity"}`;
    } else return failure(state,"This control requires supporting evidence or a manual investigation, not a numeric correction.");
    if (!payloadLines.length || !sourceUsable(d,target)) return failure(state,"A correction requires available source lines and a current destination snapshot.");
    const metrics=[...new Set(payloadLines.map(l=>l.metric))];
    for (const metric of metrics) {
      const lines=payloadLines.filter(l=>l.metric===metric);
      const after=metric==="costCode"?[...new Set(lines.map(l=>`${l.job}:${l.value}`))].sort().join(", "):metric==="rate"?lines[0].value:lines.reduce((s,l)=>s+Number(l.value),0);
      changes.push({employeeId:e.id,metric,before:valueAt(d,target,e.id,metric),after});
    }
  } else if (action.kind==="jonas-input") {
    target="jonas";
    if (d.snapshots.jonas.health!=="not-loaded") return failure(state,"Jonas is already loaded. Use target-specific corrections; a full re-import could duplicate payroll.");
    if (!preparationReady(d)) return failure(state,"Resolve preparation and mapping issues before the Jonas handoff.");
    payloadLines=preparedLines(d); title="Load prepared payroll into Jonas";
  } else if (action.kind==="paylocity-transfer") {
    target="paylocity";
    if (d.snapshots.paylocity.health!=="not-loaded") return failure(state,"Paylocity is already loaded. Use individual corrections instead of importing the run again.");
    if (!sourceUsable(d,"jonas") || visibleIssues(results).some(c=>c.boundary!=="jonas-paylocity") || results.some(c=>c.id==="reports-jonas"&&c.state!=="passed")) return failure(state,"Current Jonas reports and resolved upstream controls are required before transfer.");
    payloadLines=d.snapshots.jonas.lines.filter(l=>d.employees.find(e=>e.id===l.employeeId)?.expectedPay); title="Transfer prepared payroll to Paylocity";
  } else if (action.kind==="closeout") {
    if (!readiness(state,results).submitted || state.closed) return failure(state,"Verified external submission is required before closeout.");
    target="jonas";title="Complete Jonas closeout";
  }
  if (action.kind==="correction" && results.some(c=>["review","unavailable"].includes(c.state) && c.boundary==="readiness" && (!c.employeeId || c.employeeId===e?.id))) return failure(state,"Resolve source readiness and identity blockers before preparing a write.");
  payloadLines=payloadLines.map(l=>({...l,sourceEmployeeId:d.employees.find(e=>e.id===l.employeeId)?.ids[target as SourceName]??l.sourceEmployeeId,batchId:`${target}-weekly-demo`}));
  if (state.actions.some(a=>["verification-pending","uncertain"].includes(a.status) && a.target===target && (!a.employeeId || !e || a.employeeId===e.id))) return failure(state,"An action at this destination is still unverified. Inspect its original receipt; do not prepare a duplicate request.");
  const key=`${evidenceKey(d)}|${action.kind}|${control?.id??"run"}|${target}|${JSON.stringify(changes)}`;
  const exists=state.actions.find(a=>a.key===key && !["invalidated","failed"].includes(a.status));
  if (exists) return failure(state,`An action for this exact evidence already exists (${exists.id}). No duplicate was created.`);
  const proposal:ActionProposal={id:`action-${state.actions.length+1}`,key,kind:action.kind,controlId:control?.id,employeeId:e?.id,target,title,reason:action.note.trim(),evidenceKey:evidenceKey(d),changes,payloadLines:payloadLines.length?payloadLines.map(l=>({...l})):undefined,createCheck,status:"proposed"};
  return event({...state,actions:[proposal,...state.actions]},action.at,"Proposal prepared",`${title} — proposal only. No source values changed.`,proposal);
}
function patchAction(state:DemoState,id:string,patch:Partial<ActionProposal>):DemoState { return {...state,actions:state.actions.map(a=>a.id===id?{...a,...patch}:a)}; }
function sameEvidence(state:DemoState,a:ActionProposal) { return a.evidenceKey===evidenceKey(state.dataset); }
function invalidate(state:DemoState,a:ActionProposal,at:string) { return event(patchAction(state,a.id,{status:"invalidated"}),at,"Proposal invalidated","Source evidence or rules changed. Rebuild the proposal; previous authorization cannot be reused.",a); }

function verify(state:DemoState, proposal:ActionProposal, at:string):DemoState {
  if (!["verification-pending","uncertain"].includes(proposal.status)) return failure(state,"Only an accepted or uncertain action can be read back. It cannot execute twice.");
  if (!sameEvidence(state,proposal)) {
    const destination=state.dataset.snapshots[proposal.target];
    const payload=proposal.payloadLines??[];
    const sameLines=payload.length>0 && payload.every(l=>destination.lines.some(row=>row.employeeId===l.employeeId&&row.metric===l.metric&&row.value===l.value&&row.code===l.code&&row.job===l.job&&row.periodId===l.periodId));
    const checkPresent=!proposal.createCheck || destination.checks.some(c=>c.employeeId===proposal.employeeId);
    if (sameLines && checkPresent && sourceUsable(state.dataset,proposal.target)) return event(patchAction(state,proposal.id,{status:"verified",verifiedSnapshotId:destination.id}),at,"Receipt reconciled after evidence changed","Current destination evidence confirms the original receipt. No resend or overwrite occurred; current payroll controls are still evaluated separately.",proposal);
    return event(patchAction(state,proposal.id,{status:"uncertain"}),at,"Receipt requires investigation","Evidence changed after the request was accepted, and the current destination does not confirm it. Do not resend. Inspect the receipt and source records; manual fallback remains available.",proposal);
  }
  if (proposal.kind==="closeout") {
    if (!readiness(state,reconcile(state.dataset)).submitted) return failure(state,"External submission evidence is no longer current.");
    return event({...patchAction(state,proposal.id,{status:"verified",verifiedSnapshotId:"closeout-evidence-demo"}),closed:true},at,"Closeout read-back verified (demo)","Simulated Jonas closing reports and period-update receipt verified. Completion email is a preview only; no real period was closed.",proposal);
  }
  const d=structuredClone(state.dataset);
  const previous=state.dataset.snapshots[proposal.target];
  const next=d.snapshots[proposal.target];
  next.revision+=1;next.id=`${proposal.target}-v${next.revision}`;next.capturedAt=at;next.health="current";next.periodId=d.run.periodId;
  next.reports=REPORTS[proposal.target].map(name=>({name,revision:next.revision,result:"passed"}));
  if (proposal.kind==="mapping" && proposal.employeeId) {
    const e=d.employees.find(e=>e.id===proposal.employeeId)!;
    const change=proposal.changes[0];
    d.rules.approvedCostMappings[e.id]={from:String(change.before).split(":").slice(1).join(":"),to:String(change.after).split(":").slice(1).join(":"),job:e.job,reason:proposal.reason,by:"Payroll Demo User"};
    d.rules.revision+=1;
  } else {
    const payload=proposal.payloadLines??[];
    if (proposal.kind==="jonas-input" || proposal.kind==="paylocity-transfer") next.lines=[];
    else next.lines=next.lines.filter(l=>!payload.some(p=>p.employeeId===l.employeeId&&p.metric===l.metric));
    const transferred=payload.map((l,i)=>({...l,id:`${proposal.target}-${proposal.id}-${i}`,sourceEmployeeId:d.employees.find(e=>e.id===l.employeeId)?.ids[proposal.target as SourceName]??"",batchId:`${proposal.target}-weekly-demo`}));
    // The adverse demo outcome illustrates a destination that did not persist the intended value.
    if (proposal.simulatedOutcome==="mismatch" && transferred.length) {
      const numeric=transferred.find(l=>typeof l.value==="number");
      if (numeric) numeric.value=Number(numeric.value)+1;
    }
    next.lines.push(...transferred);
    if (proposal.target==="paylocity" && (proposal.createCheck || proposal.kind==="paylocity-transfer")) {
      const ids=proposal.createCheck?[proposal.employeeId!]:d.employees.filter(e=>e.expectedPay).map(e=>e.id);
      for (const id of ids) if (!next.checks.some(c=>c.employeeId===id)) next.checks.push({id:`CHECK-${proposal.id}-${id}`,employeeId:id,batchId:"paylocity-weekly-demo",periodId:d.run.periodId,category:"regular"});
    }
  }
  const verified=proposal.kind==="mapping" || (proposal.payloadLines??[]).every(l=>{
    const original=(proposal.payloadLines??[]).filter(p=>p.employeeId===l.employeeId&&p.metric===l.metric);
    const actual=next.lines.filter(p=>p.employeeId===l.employeeId&&p.metric===l.metric);
    const signature=(rows:PayrollLine[])=>JSON.stringify(rows.map(p=>[p.metric,p.value,p.code,p.job,p.periodId]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
    return signature(original)===signature(actual);
  });
  let updated:DemoState={...state,dataset:d,history:[previous,...state.history],outcome:"normal",actions:state.actions.map(a=>a.id===proposal.id?{...a,status:verified?"verified":"failed",verifiedSnapshotId:next.id}:!["verified","invalidated","failed"].includes(a.status)?{...a,status:"invalidated"}:a)};
  updated=event(updated,at,verified?"Read-back verified":"Read-back failed",verified?`Destination snapshot ${next.id} matches the proposed change. Controls recalculated; other systems were not silently changed.`:`Destination ${next.id} does not match the proposal. The discrepancy remains open; no success is claimed.`,proposal);
  if (state.externalApproval) updated=event(updated,at,"Approval evidence superseded","A source changed after the recorded external approval. That approval no longer covers the current evidence.");
  return updated;
}

export function demoReducer(state:DemoState, action:DemoAction):DemoState {
  if (action.type==="NOTICE") return {...state,notice:action.text};
  if (action.type==="RESET") return createState(action.scenario??"review");
  if (action.type==="POLICY") return event({...state,policy:{...action.policy},actions:state.actions.map(a=>a.status==="authorized"?{...a,status:"proposed",authorizedBy:undefined}:a)},action.at,"Automation preview changed","Demo automation policy updated. Authorized-but-unexecuted proposals require renewed authorization; no action was executed.");
  if (action.type==="OUTCOME") return event({...state,outcome:action.outcome},action.at,"Demo scenario control",`Next simulated destination outcome: ${action.outcome}. No source evidence changed.`);
  if (action.type==="EXPORT") return event(state,action.at,"Manual fallback exported",`Synthetic ${action.format} exported with source versions and control results.`);
  if (action.type==="REVIEW") {
    const c=reconcile(state.dataset).find(c=>c.id===action.controlId);
    if (!c || action.note.trim().length<6) return failure(state,"Add an investigation note. Recording review does not clear a discrepancy.");
    return event(state,action.at,"Investigation noted",`${action.note.trim()} — review recorded only; source values and control status unchanged.`,undefined,c.employeeId);
  }
  if (action.type==="PROPOSE") return propose(state,action);
  if (action.type==="REFRESH") {
    const d=structuredClone(state.dataset),history=[...state.history];
    const sources=action.source?[action.source]:Object.keys(d.snapshots) as EvidenceSource[];
    for (const source of sources) {
      if (d.snapshots[source].health==="not-loaded") continue;
      history.unshift(state.dataset.snapshots[source]);
      const s=d.snapshots[source];s.revision+=1;s.id=`${source}-v${s.revision}`;s.capturedAt=action.at;s.health="current";s.periodId=d.run.periodId;
      s.reports=REPORTS[source].map(name=>({name,revision:s.revision,result:"passed"}));
    }
    return event({...state,dataset:d,history,actions:state.actions.map(a=>["verification-pending","uncertain"].includes(a.status)?{...a,status:"uncertain"}:["proposed","authorized"].includes(a.status)?{...a,status:"invalidated"}:a)},action.at,"Demo evidence refreshed","New synthetic snapshots loaded. Pending proposals and prior readiness must be re-evaluated. No live refresh occurred.");
  }
  if (action.type==="EXTERNAL_APPROVAL" || action.type==="EXTERNAL_SUBMISSION" || action.type==="EXTERNAL_CLOSEOUT") {
    const gate=readiness(state,reconcile(state.dataset)),key=evidenceKey(state.dataset);
    if (action.type==="EXTERNAL_APPROVAL") {
      if (!gate.ready || state.externalApproval===key || !!state.externalSubmission) return failure(state,"Approval evidence can be recorded once after the required controls pass.");
      return event({...state,externalApproval:key},action.at,"External approval (demo)","Illustration only: a human approved the payroll in Paylocity. This app did not approve or submit payroll.");
    }
    if (action.type==="EXTERNAL_SUBMISSION") {
      if (!gate.approved || !!state.externalSubmission) return failure(state,"A separate, current external approval is required before submission evidence.");
      return event({...state,externalSubmission:key},action.at,"External submission (demo)","Illustration only: a human reviewed the audit and submitted in Paylocity. No payroll was actually submitted.");
    }
    if (!gate.submitted || state.closed) return failure(state,"Closeout requires verified external submission evidence and cannot run twice.");
    return event({...state,closed:true},action.at,"External closeout (demo)","Illustrative Jonas accrual, cost allocation and period-update evidence recorded; completion email preview only. No period closed and no email sent.");
  }
  if (!("id" in action)) return state;
  const a=state.actions.find(a=>a.id===action.id);
  if (!a) return failure(state,"Action not found.");
  if (action.type==="CANCEL") {
    if (!["proposed","authorized"].includes(a.status)) return failure(state,"An accepted action cannot be cancelled or blindly retried; verify the destination first.");
    return event(patchAction(state,a.id,{status:"invalidated"}),action.at,"Proposal cancelled","Proposal cancelled without changing source data.",a);
  }
  if (["verified","invalidated","failed"].includes(a.status)) return failure(state,"This action is finished. No duplicate execution or verification was performed.");
  if (action.type==="VERIFY") return verify(state,a,action.at);
  if (!sameEvidence(state,a)) {
    if (["verification-pending","uncertain"].includes(a.status)) return failure(state,"This accepted action requires receipt-specific verification, not re-authorization or a retry.");
    return invalidate(state,a,action.at);
  }
  if (action.type==="AUTHORIZE") {
    if (a.status!=="proposed" || actionMode(state,a.kind)!=="approval") return failure(state,"The current policy does not authorize this execution path.");
    return event(patchAction(state,a.id,{status:"authorized",authorizedBy:"Payroll Demo Approver"}),action.at,"Action authorization (demo)","This exact change is authorized for simulated execution. This is not payroll approval.",a);
  }
  if (action.type==="EXTERNAL_UPDATE") {
    if (a.status!=="proposed") return failure(state,"Only a pending handoff can simulate a manual source-system update.");
    return event({...patchAction(state,a.id,{status:"verification-pending",receipt:`MANUAL-${a.id}`,simulatedOutcome:state.outcome}),outcome:"normal"},action.at,"External correction reported (demo)","A human's source-system update is simulated. Current values remain unchanged until fresh evidence is read back.",a);
  }
  if (action.type==="EXECUTE") {
    if (a.status!=="authorized" || actionMode(state,a.kind)!=="approval") return failure(state,"Execution requires authorization under the current action policy.");
    const status=state.outcome==="uncertain"?"uncertain":"verification-pending";
    return event({...patchAction(state,a.id,{status,receipt:`DEMO-RECEIPT-${a.id}`,simulatedOutcome:state.outcome}),outcome:"normal"},action.at,"Simulated request receipt",status==="uncertain"?"Delivery outcome uncertain. Do not retry: read the destination to learn whether the change was applied.":"Request accepted in the simulation. Destination verification is still required; the discrepancy is not cleared.",a);
  }
  return state;
}
