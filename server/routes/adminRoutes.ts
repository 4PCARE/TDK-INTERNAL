
import type { Express } from "express";
import { isAuthenticated, isAdmin } from "../replitAuth";
import { storage } from "../storage";
import { db } from "../db";
import { users, departments } from "@shared/schema";
import { eq } from "drizzle-orm";

export function registerAdminRoutes(app: Express) {
  // Get all users (admin only)
  app.get("/api/admin/users", isAdmin, async (req: any, res) => {
    try {
      const allUsers = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          departmentId: users.departmentId,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          departmentName: departments.name,
        })
        .from(users)
        .leftJoin(departments, eq(users.departmentId, departments.id));

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Update user role (admin only)
  app.put("/api/admin/users/:id/role", isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { role } = req.body;

      if (!["user", "admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      const [updatedUser] = await db
        .update(users)
        .set({
          role,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  // Get system statistics (admin only)
  app.get("/api/admin/stats", isAdmin, async (req: any, res) => {
    try {
      const stats = await storage.getSystemStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching system stats:", error);
      res.status(500).json({ message: "Failed to fetch system stats" });
    }
  });

  // Get all departments (admin only)
  app.get("/api/admin/departments", isAdmin, async (req: any, res) => {
    try {
      const allDepartments = await db.select().from(departments);
      res.json(allDepartments);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ message: "Failed to fetch departments" });
    }
  });

  // Create department (admin only)
  app.post("/api/admin/departments", isAdmin, async (req: any, res) => {
    try {
      const { name, description } = req.body;

      const [department] = await db
        .insert(departments)
        .values({
          name,
          description,
        })
        .returning();

      res.json(department);
    } catch (error) {
      console.error("Error creating department:", error);
      res.status(500).json({ message: "Failed to create department" });
    }
  });

  // Update department (admin only)
  app.put("/api/admin/departments/:id", isAdmin, async (req: any, res) => {
    try {
      const departmentId = parseInt(req.params.id);
      const { name, description } = req.body;

      const [updatedDepartment] = await db
        .update(departments)
        .set({
          name,
          description,
          updatedAt: new Date(),
        })
        .where(eq(departments.id, departmentId))
        .returning();

      res.json(updatedDepartment);
    } catch (error) {
      console.error("Error updating department:", error);
      res.status(500).json({ message: "Failed to update department" });
    }
  });

  // Delete department (admin only)
  app.delete("/api/admin/departments/:id", isAdmin, async (req: any, res) => {
    try {
      const departmentId = parseInt(req.params.id);

      await db.delete(departments).where(eq(departments.id, departmentId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting department:", error);
      res.status(500).json({ message: "Failed to delete department" });
    }
  });
}
