import { Task, DEFAULT_PRIORITY } from "@shared/schema";

interface ScheduleTask extends Task {
  assignedResources: number;
  originalEffort?: number; // Store original effort for recalculations
  optimized?: boolean;     // Flag to track if task has been optimized
}

/**
 * Calculate the schedule based on task dependencies, priorities, and team capacity
 * 
 * This algorithm:
 * 1. Sorts tasks by dependencies (topological sort)
 * 2. Assigns more resources to high priority tasks
 * 3. Schedules high priority tasks first
 * 4. Ensures no week exceeds team capacity
 * 5. Dynamically reassigns engineers to next priority tasks when tasks finish
 * 
 * @param tasks List of tasks to schedule
 * @param teamCapacity Maximum number of engineers per week
 * @param maxEngineersPerTask Maximum number of engineers that can work on a single task
 * @returns Scheduled tasks with start weeks calculated
 */
export function calculateSchedule(tasks: Task[], teamCapacity: number, maxEngineersPerTask: number = 2): Task[] {
  if (!tasks.length) return [];

  // Create a copy of tasks to work with and assign resources based on priority
  const scheduleTasks: ScheduleTask[] = tasks.map(task => {
    // Assign resources based on numeric priority (lower number = higher priority)
    let assignedResources = 1; // Default 1 engineer per task
    let adjustedEffort = task.effort; // By default, effort doesn't change
    
    const priority = task.priority ?? DEFAULT_PRIORITY;
    
    if (priority <= 10) {
      // High priority tasks (1-10) get full maxEngineersPerTask allocation
      assignedResources = Math.min(maxEngineersPerTask, teamCapacity);
      
      // Adjust the task duration based on assigned resources
      // More engineers = faster completion (with some diminishing returns)
      if (assignedResources > 1) {
        const efficiency = 0.9; // Efficiency factor (< 1 due to coordination overhead)
        adjustedEffort = Math.max(1, Math.ceil(task.effort / (assignedResources * efficiency)));
      }
    } else if (priority <= 100) {
      // Medium priority tasks (11-100) get up to 75% of maxEngineersPerTask
      const mediumTaskEngineers = Math.max(1, Math.floor(maxEngineersPerTask * 0.75));
      assignedResources = Math.min(mediumTaskEngineers, teamCapacity);
      
      // Apply a similar efficiency calculation for medium priority tasks
      if (assignedResources > 1) {
        const efficiency = 0.85; // Slightly lower efficiency factor
        adjustedEffort = Math.max(1, Math.ceil(task.effort / (assignedResources * efficiency)));
      }
    }
    // Low priority tasks (101+) get just 1 engineer
    
    return {
      ...task,
      assignedResources,
      effort: adjustedEffort,
      originalEffort: task.effort, // Save the original effort for display purposes
    };
  });

  // Create a map of task ID to task object for easy lookup
  const taskMap = new Map<string, ScheduleTask>();
  scheduleTasks.forEach(task => {
    taskMap.set(task.id.toString(), task);
  });

  /**
   * Calculate the earliest possible start week for a task based on its dependencies
   */
  function getEarliestStartWeek(task: ScheduleTask, tasks: ScheduleTask[]): number {
    if (!task.dependencies || task.dependencies.length === 0) {
      return 0; // No dependencies, can start immediately
    }
    
    let earliestWeek = 0;
    
    // Find the latest end week among all dependencies
    for (const depId of task.dependencies) {
      const depTask = tasks.find(t => t.id.toString() === depId);
      if (depTask) {
        const depEndWeek = (depTask.startWeek || 0) + depTask.effort;
        earliestWeek = Math.max(earliestWeek, depEndWeek);
      }
    }
    
    return earliestWeek;
  }

  // Topologically sort tasks (handle dependencies first)
  const topoSortedTasks = topologicalSort(scheduleTasks, taskMap);
  if (!topoSortedTasks) {
    // If there's a cycle, return the original tasks with a warning
    console.error("Circular dependency detected in tasks");
    return tasks;
  }

  // Sort tasks by numeric priority (lower number = higher priority)
  const sortedTasks = [...topoSortedTasks].sort((a, b) => {
    // If tasks depend on each other, respect the topological order
    const aDepends = a.dependencies?.includes(b.id.toString()) || false;
    const bDepends = b.dependencies?.includes(a.id.toString()) || false;
    
    if (aDepends) return 1; // a depends on b, so b must come first
    if (bDepends) return -1; // b depends on a, so a must come first
    
    // Otherwise, prioritize by numeric priority (lower numbers first)
    const aPriority = a.priority ?? DEFAULT_PRIORITY;
    const bPriority = b.priority ?? DEFAULT_PRIORITY;
    
    return aPriority - bPriority;
  });

  // Initialize resource tracking
  const resourcesUsedByWeek: number[] = [];
  const resourceEndEvents: {week: number, resources: number}[] = [];
  
  // First pass: Schedule all tasks and track resource usage
  for (const task of sortedTasks) {
    // Find the earliest week where all dependencies are completed
    let earliestWeek = 0;
    
    if (task.dependencies?.length) {
      task.dependencies.forEach(depId => {
        const depTask = taskMap.get(depId);
        if (depTask) {
          // A task can start only after all its dependencies are completed
          earliestWeek = Math.max(earliestWeek, (depTask.startWeek || 0) + depTask.effort);
        }
      });
    }
    
    // Find the first week where we have enough capacity
    let startWeek = earliestWeek;
    let canSchedule = false;
    
    while (!canSchedule) {
      canSchedule = true;
      
      // Check if there's enough capacity for all weeks of this task
      for (let week = startWeek; week < startWeek + task.effort; week++) {
        // Ensure the resourcesUsedByWeek array is long enough
        if (resourcesUsedByWeek.length <= week) {
          resourcesUsedByWeek.push(0);
        }
        
        if (resourcesUsedByWeek[week] + task.assignedResources > teamCapacity) {
          canSchedule = false;
          
          // High priority tasks (1-10) get first choice of weeks
          if ((task.priority ?? DEFAULT_PRIORITY) <= 10) {
            // For high priority tasks, try to move lower priority tasks
            const canReschedule = tryRescheduleLowerPriorityTasks(
              task, 
              startWeek, 
              sortedTasks, 
              resourcesUsedByWeek, 
              teamCapacity
            );
            
            if (canReschedule) {
              canSchedule = true;
              break;
            }
          }
          
          startWeek++; // Try the next week
          break;
        }
      }
    }
    
    // Schedule the task at the found start week
    task.startWeek = startWeek;
    
    // Update resources used and track when resources become available again
    for (let week = startWeek; week < startWeek + task.effort; week++) {
      if (resourcesUsedByWeek.length <= week) {
        resourcesUsedByWeek.push(0);
      }
      resourcesUsedByWeek[week] += task.assignedResources;
    }
    
    // Track when these resources will be freed up
    resourceEndEvents.push({
      week: startWeek + task.effort,
      resources: task.assignedResources
    });
  }
  
  // Perform a complete resource-based schedule optimization
  // This approach rebuilds the entire schedule to maximize resource usage
  
  // Create a timeline of all resource changes (both releases and allocations)
  const resourceTimeline: {
    week: number;
    task: ScheduleTask | null; // null means resource release
    resources: number;
    action: 'start' | 'end';
  }[] = [];
  
  // First, add all task starts and ends to the timeline
  for (const task of sortedTasks) {
    const startWeek = task.startWeek || 0;
    const endWeek = startWeek + task.effort;
    
    resourceTimeline.push({
      week: startWeek,
      task: task,
      resources: task.assignedResources,
      action: 'start'
    });
    
    resourceTimeline.push({
      week: endWeek,
      task: task,
      resources: task.assignedResources,
      action: 'end'
    });
  }
  
  // Sort the timeline by week
  resourceTimeline.sort((a, b) => {
    // If same week, we want 'end' events to come before 'start' events
    // so freed resources can be immediately reused
    if (a.week === b.week) {
      return a.action === 'end' ? -1 : 1;
    }
    return a.week - b.week;
  });
  
  // Reset all optimizations and create a fresh resource usage map
  const newResourcesUsedByWeek: number[] = [];
  for (let i = 0; i < resourcesUsedByWeek.length; i++) {
    newResourcesUsedByWeek[i] = 0;
  }
  
  // Keep track of currently running tasks
  const runningTasks = new Set<string>();
  
  // Track available resources per week
  let availableResources = teamCapacity;
  
  // Traverse the timeline and optimize resource allocation
  for (let i = 0; i < resourceTimeline.length; i++) {
    const event = resourceTimeline[i];
    const currentWeek = event.week;
    
    if (event.action === 'end') {
      // Task has ended, free up resources
      availableResources += event.resources;
      if (event.task) {
        runningTasks.delete(event.task.id.toString());
      }
      
      // Look for tasks that can be started or accelerated at this point
      const waitingTasks = sortedTasks.filter(task => {
        // Skip tasks that are already running or completed
        if (runningTasks.has(task.id.toString())) return false;
        
        // Check if this task can start at this week (all dependencies satisfied)
        const taskEarliestStart = getEarliestStartWeek(task, sortedTasks);
        return currentWeek >= taskEarliestStart && 
               (task.startWeek || 0) >= currentWeek && // not started yet
               !task.optimized; // not already optimized
      });
      
      if (waitingTasks.length > 0) {
        // Sort by priority
        waitingTasks.sort((a, b) => {
          const aPriority = a.priority ?? DEFAULT_PRIORITY;
          const bPriority = b.priority ?? DEFAULT_PRIORITY;
          return aPriority - bPriority;
        });
        
        // Try to accelerate the highest priority task
        const taskToOptimize = waitingTasks[0];
        const originalResources = taskToOptimize.assignedResources;
        const originalEffort = taskToOptimize.originalEffort || taskToOptimize.effort;
        
        // Calculate how many resources we can assign based on priority and maxEngineersPerTask
        const maxResourcesForPriority = (taskToOptimize.priority ?? DEFAULT_PRIORITY) <= 10 
          ? maxEngineersPerTask 
          : Math.max(1, Math.floor(maxEngineersPerTask * 0.75));
        const maxResources = Math.min(maxResourcesForPriority, teamCapacity);
        const newResources = Math.min(originalResources + availableResources, maxResources);
        
        if (newResources > originalResources) {
          // Calculate new effort with more resources
          const efficiency = taskToOptimize.priority && (taskToOptimize.priority <= 10) ? 0.9 : 0.85;
          const newEffort = Math.max(1, Math.ceil(originalEffort / (newResources * efficiency)));
          
          // Update task
          taskToOptimize.assignedResources = newResources;
          taskToOptimize.effort = newEffort;
          taskToOptimize.optimized = true;
          
          // Adjust available resources
          availableResources -= (newResources - originalResources);
          
          // Update the timeline for this task's end event
          // Find the corresponding end event and update it
          for (let j = i + 1; j < resourceTimeline.length; j++) {
            const timelineEvent = resourceTimeline[j];
            if (timelineEvent.task && 
                timelineEvent.task.id && 
                taskToOptimize.id && 
                timelineEvent.task.id === taskToOptimize.id && 
                timelineEvent.action === 'end') {
              // Update the end week and resources
              timelineEvent.week = currentWeek + newEffort;
              timelineEvent.resources = newResources;
              break;
            }
          }
          
          // Re-sort the timeline after modifying the end event
          resourceTimeline.sort((a, b) => {
            if (a.week === b.week) {
              return a.action === 'end' ? -1 : 1;
            }
            return a.week - b.week;
          });
        }
      }
    } else { // 'start' event
      // Task is starting, allocate resources
      availableResources -= event.resources;
      if (event.task) {
        runningTasks.add(event.task.id.toString());
      }
    }
    
    // Ensure we don't exceed team capacity
    if (availableResources < 0) {
      console.error("Resource overallocation detected at week", currentWeek);
      availableResources = 0;
    }
  }
  
  // Rebuild the resource usage map based on the optimized schedule
  for (const task of sortedTasks) {
    const startWeek = task.startWeek || 0;
    const endWeek = startWeek + task.effort;
    
    for (let week = startWeek; week < endWeek; week++) {
      if (newResourcesUsedByWeek.length <= week) {
        newResourcesUsedByWeek.push(0);
      }
      newResourcesUsedByWeek[week] += task.assignedResources;
    }
  }
  
  return sortedTasks;
}

/**
 * Try to reschedule lower priority tasks to make room for a high priority task
 */
function tryRescheduleLowerPriorityTasks(
  highPriorityTask: ScheduleTask,
  week: number,
  allTasks: ScheduleTask[],
  resourcesUsedByWeek: number[],
  teamCapacity: number
): boolean {
  // Find tasks that are scheduled in the conflicting weeks
  const conflictingTasks = allTasks.filter(t => {
    const tPriority = t.priority ?? DEFAULT_PRIORITY;
    const highPriorityValue = highPriorityTask.priority ?? DEFAULT_PRIORITY;
    
    // Skip the task itself and tasks with higher or equal priority
    // Lower priority value means higher priority
    if (t.id === highPriorityTask.id || 
        tPriority <= highPriorityValue || 
        t.startWeek === undefined) {
      return false;
    }
    
    const tStartWeek = t.startWeek || 0;
    
    // Check if this task occupies any week that overlaps with the high priority task
    return tStartWeek < week + highPriorityTask.effort && 
           tStartWeek + t.effort > week;
  });
  
  if (conflictingTasks.length === 0) return false;
  
  // Try to push each conflicting task to a later week
  for (const task of conflictingTasks) {
    // Calculate how many resources we need to free up
    const requiredResources = highPriorityTask.assignedResources;
    const taskStartWeek = task.startWeek || 0;
    
    // Check if delaying this task would free up enough resources
    if (task.assignedResources >= requiredResources) {
      // Find a new suitable week for this task
      let newStartWeek = week + highPriorityTask.effort;
      let canReschedule = true;
      
      // Make temporary copy of resources
      const tempResources = [...resourcesUsedByWeek];
      
      // Remove this task's current resource usage
      for (let w = taskStartWeek; w < taskStartWeek + task.effort; w++) {
        if (tempResources[w]) {
          tempResources[w] -= task.assignedResources;
        }
      }
      
      // Check if we can reschedule at the new week
      for (let w = newStartWeek; w < newStartWeek + task.effort; w++) {
        if (tempResources.length <= w) {
          tempResources.push(0);
        }
        if (tempResources[w] + task.assignedResources > teamCapacity) {
          canReschedule = false;
          break;
        }
      }
      
      if (canReschedule) {
        // Update actual resources
        for (let w = taskStartWeek; w < taskStartWeek + task.effort; w++) {
          resourcesUsedByWeek[w] -= task.assignedResources;
        }
        
        // Update task's start week
        task.startWeek = newStartWeek;
        
        // Add resources at new weeks
        for (let w = newStartWeek; w < newStartWeek + task.effort; w++) {
          if (resourcesUsedByWeek.length <= w) {
            resourcesUsedByWeek.push(0);
          }
          resourcesUsedByWeek[w] += task.assignedResources;
        }
        
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Calculate the earliest possible start week for a task based on its dependencies
 * 
 * @param task The task to calculate for
 * @param allTasks All tasks in the system
 * @returns The earliest possible start week
 */
function getEarliestStartWeek(task: ScheduleTask, allTasks: ScheduleTask[]): number {
  if (!task.dependencies || task.dependencies.length === 0) {
    return 0; // No dependencies, can start immediately
  }
  
  let earliestWeek = 0;
  
  // Find the latest end week among all dependencies
  for (const depId of task.dependencies) {
    const depTask = allTasks.find(t => t.id.toString() === depId);
    if (depTask) {
      const depEndWeek = (depTask.startWeek || 0) + depTask.effort;
      earliestWeek = Math.max(earliestWeek, depEndWeek);
    }
  }
  
  return earliestWeek;
}

/**
 * Perform a topological sort to order tasks by dependencies
 * Returns null if there's a cycle in the graph
 */
function topologicalSort(
  tasks: ScheduleTask[], 
  taskMap: Map<string, ScheduleTask>
): ScheduleTask[] | null {
  // State: 0 = unvisited, 1 = in progress, 2 = visited
  const visited = new Map<string, number>();
  const result: ScheduleTask[] = [];
  
  function visit(taskId: string): boolean {
    // If we've already processed this task, we're good
    if (visited.get(taskId) === 2) return true;
    
    // If we're visiting this task again in the same DFS, we have a cycle
    if (visited.get(taskId) === 1) return false;
    
    const task = taskMap.get(taskId);
    if (!task) return true; // Skip if task doesn't exist
    
    // Mark as being visited
    visited.set(taskId, 1);
    
    // Visit all dependencies
    if (task.dependencies?.length) {
      for (const depId of task.dependencies) {
        if (!visit(depId)) {
          return false; // Cycle detected
        }
      }
    }
    
    // Mark as visited and add to result
    visited.set(taskId, 2);
    result.push(task);
    
    return true;
  }
  
  // Visit all tasks
  for (const task of tasks) {
    if (!visit(task.id.toString())) {
      return null; // Cycle detected
    }
  }
  
  return result;
}
