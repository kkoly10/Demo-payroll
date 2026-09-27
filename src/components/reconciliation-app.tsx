"use client";

import { useMemo, useState } from "react";
import { buildDemoDataset } from "@/data/demo";
import {
  employeeHasUnresolvedException,
  reconcile,
  sourceRecord,
  totals,
} from "@/lib/reconciliation";
import type { Employee, PayrollException, SourceName } from "@/lib/types";

type View = "overview" | "exceptions" | "employees" | "audit" | "integrations";
type SourceFilter = "all" | "raken-jonas" | "jonas-paylocity";

const SOURCE_META: Record<SourceName, { label: string; className: string }> = {
  raken: { label: "Raken", className: "sourceRaken" },
  jonas: { label: "Jonas", className: "sourceJonas" },
  paylocity: { label: "Paylocity", className: "sourcePaylocity" },
};

const initialAudit = [
  "08:04 · Raken demo snapshot loaded",
  "08:06 · Jonas demo snapshot loaded",
  "08:08 · Paylocity demo snapshot loaded",
  "08:09 · Three-way reconciliation completed",
];

function SourceBadge({ source }: { source: SourceName }) {
  const meta = SOURCE_META[source];
  return (
    <span className={`sourceBadge ${meta.className}`}>
      <span className="sourceDot" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function StatusMark({ ok }: { ok: boolean }) {
  return <span className={ok ? "statusOk" : "statusWarn"}>{ok ? "✓" : "!"}</span>;
}

export default function ReconciliationApp() {
  const dataset = useMemo(() => buildDemoDataset(), []);
  const exceptions = useMemo(() => reconcile(dataset), [dataset]);

  const [view, setView] = useState<View>("overview");
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [audit, setAudit] = useState(initialAudit);
  const [syncTick, setSyncTick] = useState(0);

  const unresolved = exceptions.filter((item) => !resolved.has(item.id));
  const matchedCount = dataset.employees.filter(
    (employee) => !employeeHasUnresolvedException(employee.id, exceptions, resolved)
  ).length;

  const filteredEmployees = dataset.employees.filter((employee) => {
    const matches = employee.name.toLowerCase().includes(search.toLowerCase()) ||
      employee.id.toLowerCase().includes(search.toLowerCase()) ||
      employee.jonasId.toLowerCase().includes(search.toLowerCase());
    const hasIssue = employeeHasUnresolvedException(employee.id, exceptions, resolved);
    return matches && (!onlyDifferences || hasIssue);
  });

  const resolveException = (item: PayrollException) => {
    setResolved((current) => new Set([...current, item.id]));
    const employee = dataset.employees.find((e) => e.id === item.employeeId);
    setAudit((current) => [
      `${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${item.title} resolved for ${employee?.name ?? item.employeeId}`,
      ...current,
    ]);
  };

  const resetDemo = () => {
    setResolved(new Set());
    setSelectedEmployee(null);
    setSourceFilter("all");
    setSearch("");
    setOnlyDifferences(false);
    setAudit(initialAudit);
    setSyncTick((n) => n + 1);
    setView("overview");
  };

  const simulateSync = () => {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setSyncTick((n) => n + 1);
    setAudit((current) => [`${time} · All three demo sources synchronized`, ...current]);
  };

  const downloadManualPacket = () => {
    const packet = {
      notice: "Synthetic demo payroll data only",
      payrollPeriod: "Sep 20–Sep 26, 2026",
      generatedAt: new Date().toISOString(),
      dataset,
      exceptions,
      resolvedExceptionIds: Array.from(resolved),
      audit,
    };
    const blob = new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "reconciliation-demo-manual-packet.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setAudit((current) => [
      `${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Manual fallback packet exported`,
      ...current,
    ]);
  };

  const nav = [
    ["overview", "Overview"],
    ["exceptions", `Exceptions ${unresolved.length}`],
    ["employees", "Employees"],
    ["audit", "Audit"],
    ["integrations", "Integrations"],
  ] as const;

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div>
          <div className="brandBlock">
            <div className="brandMonogram">B&amp;S</div>
            <div>
              <strong>Reconciliation</strong>
              <span>Payroll control</span>
            </div>
          </div>

          <nav className="sideNav" aria-label="Main navigation">
            {nav.map(([key, label]) => (
              <button
                key={key}
                className={view === key ? "navButton active" : "navButton"}
                onClick={() => setView(key)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebarFooter">
          <div className="modeBadge">
            <span className="modeDot" />
            READ ONLY
          </div>
          <p>Synthetic demo environment</p>
          <button className="resetLink" onClick={resetDemo}>Reset demo</button>
        </div>
      </aside>

      <main className="mainPanel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Weekly payroll</p>
            <h1>Sep 20 – Sep 26, 2026</h1>
          </div>
          <div className="topActions">
            <span className="demoNotice">DEMO · Synthetic data only</span>
            <button className="secondaryButton" onClick={simulateSync}>Simulate sync</button>
          </div>
        </header>

        {view === "overview" && (
          <section className="pageStack">
            <div className="statusHero">
              <div>
                <p className="sectionKicker">Payroll status</p>
                <div className="heroStatusRow">
                  <span className={unresolved.length ? "heroSignal warning" : "heroSignal success"} />
                  <h2>{unresolved.length ? "Needs review" : "Ready for approval"}</h2>
                </div>
                <p className="heroCopy">
                  {matchedCount} of {dataset.employees.length} employees fully reconcile across the available sources.
                </p>
              </div>
              <div className="heroActions">
                <button className="primaryButton" onClick={() => setView("exceptions")}>
                  Review {unresolved.length} exceptions
                </button>
                <button className="secondaryButton" onClick={() => setView("employees")}>
                  View all {dataset.employees.length} employees
                </button>
              </div>
            </div>

            <SourceHealth syncTick={syncTick} />

            <Workflow unresolved={unresolved.length} />

            <div className="twoColumn">
              <ExceptionSummary
                exceptions={unresolved}
                employees={dataset.employees}
                onOpen={(employee) => setSelectedEmployee(employee)}
              />
              <TotalsPanel dataset={dataset} />
            </div>

            <div className="fallbackStrip">
              <div>
                <strong>Manual controls remain available.</strong>
                <span>Inspect every employee, compare source-to-source, or export the synthetic fallback packet.</span>
              </div>
              <button className="secondaryButton" onClick={downloadManualPacket}>Export manual packet</button>
            </div>
          </section>
        )}

        {view === "exceptions" && (
          <section className="pageStack">
            <PageHeading
              title="Exception queue"
              description="Only unresolved differences are prioritized here. The complete employee population remains one click away."
              action={<button className="secondaryButton" onClick={() => setView("employees")}>View all employees</button>}
            />
            <div className="exceptionList">
              {unresolved.length === 0 ? (
                <div className="emptyState">
                  <span className="bigCheck">✓</span>
                  <h3>No unresolved exceptions</h3>
                  <p>All 52 synthetic employees currently reconcile.</p>
                </div>
              ) : unresolved.map((item) => {
                const employee = dataset.employees.find((e) => e.id === item.employeeId)!;
                return (
                  <article className="exceptionRow" key={item.id}>
                    <div className={item.severity === "critical" ? "severity critical" : "severity warning"}>
                      {item.severity === "critical" ? "Critical" : "Review"}
                    </div>
                    <div className="exceptionBody">
                      <div>
                        <h3>{item.title}</h3>
                        <p>{employee.name} · {employee.id}</p>
                      </div>
                      <p className="exceptionDetail">{item.detail}</p>
                    </div>
                    <div className="boundaryChip">{item.boundary}</div>
                    <div className="rowActions">
                      <button className="textButton" onClick={() => setSelectedEmployee(employee)}>Trace</button>
                      <button className="secondaryButton compact" onClick={() => resolveException(item)}>Resolve demo</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {view === "employees" && (
          <section className="pageStack">
            <PageHeading
              title="All employees"
              description="Full manual visibility is always available. Search, filter, and inspect reconciled employees as well as exceptions."
              action={<button className="secondaryButton" onClick={downloadManualPacket}>Export source packet</button>}
            />

            <div className="filterBar">
              <div className="searchWrap">
                <span>⌕</span>
                <input
                  aria-label="Search employees"
                  placeholder="Search name or employee ID"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="segmented" aria-label="Source comparison">
                {([
                  ["all", "All 3"],
                  ["raken-jonas", "Raken ↔ Jonas"],
                  ["jonas-paylocity", "Jonas ↔ Paylocity"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    className={sourceFilter === key ? "segment active" : "segment"}
                    onClick={() => setSourceFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="checkControl">
                <input
                  type="checkbox"
                  checked={onlyDifferences}
                  onChange={(e) => setOnlyDifferences(e.target.checked)}
                />
                Needs review only
              </label>
            </div>

            <EmployeeTable
              employees={filteredEmployees}
              dataset={dataset}
              exceptions={exceptions}
              resolved={resolved}
              sourceFilter={sourceFilter}
              onSelect={setSelectedEmployee}
            />
          </section>
        )}

        {view === "audit" && (
          <section className="pageStack">
            <PageHeading
              title="Audit trail"
              description="Every demo synchronization, resolution, and fallback action is visible here."
            />
            <div className="auditPanel">
              {audit.map((entry, index) => (
                <div className="auditRow" key={`${entry}-${index}`}>
                  <span className="auditLine" />
                  <span>{entry}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {view === "integrations" && (
          <section className="pageStack">
            <PageHeading
              title="Integrations"
              description="Payroll users would not configure these. This administration view demonstrates the intended production separation."
            />
            <div className="integrationGrid">
              <IntegrationCard source="raken" method="Public API / approved export" access="Read only" />
              <IntegrationCard source="jonas" method="Data Mart / supported reporting" access="Read only" />
              <IntegrationCard source="paylocity" method="Developer API / approved reports" access="Read only" />
            </div>

            <div className="writePanel">
              <div>
                <p className="sectionKicker">Future write capabilities</p>
                <h3>Designed, but deliberately inactive</h3>
                <p>
                  The production architecture can support approved writes later. The demo performs no external writes.
                </p>
              </div>
              <div className="writeRows">
                <div><span>Jonas payroll write</span><strong>OFF</strong></div>
                <div><span>Paylocity batch creation</span><strong>OFF</strong></div>
                <div><span>Automatic payroll submission</span><strong>NOT PLANNED FOR DEMO</strong></div>
              </div>
            </div>
          </section>
        )}
      </main>

      {selectedEmployee && (
        <EmployeeDrawer
          employee={selectedEmployee}
          dataset={dataset}
          exceptions={exceptions}
          resolved={resolved}
          onResolve={resolveException}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}

function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="pageHeading">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function SourceHealth({ syncTick }: { syncTick: number }) {
  const time = syncTick ? "just now" : undefined;
  const items: Array<[SourceName, string]> = [
    ["raken", time ?? "8:04 AM"],
    ["jonas", time ?? "8:06 AM"],
    ["paylocity", time ?? "8:08 AM"],
  ];

  return (
    <div className="sourceHealth">
      {items.map(([source, synced]) => (
        <div className="sourceHealthItem" key={source}>
          <SourceBadge source={source} />
          <div>
            <strong>Connected</strong>
            <span>Synced {synced}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Workflow({ unresolved }: { unresolved: number }) {
  const steps = [
    ["Collect", "done"],
    ["Validate", "done"],
    ["Prepare Jonas", "done"],
    ["Verify Jonas", "done"],
    ["Paylocity", "done"],
    ["Reconcile", unresolved ? "current" : "done"],
    ["Approve", unresolved ? "future" : "current"],
  ];

  return (
    <div className="workflow">
      {steps.map(([label, state], index) => (
        <div className={`workflowStep ${state}`} key={label}>
          <span className="stepIndex">{state === "done" ? "✓" : index + 1}</span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function ExceptionSummary({
  exceptions,
  employees,
  onOpen,
}: {
  exceptions: PayrollException[];
  employees: Employee[];
  onOpen: (employee: Employee) => void;
}) {
  return (
    <div className="panel">
      <div className="panelHeader">
        <div>
          <p className="sectionKicker">Attention required</p>
          <h3>{exceptions.length} unresolved exceptions</h3>
        </div>
      </div>
      <div className="summaryRows">
        {exceptions.slice(0, 5).map((item) => {
          const employee = employees.find((e) => e.id === item.employeeId)!;
          return (
            <button className="summaryRow" key={item.id} onClick={() => onOpen(employee)}>
              <span className={item.severity === "critical" ? "miniSignal critical" : "miniSignal warning"} />
              <span>
                <strong>{item.title}</strong>
                <small>{employee.name} · {item.boundary}</small>
              </span>
              <span className="chevron">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TotalsPanel({ dataset }: { dataset: ReturnType<typeof buildDemoDataset> }) {
  const r = totals(dataset.raken);
  const j = totals(dataset.jonas);
  const p = totals(dataset.paylocity);
  const rows = [
    ["Regular", r.regular, j.regular, p.regular],
    ["Overtime", r.overtime, j.overtime, p.overtime],
    ["PTO", r.pto, j.pto, p.pto],
    ["Per diem", r.perDiem, j.perDiem, p.perDiem],
  ] as const;

  return (
    <div className="panel">
      <div className="panelHeader">
        <div>
          <p className="sectionKicker">Three-way totals</p>
          <h3>Source comparison</h3>
        </div>
      </div>
      <table className="totalsTable">
        <thead>
          <tr>
            <th>Metric</th>
            <th><SourceBadge source="raken" /></th>
            <th><SourceBadge source="jonas" /></th>
            <th><SourceBadge source="paylocity" /></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, a, b, c]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{label === "Per diem" ? `$${a.toLocaleString()}` : a}</td>
              <td>{label === "Per diem" ? `$${b.toLocaleString()}` : b}</td>
              <td>{label === "Per diem" ? `$${c.toLocaleString()}` : c}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmployeeTable({
  employees,
  dataset,
  exceptions,
  resolved,
  sourceFilter,
  onSelect,
}: {
  employees: Employee[];
  dataset: ReturnType<typeof buildDemoDataset>;
  exceptions: PayrollException[];
  resolved: Set<string>;
  sourceFilter: SourceFilter;
  onSelect: (employee: Employee) => void;
}) {
  return (
    <div className="tablePanel">
      <table className="employeeTable">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Role</th>
            {sourceFilter !== "jonas-paylocity" && <th className="sourceHead rakenHead">Raken</th>}
            <th className="sourceHead jonasHead">Jonas</th>
            {sourceFilter !== "raken-jonas" && <th className="sourceHead paylocityHead">Paylocity</th>}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => {
            const r = sourceRecord(dataset, "raken", employee.id)!;
            const j = sourceRecord(dataset, "jonas", employee.id)!;
            const p = sourceRecord(dataset, "paylocity", employee.id)!;
            const hasIssue = employeeHasUnresolvedException(employee.id, exceptions, resolved);
            const hour = (record: typeof r) => record.checkCreated === false
              ? "No check"
              : `${record.regularHours + record.overtimeHours + record.ptoHours} hrs`;
            return (
              <tr key={employee.id} onClick={() => onSelect(employee)} tabIndex={0} role="button">
                <td>
                  <strong>{employee.name}</strong>
                  <small>{employee.id} · Jonas {employee.jonasId}</small>
                </td>
                <td>{employee.role}</td>
                {sourceFilter !== "jonas-paylocity" && <td className="rakenCell">{hour(r)}</td>}
                <td className="jonasCell">{hour(j)}</td>
                {sourceFilter !== "raken-jonas" && <td className="paylocityCell">{hour(p)}</td>}
                <td>
                  <span className={hasIssue ? "rowStatus review" : "rowStatus matched"}>
                    {hasIssue ? "Needs review" : "Reconciled"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {employees.length === 0 && <div className="tableEmpty">No employees match this view.</div>}
    </div>
  );
}

function EmployeeDrawer({
  employee,
  dataset,
  exceptions,
  resolved,
  onResolve,
  onClose,
}: {
  employee: Employee;
  dataset: ReturnType<typeof buildDemoDataset>;
  exceptions: PayrollException[];
  resolved: Set<string>;
  onResolve: (item: PayrollException) => void;
  onClose: () => void;
}) {
  const r = sourceRecord(dataset, "raken", employee.id)!;
  const j = sourceRecord(dataset, "jonas", employee.id)!;
  const p = sourceRecord(dataset, "paylocity", employee.id)!;
  const issue = exceptions.find((item) => item.employeeId === employee.id && !resolved.has(item.id));
  const rows: Array<[string, string | number, string | number, string | number]> = [
    ["Regular", r.regularHours, j.regularHours, p.regularHours],
    ["Overtime", r.overtimeHours, j.overtimeHours, p.overtimeHours],
    ["PTO", r.ptoHours, j.ptoHours, p.ptoHours],
    ["Per diem", `$${r.perDiem}`, `$${j.perDiem}`, `$${p.perDiem}`],
    ["Rate", `$${r.rate.toFixed(2)}`, `$${j.rate.toFixed(2)}`, `$${p.rate.toFixed(2)}`],
    ["Cost code", r.costCode, j.costCode, p.costCode],
  ];

  return (
    <div className="drawerBackdrop" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawerHeader">
          <div>
            <p className="sectionKicker">{employee.id} · {employee.role}</p>
            <h2>{employee.name}</h2>
          </div>
          <button className="iconButton" aria-label="Close employee detail" onClick={onClose}>×</button>
        </div>

        <div className={issue ? "employeeState review" : "employeeState good"}>
          <span>{issue ? "!" : "✓"}</span>
          <div>
            <strong>{issue ? "Needs review" : "Fully reconciled"}</strong>
            <p>{issue ? issue.title : "All compared values match across the available sources."}</p>
          </div>
        </div>

        <div className="drawerSection">
          <div className="sourceLegend">
            <SourceBadge source="raken" />
            <SourceBadge source="jonas" />
            <SourceBadge source="paylocity" />
          </div>
          <table className="detailTable">
            <thead>
              <tr><th>Metric</th><th>Raken</th><th>Jonas</th><th>Paylocity</th></tr>
            </thead>
            <tbody>
              {rows.map(([label, a, b, c]) => {
                const ok = a === b && b === c;
                return (
                  <tr key={label}>
                    <td>{label}</td>
                    <td className="rakenCell">{a}</td>
                    <td className="jonasCell">{b}</td>
                    <td className="paylocityCell">{c}</td>
                    <td><StatusMark ok={ok} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="drawerSection traceCard">
          <div className="traceHeading">
            <div>
              <p className="sectionKicker">Trace this employee</p>
              <h3>{issue ? issue.title : "Source path verified"}</h3>
            </div>
            {issue && <span className="boundaryChip">{issue.boundary}</span>}
          </div>

          <div className="traceFlow">
            <div className="traceNode rakenNode">
              <SourceBadge source="raken" />
              <strong>{issue?.boundary === "Raken → Jonas" ? "Source value" : "Field record"}</strong>
              <span>{r.regularHours + r.overtimeHours + r.ptoHours} total hours · job {r.project}</span>
            </div>
            <div className="traceArrow">↓</div>
            <div className="traceNode jonasNode">
              <SourceBadge source="jonas" />
              <strong>{issue?.boundary === "Raken → Jonas" ? "Difference first appears here" : "Payroll / job cost"}</strong>
              <span>{j.regularHours + j.overtimeHours + j.ptoHours} total hours · cost {j.costCode}</span>
            </div>
            <div className="traceArrow">↓</div>
            <div className="traceNode paylocityNode">
              <SourceBadge source="paylocity" />
              <strong>{p.checkCreated === false ? "No check found" : "Check representation"}</strong>
              <span>{p.checkCreated === false ? "Critical exception" : `${p.regularHours + p.overtimeHours + p.ptoHours} total hours`}</span>
            </div>
          </div>

          {issue && (
            <div className="resolutionBar">
              <div>
                <strong>{issue.detail}</strong>
                <span>Demo resolution records the action but performs no external write.</span>
              </div>
              <button className="primaryButton" onClick={() => onResolve(issue)}>Resolve demo exception</button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function IntegrationCard({
  source,
  method,
  access,
}: {
  source: SourceName;
  method: string;
  access: string;
}) {
  return (
    <article className="integrationCard">
      <div className="integrationTop">
        <SourceBadge source={source} />
        <span className="connectedTag">Connected · Demo</span>
      </div>
      <dl>
        <div><dt>Method</dt><dd>{method}</dd></div>
        <div><dt>Access</dt><dd>{access}</dd></div>
        <div><dt>Last sync</dt><dd>8:0{source === "raken" ? "4" : source === "jonas" ? "6" : "8"} AM</dd></div>
      </dl>
      <button className="secondaryButton fullWidth">Test demo connection</button>
    </article>
  );
}
