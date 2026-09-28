"use client";
import type { ControlResult, DemoState, Metric, SourceFilter, View } from "@/lib/types";
import { employeeState, visibleIssues } from "@/lib/reconciliation";
import { BOUNDARY_LABELS, FINAL_METRICS, METRICS, SOURCES, fmt, inScope, sourceUsable, totals, valueAt } from "@/lib/payroll/model";
import { processStages, readiness } from "@/lib/payroll/workflow";
import { InfoHint, SourceBadge, StatusBadge, timeLabel } from "./ui";

export type OpenEmployee = (id:string,controlId?:string)=>void;
export function SourceHealth({state}:{state:DemoState}) {
  const roles={raken:"Field time and project evidence",jonas:"Prepared payroll and job cost",paylocity:"Payroll batches and checks"};
  return <div className="sourceHealth">{SOURCES.map(source=>{
    const s=state.dataset.snapshots[source],usable=sourceUsable(state.dataset,source);
    return <div className="sourceHealthItem" key={source}><SourceBadge source={source}/><div className="sourceHealthCopy"><strong>{roles[source]}</strong><span>{s.health==="not-loaded"?"No payroll snapshot yet":`${s.id} · ${timeLabel(s.capturedAt)}`}</span><span className={`sourceCondition ${usable?"current":"attention"}`}>{usable?"Current demo evidence":s.health==="not-loaded"?"Not loaded":s.periodId!==state.dataset.run.periodId?"Wrong pay period":s.health}</span></div></div>;
  })}</div>;
}
export function TotalsPanel({state,controls}:{state:DemoState;controls:ControlResult[]}) {
  const d=state.dataset;
  return <section className="panel"><div className="panelHeader"><div><div className="kickerWithInfo"><p className="sectionKicker">Final payroll control</p><InfoHint label="How are payroll totals used?">Employee-level controls come first. These totals summarize the expected pay-run population; missing checks contribute no Paylocity values. Equal totals can hide employee-level or earning-code differences. This demo does not calculate taxes or net pay.</InfoHint></div><h3>Jonas vs Paylocity</h3></div></div><div className="tableScroll"><table className="totalsTable"><thead><tr><th>Component</th><th><SourceBadge source="jonas"/></th><th><SourceBadge source="paylocity"/></th><th>Control</th></tr></thead><tbody>{FINAL_METRICS.filter(m=>m!=="rate").map(metric=>{
    const issues=controls.filter(c=>c.boundary==="jonas-paylocity"&&c.metric===metric&&c.state==="review");
    const unavailable=!sourceUsable(d,"jonas")||!sourceUsable(d,"paylocity");
    const missing=controls.some(c=>c.id.endsWith("-check")&&c.state==="review");
    return <tr key={metric}><td>{METRICS[metric].label}</td><td>{fmt(totals(d,"jonas",metric),metric)}</td><td>{fmt(totals(d,"paylocity",metric),metric)}</td><td>{unavailable?<span className="muted">Awaiting evidence</span>:issues.length?<span className="warningText">{issues.length} employee {issues.length===1?"issue":"issues"}</span>:missing?<span className="warningText">Check incomplete</span>:<span className="passedText">✓ Compared</span>}</td></tr>;
  })}</tbody></table></div><p className="panelFootnote">Rate checks run per employee. Source systems retain payroll calculations; this is not a net-pay or tax validation.</p></section>;
}
export function Overview({state,controls,onNavigate,onEmployee,onExport,tour}:{state:DemoState;controls:ControlResult[];onNavigate:(view:View)=>void;onEmployee:OpenEmployee;onExport:()=>void;tour:number|null}) {
  const d=state.dataset,gate=readiness(state,controls),issues=visibleIssues(controls);
  const expected=d.employees.filter(e=>e.expectedPay),affected=new Set(issues.map(c=>c.employeeId).filter(Boolean));
  const verified=expected.filter(e=>["passed","expected"].includes(employeeState(controls,e.id).state)).length;
  const represented=new Set(d.snapshots.paylocity.checks.map(c=>c.employeeId));
  const paid=expected.filter(e=>represented.has(e.id)).length;
  const preparationIssues=issues.filter(c=>c.boundary!=="jonas-paylocity");
  const finalIssues=issues.filter(c=>c.boundary==="jonas-paylocity");
  const current=gate.submitted?7:gate.approved?6:gate.ready?5:d.snapshots.jonas.health==="not-loaded"?1:d.snapshots.paylocity.health==="not-loaded"?3:4;
  const stages=processStages(state,controls);
  return <section className="pageStack">
    <div className={`statusHero ${tour===0?"tourTarget":""}`} data-tour="overview">
      <div className="heroMain"><div className="kickerWithInfo"><p className="sectionKicker">Payroll readiness</p><InfoHint label="What does readiness mean?">Reconciliation checks the current source evidence under the applicable rules. Expected transformations can pass without identical raw values. Reviewed does not mean corrected, and corrected does not mean approved or submitted.</InfoHint></div>
      <div className="heroStatusRow"><span aria-hidden="true" className={`heroSignal ${gate.ready?"success":"warning"}`}/><h2>{gate.label}</h2></div>
      <p className="heroCopy">One view of payroll inputs, Jonas preparation and Paylocity checks. Routine comparisons run automatically; Payroll decides what needs correction.</p>
      <div className="heroStats"><div><strong>{verified} / {expected.length}</strong><span>Employees verified</span></div><div className={issues.length?"heroStatCritical":""}><strong>{issues.length}</strong><span>Open controls · {affected.size} employees</span></div><div><strong>{d.snapshots.paylocity.health==="not-loaded"?"Not loaded":`${paid} / ${expected.length}`}</strong><span>Expected employees with checks</span></div></div>
      <p className="nextAction">{state.externalSubmission?"External steps are illustrated only. No payroll was actually submitted.":gate.ready?"Required demo controls passed. Payroll still approves and submits separately in Paylocity.":"Reconciled means verified under the applicable rules—not approved or submitted."}</p></div>
      <div className="heroActions"><button className="primaryButton" onClick={()=>onNavigate(issues.length?"exceptions":"process")}>{issues.length?`Review ${issues.length} open controls`:gate.ready?"View human handoff":"Continue payroll process"}</button><button className="secondaryButton" onClick={()=>onNavigate("employees")}>View all {d.employees.length} employees</button><button className="textButton" onClick={()=>onNavigate("process")}>View payroll process →</button></div>
    </div>
    <div className="sectionLabelRow"><div><span>Source evidence</span><InfoHint label="What do these systems represent?">Raken supplies field time and project context. Jonas contains prepared payroll and job-cost records. Paylocity contains payroll batches and checks. Salary, leave, per diem and other supporting inputs follow their own applicable paths. All data here is synthetic.</InfoHint></div><small>Snapshots, not live connections</small></div><SourceHealth state={state}/>
    <nav className="payrollStrip" aria-label="Payroll process stages">{stages.map((stage,i)=><button className={`stripStep ${i===current?"current":""}`} key={stage.id} onClick={()=>onNavigate("process")}><span className="stepIndex">{i+1}</span><span>{["Inputs","Prepare","Jonas","Paylocity","Reconcile","Human approval","Human submit","Closeout"][i]}</span></button>)}</nav>
    <div className="twoColumn"><section className="panel"><div className="panelHeader"><div><p className="sectionKicker">Human attention</p><h3>{issues.length?"Investigate the exceptions":"No open discrepancies"}</h3></div><button className="textButton" onClick={()=>onNavigate("exceptions")}>View queue →</button></div><div className="controlBoundarySummary"><span>{preparationIssues.length} preparation / readiness</span><span>{finalIssues.length} final payroll</span></div><div className="summaryRows">{issues.slice(0,4).map(c=><button className="summaryRow" key={c.id} onClick={()=>c.employeeId?onEmployee(c.employeeId,c.id):onNavigate("integrations")}><span className={`miniSignal ${c.severity==="critical"?"critical":"warning"}`} aria-hidden="true"/><span><strong>{c.title}</strong><small>{d.employees.find(e=>e.id===c.employeeId)?.name??"Run-level control"} · {BOUNDARY_LABELS[c.boundary]}</small></span><span className="chevron" aria-hidden="true">›</span></button>)}</div>{!issues.length&&<p className="panelFootnote">{state.externalSubmission?"All applicable demo controls pass. External human approval / submission evidence is illustrative only; this app did not perform those actions.":state.externalApproval?"All applicable demo controls pass. External human approval is illustrated; payroll submission remains separate.":gate.ready?"All applicable demo controls pass. Payroll approval and submission remain separate human actions.":"There are no discrepancies to investigate, but loading or verifying evidence is still required."}</p>}{issues.length>4&&<p className="panelFootnote">Showing 4 of {issues.length} open controls. The full queue retains every issue.</p>}</section><TotalsPanel state={state} controls={controls}/></div>
    {gate.unverified.length>0&&<div className="attentionStrip"><strong>{gate.unverified.length} proposed / unverified actions</strong><span>An action receipt is not a verified correction.</span><button className="textButton" onClick={()=>onNavigate("process")}>Inspect actions →</button></div>}
    <div className="fallbackStrip"><div><strong>Manual visibility stays available.</strong><span>Inspect every employee or export a readable review packet with the source evidence and current controls.</span></div><button className="secondaryButton" onClick={onExport}>Export review packet</button></div>
  </section>;
}
export function EmployeeTable({state,controls,scope,search,onlyReview,onEmployee}:{state:DemoState;controls:ControlResult[];scope:SourceFilter;search:string;onlyReview:boolean;onEmployee:OpenEmployee}) {
  const d=state.dataset,q=search.toLowerCase().trim();
  const employees=d.employees.filter(e=>[e.name,e.id,...Object.values(e.ids)].some(v=>v?.toLowerCase().includes(q))).filter(e=>!onlyReview||["review","unavailable"].includes(employeeState(controls,e.id,scope).state));
  function hours(source:"raken"|"jonas"|"paylocity",id:string) {
    const e=d.employees.find(e=>e.id===id)!;
    if(source==="raken"&&e.role==="Salary")return "Not expected";
    if(d.snapshots[source].health==="not-loaded")return "Not loaded";
    if(source==="paylocity"&&!d.snapshots.paylocity.checks.some(c=>c.employeeId===id))return "No check";
    const values=(["regular","overtime","pto","holiday"] as Metric[]).map(m=>valueAt(d,source,id,m));
    return values.some(v=>v===null)?"Incomplete":`${values.reduce<number>((sum,v)=>sum+Number(v),0)} h`;
  }
  return <><p className="viewCount" aria-live="polite">Showing {employees.length} of {d.employees.length} employees · hours include regular, overtime, PTO and holiday. Open an employee for component-level evidence.</p><div className="tablePanel tableScroll"><table className="employeeTable"><thead><tr><th>Employee</th><th>Payroll path</th>{scope!=="jonas-paylocity"&&<th className="sourceHead rakenHead">Raken</th>}<th className="sourceHead jonasHead">Jonas</th>{scope!=="raken-jonas"&&<th className="sourceHead paylocityHead">Paylocity</th>}<th>{scope==="all"?"Applicable controls":"Selected comparison"}</th><th><span className="srOnly">Inspect</span></th></tr></thead><tbody>{employees.map(e=>{
    const status=employeeState(controls,e.id,scope),issues=visibleIssues(controls).filter(c=>c.employeeId===e.id&&inScope(c,scope));
    return <tr key={e.id}><td><button className="employeeName" onClick={()=>onEmployee(e.id)}>{e.name}</button><small>{e.id} · Jonas {e.ids.jonas}</small></td><td>{e.role}</td>{scope!=="jonas-paylocity"&&<td className="rakenCell">{hours("raken",e.id)}</td>}<td className="jonasCell">{hours("jonas",e.id)}</td>{scope!=="raken-jonas"&&<td className="paylocityCell">{hours("paylocity",e.id)}</td>}<td><StatusBadge state={status.state} label={status.label}/>{issues.length>0&&<small>{issues[0].title}{issues.length>1?` + ${issues.length-1} more`:""}</small>}</td><td><button className="textButton" aria-label={`Trace ${e.name}`} onClick={()=>onEmployee(e.id)}>Trace</button></td></tr>;
  })}</tbody></table>{!employees.length&&<div className="tableEmpty">No employees match these filters. Clear the search or turn off Needs review only to inspect everyone.</div>}</div></>;
}
