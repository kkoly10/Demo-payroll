<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in node_modules/next/dist/docs/ (resolved from this file's directory; in monorepos the next package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by next dev — verify at node_modules/next/dist/server/lib/generate-agent-files.js. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# B&S Reconciliation — Product Brief for Agents

## Read this before changing product behavior

This repository is currently an interactive demo, but it is intentionally structured as the beginning of a real internal payroll-control product for B&S.

Do not redesign it as a generic payroll SaaS, accounting platform, HRIS, timeclock product, or replacement for Raken, Jonas Enterprise, or Paylocity.

The ultimate product is an internal payroll reconciliation and orchestration control plane that sits above B&S's existing systems. Its purpose is to make payroll safer, faster, easier to verify, and easier to troubleshoot while preserving human control and the existing manual fallback process.

## Core problem

B&S payroll currently crosses several systems and manual steps:

- Raken captures field time and project/cost context.
- Excel/manual cleanup and legacy transformation logic prepare data for Jonas.
- Jonas Enterprise handles construction payroll/accounting/job-cost representation.
- Jonas payroll data is exported and moved into Paylocity.
- Paylocity handles employee payroll/check processing.
- Payroll staff manually compare reports and investigate discrepancies.

The product should answer one central question:

> Did the right payroll information make it correctly from the authoritative source, through Jonas, into Paylocity before payroll is approved?

The tool should also help locate where a discrepancy first appears.

## Working authority model

Treat the following as the working product model, not an irreversible production assumption. Confirm exact ownership with B&S before real integration work.

### Raken
Primary source for field-originated facts such as:
- worker/time entries
- work date
- project
- cost-code context
- approved field hours
- classification/pay-type context when available

### Jonas Enterprise
Primary source for construction ERP/accounting/payroll representation such as:
- valid jobs and cost items
- job-cost allocation
- payroll/accounting entries
- payroll calculations/reports
- construction-side representation of labor

### Paylocity
Primary source for employee payroll/check execution such as:
- employee payroll/check representation
- final payroll batches/checks
- earnings/deductions used in payroll processing
- HR/pay setup where B&S designates it authoritative

Some fields exist in more than one system. Do not invent a winner. Where authority is ambiguous, surface the disagreement and require a B&S-approved rule.

## Product philosophy

### 1. Exception-first, never exception-only

The default experience should prioritize discrepancies, but users must always be able to:
- view every employee
- inspect reconciled employees
- search and filter
- compare any source pair
- inspect source evidence
- export/manual-review data

The system should reduce manual work without removing manual visibility.

### 2. Trust through evidence

Never ask Payroll to blindly trust a green status.

Every important conclusion should be explainable:
- what values were compared
- which source each value came from
- when each source was synchronized
- where values first stopped matching
- what rule or mapping was applied
- what user resolved or approved an exception

Use language such as "likely discrepancy boundary" or "first mismatch appears between..." unless the root cause is proven.

### 3. Automation with manual fallback

The existing manual process is a fallback, not something to erase.

If integrations fail or a user wants reassurance, they should be able to:
- inspect all employees
- inspect raw/source-derived records
- compare Raken ↔ Jonas
- compare Jonas ↔ Paylocity
- export a review packet
- continue the established manual payroll process outside the app

The tool must never trap Payroll inside automation.

### 4. Human authority over consequential payroll decisions

Automation may:
- read
- normalize
- map
- compare
- validate
- prepare files
- detect duplicates/missing checks
- identify likely discrepancy boundaries
- generate proposed changes

Humans retain authority over:
- ambiguous payroll-policy decisions
- PTO eligibility decisions
- unusual overtime/correction treatment
- unresolved cost-code choices
- final payroll approval/submission
- enabling external write behavior

### 5. Write → read back → verify

Future external writes must never stop at "request succeeded."

For any supported write:
1. prepare an exact proposed payload
2. require the appropriate approval
3. write through a vendor-supported mechanism
4. read back the resulting system state
5. reconcile the read-back against the intended write
6. log the entire operation

## Product modes

The architecture should support these modes even if only the first modes are active initially:

1. READ ONLY
   - retrieve/import data
   - compare and explain
   - no external writes

2. SHADOW
   - generate exactly what would be written
   - preview files/payloads
   - no external writes

3. APPROVAL
   - supported writes may execute only after an authorized human approval
   - write/read-back verification required

4. AUTOMATED
   - reserved for carefully approved low-risk actions
   - do not assume final payroll submission ever belongs here

Current demo: synthetic, frontend-only, no external writes.

## UX principles

This is operations software, not a marketing SaaS dashboard.

Design for payroll staff who may be cautious about automation.

### Source identity

Use persistent source identity throughout the product:
- Raken = orange
- Jonas = blue
- Paylocity = green

Color is an aid, never the only identifier. Always show the source name.

Do not use source color as the sole status signal. Success/warning/critical status must remain distinguishable from source identity.

### Default journey

A user opening the app should understand:
1. Which payroll period am I looking at?
2. Are the sources current?
3. Is payroll reconciled?
4. What needs my attention?
5. Can I inspect everyone if I want?
6. What happens if I click this?
7. Is any action going to change payroll?

### Guidance

Prefer subtle contextual guidance:
- small information tooltips
- a concise "How to read this" surface
- source-purpose explanations
- explanation of what "reconciled" means
- explanation of what a discrepancy boundary means
- clear distinction between review and write actions

Do not overwhelm users with tutorial walls.

### Reconciled does not mean approved

A reconciled employee/payroll means the compared values agree under the current rules and data snapshots.

It does not mean:
- payroll has been approved
- payroll has been submitted
- every business-policy question has been resolved

Keep reconciliation, approval, and submission visibly distinct.

## Core user experiences

### Overview
Should show:
- payroll period
- current status
- matched vs needs-review population
- source synchronization health
- payroll workflow stage
- exception summary
- high-level source totals
- clear path to View All Employees

### Exception queue
Should show:
- employee
- discrepancy type
- severity
- source values/evidence
- likely/first mismatch boundary
- trace
- notes
- resolution status
- owner/escalation when implemented

### All Employees

This is a deliberate manual/reassurance fallback.

Users should be able to:
- see the full population
- search employee name/ID
- filter needs-review vs reconciled
- inspect fully reconciled employees
- compare All 3, Raken ↔ Jonas, or Jonas ↔ Paylocity
- open employee detail

Important: source-pair filters must affect the comparison/status shown in that view. Do not flag a Raken-only discrepancy when the user is explicitly viewing Jonas ↔ Paylocity.

### Employee detail / Trace

Should make the source path understandable at a glance.

Show:
- Raken values
- Jonas values
- Paylocity values
- source-specific IDs where useful
- job/cost context
- hours/earnings categories
- check existence
- first mismatch boundary
- evidence used
- current resolution state

Do not imply causation unless established.

### Integrations

This is an administration surface, not normal Payroll onboarding.

Payroll should not see "Connect Raken / Connect Jonas / Connect Paylocity" on first use.

Production intent:
- IT/admin configures connectors
- Payroll opens the app and sees synchronized information already available

### Audit

Eventually every meaningful action should be durable and attributable:
- syncs
- mapping changes
- exception resolutions
- approvals
- generated files/payloads
- writes
- read-back verification
- fallback exports

## Production access model

Production should require B&S-controlled authentication, ideally Microsoft Entra ID/OIDC if that matches the company's environment.

No public signup.

Expected role separation:
- Payroll Operator
- Payroll Approver
- IT Integration Administrator
- Auditor/Management, read-only

Do not give IT integration administration automatic payroll approval authority simply because the same person can configure connectors.

## Integration architecture

Browser clients must never hold vendor secrets.

Intended shape:

    Payroll browser
          |
          v
    Reconciliation web app
          |
          v
    Backend / connector layer
       |       |        |
     Raken   Jonas   Paylocity

Potential production paths to verify with B&S/vendors:
- Raken: public API and/or approved export
- Jonas Enterprise: Data Mart/read-only SQL and/or vendor-supported reporting/import mechanisms
- Paylocity: approved developer APIs and/or supported payroll files/reports

Do not assume B&S licenses or entitlements exist until verified.

## Demo architecture

The demo intentionally has no backend.

Current shape:
- Next.js / React / TypeScript
- deterministic synthetic fixture data
- real client-side reconciliation logic
- interactive exception review
- no credentials
- no B&S employee data
- no external writes

Keep reconciliation logic separate from UI so demo data can later be replaced by connectors.

Preferred conceptual boundaries:
- data/ = demo fixtures
- lib/reconciliation* = normalization/comparison rules
- connectors/ = future vendor adapters
- UI = presentation and controlled user interaction

## Important reconciliation rules

### Employee identity

Never fuzzy-match employees by name.

Production should use explicit, maintained cross-system identity mapping:
- internal reconciliation ID
- Raken worker ID
- Jonas employee code
- Paylocity employee ID

### Employee-level before grand totals

Grand totals are a secondary control.

Two employee errors can offset while totals still match.

The strongest reconciliation happens by employee and component:
- regular hours
- overtime
- PTO/holiday
- taxable/non-taxable per diem
- rate where appropriate
- earnings/deductions where appropriate
- job/cost allocation
- check existence

### Not every employee is expected in every source

For example, some salary or non-field populations may not originate in Raken.

Do not automatically mark "missing from Raken" as an error without considering the employee/payroll stream.

### Missing Paylocity check

A missing check must not silently contribute normal Paylocity totals in demo or production logic.

### Source-pair comparisons

When the user selects:
- Raken ↔ Jonas: evaluate only that boundary
- Jonas ↔ Paylocity: evaluate only that boundary
- All 3: evaluate the complete path

## Real B&S payroll streams to account for over time

The mature product must account for more than standard field hours:
- field employees
- drivers/mechanics/interns
- salaried employees
- salary PTO
- holidays
- per diem
- missed/late hours
- supplemental checks
- manual earnings/deductions
- reimbursements/commissions/insurance as applicable

Do not assume Raken is the origin for every payroll component.

## Safety and privacy rules

This GitHub repository is currently a demo.

Never add:
- real B&S employee payroll data
- SSNs
- bank/direct-deposit data
- tax forms
- production API credentials
- secrets/tokens
- confidential B&S documents
- screenshots containing real payroll PII

without an explicit approved migration to B&S-controlled private infrastructure.

Before real-data work:
- confirm repository visibility
- confirm B&S authorization
- use company-controlled accounts/infrastructure
- establish role-based access
- establish secret management
- establish audit retention
- establish backup/recovery

Prefer synthetic or approved pseudonymized data for development.

## Do not accidentally build the wrong product

Avoid:
- generic SaaS marketing patterns
- a public signup flow
- a new payroll calculation engine
- replacing Paylocity
- replacing Jonas accounting/job costing
- replacing Raken field-time capture
- AI chatbot-first UX
- hiding raw/source evidence from Payroll
- silently auto-correcting ambiguous payroll data
- treating a successful API response as proof that payroll is correct

The differentiator is cross-system evidence, exception localization, safe orchestration, and preserved manual control.

## Definition of ultimate success

The mature product should let an authorized Payroll user open one screen and quickly determine:

> Are the right employees being paid the right hours/earnings, charged to the right jobs/costs, with Raken, Jonas, and Paylocity agreeing where they are supposed to agree—and if not, exactly what needs investigation before payroll is released?

It should reduce repetitive comparison work while making the payroll process more transparent, not less.
