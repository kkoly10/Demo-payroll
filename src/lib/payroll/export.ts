import type { ControlResult, DemoState } from "../types";
import { BOUNDARY_LABELS, METRICS, fmt } from "./model";
const escapeHtml=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const csv=(v:unknown)=>{
  let text=String(v??"");
  // Spreadsheet formula injection protection, including after leading whitespace.
  if (/^[\s]*[=+@-]/.test(text) || /^0\d+$/.test(text)) text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
};
export function comparisonCsv(state:DemoState, controls:ControlResult[]) {
  const header=["SYNTHETIC DEMO ONLY","Pay period","Employee","ID","Control","Boundary","Input evidence","Expected","Destination","Result","Explanation","Source versions"];
  return "\ufeff"+[header,...controls.map(c=>["Not payroll instructions",state.dataset.run.periodId,state.dataset.employees.find(e=>e.id===c.employeeId)?.name??"Run control",c.employeeId??"",c.title,BOUNDARY_LABELS[c.boundary],fmt(c.from,c.metric),fmt(c.expected,c.metric),fmt(c.actual,c.metric),c.state,c.detail,c.evidenceIds.join("; ")])].map(row=>row.map(csv).join(",")).join("\r\n");
}
export function preparationCsv(state:DemoState, lines:import("../types").PayrollLine[]) {
  return "\ufeff"+[["SYNTHETIC PREVIEW — NOT A VENDOR-APPROVED IMPORT","Employee","Period","Work date","Component","Code","Value","Job"],...lines.map(l=>["DEMO ONLY",l.sourceEmployeeId,l.periodId,l.workDate,METRICS[l.metric].label,l.code,fmt(l.value,l.metric),l.job])].map(r=>r.map(csv).join(",")).join("\r\n");
}
export function reviewHtml(state:DemoState,controls:ControlResult[]) {
  const rows=controls.filter(c=>c.state!=="not-applicable").map(c=>`<tr><td>${escapeHtml(state.dataset.employees.find(e=>e.id===c.employeeId)?.name??"Run control")}</td><td>${escapeHtml(c.title)}<br>${escapeHtml(BOUNDARY_LABELS[c.boundary])}</td><td>${escapeHtml(fmt(c.from,c.metric))}</td><td>${escapeHtml(fmt(c.expected,c.metric))}</td><td>${escapeHtml(fmt(c.actual,c.metric))}</td><td>${escapeHtml(c.state)}</td><td>${escapeHtml(c.detail)}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Synthetic payroll review packet</title><style>body{font:14px system-ui;margin:32px;color:#20252b}h1{margin-bottom:8px}.notice{padding:16px;border:2px solid #555}table{border-collapse:collapse;width:100%;font-size:11px;margin-top:20px}th,td{border:1px solid #ccd1d6;padding:8px;text-align:left;vertical-align:top}th{background:#eff2f4}thead{display:table-header-group}@media print{tr{break-inside:avoid}}</style></head><body><h1>B&amp;S Reconciliation — review packet</h1><p>${escapeHtml(state.dataset.run.periodLabel)}</p><div class="notice"><strong>Synthetic demo only. Not approved payroll and not a vendor import file.</strong><p>No payroll has been approved, submitted, or changed in a real system. Missing or stale evidence is not treated as a passing comparison. This export is a review aid, not authorization to pay.</p></div><h2>Source evidence</h2>${Object.values(state.dataset.snapshots).map(s=>`<p>${escapeHtml(s.source)} · ${escapeHtml(s.id)} · ${escapeHtml(s.health)} · ${escapeHtml(s.capturedAt)}</p>`).join("")}<table><thead><tr><th>Employee</th><th>Control</th><th>Input</th><th>Expected</th><th>Destination</th><th>Result</th><th>Explanation</th></tr></thead><tbody>${rows}</tbody></table><h2>Demo audit history</h2>${state.audit.map(a=>`<p><strong>${escapeHtml(a.type)}</strong> · ${escapeHtml(a.at)} · ${escapeHtml(a.actor)}<br>${escapeHtml(a.detail)}<br>Evidence: ${escapeHtml(a.evidenceIds.join(", "))}</p>`).join("")}</body></html>`;
}
export function download(text:string,name:string,type:string) {
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
