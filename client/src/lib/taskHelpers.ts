import { Task } from "@shared/schema";

/**
 * Validates if adding a dependency would create a circular reference
 * 
 * @param taskId The ID of the task we're adding dependencies to
 * @param newDependencyId The ID of the dependency we want to add
 * @param allTasks All tasks in the system
 * @returns true if adding this dependency would create a cycle
 */
export function wouldCreateCycle(
  taskId: string, 
  newDependencyId: string, 
  allTasks: Task[]
): boolean {
  if (taskId === newDependencyId) return true;
  
  const visited = new Set<string>();
  const dependencyMap = new Map<string, string[]>();
  
  // Build dependency map
  allTasks.forEach(task => {
    dependencyMap.set(task.id.toString(), task.dependencies?.map(String) || []);
  });
  
  // Add the new potential dependency
  const currentDeps = dependencyMap.get(taskId) || [];
  dependencyMap.set(taskId, [...currentDeps, newDependencyId]);
  
  // Check for cycles starting from the dependency
  function hasCycle(currentId: string, path = new Set<string>()): boolean {
    if (path.has(currentId)) return true;
    if (visited.has(currentId)) return false;
    
    visited.add(currentId);
    path.add(currentId);
    
    const dependencies = dependencyMap.get(currentId) || [];
    for (const depId of dependencies) {
      if (hasCycle(depId, new Set(path))) return true;
    }
    
    path.delete(currentId);
    return false;
  }
  
  return hasCycle(newDependencyId);
}

/**
 * Gets a list of tasks that depend on the given task
 * 
 * @param taskId The task ID to check
 * @param allTasks All tasks in the system
 * @returns Array of task IDs that depend on the given task
 */
export function getDependentTasks(taskId: string, allTasks: Task[]): string[] {
  return allTasks
    .filter(task => task.dependencies?.includes(taskId))
    .map(task => task.id.toString());
}

/**
 * Gets the earliest possible start week for a task based on its dependencies
 * 
 * @param task The task to check
 * @param allTasks All tasks in the system
 * @returns The earliest possible start week
 */
export function getEarliestStartWeek(task: Task, allTasks: Task[]): number {
  if (!task.dependencies?.length) return 0;
  
  let earliestWeek = 0;
  
  task.dependencies.forEach(depId => {
    const depTask = allTasks.find(t => t.id.toString() === depId);
    if (depTask) {
      earliestWeek = Math.max(earliestWeek, depTask.startWeek + depTask.effort);
    }
  });
  
  return earliestWeek;
}
