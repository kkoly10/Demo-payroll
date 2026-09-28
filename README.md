# B&S Reconciliation

B&S Reconciliation is an internal payroll-control concept designed to sit above B&S's existing payroll-related systems rather than replace them.

The current repository is an interactive demo using synthetic data only. The longer-term product direction is a secure internal web application that can read from Raken, Jonas Enterprise, and Paylocity, normalize the same payroll across those systems, identify discrepancies, explain where values first diverge, preserve the existing manual controls, and eventually prepare or execute carefully approved write operations.

## The idea in one sentence

> Make sure the right employee gets the right pay, charged to the right job/cost, with each authoritative system agreeing before payroll is released.

## Why the product exists

B&S's payroll process crosses multiple systems and manual handoffs.

At a high level:

    Raken
      ↓
    field time / project / cost context
      ↓
    Jonas Enterprise
      ↓
    construction payroll / accounting / job cost
      ↓
    Paylocity
      ↓
    employee payroll / checks

The real workflow also includes salary, PTO/holiday, per diem, missed hours, supplemental checks, manual adjustments, and reports.

The problem is not simply "move data from A to B."

The harder question is:

> Did the same payroll information make it correctly through every system, and can Payroll see exactly what is wrong when it did not?

That is what Reconciliation is meant to solve.

## Working source model

This is the intended product model and must be confirmed with B&S before production integration:

- Raken — field-originated time/project/cost information
- Jonas Enterprise — construction payroll, accounting, job-cost allocation, and payroll-side representation
- Paylocity — employee payroll/check processing and related payroll representation

Some facts exist in multiple systems. The app should never silently choose a winner when B&S has not defined one.

## Product principles

### Exception-first, never exception-only

The fastest path is to show only what needs attention.

The trust-building fallback is always available:

- Review Exceptions
- View All Employees
- search/filter the full population
- inspect reconciled employees
- compare Raken ↔ Jonas
- compare Jonas ↔ Paylocity
- compare all three
- inspect source evidence

The system should help Payroll move toward autonomy without taking away manual control.

### Trust through evidence

A green status should be explainable.

Users should be able to see:
- which source supplied a value
- when that source was synchronized
- what values were compared
- where the first mismatch appears
- what mapping/rule was applied
- who reviewed or approved an exception

### Reconciled is not the same as approved

"Reconciled" means the compared values agree under the available data and rules.

It does not mean payroll has been submitted.

Approval and submission remain separate controlled steps.

### Human authority over consequential payroll decisions

The product can automate:
- reading
- normalizing
- mapping
- validating
- comparing
- duplicate/missing-check detection
- file/payload preparation
- proposed changes

Authorized humans retain control over:
- ambiguous payroll decisions
- unusual corrections
- unresolved mappings
- approvals
- enabling external writes
- final payroll submission

## Product modes

The architecture is intended to mature through four modes:

| Mode | Behavior |
| --- | --- |
| Read Only | Read/import, compare, explain. No external writes. |
| Shadow | Generate exactly what would be written, but do not send it. |
| Approval | Supported writes require human approval and read-back verification. |
| Automated | Only explicitly approved low-risk actions may run automatically. |

The current demo has no live writes. It can simulate Read Only, Shadow/preview, and approval-gated action flows entirely in the browser so the control model can be demonstrated without vendor credentials or real payroll data.

## UX model

This is operations software.

The interface should answer immediately:

1. Which payroll period am I looking at?
2. Are Raken, Jonas, and Paylocity current?
3. How many employees reconcile?
4. What needs review?
5. Can I inspect everyone if I want?
6. What does each source represent?
7. Will this action change payroll?

### Source identity

The UI uses persistent visual source identity:

- Raken — orange
- Jonas — blue
- Paylocity — green

Color is never the only identifier; source names remain visible.

### Core views

- Overview — payroll readiness, source evidence, workflow stage, final controls, exceptions
- Payroll process — B&S's staged workflow, preparation previews, automation scope, human approval/submission gates, and closeout
- Exceptions — prioritized preparation and final-payroll discrepancies with trace/evidence
- Employees — full population/manual reassurance path
- Employee Trace — source evidence, approval provenance, documented transformations, handoffs, and destination verification
- Audit — snapshots, decisions, proposals, receipts, read-back verification, and exports
- Integrations — IT/admin-only connector and evidence-readiness concept

## Manual fallback is a feature

Reconciliation should never trap Payroll inside automation.

If a connector is unavailable or a user wants independent reassurance, the product should support:
- viewing every employee
- source-pair comparisons
- raw/source-derived evidence
- export/review packets
- continued use of the established manual process

The goal is to make Payroll choose automation because it is transparent and reliable—not because the old process was removed.

## Future integration shape

Production is intended to look roughly like:

    Payroll user
         |
         v
    Reconciliation web app
         |
         v
    Backend / connector layer
      |        |         |
    Raken    Jonas    Paylocity

Potential paths to verify with B&S/vendors:
- Raken public API and/or approved export
- Jonas Data Mart/read-only SQL and/or supported import/reporting interfaces
- Paylocity developer APIs and/or supported payroll files/reports

Production credentials must remain server-side.

## Future write model

Write capability may be implemented while disabled.

When eventually enabled, writes should follow:

    Prepare
      ↓
    Preview exact change
      ↓
    Authorized approval
      ↓
    Write through supported interface
      ↓
    Read back
      ↓
    Reconcile again
      ↓
    Audit

A successful API response is not enough.

## Current demo

The current implementation is intentionally backend-free:

- Next.js
- React
- TypeScript
- deterministic synthetic payroll fixtures
- real client-side reconciliation logic
- 52 fictional employees
- deliberately engineered exception scenarios
- no real B&S employee information
- no vendor credentials
- no external writes

Current demo scenarios include examples such as:
- missing Paylocity check
- Raken → Jonas hour discrepancy
- cost-code mismatch
- Jonas → Paylocity rate mismatch
- PTO mismatch
- per-diem mismatch

## Safety

This repository must remain synthetic unless B&S explicitly authorizes a move to private, company-controlled infrastructure.

Do not commit:
- real payroll records
- employee PII
- SSNs
- banking information
- tax forms
- real credentials/tokens
- confidential internal documents

Before any production work, confirm:
- private/company-controlled repository
- B&S-approved infrastructure
- Microsoft Entra or equivalent authentication
- role-based access
- secret management
- audit logging/retention
- backups and recovery

## Local development

    npm install
    npm run dev

## Verification

    npm run lint
    npm run build

## For coding agents

Read AGENTS.md before modifying product behavior.

It contains the product boundaries, trust model, authority assumptions, integration direction, safety rules, and UX principles that should survive future implementation changes.
