import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const loadModule=createRequire(import.meta.url);
const load=p=>loadModule(path.join(process.env.PAYROLL_TEST_BUILD,p));
const prod=load("lib/production/foundation.js");

const pins={authorityMatrixVersion:1,ruleSetVersion:7,mappingSetVersion:12,identitySetVersion:4};
const run=()=>prod.createPayrollRun({
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
  assert.throws(()=>prod.createPayrollRun({
    id:"x",companyId:"c",createdAt:"now",pins,
    periods:[{id:"a",kind:"primary",periodEnding:"x"},{id:"b",kind:"primary",periodEnding:"x"}],
    sources:[],
  }),/exactly one primary/);
});

test("configuration pins are frozen and drift is detectable",()=>{
  const r=run();
  assert.equal(Object.isFrozen(r.pins),true);
  assert.equal(prod.configurationHasDrift(r,{...pins,ruleSetVersion:8}),true);
  assert.equal(prod.configurationHasDrift(r,pins),false);
});

test("sensitive change author cannot approve their own change",()=>{
  const change={id:"chg-1",scope:"rule",sensitive:true,authorId:"komlan",title:"Rule",before:1,after:2,state:"in-review"};
  assert.equal(prod.canApproveChange("payroll-approver","komlan",change),false);
  assert.throws(()=>prod.approveChange(change,"komlan","payroll-approver","now"),/not allowed/);
});

test("payroll approver can approve a sensitive payroll change created by another person",()=>{
  const change={id:"chg-2",scope:"rule",sensitive:true,authorId:"komlan",title:"Rule",before:1,after:2,state:"in-review"};
  const approved=prod.approveChange(change,"payroll-lead","payroll-approver","now");
  assert.equal(approved.state,"approved");
  assert.equal(approved.reviewerId,"payroll-lead");
});

test("platform admin and security auditor do not inherit payroll approval authority",()=>{
  assert.equal(prod.canPerformPayrollApproval("platform-admin"),false);
  assert.equal(prod.canPerformPayrollApproval("security-auditor"),false);
  assert.equal(prod.canPerformPayrollApproval("payroll-approver"),true);
});

test("security auditor cannot approve sensitive payroll configuration",()=>{
  const change={id:"chg-audit",scope:"rule",sensitive:true,authorId:"builder",title:"Rule",before:1,after:2,state:"in-review"};
  assert.equal(prod.canApproveChange("security-auditor","auditor",change),false);
});

test("approval becomes stale when evidence or configuration no longer matches",()=>{
  const r=run();
  const stamp={actorId:"payroll-lead",runId:r.id,evidenceKey:"e1",configurationKey:prod.configurationKey(r.pins),at:"now"};
  assert.equal(prod.approvalIsCurrent(stamp,r,"e1"),true);
  assert.equal(prod.approvalIsCurrent(stamp,r,"e2"),false);
  const r2=prod.createPayrollRun({...r,pins:{...pins,mappingSetVersion:13}});
  assert.equal(prod.approvalIsCurrent(stamp,r2,"e1"),false);
});

test("audit events are append-only and reject duplicate event IDs",()=>{
  const e={id:"evt-1",at:"now",actorId:"user",type:"SOURCE_IMPORTED",detail:"Synthetic"};
  const list=prod.appendAuditEvent([],e);
  assert.equal(list.length,1);
  assert.equal(Object.isFrozen(list),true);
  assert.throws(()=>prod.appendAuditEvent(list,e),/Duplicate audit event/);
});

test("unconfirmed authority never resolves as a confirmed source",()=>{
  const matrix={version:1,rules:[{
    fact:"pto-balance",source:"paylocity",status:"proposed",effectiveFrom:"2026-10-15",evidenceRequired:["balance"],
  }]};
  assert.equal(prod.authorityFor(matrix,"pto-balance").source,"paylocity");
  assert.equal(prod.confirmedAuthorityFor(matrix,"pto-balance"),null);
});

test("authority matrix must explicitly cover required facts without duplicates",()=>{
  const matrix={version:1,rules:[{
    fact:"approved-field-time",source:"raken",status:"proposed",effectiveFrom:"2026-10-15",evidenceRequired:["approval"],
  }]};
  assert.doesNotThrow(()=>prod.assertAuthorityMatrixComplete(matrix,["approved-field-time"]));
  assert.throws(()=>prod.assertAuthorityMatrixComplete(matrix,["approved-field-time","pay-rate"]),/missing/);
});
