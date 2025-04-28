import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Default priority value, lower number = higher priority
export const DEFAULT_PRIORITY = 100;

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  effort: integer("effort").notNull(), // In person-weeks
  startWeek: integer("start_week").default(0),
  dependencies: text("dependencies").array(), // Store task IDs
  priority: integer("priority").default(DEFAULT_PRIORITY), // Lower number = higher priority
});

export const projectConfig = pgTable("project_config", {
  id: serial("id").primaryKey(),
  teamCapacity: integer("team_capacity").notNull().default(3),
  maxEngineersPerTask: integer("max_engineers_per_task").notNull().default(2),
});

export const insertTaskSchema = createInsertSchema(tasks).pick({
  name: true,
  effort: true,
  dependencies: true,
  priority: true,
});

export const taskSchema = createInsertSchema(tasks);

export const insertProjectConfigSchema = createInsertSchema(projectConfig).pick({
  teamCapacity: true,
  maxEngineersPerTask: true,
});

export const projectConfigSchema = z.object({
  teamCapacity: z.number().int().min(1).max(100),
  maxEngineersPerTask: z.number().int().min(1).max(10),
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertProjectConfig = z.infer<typeof insertProjectConfigSchema>;
export type ProjectConfig = z.infer<typeof projectConfigSchema>;
