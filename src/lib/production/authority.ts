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
  const duplicates = matrix.rules.filter((rule, index) => matrix.rules.findIndex(other => other.fact === rule.fact) !== index);
  if (duplicates.length) throw new Error(`Authority matrix has duplicate facts: ${[...new Set(duplicates.map(rule => rule.fact))].join(", ")}`);
}
