import { tasks, projectConfig, type Task, type InsertTask, type ProjectConfig, DEFAULT_PRIORITY, type InsertProjectConfig } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  getTasks(): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, task: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<boolean>;
  getProjectConfig(): Promise<ProjectConfig>;
  setProjectConfig(config: ProjectConfig): Promise<ProjectConfig>;
}

export class DatabaseStorage implements IStorage {
  async getTasks(): Promise<Task[]> {
    return await db.select().from(tasks);
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    // Ensure dependencies is an array
    const dependencies = insertTask.dependencies || [];
    // Set default priority if not provided
    const priority = insertTask.priority || DEFAULT_PRIORITY;
    
    const [task] = await db
      .insert(tasks)
      .values({ 
        ...insertTask, 
        dependencies,
        priority,
        startWeek: 0  // Will be calculated by scheduling algorithm
      })
      .returning();

    return task;
  }

  async updateTask(id: number, updates: Partial<InsertTask>): Promise<Task | undefined> {
    const existingTask = await this.getTask(id);
    if (!existingTask) return undefined;

    // Make sure we don't override dependencies with null
    const dependencies = updates.dependencies !== undefined 
      ? updates.dependencies 
      : existingTask.dependencies;

    const [updatedTask] = await db
      .update(tasks)
      .set({ 
        ...updates,
        dependencies
      })
      .where(eq(tasks.id, id))
      .returning();

    return updatedTask;
  }

  async deleteTask(id: number): Promise<boolean> {
    // First get all tasks to check dependencies
    const allTasks = await this.getTasks();
    
    // Update any tasks that had this task as a dependency
    for (const task of allTasks) {
      if (task.dependencies && task.dependencies.includes(id.toString())) {
        const updatedDependencies = task.dependencies.filter(
          (dep: string) => dep !== id.toString()
        );
        await db
          .update(tasks)
          .set({ dependencies: updatedDependencies })
          .where(eq(tasks.id, task.id));
      }
    }
    
    // Now delete the task
    const result = await db.delete(tasks).where(eq(tasks.id, id)).returning();
    return result.length > 0;
  }

  async getProjectConfig(): Promise<ProjectConfig> {
    // Try to get existing config
    const [config] = await db.select().from(projectConfig);
    
    if (config) {
      return {
        teamCapacity: config.teamCapacity,
        maxEngineersPerTask: config.maxEngineersPerTask || 2
      };
    }
    
    // If no config exists, create default config
    return this.setProjectConfig({ 
      teamCapacity: 3, 
      maxEngineersPerTask: 2 
    });
  }

  async setProjectConfig(config: ProjectConfig): Promise<ProjectConfig> {
    // Check if config exists
    const [existingConfig] = await db.select().from(projectConfig);
    
    if (existingConfig) {
      // Update existing config
      const [updatedConfig] = await db
        .update(projectConfig)
        .set({ 
          teamCapacity: config.teamCapacity,
          maxEngineersPerTask: config.maxEngineersPerTask
        })
        .where(eq(projectConfig.id, existingConfig.id))
        .returning();
      
      return {
        teamCapacity: updatedConfig.teamCapacity,
        maxEngineersPerTask: updatedConfig.maxEngineersPerTask
      };
    } else {
      // Create new config
      const [newConfig] = await db
        .insert(projectConfig)
        .values({ 
          teamCapacity: config.teamCapacity,
          maxEngineersPerTask: config.maxEngineersPerTask
        })
        .returning();
      
      return {
        teamCapacity: newConfig.teamCapacity,
        maxEngineersPerTask: newConfig.maxEngineersPerTask
      };
    }
  }
}

export const storage = new DatabaseStorage();
