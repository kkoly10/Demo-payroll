"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ControlState, EvidenceSource, SourceFilter } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/payroll/model";

export function SourceBadge({source}:{source:EvidenceSource}) {
  const cls={raken:"sourceRaken",jonas:"sourceJonas",paylocity:"sourcePaylocity",inputs:"sourceInputs"}[source];
  return <span className={`sourceBadge ${cls}`}><span className="sourceDot" aria-hidden="true"/>{SOURCE_LABELS[source]}</span>;
}
export function StatusBadge({state,label}:{state:ControlState;label?:string}) {
  const defaults:Record<ControlState,string>={passed:"Passed",expected:"Verified adjustment",review:"Needs review",unavailable:"Cannot verify",pending:"Awaiting evidence","not-applicable":"Not applicable"};
  const symbols:Record<ControlState,string>={passed:"✓",expected:"✓",review:"!",unavailable:"!",pending:"○","not-applicable":"—"};
  return <span className={`controlStatus ${state}`}><span aria-hidden="true">{symbols[state]}</span>{label??defaults[state]}</span>;
}
export function InfoHint({label,children}:{label:string;children:ReactNode}) {
  const [open,setOpen]=useState(false);const ref=useRef<HTMLDivElement>(null);const id=useId();
  useEffect(()=>{
    if(!open)return;
    const pointer=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);};
    const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();setOpen(false);ref.current?.querySelector("button")?.focus();}};
    document.addEventListener("pointerdown",pointer);document.addEventListener("keydown",key);
    return()=>{document.removeEventListener("pointerdown",pointer);document.removeEventListener("keydown",key);};
  },[open]);
  return <div className="infoHint" ref={ref}><button type="button" className="infoTrigger" aria-label={label} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>i</button>{open&&<div className="infoPopover" id={id} role="note"><button className="popoverClose" aria-label="Close guidance" onClick={()=>setOpen(false)}>×</button><div className="infoPopoverBody">{children}</div></div>}</div>;
}
export function Modal({title,subtitle,children,onClose,wide=false}:{title:string;subtitle?:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);const id=useId();
  useEffect(()=>{
    const el=ref.current;if(!el)return;const previous=document.activeElement as HTMLElement|null;
    el.showModal();const scroll=document.body.style.overflow;document.body.style.overflow="hidden";
    return()=>{el.close();document.body.style.overflow=scroll;if(previous?.isConnected)previous.focus();};
  },[]);
  return <dialog ref={ref} className={`payrollDialog${wide?" wide":""}`} aria-labelledby={id} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="dialogFrame"><header className="dialogHeader"><div>{subtitle&&<p className="dialogSubtitle">{subtitle}</p>}<h2 id={id}>{title}</h2></div><button className="iconButton" aria-label="Close panel" onClick={onClose} autoFocus>×</button></header><div className="dialogContent">{children}</div></div></dialog>;
}
export function PageHeading({title,description,action}:{title:string;description:string;action?:ReactNode}) {
  return <div className="pageHeading"><div><h2>{title}</h2><p>{description}</p></div>{action}</div>;
}
export function ScopeButtons({value,onChange}:{value:SourceFilter;onChange:(v:SourceFilter)=>void}) {
  return <div className="segmented" role="group" aria-label="Source comparison">{([["all","All 3"],["raken-jonas","Raken ↔ Jonas"],["jonas-paylocity","Jonas ↔ Paylocity"]] as const).map(([key,label])=><button key={key} className={`segment${key===value?" active":""}`} aria-pressed={key===value} onClick={()=>onChange(key)}>{label}</button>)}</div>;
}
export function EmptyState({title,children}:{title:string;children:ReactNode}) {return <div className="emptyState"><h3>{title}</h3><p>{children}</p></div>;}
export function timeLabel(iso:string) {return new Date(iso).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/New_York"})+" ET";}
