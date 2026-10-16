import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const loadModule=createRequire(import.meta.url);
const load=p=>loadModule(path.join(process.env.PAYROLL_TEST_BUILD,p));
const authority=load("lib/production/authority.js");
const gov=load("lib/production/governance.js");

const pins={authorityMatrixVersion:1,ruleSetVersion:7,mappingSetVersion:12,identitySetVersion:4};
const run=()=>gov.createPayrollRun({
  id:"run-1",
  companyId:"company-1",
  createdAt:"2026-10-15T20:00:00Z",
  pins,
  periods:[
    {id:"2026-W41",kind:"primary",periodEnding:"2026-10-10"},
    {id:"2026-W41-missed",kind:"supplemental",periodEnding:"2026-10-10",parentPeriodId:"2026-W41"},
  ],
  sources:[{source:"jonas",revision:"j-1",capturedAt:"2026-10-15T20:01:00Z"}],
});

test("production run supports one primary period plus linked supplemental periods",()=>{
  const r=run();
  assert.equal(r.periods.length,2);
  assert.equal(r.periods[1].parentPeriodId,"2026-W41");
});

test("production run rejects multiple primary periods",()=>{
  assert.throws(()=>gov.createPayrollRun({
    id:"x",companyId:"c",createdAt:"now",pins,
    periods:[{id:"a",kind:"primary",periodEnding:"x"},{id:"b",kind:"primary",periodEnding:"x"}],
    sources:[],
  }),/exactly one primary/);
});

test("configuration pins are frozen and drift is detectable",()=>{
  const r=run();
  assert.equal(Object.isFrozen(r.pins),true);
  assert.equal(gov.configurationHasDrift(r,{...pins,ruleSetVersion:8}),true);
  assert.equal(gov.configurationHasDrift(r,pins),false);
});

test("sensitive change author cannot approve their own change",()=>{
  const change={id:"chg-1",scope:"rule",sensitive:true,authorId:"komlan",title:"Rule",before:1,after:2,state:"in-review"};
  assert.equal(gov.canApproveChange("payroll-approver","komlan",change),false);
  assert.throws(()=>gov.approveChange(change,"komlan","payroll-approver","now"),/not allowed/);
});

test("payroll approver can approve a sensitive payroll change created by another person",()=>{
  const change={id:"chg-2",scope:"rule",sensitive:true,authorId:"komlan",title:"Rule",before:1,after:2,state:"in-review"};
  const approved=gov.approveChange(change,"payroll-lead","payroll-approver","now");
  assert.equal(approved.state,"approved");
  assert.equal(approved.reviewerId,"payroll-lead");
});

test("platform admin does not inherit payroll approval authority",()=>{
  assert.equal(gov.canPerformPayrollApproval("platform-admin"),false);
  assert.equal(gov.canPerformPayrollApproval("payroll-approver"),true);
});

test("approval becomes stale when evidence or configuration no longer matches",()=>{
  const r=run();
  const stamp={actorId:"payroll-lead",runId:r.id,evidenceKey:"e1",configurationKey:gov.configurationKey(r.pins),at:"now"};
  assert.equal(gov.approvalIsCurrent(stamp,r,"e1"),true);
  assert.equal(gov.approvalIsCurrent(stamp,r,"e2"),false);
  const r2=gov.createPayrollRun({...r,pins:{...pins,mappingSetVersion:13}});
  assert.equal(gov.approvalIsCurrent(stamp,r2,"e1"),false);
});

test("audit events are append-only and reject duplicate event IDs",()=>{
  const e={id:"evt-1",at:"now",actorId:"user",type:"SOURCE_IMPORTED",detail:"Synthetic"};
  const list=gov.appendAuditEvent([],e);
  assert.equal(list.length,1);
  assert.equal(Object.isFrozen(list),true);
  assert.throws(()=>gov.appendAuditEvent(list,e),/Duplicate audit event/);
});

test("unconfirmed authority never resolves as a confirmed source",()=>{
  const matrix={version:1,rules:[{
    fact:"pto-balance",source:"paylocity",status:"proposed",effectiveFrom:"2026-10-15",evidenceRequired:["balance"],
  }]};
  assert.equal(authority.authorityFor(matrix,"pto-balance").source,"paylocity");
  assert.equal(authority.confirmedAuthorityFor(matrix,"pto-balance"),null);
});

test("authority matrix must explicitly cover required facts without duplicates",()=>{
  const matrix={version:1,rules:[{
    fact:"approved-field-time",source:"raken",status:"proposed",effectiveFrom:"2026-10-15",evidenceRequired:["approval"],
  }]};
  assert.doesNotThrow(()=>authority.assertAuthorityMatrixComplete(matrix,["approved-field-time"]));
  assert.throws(()=>authority.assertAuthorityMatrixComplete(matrix,["approved-field-time","pay-rate"]),/missing/);
});
