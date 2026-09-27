# B&S Reconciliation Demo

Interactive, front-end-only concept for a payroll reconciliation control plane spanning Raken, Jonas Enterprise, and Paylocity.

## Safety

- Synthetic employee and payroll data only.
- No vendor credentials.
- No real B&S payroll data.
- No external write operations.
- Read-only / shadow-mode concepts are demonstrated visually.

## Demo goals

- Exception-first payroll review with a one-click **View all employees** fallback.
- Persistent source identity: Raken = orange, Jonas = blue, Paylocity = green.
- Source-to-source filtering.
- Employee-level three-way comparison and trace view.
- Manual fallback packet export.
- Demo exception resolution with an audit trail.
- Integration administration concept with future writes visibly disabled.

## Local development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm run build
```

The demo intentionally has no backend. The reconciliation engine operates on deterministic fixtures so real connectors can replace demo data later without redesigning the UI.
