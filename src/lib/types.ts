export type SourceName = "raken" | "jonas" | "paylocity";

export type PayrollRecord = {
  employeeId: string;
  regularHours: number;
  overtimeHours: number;
  ptoHours: number;
  perDiem: number;
  rate: number;
  project: string;
  costCode: string;
  checkCreated?: boolean;
  sourceApplicable?: boolean;
};

export type Employee = {
  id: string;
  name: string;
  role: "Field" | "Driver" | "Salary";
  rakenId: string;
  jonasId: string;
  paylocityId: string;
};

export type ExceptionKind =
  | "missing-check"
  | "regular-hours"
  | "overtime"
  | "pto"
  | "per-diem"
  | "rate"
  | "cost-code";

export type PayrollException = {
  id: string;
  employeeId: string;
  kind: ExceptionKind;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  boundary: "Raken → Jonas" | "Jonas → Paylocity" | "Needs review";
};

export type DemoDataset = {
  employees: Employee[];
  raken: PayrollRecord[];
  jonas: PayrollRecord[];
  paylocity: PayrollRecord[];
};
