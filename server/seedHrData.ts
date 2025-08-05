import { db } from "./db";
import { hrEmployees } from "@shared/schema";

export async function seedHrEmployees() {
  try {
    console.log("Seeding HR employee data...");

    const sampleEmployees = [
      {
        employeeId: "EMP001",
        citizenId: "1234567890123",
        firstName: "Somchai",
        lastName: "Jaidee",
        email: "somchai.j@company.com",
        phone: "081-234-5678",
        department: "Engineering",
        position: "Senior Software Engineer",
        startDate: new Date("2020-03-15"),
        leaveDays: 10,
      },
      {
        employeeId: "EMP002",
        citizenId: "2345678901234",
        firstName: "Siriporn",
        lastName: "Kulkarn",
        email: "siriporn.k@company.com",
        phone: "082-345-6789",
        department: "Human Resources",
        position: "HR Manager",
        startDate: new Date("2019-08-20"),
        leaveDays: 15,
      },
      {
        employeeId: "EMP003",
        citizenId: "3456789012345",
        firstName: "Niran",
        lastName: "Thanakit",
        email: "niran.t@company.com",
        phone: "083-456-7890",
        department: "Marketing",
        position: "Marketing Specialist",
        startDate: new Date("2021-01-10"),
        leaveDays: 0,
      },
      {
        employeeId: "EMP004",
        citizenId: "4567890123456",
        firstName: "Gary",
        lastName: "Huang",
        email: "pootayan@gmail.com",
        phone: "084-567-8901",
        department: "Sales",
        position: "Pre-Sales&AI Specialist",
        startDate: new Date("2025-01-06"),
        leaveDays: 7,
      },
      {
        employeeId: "EMP004",
        citizenId: "4567890123456",
        firstName: "Jakapan",
        lastName: "Narkbuakaew",
        email: "admin@4plus.co.th",
        phone: "084-567-8901",
        department: "HR",
        position: "HR Manager",
        startDate: new Date("2018-01-06"),
        leaveDays: 15,
      },
    ];

    // Insert sample employees
    await db.insert(hrEmployees).values(sampleEmployees);

    console.log(`✓ Successfully seeded ${sampleEmployees.length} HR employees`);
    return sampleEmployees;
  } catch (error) {
    console.error("Error seeding HR employee data:", error);
    throw error;
  }
}
