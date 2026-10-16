export type AuthoritySource = "raken" | "jonas" | "paylocity" | "supporting-input" | "human";
export type AuthorityStatus = "proposed" | "confirmed" | "ambiguous";

export type PayrollFact =
  | "employee-identity"
  | "approved-field-time"
  | "job-cost-code"
  | "pto-balance"
  | "pay-rate"
  | "salary-pay"
  | "holiday"
  | "per-diem-eligibility"
  | "per-diem-amount"
  | "deduction"
  | "final-check"
  | "payroll-approval"
  | "payroll-submission"
  | "jonas-closeout";

export type AuthorityRule = {
  fact: PayrollFact;
  source: AuthoritySource;
  status: AuthorityStatus;
  effectiveFrom: string;
  evidenceRequired: string[];
  notes?: string;
};

export type AuthorityMatrix = {
  version: number;
  rules: AuthorityRule[];
};

export type ProductionRole =
  | "platform-admin"
  | "application-admin"
  | "payroll-operator"
  | "payroll-approver"
  | "security-auditor";

export type PayrollPeriod = {
  id: string;
  kind: "primary" | "supplemental" | "retro";
  periodEnding: string;
  parentPeriodId?: string;
};

export type ConfigurationPins = {
  authorityMatrixVersion: number;
  ruleSetVersion: number;
  mappingSetVersion: number;
  identitySetVersion: number;
};

export type SourcePin = {
  source: "raken" | "jonas" | "paylocity" | "supporting-input";
  revision: string;
  capturedAt: string;
};

export type PayrollRunDefinition = {
  id: string;
  companyId: string;
  periods: PayrollPeriod[];
  pins: Readonly<ConfigurationPins>;
  sources: readonly SourcePin[];
  createdAt: string;
};

export type ChangeScope = "authority" | "rule" | "mapping" | "identity" | "integration" | "ui";
export type ChangeState = "draft" | "in-review" | "approved" | "published" | "rejected";

export type ChangeRequest = {
  id: string;
  scope: ChangeScope;
  sensitive: boolean;
  authorId: string;
  title: string;
  before: unknown;
  after: unknown;
  state: ChangeState;
  reviewerId?: string;
  approvedAt?: string;
  effectiveAt?: string;
};

export type AuditEvent = {
  id: string;
  at: string;
  actorId: string;
  type: string;
  runId?: string;
  evidenceRevision?: string;
  detail: string;
};

export type ApprovalStamp = {
  actorId: string;
  runId: string;
  evidenceKey: string;
  configurationKey: string;
  at: string;
};

export function authorityFor(matrix: AuthorityMatrix, fact: PayrollFact): AuthorityRule | null {
  return matrix.rules.find(rule => rule.fact === fact) ?? null;
}

export function confirmedAuthorityFor(matrix: AuthorityMatrix, fact: PayrollFact): AuthorityRule | null {
  const rule = authorityFor(matrix, fact);
  return rule?.status === "confirmed" ? rule : null;
}

export function assertAuthorityMatrixComplete(matrix: AuthorityMatrix, requiredFacts: PayrollFact[]): void {
  const facts = new Set(matrix.rules.map(rule => rule.fact));
  const missing = requiredFacts.filter(fact => !facts.has(fact));
  if (missing.length) throw new Error(`Authority matrix is missing: ${missing.join(", ")}`);
  const duplicates = matrix.rules.filter((rule, index) =>
    matrix.rules.findIndex(other => other.fact === rule.fact) !== index
  );
  if (duplicates.length) {
    throw new Error(`Authority matrix has duplicate facts: ${[...new Set(duplicates.map(rule => rule.fact))].join(", ")}`);
  }
}

export function createPayrollRun(input: PayrollRunDefinition): PayrollRunDefinition {
  if (!input.periods.length) throw new Error("Payroll run requires at least one period.");
  if (input.periods.filter(period => period.kind === "primary").length !== 1) {
    throw new Error("Payroll run requires exactly one primary period.");
  }
  if (new Set(input.periods.map(period => period.id)).size !== input.periods.length) {
    throw new Error("Payroll period IDs must be unique.");
  }
  const known = new Set(input.periods.map(period => period.id));
  for (const period of input.periods) {
    if (period.kind !== "primary" && period.parentPeriodId && !known.has(period.parentPeriodId)) {
      throw new Error(`Unknown parent period: ${period.parentPeriodId}`);
    }
  }
  const pins = Object.freeze({ ...input.pins });
  const sources = Object.freeze(input.sources.map(source => Object.freeze({ ...source })));
  const periods = Object.freeze(input.periods.map(period => Object.freeze({ ...period }))) as unknown as PayrollPeriod[];
  return Object.freeze({ ...input, pins, sources, periods });
}

export function configurationKey(pins: ConfigurationPins): string {
  return `${pins.authorityMatrixVersion}:${pins.ruleSetVersion}:${pins.mappingSetVersion}:${pins.identitySetVersion}`;
}

export function configurationHasDrift(run: PayrollRunDefinition, current: ConfigurationPins): boolean {
  return configurationKey(run.pins) !== configurationKey(current);
}

export function canApproveChange(role: ProductionRole, actorId: string, change: ChangeRequest): boolean {
  if (change.sensitive && actorId === change.authorId) return false;
  if (change.scope === "ui" || change.scope === "integration") {
    return role === "platform-admin" || role === "application-admin";
  }
  return role === "payroll-approver";
}

export function approveChange(change: ChangeRequest, actorId: string, role: ProductionRole, at: string): ChangeRequest {
  if (change.state !== "in-review") throw new Error("Only a change in review can be approved.");
  if (!canApproveChange(role, actorId, change)) throw new Error("Actor is not allowed to approve this change.");
  return { ...change, state: "approved", reviewerId: actorId, approvedAt: at };
}

export function publishChange(change: ChangeRequest, effectiveAt: string): ChangeRequest {
  if (change.state !== "approved") throw new Error("Only an approved change can be published.");
  return { ...change, state: "published", effectiveAt };
}

export function appendAuditEvent(events: readonly AuditEvent[], event: AuditEvent): readonly AuditEvent[] {
  if (events.some(existing => existing.id === event.id)) {
    throw new Error(`Duplicate audit event: ${event.id}`);
  }
  return Object.freeze([...events, Object.freeze({ ...event })]);
}

export function approvalIsCurrent(stamp: ApprovalStamp, run: PayrollRunDefinition, evidenceKey: string): boolean {
  return stamp.runId === run.id
    && stamp.evidenceKey === evidenceKey
    && stamp.configurationKey === configurationKey(run.pins);
}

export function canPerformPayrollApproval(role: ProductionRole): boolean {
  return role === "payroll-approver";
}
