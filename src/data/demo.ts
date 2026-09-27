import type { DemoDataset, Employee, PayrollRecord } from "@/lib/types";

const firstNames = [
  "Marcus","Emily","David","Sarah","James","Olivia","Anthony","Rachel","Steven","Monica",
  "Daniel","Priya","Jordan","Natalie","Andre","Maya","Christopher","Lauren","Victor","Alicia",
  "Thomas","Erica","Michael","Jasmine","Robert","Nicole","Kevin","Brianna","Samuel","Dana",
  "Jonathan","Felicia","Isaiah","Camille","Eric","Tanya","George","Monique","Ryan","Kiara",
  "Patrick","Vanessa","Terrence","Sofia","Caleb","Denise","Aaron","Whitney","Malcolm","Grace",
  "Noah","Elena"
];

const lastNames = [
  "Reed","Carter","Miles","Brooks","Cole","Bennett","Grant","Foster","Price","Hayes",
  "Wright","Patel","Morgan","Clark","Lewis","Diaz","Hall","Young","Turner","Scott",
  "Adams","King","Green","Hill","Baker","Rivera","Nelson","Campbell","Mitchell","Parker",
  "Evans","Edwards","Collins","Stewart","Morris","Rogers","Cook","Ward","Cooper","Bailey",
  "Bell","Murphy","Richardson","Cox","Howard","Torres","Peterson","Gray","Ramirez","James",
  "Watson","Wood"
];

function makeEmployees(): Employee[] {
  return firstNames.map((first, i) => ({
    id: `EMP-${String(1001 + i)}`,
    name: `${first} ${lastNames[i]}`,
    role: i % 9 === 0 ? "Salary" : i % 6 === 0 ? "Driver" : "Field",
    rakenId: `R-${String(180 + i)}`,
    jonasId: String(180 + i).padStart(5, "0"),
    paylocityId: `P-${String(180 + i).padStart(5, "0")}`,
  }));
}

function baseRecord(employee: Employee, i: number): PayrollRecord {
  const regularHours = employee.role === "Salary" ? 40 : i % 5 === 0 ? 38 : 40;
  const overtimeHours = employee.role === "Salary" ? 0 : i % 4 === 0 ? 4 : i % 7 === 0 ? 6 : 0;
  return {
    employeeId: employee.id,
    regularHours,
    overtimeHours,
    ptoHours: employee.role === "Salary" && i % 3 === 0 ? 8 : 0,
    perDiem: employee.role === "Field" && i % 4 === 1 ? 250 : 0,
    rate: 24.5 + (i % 12) * 1.25,
    project: `30${String((i % 8) + 11)}`,
    costCode: ["1000", "1100", "1200", "1400", "2100"][i % 5],
    checkCreated: true,
  };
}

export function buildDemoDataset(): DemoDataset {
  const employees = makeEmployees();
  const raken = employees.map(baseRecord);
  const jonas = raken.map((r) => ({ ...r }));
  const paylocity = raken.map((r) => ({ ...r }));

  const byId = (rows: PayrollRecord[], id: string) => rows.find((row) => row.employeeId === id)!;

  // Seven deliberate demo exceptions.
  byId(raken, "EMP-1003").overtimeHours = 8;
  byId(jonas, "EMP-1003").overtimeHours = 6;
  byId(paylocity, "EMP-1003").overtimeHours = 6;

  byId(paylocity, "EMP-1007").checkCreated = false;

  byId(raken, "EMP-1011").costCode = "1800";
  byId(jonas, "EMP-1011").costCode = "1400";
  byId(paylocity, "EMP-1011").costCode = "1400";

  byId(jonas, "EMP-1016").rate = 31.25;
  byId(paylocity, "EMP-1016").rate = 30.75;

  byId(raken, "EMP-1024").perDiem = 300;
  byId(jonas, "EMP-1024").perDiem = 300;
  byId(paylocity, "EMP-1024").perDiem = 0;

  byId(raken, "EMP-1031").ptoHours = 8;
  byId(jonas, "EMP-1031").ptoHours = 8;
  byId(paylocity, "EMP-1031").ptoHours = 0;

  byId(raken, "EMP-1040").regularHours = 40;
  byId(jonas, "EMP-1040").regularHours = 38;
  byId(paylocity, "EMP-1040").regularHours = 38;

  return { employees, raken, jonas, paylocity };
}
