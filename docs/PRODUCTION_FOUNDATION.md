# Production foundation

This repository remains a synthetic public demo. The production foundation below is intentionally generic and contains no B&S payroll data, credentials, confidential documents, or confirmed internal authority matrix.

## Why this layer exists

The demo proves reconciliation and control behavior. A production payroll operations application needs additional guarantees around:

- field-level authority
- linked/supplemental payroll periods
- versioned configuration
- separation of duties
- stale-approval invalidation
- append-only audit events
- explicit change review
- safe integration boundaries

The detailed B&S production control specification should live only in a B&S-controlled private repository or approved document store.

## Authority is field-level

Production code must not assume one application is globally authoritative.

Every pay-critical fact should be covered by a versioned authority matrix with one of these statuses:

- `proposed`
- `confirmed`
- `ambiguous`

Only a `confirmed` authority rule may be treated as authoritative by automation. Ambiguous or proposed authority must keep the relevant control in review.

See `src/lib/production/authority.ts`.

## Payroll runs can contain linked periods

A real payroll run may need:

- one primary period
- supplemental periods
- retro/missed-hours periods

The production run contract requires exactly one primary period and permits linked supplemental/retro periods.

See `src/lib/production/governance.ts`.

## Runs pin configuration versions

A production run pins the versions of:

- authority matrix
- payroll rules
- mappings
- employee identity mapping

Changing current configuration does not silently change an in-progress run. Configuration drift is detectable and can require explicit re-baselining/review.

## Sensitive changes require independent review

Consequential authority/rule/mapping/identity changes use a change-request model.

A sensitive change author cannot approve their own change.

Platform/application administration does not automatically grant payroll approval authority.

## Evidence changes make prior approval stale

Approval is valid only for the run, evidence revision, and configuration version that were reviewed.

Fresh evidence or different configuration invalidates the old approval and requires review of the new state.

## Audit is append-only

Production audit events are appended and must have unique IDs. Existing audit facts should not be rewritten as the normal application workflow.

## Cloud and connector implementation

The production deployment should use B&S-controlled infrastructure and identities. Cloud-specific SDKs should remain outside payroll-domain logic where practical.

The public repository must not contain:

- production secrets
- real employee payroll data
- confidential B&S process documents
- a confirmed internal authority matrix
- production tenant identifiers

## Tests

`tests/production-foundation.test.mjs` covers the first production invariants:

- linked periods
- exactly one primary period
- frozen configuration pins
- drift detection
- separation of duties
- stale approval
- append-only audit
- unconfirmed authority behavior
- authority-matrix completeness
