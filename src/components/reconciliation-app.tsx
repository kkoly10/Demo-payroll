"use client";
import { useEffect, useMemo, useReducer, useState } from "react";
import type { Scenario, SourceFilter, View } from "@/lib/types";
import { createState, demoReducer } from "@/lib/payroll/state";
import type { DemoAction } from "@/lib/payroll/state";
import { reconcile, visibleIssues } from "@/lib/reconciliation";
import { Overview, EmployeeTable } from "./payroll/overview";
import { Exceptions } from "./payroll/exceptions";
import { EmployeeTrace } from "./payroll/trace";
import { ActionInspector } from "./payroll/action-inspector";
import { PayrollProcess, PreparationPreview } from "./payroll/process";
import { AuditTrail, AutomationOptions, DemoControls, ExportPanel, Integrations, QuickGuide, Walkthrough } from "./payroll/panels";
import { PageHeading, ScopeButtons } from "./payroll/ui";

type Panel="guide"|"policy"|"demo"|"export"|"preparation"|null;
type Selection={id:string;controlId?:string};
type ProposalRequest=Omit<Extract<DemoAction,{type:"PROPOSE"}>,"type"|"at">;
export default function ReconciliationApp() {
  const [state,dispatch]=useReducer(demoReducer,undefined,()=>createState());
  const [view,setView]=useState<View>("overview");const [scope,setScope]=useState<SourceFilter>("all");
  const [search,setSearch]=useState("");const [onlyReview,setOnlyReview]=useState(false);
  const [selection,setSelection]=useState<Selection|null>(null);const [activeAction,setActiveAction]=useState<string|null>(null);
  const [panel,setPanel]=useState<Panel>(null),[tour,setTour]=useState<number|null>(null),[externalDemo,setExternalDemo]=useState(false);
  const controls=useMemo(()=>reconcile(state.dataset),[state.dataset]);
  const issues=useMemo(()=>visibleIssues(controls),[controls]);
  const openPanel=(p:Panel)=>{setSelection(null);setActiveAction(null);setPanel(p);};
  function navigate(next:View) {
    setView(next);setScope("all");setSearch("");setOnlyReview(false);
    setSelection(null);setActiveAction(null);setPanel(null);
    window.scrollTo({top:0,behavior:"instant"});
  }
  function openEmployee(id:string,controlId?:string) {
    if(!["employees","exceptions"].includes(view))setScope("all");
    setPanel(null);setActiveAction(null);setSelection({id,controlId});
  }
  function openAction(id:string) {setPanel(null);setSelection(null);setActiveAction(id);}
  function propose(request:ProposalRequest) {
    const action:DemoAction={type:"PROPOSE",...request,at:new Date().toISOString()};
    // Pure preflight lets the UI open only a successfully-created proposal. The reducer
    // repeats the same checks against its current state; no I/O occurs here.
    const next=demoReducer(state,action);dispatch(action);
    if(next.actions.length>state.actions.length)openAction(next.actions[0].id);
  }
  function reset(scenario:Scenario) {
    dispatch({type:"RESET",scenario,at:new Date().toISOString()});setTour(null);setExternalDemo(false);navigate("overview");
  }
  function tourStep(step:number) {
    setTour(step);setScope("all");setPanel(null);setActiveAction(null);setSearch("");setOnlyReview(false);
    setSelection(step===3?{id:"EMP-1005",controlId:"EMP-1005-prep-regular"}:null);
    setView(step===0?"overview":step===2?"exceptions":step===3?"employees":"process");
    window.scrollTo({top:0,behavior:"instant"});
  }
  useEffect(()=>{
    if(!state.notice)return;const timer=setTimeout(()=>dispatch({type:"NOTICE",text:""}),10000);return()=>clearTimeout(timer);
  },[state.notice]);
  const tourBar=tour===null?null:<Walkthrough step={tour} onStep={tourStep} onClose={()=>setTour(null)}/>;
  const nav:readonly [View,string][]=[["overview","Overview"],["process","Payroll process"],["exceptions",`Exceptions ${issues.length}`],["employees","Employees"],["audit","Audit"],["integrations","Integrations"]];
  return <div className="appShell realigned"><aside className="sidebar"><div><div className="brandBlock"><div className="brandMonogram">B&amp;S</div><div><strong>Reconciliation</strong><span>Payroll workflow &amp; controls</span></div></div><nav className="sideNav" aria-label="Main navigation">{nav.map(([key,label])=><button key={key} className={`navButton ${view===key?"active":""}`} aria-current={view===key?"page":undefined} onClick={()=>navigate(key)}>{label}</button>)}</nav></div><div className="sidebarFooter"><div className="modeBadge"><span className="modeDot" aria-hidden="true"/>NO LIVE WRITES</div><p>Synthetic browser session.<br/>All external actions are simulated.</p><div className="demoControlLinks"><button className="resetLink" onClick={()=>openPanel("demo")}>Demo controls / reset</button></div></div></aside>
    <main className="mainPanel"><header className="topbar"><div><p className="eyebrow">Weekly payroll · {state.dataset.run.company}</p><h1>{state.dataset.run.periodLabel}</h1><p className="topbarPurpose">Bring payroll inputs, preparation and checks together before human approval.</p></div><div className="topActions"><button className="helpGuideButton" onClick={()=>openPanel("guide")}><span className="helpIcon" aria-hidden="true">i</span>Quick guide</button><span className="demoNotice">DEMO · No live systems</span></div></header>
      {tour!==null&&!selection&&tourBar}
      {view==="overview"&&<Overview state={state} controls={controls} onNavigate={navigate} onEmployee={openEmployee} onExport={()=>openPanel("export")} tour={tour}/>}
      {view==="process"&&<PayrollProcess key={`${state.scenario}-${tour===4?"human-handoff":"process"}`} state={state} controls={controls} onPolicy={()=>openPanel("policy")} onPrepare={()=>openPanel("preparation")} onNavigate={navigate} onPropose={propose} onAction={openAction} send={dispatch} externalDemo={externalDemo} tour={tour}/>}
      {view==="exceptions"&&<Exceptions state={state} controls={controls} scope={scope} onScope={setScope} onEmployee={openEmployee} onAll={()=>navigate("employees")} onSources={()=>navigate("integrations")}/>}
      {view==="employees"&&<section className="pageStack"><PageHeading title="All employees" description="Full manual visibility. Compare the appropriate source pairs or inspect the entire evidence path, including expected adjustments and supporting payroll inputs." action={<button className="secondaryButton" onClick={()=>openPanel("export")}>Export review packet</button>}/><div className="filterBar"><div className="searchWrap"><span aria-hidden="true">⌕</span><input aria-label="Search employees" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or any mapped employee ID"/></div><ScopeButtons value={scope} onChange={setScope}/><label className="checkControl"><input type="checkbox" checked={onlyReview} onChange={e=>setOnlyReview(e.target.checked)}/>Needs review only</label>{(search||onlyReview||scope!=="all")&&<button className="textButton" onClick={()=>{setSearch("");setOnlyReview(false);setScope("all");}}>Clear filters</button>}</div><EmployeeTable state={state} controls={controls} scope={scope} search={search} onlyReview={onlyReview} onEmployee={openEmployee}/></section>}
      {view==="audit"&&<AuditTrail state={state} onExport={()=>openPanel("export")} onNavigate={navigate}/>}
      {view==="integrations"&&<Integrations state={state} controls={controls} send={dispatch}/>}
    </main>
    {state.notice&&!selection&&!activeAction&&!panel&&<div className="sessionNotice" role="status"><span>{state.notice}</span><button aria-label="Dismiss notice" onClick={()=>dispatch({type:"NOTICE",text:""})}>×</button></div>}
    {selection&&<EmployeeTrace key={`${selection.id}-${selection.controlId??"default"}-${scope}`} id={selection.id} initialControl={selection.controlId} scope={scope} state={state} controls={controls} onClose={()=>setSelection(null)} onAction={openAction} onPropose={propose} send={dispatch} onAllSources={()=>{setScope("all");setSelection({id:selection.id});}} tour={tour===3?tourBar:undefined}/>}
    {activeAction&&<ActionInspector key={activeAction} state={state} id={activeAction} send={dispatch} onClose={()=>setActiveAction(null)} onEmployee={openEmployee}/>}
    {panel==="guide"&&<QuickGuide onClose={()=>setPanel(null)} onStart={()=>tourStep(0)}/>}
    {panel==="policy"&&<AutomationOptions state={state} send={dispatch} onClose={()=>setPanel(null)}/>}
    {panel==="demo"&&<DemoControls state={state} send={dispatch} onClose={()=>setPanel(null)} externalDemo={externalDemo} onExternal={setExternalDemo} onReset={reset}/>}
    {panel==="export"&&<ExportPanel state={state} controls={controls} send={dispatch} onClose={()=>setPanel(null)}/>}
    {panel==="preparation"&&<PreparationPreview state={state} controls={controls} onClose={()=>setPanel(null)} onPropose={propose} onEmployee={openEmployee} send={dispatch}/>}
  </div>;
}
