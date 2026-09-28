"use client";
import type { ControlResult, DemoState, SourceFilter } from "@/lib/types";
import { visibleIssues } from "@/lib/reconciliation";
import { BOUNDARY_LABELS, inScope } from "@/lib/payroll/model";
import { EmptyState, PageHeading, ScopeButtons, StatusBadge } from "./ui";
import type { OpenEmployee } from "./overview";

export function Exceptions({state,controls,scope,onScope,onEmployee,onAll,onSources}:{state:DemoState;controls:ControlResult[];scope:SourceFilter;onScope:(s:SourceFilter)=>void;onEmployee:OpenEmployee;onAll:()=>void;onSources:()=>void}) {
  const issues=visibleIssues(controls).filter(c=>inScope(c,scope));
  const groups=Map.groupBy(issues,c=>c.employeeId??"run");
  return <section className="pageStack"><PageHeading title="Exception queue" description="Investigate what needs judgment. Recording review does not fix a source record; a correction is complete only after destination evidence verifies it." action={<button className="secondaryButton" onClick={onAll}>View all employees</button>}/><div className="filterBar"><ScopeButtons value={scope} onChange={onScope}/><span className="viewCount">{issues.length} open controls · {new Set(issues.map(c=>c.employeeId).filter(Boolean)).size} affected employees</span></div>{!issues.length?<EmptyState title="No open discrepancies in this view">Other stages or evidence may still be pending. Use Payroll process for the full readiness decision.</EmptyState>:<div className="exceptionList">{[...groups.entries()].map(([id,items])=>{
    const e=state.dataset.employees.find(e=>e.id===id);
    return <article className="issueGroup" key={id} data-testid="exception-group"><div className="issueGroupHeader"><div><strong>{e?.name??"Run-level readiness"}</strong><span>{e?`${e.id} · ${e.role}`:"Source evidence and identity controls"}</span></div><span className={`severity ${items.some(c=>c.severity==="critical")?"critical":"warning"}`}>{items.some(c=>c.severity==="critical")?"Critical":"Review"}</span><span className="muted">{items.length} {items.length===1?"control":"controls"}</span></div>{items.map(c=><button key={c.id} className="issueControl" onClick={()=>e?onEmployee(e.id,c.id):onSources()}><span><strong>{c.title}</strong><small>{c.detail}</small></span><span className="boundaryChip">{BOUNDARY_LABELS[c.boundary]}</span><StatusBadge state={c.state}/><span className="textLink">{e?"Trace evidence":"Inspect sources"} →</span></button>)}</article>;
  })}</div>}</section>;
}
