"use client";
import { useState } from "react";
import type { ControlResult, DemoState, Metric, SourceFilter } from "@/lib/types";
import type { DemoAction } from "@/lib/payroll/state";
import { actionMode } from "@/lib/payroll/state";
import { employeeState } from "@/lib/reconciliation";
import { BOUNDARY_LABELS, METRICS, PREP_METRICS, SOURCE_LABELS, fmt, inScope, valueAt } from "@/lib/payroll/model";
import { preparedValue } from "@/lib/payroll/preparation";
import { InfoHint, Modal, SourceBadge, StatusBadge, timeLabel } from "./ui";

type ProposalRequest=Omit<Extract<DemoAction,{type:"PROPOSE"}>,"type"|"at">;
export function EmployeeTrace({id,initialControl,scope,state,controls,onClose,onAction,onPropose,send,tour,onAllSources}:{id:string;initialControl?:string;scope:SourceFilter;state:DemoState;controls:ControlResult[];onClose:()=>void;onAction:(id:string)=>void;onPropose:(a:ProposalRequest)=>void;send:(a:DemoAction)=>void;tour?:React.ReactNode;onAllSources:()=>void}) {
  const d=state.dataset,e=d.employees.find(e=>e.id===id)!;
  const relevant=controls.filter(c=>c.employeeId===id&&inScope(c,scope));
  const initial=initialControl??relevant.find(c=>c.state==="review")?.id??relevant.find(c=>c.state==="expected")?.id??relevant.find(c=>c.metric)?.id??relevant[0]?.id;
  const [selected,setSelected]=useState(initial);const [note,setNote]=useState("");
  const [target,setTarget]=useState<"jonas"|"paylocity"|"raken">("paylocity");
  const currentCost=String(valueAt(d,"jonas",id,"costCode")??"").split(":").slice(1).join(":");
  const [code,setCode]=useState(d.rules.validCostCodes[e.job]?.includes(currentCost)?currentCost:d.rules.validCostCodes[e.job]?.[0]??"");
  const c=relevant.find(c=>c.id===selected)??relevant[0];
  const status=employeeState(controls,id,scope),metric:Metric=c?.metric??"regular";
  const input=preparedValue(d,e,metric);
  const a=state.actions.find(a=>a.controlId===c?.id&&!['invalidated','failed'].includes(a.status));
  const mapping=c?.metric==="costCode"&&c.state==="review"&&!input.valid;
  const isFinal=c?.boundary==="jonas-paylocity";
  const missingCheck=c?.id===`${id}-check`&&!d.snapshots.paylocity.checks.some(check=>check.employeeId===id);
  const canCorrect=c?.state==="review"&&(!!c.metric||missingCheck)&&!state.externalSubmission;
  const effectiveTarget=mapping?"inputs":missingCheck?"paylocity":isFinal?(target==="raken"?"paylocity":target):(target==="raken"&&c?.boundary==="raken-jonas"&&!c.rule?"raken":"jonas");
  const mode=actionMode(state,mapping?"mapping":"correction");
  const changeControl=(next:string)=>{setSelected(next);setNote("");setTarget("paylocity");};
  const now=()=>new Date().toISOString();
  const notApplicable=scope==="raken-jonas"&&e.role==="Salary";
  const visibleMetrics=scope==="raken-jonas"?PREP_METRICS.filter(m=>preparedValue(d,e,m).source==="raken"):scope==="jonas-paylocity"?PREP_METRICS.filter(m=>m!=="costCode"):PREP_METRICS;
  return <Modal title={e.name} subtitle={`${e.id} · ${e.role} · ${d.run.periodLabel}`} onClose={onClose} wide>
    {tour}
    {state.notice&&<p className="inlineNotice" role="status">{state.notice}</p>}
    <div className="traceSummary"><StatusBadge state={status.state} label={status.label}/><span>{scope==="all"?"All applicable source and payroll controls":BOUNDARY_LABELS[scope]} · not payroll approval</span></div>
    {notApplicable&&<div className="readOnlyNotice">This salary payroll does not originate in Raken. No Raken → Jonas comparison is required.<div className="buttonRow"><button className="secondaryButton" onClick={onAllSources}>View the full payroll evidence path</button></div></div>}
    {!notApplicable&&<label className="fieldLabel">Control to trace<select value={c?.id??""} onChange={ev=>changeControl(ev.target.value)}>{relevant.filter(x=>x.state!=="not-applicable").map(x=><option key={x.id} value={x.id}>{x.title} · {x.state.replaceAll("-"," ")} · {BOUNDARY_LABELS[x.boundary]}</option>)}</select></label>}
    {c&&!notApplicable&&<section className="traceFocus"><div className="traceFocusHeader"><div><h3>{c.title}</h3><p>{c.detail}</p></div><StatusBadge state={c.state}/></div><div className="traceBoundary"><span>{BOUNDARY_LABELS[c.boundary]}</span><InfoHint label="What does this investigation boundary mean?">This is the handoff or control where evidence disagrees. It narrows the investigation; it does not prove the cause or choose the correct system. More than one boundary can have an issue for the same employee.</InfoHint></div>
      <div className="evidencePath">
        <div className={`evidenceNode ${input.source==="raken"?"rakenNode":"inputNode"}`}><SourceBadge source={input.source}/><strong>{fmt(input.raw,metric)}</strong><span>{input.source==="raken"?"Original field evidence":metric.startsWith("perDiem")?"Per-diem tracker · synthetic":e.role==="Salary"&&["regular","pto","holiday"].includes(metric)?"Salary / leave input · synthetic":"Approved payroll input · illustrative"}</span><small>{d.snapshots[input.source].id} · original values retained</small></div>
        {input.source==="raken"&&<div className="evidenceStep"><strong>{d.rules.sourceApprovals[id]?"Supervisor approval recorded":"Supervisor approval required"}</strong><span>{d.rules.sourceApprovals[id]?`${d.rules.sourceApprovals[id].by} · ${timeLabel(d.rules.sourceApprovals[id].at)}`:"A matching number is not a substitute for approval."}</span></div>}
        <div className="evidenceStep"><strong>{input.rule?"Documented transformation":"Payroll-ready expectation"} · {fmt(input.value,metric)}</strong><span>{input.rule??(input.valid?"No numeric transformation needed. Employee identity and component mapping retained.":"Cannot prepare safely until the job-specific mapping is reviewed.")}</span></div>
        <div className="evidenceNode jonasNode"><SourceBadge source="jonas"/><strong>{fmt(valueAt(d,"jonas",id,metric),metric)}</strong><span>Prepared payroll · Pay Journal evidence</span><small>{d.snapshots.jonas.id} · {d.snapshots.jonas.health}</small></div>
        <div className="evidenceStep"><strong>Transfer and destination check</strong><span>Prepared data, import receipt and read-back are separate evidence steps.</span></div>
        <div className="evidenceNode paylocityNode"><SourceBadge source="paylocity"/><strong>{d.snapshots.paylocity.health==="not-loaded"?"Not loaded":!d.snapshots.paylocity.checks.some(x=>x.employeeId===id)?"No check":metric==="costCode"?"Not compared in this control":fmt(valueAt(d,"paylocity",id,metric),metric)}</strong><span>{metric==="costCode"?"Cost allocation is checked against Jonas, not the employee check.":"Pre Process Payroll Register evidence"}</span><small>{d.snapshots.paylocity.id} · {d.snapshots.paylocity.health}</small></div>
      </div>
    </section>}
    {c?.state==="review"&&<section className="resolutionPanel"><h3>Payroll decision</h3><p>{mode==="manual"?"Read-only workflow: record the finding, correct the appropriate source outside this tool, then verify updated evidence.":mode==="preview"?"Prepare and inspect the proposed change. This policy does not permit the tool to execute it.":"Future workflow: authorize this exact proposed action, simulate execution, then verify the destination. Payroll approval remains separate."}</p>
      {mapping&&<label className="fieldLabel">Confirmed Jonas code for job {e.job}<select aria-label="Confirmed cost code" value={code} onChange={ev=>setCode(ev.target.value)}>{d.rules.validCostCodes[e.job]?.map(code=><option key={code} value={code}>{code} · valid in the synthetic job catalog</option>)}</select></label>}
      {canCorrect&&!mapping&&!missingCheck&&<label className="fieldLabel">What did Payroll determine?<select aria-label="Resolution target" value={effectiveTarget} onChange={ev=>{setTarget(ev.target.value as typeof target);setNote("");}}>{isFinal?<><option value="paylocity">Jonas value confirmed → correct Paylocity</option><option value="jonas">Paylocity value confirmed → correct Jonas</option></>:<><option value="jonas">Prepared source / rule confirmed → correct Jonas</option>{c.boundary==="raken-jonas"&&!c.rule&&<option value="raken">Jonas value confirmed → correct original Raken evidence</option>}</>}</select></label>}
      <label className="fieldLabel">Investigation finding<textarea aria-label="Investigation finding" rows={3} value={note} onChange={ev=>setNote(ev.target.value)} placeholder="Use synthetic notes only. What evidence supports this decision?"/></label>
      <div className="buttonRow"><button className="secondaryButton" disabled={note.trim().length<6} onClick={()=>send({type:"REVIEW",controlId:c.id,note,at:now()})}>Record review only</button>{canCorrect&&<button className="primaryButton" disabled={note.trim().length<6} onClick={()=>onPropose({kind:mapping?"mapping":"correction",controlId:c.id,target:effectiveTarget,note,costCode:code})}>{mapping?"Prepare reviewed mapping":"Preview proposed correction"}</button>}</div><small>No generic “waive discrepancy” action. Review alone never clears a failed control.</small>
    </section>}
    {a&&<section className="actionLink"><div><strong>{a.title}</strong><span>{a.status.replaceAll("-"," ")} · {SOURCE_LABELS[a.target]} · {a.id}</span></div><button className="secondaryButton" onClick={()=>onAction(a.id)}>Inspect action and receipt</button></section>}
    <details className="evidenceDetails"><summary>All component values and source IDs</summary><p>Original inputs stay visible. Rates, per diem and deductions do not originate in Raken in this demo model. Figures are synthetic.</p><div className="identityRow">{Object.entries(e.ids).map(([s,v])=><span key={s}><strong>{SOURCE_LABELS[s as keyof typeof e.ids]}</strong> {v??"Not expected"}</span>)}</div><div className="tableScroll"><table className="detailTable"><thead><tr><th>Component</th>{scope!=="jonas-paylocity"&&<><th>Input evidence</th><th>Payroll-ready</th></>}<th>Jonas</th>{scope!=="raken-jonas"&&<th>Paylocity</th>}<th>Inspect</th></tr></thead><tbody>{visibleMetrics.map(m=>{
      const p=preparedValue(d,e,m),control=relevant.find(x=>x.metric===m&&x.state==="review")??relevant.find(x=>x.metric===m);
      return <tr key={m}><td>{METRICS[m].label}</td>{scope!=="jonas-paylocity"&&<><td><small>{SOURCE_LABELS[p.source]}</small>{fmt(p.raw,m)}</td><td>{fmt(p.value,m)}</td></>}<td className="jonasCell">{fmt(valueAt(d,"jonas",id,m),m)}</td>{scope!=="raken-jonas"&&<td className="paylocityCell">{m==="costCode"?"Not compared":fmt(valueAt(d,"paylocity",id,m),m)}</td>}<td>{control&&<button className="textButton" onClick={()=>changeControl(control.id)}>Trace</button>}</td></tr>;
    })}</tbody></table></div></details>
    <details className="evidenceDetails"><summary>Underlying source lines and snapshot history</summary><p>Current and previous snapshots remain distinguishable. These records are normalized demo evidence—not vendor API payloads.</p>{Object.values(d.snapshots).map(s=><details key={s.id}><summary>{SOURCE_LABELS[s.source]} · {s.id} · {s.lines.filter(l=>l.employeeId===id).length} lines</summary><pre className="technicalPreview">{JSON.stringify(s.lines.filter(l=>l.employeeId===id),null,2)}</pre></details>)}<p>{state.history.length} previous source snapshot(s) retained for this browser session.</p>{state.history.filter(s=>s.lines.some(l=>l.employeeId===id)).map(s=><details key={s.id}><summary>Previous {SOURCE_LABELS[s.source]} · {s.id}</summary><pre className="technicalPreview">{JSON.stringify(s.lines.filter(l=>l.employeeId===id),null,2)}</pre></details>)}</details>
    <p className="dialogFootnote">No real employee data, live connection or external write. Demo state resets on page reload.</p>
  </Modal>;
}
