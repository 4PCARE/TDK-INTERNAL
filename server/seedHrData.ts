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
      },
      {
        employeeId: "EMP004",
        citizenId: "4567890123456",
        firstName: "Pranee",
        lastName: "Suksawat",
        email: "pranee.s@company.com",
        phone: "084-567-8901",
        department: "Finance",
        position: "Financial Analyst",
        startDate: new Date("2020-11-05"),
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
