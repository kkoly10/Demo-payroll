"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function InfoHint({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="infoHint" ref={rootRef}>
      <button
        type="button"
        className="infoTrigger"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        i
      </button>
      {open && (
        <div className="infoPopover" role="note">
          <button
            type="button"
            className="popoverClose"
            aria-label="Close guidance"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <div className="infoPopoverBody">{children}</div>
        </div>
      )}
    </div>
  );
}

function HelpGuide() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="helpGuideButton"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="helpIcon">i</span>
        Quick guide
      </button>
      {open && (
        <div className="guideBackdrop" onMouseDown={() => setOpen(false)}>
          <aside
            className="guidePanel"
            aria-label="How to read Reconciliation"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="guidePanelHeader">
              <div>
                <p className="sectionKicker">Quick guide</p>
                <h2>How to read Reconciliation</h2>
              </div>
              <button
                type="button"
                className="iconButton"
                aria-label="Close quick guide"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="guideLead">
              <strong>Purpose</strong>
              <span>Verify that payroll data stays consistent as it moves through the systems, then focus people only on the items that need judgment.</span>
            </div>

            <div className="guideSteps">
              <div>
                <span className="guideNumber">1</span>
                <div>
                  <strong>Start with exceptions.</strong>
                  <span>These are employees or payroll components that do not currently agree across the compared sources.</span>
                </div>
              </div>
              <div>
                <span className="guideNumber">2</span>
                <div>
                  <strong>Trace before correcting.</strong>
                  <span>Trace shows where the values first stop matching so Payroll can investigate the right handoff.</span>
                </div>
              </div>
              <div>
                <span className="guideNumber">3</span>
                <div>
                  <strong>Use View all for reassurance.</strong>
                  <span>Every employee remains available for spot-checking or full manual review.</span>
                </div>
              </div>
            </div>

            <div className="guideSourceLegend">
              <div><SourceBadge source="raken" /><span>Field time & project context</span></div>
              <div><SourceBadge source="jonas" /><span>Payroll, accounting & job cost</span></div>
              <div><SourceBadge source="paylocity" /><span>Employee checks & payroll processing</span></div>
            </div>

            <div className="guideCaution">
              <strong>Reconciled ≠ submitted.</strong>
              <span>It means the compared values agree. Payroll approval and submission remain separate controlled actions.</span>
            </div>

            <button className="primaryButton fullWidth" onClick={() => setOpen(false)}>
              Got it
            </button>
          </aside>
        </div>
      )}
    </>
  );
}

function exceptionAppliesToFilter(item: PayrollException, filter: SourceFilter) {
  if (filter === "all") return true;
  if (filter === "raken-jonas") return item.boundary === "Raken → Jonas";
  return item.boundary === "Jonas → Paylocity";
}

function applyDemoCorrections(
  base: ReturnType<typeof buildDemoDataset>,
  resolvedIds: Set<string>,
  originalExceptions: PayrollException[]
) {
  const copy = {
    employees: base.employees.map((employee) => ({ ...employee })),
    raken: base.raken.map((row) => ({ ...row })),
    jonas: base.jonas.map((row) => ({ ...row })),
    paylocity: base.paylocity.map((row) => ({ ...row })),
  };

  const get = (rows: typeof copy.raken, id: string) =>
    rows.find((row) => row.employeeId === id)!;

  for (const item of originalExceptions) {
    if (!resolvedIds.has(item.id)) continue;
    const r = get(copy.raken, item.employeeId);
    const j = get(copy.jonas, item.employeeId);
    const p = get(copy.paylocity, item.employeeId);

    if (item.kind === "missing-check") {
      p.checkCreated = true;
      p.regularHours = j.regularHours;
      p.overtimeHours = j.overtimeHours;
      p.ptoHours = j.ptoHours;
      p.perDiem = j.perDiem;
      p.rate = j.rate;
      p.costCode = j.costCode;
      continue;
    }

    const keyByKind = {
      "regular-hours": "regularHours",
      overtime: "overtimeHours",
      pto: "ptoHours",
      "per-diem": "perDiem",
      rate: "rate",
      "cost-code": "costCode",
    } as const;
    const key = keyByKind[item.kind as keyof typeof keyByKind];
    if (!key) continue;

    if (item.boundary === "Raken → Jonas") {
      (j as unknown as Record<string, string | number>)[key] =
        (r as unknown as Record<string, string | number>)[key];
      (p as unknown as Record<string, string | number>)[key] =
        (r as unknown as Record<string, string | number>)[key];
    } else {
      (p as unknown as Record<string, string | number>)[key] =
        (j as unknown as Record<string, string | number>)[key];
    }
  }

  return copy;
}

export default function ReconciliationApp() {
  const baseDataset = useMemo(() => buildDemoDataset(), []);
  const originalExceptions = useMemo(() => reconcile(baseDataset), [baseDataset]);

  const [view, setView] = useState<View>("overview");
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [audit, setAudit] = useState(initialAudit);
  const [syncTick, setSyncTick] = useState(0);

  const dataset = useMemo(
    () => applyDemoCorrections(baseDataset, resolved, originalExceptions),
    [baseDataset, resolved, originalExceptions]
  );
  const exceptions = useMemo(
    () => reconcile(dataset).sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
      return a.title.localeCompare(b.title);
    }),
    [dataset]
  );
  const unresolved = exceptions;
  const criticalCount = unresolved.filter((item) => item.severity === "critical").length;
  const matchedCount = dataset.employees.filter(
    (employee) => !employeeHasUnresolvedException(employee.id, exceptions, new Set())
  ).length;

  const filteredEmployees = dataset.employees.filter((employee) => {
    const matches = employee.name.toLowerCase().includes(search.toLowerCase()) ||
      employee.id.toLowerCase().includes(search.toLowerCase()) ||
      employee.jonasId.toLowerCase().includes(search.toLowerCase());
    const hasIssue = exceptions.some(
      (item) => item.employeeId === employee.id && exceptionAppliesToFilter(item, sourceFilter)
    );
    return matches && (!onlyDifferences || hasIssue);
  });

  const resolveException = (item: PayrollException) => {
    const original = originalExceptions.find(
      (candidate) => candidate.employeeId === item.employeeId && candidate.kind === item.kind
    ) ?? item;
    setResolved((current) => new Set([...current, original.id]));
    const employee = dataset.employees.find((e) => e.id === item.employeeId);
    setAudit((current) => [
      `${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Demo correction applied for ${employee?.name ?? item.employeeId}: ${item.title}`,
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
      currentExceptions: exceptions,
      originalExceptions,
      simulatedCorrectionIds: Array.from(resolved),
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
          <div className="demoControlLinks">
            <button className="resetLink" onClick={simulateSync}>Refresh demo data</button>
            <button className="resetLink" onClick={resetDemo}>Reset demo</button>
          </div>
        </div>
      </aside>

      <main className="mainPanel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Weekly payroll</p>
            <h1>Sep 20 – Sep 26, 2026</h1>
            <p className="topbarPurpose">Compare the same payroll across Raken, Jonas, and Paylocity before approval.</p>
          </div>
          <div className="topActions">
            <HelpGuide />
            <span className="demoNotice">DEMO · Synthetic data only</span>
          </div>
        </header>

        {view === "overview" && (
          <section className="pageStack">
            <div className="overviewPurpose">
              <div>
                <span className="purposeLabel">What this view answers</span>
                <strong>Does this pay period agree across the systems, and what needs human review?</strong>
              </div>
              <span className="purposePath"><b className="rakenText">Raken</b><i>→</i><b className="jonasText">Jonas</b><i>→</i><b className="paylocityText">Paylocity</b></span>
            </div>

            <div className="statusHero">
              <div>
                <div className="kickerWithInfo">
                  <p className="sectionKicker">Payroll status</p>
                  <InfoHint label="What does payroll status mean?">
                    <strong>Needs review</strong> means at least one compared value does not agree. <strong>Ready for approval</strong> means the available comparisons pass; it does not submit payroll.
                  </InfoHint>
                </div>
                <div className="heroStatusRow">
                  <span className={unresolved.length ? "heroSignal warning" : "heroSignal success"} />
                  <h2>{unresolved.length ? "Needs review" : "Ready for approval"}</h2>
                </div>
                <p className="heroCopy">
                  {matchedCount} of {dataset.employees.length} employees fully reconcile across the available sources. No payroll change happens from this screen.
                </p>
                <div className="heroStats" aria-label="Payroll reconciliation summary">
                  <div><strong>{matchedCount}</strong><span>Reconciled</span></div>
                  <div><strong>{unresolved.length}</strong><span>Needs review</span></div>
                  <div className={criticalCount ? "heroStatCritical" : ""}><strong>{criticalCount}</strong><span>Critical</span></div>
                </div>
                <p className="nextAction">
                  <strong>Next:</strong> review the {unresolved.length} exceptions. Use <em>View all employees</em> whenever you want to independently spot-check the full payroll.
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

            <div className="sectionLabelRow">
              <div>
                <span>Source health</span>
                <InfoHint label="What are these sources?">
                  <div className="sourceHelpRows">
                    <p><b className="rakenText">Raken</b> supplies field time and project/cost context.</p>
                    <p><b className="jonasText">Jonas</b> represents construction payroll, accounting, and job-cost allocation.</p>
                    <p><b className="paylocityText">Paylocity</b> represents employee payroll/check data used for payroll processing.</p>
                    <p>If a required source is stale or unavailable, production should block an automated ready state and point Payroll to the manual fallback.</p>
                  </div>
                </InfoHint>
              </div>
              <small>Colors stay consistent everywhere in the app.</small>
            </div>
            <SourceHealth syncTick={syncTick} />

            <div className="sectionLabelRow compactLabel">
              <div>
                <span>Payroll journey</span>
                <InfoHint label="How do I read the payroll journey?">
                  This shows where the pay period sits in the workflow. A completed step means its demo check has passed; the highlighted step is where attention is currently focused.
                </InfoHint>
              </div>
              <small>Current stage: {unresolved.length ? "Reconcile" : "Approve"}</small>
            </div>
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
                <div className="inlineTitleWithInfo">
                  <strong>Manual controls remain available.</strong>
                  <InfoHint label="What is the fallback?">
                    Reconciliation should never trap Payroll inside automation. If a connection is unavailable or someone wants independent reassurance, they can inspect all employees, compare source pairs, export the source packet, and continue the established manual process.
                  </InfoHint>
                </div>
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
              description="Only unresolved differences are prioritized here. A boundary shows where values first stop matching—not a proven root cause. The complete employee population remains one click away."
              action={
                <div className="headingActions">
                  <InfoHint label="What should I do with an exception?">
                    Open <strong>Trace</strong> to inspect the source values. <strong>Simulate correction</strong> changes only the synthetic demo copy and re-runs reconciliation. Production would correct the authoritative source or record an approved exception, then synchronize again.
                  </InfoHint>
                  <button className="secondaryButton" onClick={() => setView("employees")}>View all employees</button>
                </div>
              }
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
                    <div className="boundaryWithInfo">
                      <div className="boundaryChip">First mismatch · {item.boundary}</div>
                      <InfoHint label="What does boundary mean?">
                        The boundary is the first transition where the compared values stop agreeing. It helps narrow investigation, but it does not by itself prove the root cause.
                      </InfoHint>
                    </div>
                    <div className="rowActions">
                      <button className="textButton" onClick={() => setSelectedEmployee(employee)}>Trace</button>
                      <button className="secondaryButton compact" onClick={() => resolveException(item)}>Simulate correction</button>
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
              action={
                <div className="headingActions">
                  <InfoHint label="Why view all employees?">
                    This is the manual reassurance path. Use it to spot-check the system, inspect a fully reconciled employee, or compare only Raken ↔ Jonas or Jonas ↔ Paylocity.
                  </InfoHint>
                  <button className="secondaryButton" onClick={downloadManualPacket}>Export source packet</button>
                </div>
              }
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

              <div className="filterWithHint">
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
                <InfoHint label="What do source filters do?">
                  <strong>All 3</strong> shows the full chain. <strong>Raken ↔ Jonas</strong> checks whether field time made it into payroll/job cost correctly. <strong>Jonas ↔ Paylocity</strong> checks whether prepared payroll made it into employee checks correctly.
                </InfoHint>
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
              sourceFilter={sourceFilter}
              onSelect={setSelectedEmployee}
            />
          </section>
        )}

        {view === "audit" && (
          <section className="pageStack">
            <PageHeading
              title="Audit trail"
              description="Every demo synchronization, resolution, and fallback action is visible here. Production would persist this history server-side so payroll decisions remain traceable."
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
              description="Payroll users would not configure these. IT manages connections in the background; Payroll should open the app and see current information already available."
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
  const items: Array<[SourceName, string, string]> = [
    ["raken", time ?? "8:04 AM", "Field time & project context"],
    ["jonas", time ?? "8:06 AM", "Payroll, accounting & job cost"],
    ["paylocity", time ?? "8:08 AM", "Employee checks & payroll"],
  ];

  return (
    <div className="sourceHealth">
      {items.map(([source, synced, role]) => (
        <div className="sourceHealthItem" key={source}>
          <SourceBadge source={source} />
          <div className="sourceHealthCopy">
            <strong>{role}</strong>
            <span>Demo snapshot · {synced}</span>
          </div>
          <span className="sourceReady">Available</span>
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
  const commonIds = new Set(
    dataset.raken.filter((row) => row.sourceApplicable !== false).map((row) => row.employeeId)
  );
  const r = totals(dataset.raken.filter((row) => commonIds.has(row.employeeId)));
  const j = totals(dataset.jonas.filter((row) => commonIds.has(row.employeeId)));
  const p = totals(dataset.paylocity.filter((row) => commonIds.has(row.employeeId)));
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
          <div className="kickerWithInfo">
            <p className="sectionKicker">Three-way totals</p>
            <InfoHint label="How should I use these totals?">
              Totals are a quick control, not enough by themselves. This demo uses employees expected across all three sources; salary-only paths are excluded. Two employee-level errors can offset each other while the grand total still matches.
            </InfoHint>
          </div>
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
  sourceFilter,
  onSelect,
}: {
  employees: Employee[];
  dataset: ReturnType<typeof buildDemoDataset>;
  exceptions: PayrollException[];
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
            const hasIssue = exceptions.some(
              (item) => item.employeeId === employee.id && exceptionAppliesToFilter(item, sourceFilter)
            );
            const hour = (record: typeof r) => record.sourceApplicable === false
              ? "Not expected"
              : record.checkCreated === false
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
  onResolve,
  onClose,
}: {
  employee: Employee;
  dataset: ReturnType<typeof buildDemoDataset>;
  exceptions: PayrollException[];
  onResolve: (item: PayrollException) => void;
  onClose: () => void;
}) {
  const r = sourceRecord(dataset, "raken", employee.id)!;
  const j = sourceRecord(dataset, "jonas", employee.id)!;
  const p = sourceRecord(dataset, "paylocity", employee.id)!;
  const issue = exceptions.find((item) => item.employeeId === employee.id);
  const rakenValue = (value: string | number) =>
    r.sourceApplicable === false ? "Not expected" : value;
  const rows: Array<[string, string | number, string | number, string | number]> = [
    ["Regular", rakenValue(r.regularHours), j.regularHours, p.regularHours],
    ["Overtime", rakenValue(r.overtimeHours), j.overtimeHours, p.overtimeHours],
    ["PTO", rakenValue(r.ptoHours), j.ptoHours, p.ptoHours],
    ["Per diem", rakenValue(`$${r.perDiem}`), `$${j.perDiem}`, `$${p.perDiem}`],
    ["Rate", rakenValue(`$${r.rate.toFixed(2)}`), `$${j.rate.toFixed(2)}`, `$${p.rate.toFixed(2)}`],
    ["Cost code", rakenValue(r.costCode), j.costCode, p.costCode],
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
                const ok = a === "Not expected" ? b === c : a === b && b === c;
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
              <div className="kickerWithInfo">
                <p className="sectionKicker">Trace this employee</p>
                <InfoHint label="What does Trace show?">
                  Trace follows the same employee through the source systems and highlights where values first diverge. It is evidence for investigation, not an automatic payroll correction.
                </InfoHint>
              </div>
              <h3>{issue ? issue.title : "Source path verified"}</h3>
            </div>
            {issue && <span className="boundaryChip">First mismatch · {issue.boundary}</span>}
          </div>

          <div className="traceFlow">
            <div className="traceNode rakenNode">
              <SourceBadge source="raken" />
              <strong>{r.sourceApplicable === false ? "Not part of this employee path" : issue?.boundary === "Raken → Jonas" ? "Source value" : "Field record"}</strong>
              <span>{r.sourceApplicable === false ? "Salary payroll does not originate in Raken." : `${r.regularHours + r.overtimeHours + r.ptoHours} total hours · job ${r.project}`}</span>
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
                <span>The demo aligns the synthetic downstream value and re-runs reconciliation. Production would require correcting the authoritative source or documenting an approved exception, then re-syncing.</span>
              </div>
              <button className="primaryButton" onClick={() => onResolve(issue)}>Simulate correction</button>
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
