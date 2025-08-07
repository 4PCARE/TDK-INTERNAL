import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "./db";
import { hrEmployees } from "@shared/schema";
import { eq } from "drizzle-orm";

// Public HR API routes (no authentication required)
export function registerHrApiRoutes(app: Express) {
  // Public HR employee lookup by Thai Citizen ID
  app.get('/api/public/hr/employee/:citizenId', async (req, res) => {
    try {
      const { citizenId } = req.params;
      
      // Validate Thai Citizen ID format (13 digits)
      if (!citizenId || !/^\d{13}$/.test(citizenId)) {
        return res.status(400).json({ 
          success: false,
          message: "Invalid Thai Citizen ID format. Must be 13 digits." 
        });
      }

      // Look up employee in HR database
      const [employee] = await db
        .select({
          employeeId: hrEmployees.employeeId,
          name: hrEmployees.name,
          department: hrEmployees.department,
          position: hrEmployees.position,
          isActive: hrEmployees.isActive
        })
        .from(hrEmployees)
        .where(eq(hrEmployees.citizenId, citizenId))
        .limit(1);

      if (!employee || !employee.isActive) {
        return res.json({
          success: false,
          message: "No active employee found with the provided Thai Citizen ID.",
          found: false
        });
      }

      res.json({
        success: true,
        found: true,
        message: `Yes, ${employee.employeeId} ${employee.firstName} ${employee.lastName} is working in ${employee.department}`,
        data: {
          employeeId: employee.employeeId,
          name: `${employee.firstName} ${employee.lastName}`,
          department: employee.department,
          position: employee.position
        }
      });

    } catch (error) {
      console.error("HR API error:", error);
      res.status(500).json({ 
        success: false,
        message: "Internal server error" 
      });
    }
  });

  // Bulk employee lookup (for integration purposes)
  app.post('/api/public/hr/employees/lookup', async (req, res) => {
    try {
      const { citizenIds } = req.body;
      
      if (!Array.isArray(citizenIds) || citizenIds.length === 0) {
        return res.status(400).json({ 
          success: false,
          message: "citizenIds array is required" 
        });
      }

      // Validate all citizen IDs
      const invalidIds = citizenIds.filter(id => !/^\d{13}$/.test(id));
      if (invalidIds.length > 0) {
        return res.status(400).json({ 
          success: false,
          message: "Invalid Thai Citizen ID format found",
          invalidIds 
        });
      }

      // Look up employees
      const employees = await db
        .select({
          citizenId: hrEmployees.citizenId,
          employeeId: hrEmployees.employeeId,
          firstName: hrEmployees.firstName,
          lastName: hrEmployees.lastName,
          department: hrEmployees.department,
          position: hrEmployees.position,
          isActive: hrEmployees.isActive
        })
        .from(hrEmployees)
        .where(eq(hrEmployees.isActive, true));

      const results = citizenIds.map(citizenId => {
        const employee = employees.find(emp => emp.citizenId === citizenId);
        if (!employee) {
          return {
            citizenId,
            found: false,
            message: "No active employee found"
          };
        }
        
        return {
          citizenId,
          found: true,
          message: `Yes, ${employee.employeeId} ${employee.firstName} ${employee.lastName} is working in ${employee.department}`,
          data: {
            employeeId: employee.employeeId,
            name: `${employee.firstName} ${employee.lastName}`,
            department: employee.department,
            position: employee.position
          }
        };
      });

      res.json({
        success: true,
        results
      });

    } catch (error) {
      console.error("HR bulk lookup error:", error);
      res.status(500).json({ 
        success: false,
        message: "Internal server error" 
      });
    }
  });

  // API health check
  app.get('/api/public/hr/health', (req, res) => {
    res.json({
      success: true,
      message: "HR API is running",
      timestamp: new Date().toISOString()
    });
  });
}