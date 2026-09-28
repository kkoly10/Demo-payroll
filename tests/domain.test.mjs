import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
const loadModule=createRequire(import.meta.url);
const load=p=>loadModule(path.join(process.env.PAYROLL_TEST_BUILD,p));
const {createState,demoReducer,DEFAULT_POLICY}=load("lib/payroll/state.js");
const {reconcile,visibleIssues,employeeState,preparationReady}=load("lib/reconciliation.js");
const {valueAt,evidenceKey,totals}=load("lib/payroll/model.js");
const {preparedValue}=load("lib/payroll/preparation.js");
const {readiness}=load("lib/payroll/workflow.js");
const at="2026-09-28T14:00:00.000Z";
const send=(s,a)=>demoReducer(s,{at,...a});
const issue=(s,id)=>reconcile(s.dataset).find(c=>c.id===id);
function propose(s,controlId,target="paylocity") { return send(s,{type:"PROPOSE",kind:"correction",controlId,target,note:"Confirmed source evidence in the demo."}); }
function manual(s) {const id=s.actions[0].id;return send(send(s,{type:"EXTERNAL_UPDATE",id}),{type:"VERIFY",id});}
function fixMapping(s) {return manual(send(s,{type:"PROPOSE",kind:"mapping",controlId:"EMP-1011-prep-costCode",costCode:"1000",note:"Jonas job catalog confirmed by Payroll Demo User."}));}
function approvedPolicy(s) {return send(s,{type:"POLICY",policy:{...DEFAULT_POLICY,transfer:"approval",corrections:"approval",closeout:"approval"}});}
function execute(s) {const id=s.actions[0].id;return send(send(s,{type:"AUTHORIZE",id}),{type:"EXECUTE",id});}
function preparedRun() {
  let s=fixMapping(createState("preparation"));
  s=manual(send(s,{type:"PROPOSE",kind:"jonas-input",note:"Validated synthetic payroll-ready input."}));
  s=manual(send(s,{type:"PROPOSE",kind:"paylocity-transfer",note:"Confirmed current Jonas Pay Journal."}));
  return s;
}

test("opening scenario: 52 employees, seven open controls, six final and one upstream",()=>{
  const s=createState();const issues=visibleIssues(reconcile(s.dataset));
  assert.equal(s.dataset.employees.length,52);assert.equal(issues.length,7);
  assert.equal(issues.filter(c=>c.boundary==="jonas-paylocity").length,6);
  assert.equal(issues.filter(c=>c.boundary==="raken-jonas").length,1);
});
test("foreman transformation is evidence, not mutation of Raken",()=>{
  const s=createState(), e=s.dataset.employees.find(e=>e.id==="EMP-1005");
  assert.equal(valueAt(s.dataset,"raken",e.id,"regular"),38);
  assert.equal(preparedValue(s.dataset,e,"regular").value,40);
  assert.equal(issue(s,`${e.id}-prep-regular`).state,"expected");
  assert.equal(employeeState(reconcile(s.dataset),e.id).state,"expected");
});
test("salary PTO replaces regular hours; Raken is not required",()=>{
  const s=createState();for(const e of s.dataset.employees.filter(e=>e.role==="Salary")) {
    assert.equal(valueAt(s.dataset,"jonas",e.id,"regular")+valueAt(s.dataset,"jonas",e.id,"pto"),40);
    assert.equal(valueAt(s.dataset,"raken",e.id,"regular"),null);
    assert.equal(employeeState(reconcile(s.dataset),e.id,"raken-jonas").state,"not-applicable");
  }
});
test("missing check does not supply phantom Paylocity values or totals",()=>{
  const s=createState();assert.equal(valueAt(s.dataset,"paylocity","EMP-1007","regular"),null);
  assert.equal(issue(s,"EMP-1007-check").state,"review");
  assert.ok(totals(s.dataset,"jonas","regular")>totals(s.dataset,"paylocity","regular"));
});
test("all boundaries are evaluated; multiple issues for one employee survive",()=>{
  const s=createState("multiple");assert.equal(issue(s,"EMP-1003-prep-regular").state,"review");
  assert.equal(issue(s,"EMP-1003-final-regular").state,"review");
  assert.equal(issue(s,"EMP-1003-final-overtime").state,"review");
});
test("source-pair states do not borrow another boundary's result",()=>{
  const s=createState(),r=reconcile(s.dataset);
  assert.equal(employeeState(r,"EMP-1040","raken-jonas").state,"passed");
  assert.equal(employeeState(r,"EMP-1040","jonas-paylocity").state,"review");
});
test("read-only investigation notes cannot clear discrepancies",()=>{
  let s=createState();const before=evidenceKey(s.dataset);
  s=send(s,{type:"REVIEW",controlId:"EMP-1040-final-regular",note:"Investigating the two missing hours."});
  assert.equal(evidenceKey(s.dataset),before);assert.equal(issue(s,"EMP-1040-final-regular").state,"review");
});
test("proposal and reported execution leave source evidence unchanged until read-back",()=>{
  let s=propose(createState(),"EMP-1040-final-regular");const key=evidenceKey(s.dataset),id=s.actions[0].id;
  assert.equal(valueAt(s.dataset,"paylocity","EMP-1040","regular"),38);
  s=send(s,{type:"EXTERNAL_UPDATE",id});assert.equal(evidenceKey(s.dataset),key);
  assert.equal(s.actions[0].status,"verification-pending");
  s=send(s,{type:"VERIFY",id});assert.equal(s.actions[0].status,"verified");
  assert.equal(valueAt(s.dataset,"paylocity","EMP-1040","regular"),40);
  assert.equal(s.history[0].id,"paylocity-v1");
});
test("correcting Jonas does not silently rewrite Paylocity or Raken",()=>{
  const s=manual(propose(createState(),"EMP-1040-final-regular","jonas"));
  assert.equal(valueAt(s.dataset,"jonas","EMP-1040","regular"),38);
  assert.equal(valueAt(s.dataset,"paylocity","EMP-1040","regular"),38);
  assert.equal(valueAt(s.dataset,"raken","EMP-1040","regular"),40);
  assert.equal(issue(s,"EMP-1040-prep-regular").state,"review");
});
test("reviewed job-specific mapping retains source code and records an expected transformation",()=>{
  const s=fixMapping(createState());assert.equal(valueAt(s.dataset,"raken","EMP-1011","costCode"),"3013:9999");
  assert.equal(issue(s,"EMP-1011-prep-costCode").state,"expected");
  assert.equal(s.dataset.rules.revision,2);
});
test("arbitrary invalid mapping is rejected",()=>{
  const s=send(createState(),{type:"PROPOSE",kind:"mapping",controlId:"EMP-1011-prep-costCode",costCode:"BAD",note:"Unverified arbitrary code"});
  assert.equal(s.actions.length,0);
});
test("manual and preview policy cannot execute a system write",()=>{
  for(const mode of ["manual","preview"]) {
    let s=createState();s=send(s,{type:"POLICY",policy:{...DEFAULT_POLICY,corrections:mode}});s=propose(s,"EMP-1040-final-regular");
    s=send(s,{type:"AUTHORIZE",id:s.actions[0].id});assert.equal(s.actions[0].status,"proposed");
    s=send(s,{type:"EXECUTE",id:s.actions[0].id});assert.equal(s.actions[0].status,"proposed");
  }
});
test("authorization, receipt and verification are separate; double execute cannot duplicate",()=>{
  let s=execute(propose(approvedPolicy(createState()),"EMP-1040-final-regular"));const id=s.actions[0].id;
  assert.equal(s.actions[0].status,"verification-pending");assert.equal(valueAt(s.dataset,"paylocity","EMP-1040","regular"),38);
  s=send(s,{type:"EXECUTE",id});assert.equal(s.actions[0].status,"verification-pending");
  s=send(s,{type:"VERIFY",id});const n=s.dataset.snapshots.paylocity.lines.length;
  s=send(s,{type:"VERIFY",id});assert.equal(s.dataset.snapshots.paylocity.lines.length,n);
});
test("duplicate proposal keys cannot produce duplicate changes",()=>{
  let s=propose(createState(),"EMP-1040-final-regular");s=propose(s,"EMP-1040-final-regular");assert.equal(s.actions.length,1);
});
test("changing policy revokes unexecuted authorization",()=>{
  let s=propose(approvedPolicy(createState()),"EMP-1040-final-regular");s=send(s,{type:"AUTHORIZE",id:s.actions[0].id});
  s=send(s,{type:"POLICY",policy:DEFAULT_POLICY});assert.equal(s.actions[0].status,"proposed");assert.equal(s.actions[0].authorizedBy,undefined);
});
test("new snapshots invalidate pending proposals and old authorization",()=>{
  let s=propose(approvedPolicy(createState()),"EMP-1040-final-regular");s=send(s,{type:"AUTHORIZE",id:s.actions[0].id});
  s=send(s,{type:"REFRESH",source:"paylocity"});assert.equal(s.actions[0].status,"invalidated");
  assert.equal(valueAt(s.dataset,"paylocity","EMP-1040","regular"),38);
});
test("uncertain delivery must be read back, not retried",()=>{
  let s=propose(approvedPolicy(createState()),"EMP-1040-final-regular");s=send(s,{type:"OUTCOME",outcome:"uncertain"});s=execute(s);const id=s.actions[0].id;
  assert.equal(s.actions[0].status,"uncertain");s=send(s,{type:"EXECUTE",id});assert.equal(s.actions[0].status,"uncertain");
  s=send(s,{type:"VERIFY",id});assert.equal(s.actions[0].status,"verified");
});
test("bad read-back cannot claim successful correction",()=>{
  let s=propose(approvedPolicy(createState()),"EMP-1040-final-regular");s=send(s,{type:"OUTCOME",outcome:"mismatch"});s=execute(s);s=send(s,{type:"VERIFY",id:s.actions[0].id});
  assert.equal(s.actions[0].status,"failed");assert.equal(issue(s,"EMP-1040-final-regular").state,"review");
});
test("stale / unavailable / wrong-period snapshots block readiness and totals",()=>{
  for(const scenario of ["stale","wrong-period"]) { const s=createState(scenario);assert.equal(readiness(s,reconcile(s.dataset)).ready,false);assert.equal(totals(s.dataset,"paylocity","regular"),null);assert.equal(issue(s,"source-paylocity").state,"unavailable"); }
});
test("matching but unapproved time requires human evidence",()=>{
  const s=createState("unapproved");assert.equal(issue(s,"EMP-1002-source-approval").state,"review");assert.equal(preparationReady(s.dataset),false);
});
test("before a batch is loaded checks are pending, not missing",()=>{
  const s=createState("preparation");assert.equal(issue(s,"EMP-1007-check").state,"pending");assert.equal(visibleIssues(reconcile(s.dataset)).filter(c=>c.boundary==="jonas-paylocity").length,0);
});
test("ready presentation scenario demonstrates the human gate without approving or submitting",()=>{
  const s=createState("ready"),results=reconcile(s.dataset),gate=readiness(s,results);
  assert.equal(visibleIssues(results).length,0);assert.equal(gate.ready,true);
  assert.equal(s.externalApproval,undefined);assert.equal(s.externalSubmission,undefined);
  assert.equal(issue(s,"EMP-1011-prep-costCode").state,"expected");
});
test("end-to-end preparation -> Jonas -> Paylocity -> ready does not approve or submit",()=>{
  const s=preparedRun();assert.equal(visibleIssues(reconcile(s.dataset)).length,0);assert.equal(readiness(s,reconcile(s.dataset)).ready,true);assert.equal(s.externalApproval,undefined);assert.equal(s.externalSubmission,undefined);assert.equal(s.dataset.snapshots.paylocity.checks.length,52);
});
test("approval and submission are distinct external human steps; closeout waits",()=>{
  let s=preparedRun();s=send(s,{type:"EXTERNAL_CLOSEOUT"});assert.equal(s.closed,false);
  s=send(s,{type:"EXTERNAL_SUBMISSION"});assert.equal(s.externalSubmission,undefined);
  s=send(s,{type:"EXTERNAL_APPROVAL"});assert.ok(s.externalApproval);assert.equal(s.externalSubmission,undefined);
  s=send(s,{type:"EXTERNAL_SUBMISSION"});assert.ok(s.externalSubmission);
  s=send(s,{type:"EXTERNAL_CLOSEOUT"});assert.equal(s.closed,true);
});
test("refreshing evidence supersedes approval; old approval cannot authorize submission",()=>{
  let s=send(preparedRun(),{type:"EXTERNAL_APPROVAL"});s=send(s,{type:"REFRESH",source:"jonas"});
  assert.equal(readiness(s,reconcile(s.dataset)).approved,false);s=send(s,{type:"EXTERNAL_SUBMISSION"});assert.equal(s.externalSubmission,undefined);
});
test("an already-loaded run cannot be reimported wholesale",()=>{
  let s=send(createState(),{type:"PROPOSE",kind:"paylocity-transfer",note:"Attempt to import the same run twice"});assert.equal(s.actions.length,0);
});
test("missing and literal zero values are different",()=>{
  const s=createState();s.dataset.snapshots.paylocity.lines=s.dataset.snapshots.paylocity.lines.filter(l=>!(l.employeeId==="EMP-1002"&&l.metric==="holiday"));
  assert.equal(valueAt(s.dataset,"paylocity","EMP-1002","holiday"),null);assert.equal(issue(s,"EMP-1002-final-holiday").state,"review");
});
test("matching deduction totals cannot hide a different code",()=>{
  const s=createState();s.dataset.snapshots.paylocity.lines.find(l=>l.employeeId==="EMP-1002"&&l.metric==="deductions").code="WRONG";
  assert.equal(issue(s,"EMP-1002-final-deductions").state,"review");
});
test("duplicate employee identity mapping is an explicit blocker",()=>{
  const s=createState();s.dataset.employees[1].ids.paylocity=s.dataset.employees[2].ids.paylocity;
  assert.equal(issue(s,"EMP-1002-identity-paylocity").state,"review");
});
test("supplemental checks are not automatically classified as duplicates",()=>{
  const s=createState();s.dataset.snapshots.paylocity.checks.push({id:"SUPP-DEMO",employeeId:"EMP-1002",batchId:"extra",periodId:s.dataset.run.periodId,category:"supplemental"});
  assert.equal(issue(s,"EMP-1002-check").state,"passed");
});
test("duplicate regular checks are critical, not a green completeness count",()=>{
  const s=createState();s.dataset.snapshots.paylocity.checks.push({id:"DUP-DEMO",employeeId:"EMP-1002",batchId:"extra",periodId:s.dataset.run.periodId,category:"regular"});
  assert.equal(issue(s,"EMP-1002-check").state,"review");assert.equal(issue(s,"EMP-1002-check").severity,"critical");
});
