import type { DemoDataset, PayrollException, PayrollRecord, SourceName } from "@/lib/types";

const recordMap = (rows: PayrollRecord[]) => new Map(rows.map((row) => [row.employeeId, row]));

export function reconcile(dataset: DemoDataset): PayrollException[] {
  const raken = recordMap(dataset.raken);
  const jonas = recordMap(dataset.jonas);
  const paylocity = recordMap(dataset.paylocity);
  const exceptions: PayrollException[] = [];

  for (const employee of dataset.employees) {
    const r = raken.get(employee.id)!;
    const j = jonas.get(employee.id)!;
    const p = paylocity.get(employee.id)!;

    if (p.checkCreated === false) {
      exceptions.push({
        id: `${employee.id}-missing-check`,
        employeeId: employee.id,
        kind: "missing-check",
        severity: "critical",
        title: "Missing Paylocity check",
        detail: `Jonas contains ${j.regularHours + j.overtimeHours + j.ptoHours} hours, but no Paylocity check exists.`,
        boundary: "Jonas → Paylocity",
      });
    }

    const comparisons: Array<{
      key: "regularHours" | "overtimeHours" | "ptoHours" | "perDiem";
      kind: PayrollException["kind"];
      label: string;
    }> = [
      { key: "regularHours", kind: "regular-hours", label: "Regular hours" },
      { key: "overtimeHours", kind: "overtime", label: "Overtime" },
      { key: "ptoHours", kind: "pto", label: "PTO" },
      { key: "perDiem", kind: "per-diem", label: "Per diem" },
    ];

    for (const item of comparisons) {
      if (r[item.key] !== j[item.key]) {
        exceptions.push({
          id: `${employee.id}-${item.kind}-rj`,
          employeeId: employee.id,
          kind: item.kind,
          severity: "warning",
          title: `${item.label} mismatch`,
          detail: `Raken shows ${r[item.key]}; Jonas shows ${j[item.key]}.`,
          boundary: "Raken → Jonas",
        });
      } else if (j[item.key] !== p[item.key]) {
        exceptions.push({
          id: `${employee.id}-${item.kind}-jp`,
          employeeId: employee.id,
          kind: item.kind,
          severity: "warning",
          title: `${item.label} mismatch`,
          detail: `Jonas shows ${j[item.key]}; Paylocity shows ${p[item.key]}.`,
          boundary: "Jonas → Paylocity",
        });
      }
    }

    if (r.costCode !== j.costCode) {
      exceptions.push({
        id: `${employee.id}-cost-code`,
        employeeId: employee.id,
        kind: "cost-code",
        severity: "warning",
        title: "Cost-code mismatch",
        detail: `Raken reports cost code ${r.costCode}; Jonas currently carries ${j.costCode}.`,
        boundary: "Raken → Jonas",
      });
    }

    if (j.rate !== p.rate) {
      exceptions.push({
        id: `${employee.id}-rate`,
        employeeId: employee.id,
        kind: "rate",
        severity: "warning",
        title: "Pay-rate mismatch",
        detail: `Jonas rate is $${j.rate.toFixed(2)}; Paylocity rate is $${p.rate.toFixed(2)}.`,
        boundary: "Jonas → Paylocity",
      });
    }
  }

  // Keep the demo intentionally focused on one canonical exception per employee.
  return exceptions.filter((item, index, all) =>
    all.findIndex((candidate) => candidate.employeeId === item.employeeId) === index
  );
}

export function sourceRecord(dataset: DemoDataset, source: SourceName, employeeId: string) {
  return dataset[source].find((row) => row.employeeId === employeeId);
}

export function employeeHasUnresolvedException(
  employeeId: string,
  exceptions: PayrollException[],
  resolved: Set<string>
) {
  return exceptions.some((item) => item.employeeId === employeeId && !resolved.has(item.id));
}

export function totals(rows: PayrollRecord[]) {
  return rows.reduce(
    (acc, row) => ({
      regular: acc.regular + row.regularHours,
      overtime: acc.overtime + row.overtimeHours,
      pto: acc.pto + row.ptoHours,
      perDiem: acc.perDiem + row.perDiem,
    }),
    { regular: 0, overtime: 0, pto: 0, perDiem: 0 }
  );
}
