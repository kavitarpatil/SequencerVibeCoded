import { useEffect, useRef } from "react";
import { Task, DEFAULT_PRIORITY } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ResourceUsage {
  week: number;
  used: number;
  capacity: number;
  status: 'available' | 'full' | 'over';
}

interface GanttChartProps {
  tasks: Task[];
  resourceUsage: ResourceUsage[];
  zoomLevel: number;
  isLoading: boolean;
}

export default function GanttChart({ tasks, resourceUsage, zoomLevel, isLoading }: GanttChartProps) {
  const ganttContainerRef = useRef<HTMLDivElement>(null);
  const cellWidth = (zoomLevel / 100) * 100; // Base width is 100px

  // Calculate end week for each task
  const getTaskEndWeek = (task: Task) => (task.startWeek || 0) + task.effort;

  // Find the maximum week in the schedule
  const maxWeek = Math.max(
    ...tasks.map(task => getTaskEndWeek(task)),
    resourceUsage.length
  );

  // Track dependencies for drawing lines
  const ganttTaskRefs = useRef<Record<string, HTMLDivElement>>({});

  // Get task background color based on numeric priority
  const getTaskColor = (priority: number | null) => {
    if (!priority) priority = DEFAULT_PRIORITY;
    
    if (priority <= 10) {
      return 'bg-red-600'; // High priority
    } else if (priority <= 100) {
      return 'bg-amber-500'; // Medium priority
    } else {
      return 'bg-emerald-600'; // Low priority
    }
  };

  // Draw dependency lines after render
  useEffect(() => {
    if (isLoading || tasks.length === 0) return;

    const container = ganttContainerRef.current;
    if (!container) return;

    // Remove any existing dependency lines
    const existingLines = container.querySelectorAll('.dependency-line');
    existingLines.forEach(line => line.remove());

    // Draw new dependency lines
    tasks.forEach(task => {
      if (!task.dependencies?.length) return;
      
      const targetElement = ganttTaskRefs.current[task.id.toString()];
      if (!targetElement) return;

      task.dependencies.forEach(depId => {
        const sourceElement = ganttTaskRefs.current[depId];
        if (!sourceElement) return;

        // Get positions
        const sourceRect = sourceElement.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Calculate line coordinates relative to container
        const x1 = sourceRect.right - containerRect.left;
        const y1 = sourceRect.top + sourceRect.height/2 - containerRect.top;
        const x2 = targetRect.left - containerRect.left;
        const y2 = targetRect.top + targetRect.height/2 - containerRect.top;

        // Create line element
        const line = document.createElement('div');
        line.className = 'dependency-line';
        
        // Calculate length and angle
        const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        
        // Position line
        line.style.width = `${length}px`;
        line.style.left = `${x1}px`;
        line.style.top = `${y1}px`;
        line.style.transform = `rotate(${angle}deg)`;
        line.style.transformOrigin = '0 0';
        
        container.appendChild(line);
      });
    });
  }, [tasks, isLoading, zoomLevel]);

  // Get color class based on resource status
  const getResourceBarColor = (status: ResourceUsage['status']) => {
    switch (status) {
      case 'available': return 'bg-success';
      case 'full': return 'bg-warning';
      case 'over': return 'bg-error';
      default: return 'bg-primary';
    }
  };

  // Sort tasks by numeric priority for display (lower numbers first)
  const sortedTasks = [...tasks].sort((a, b) => {
    const aPriority = a.priority ?? DEFAULT_PRIORITY;
    const bPriority = b.priority ?? DEFAULT_PRIORITY;
    
    return aPriority - bPriority;
  });

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="mb-4">
          <Skeleton className="h-5 w-48 mb-2" />
          <div className="flex">
            <Skeleton className="w-40 h-8 flex-shrink-0" />
            <div className="flex-grow flex gap-1">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          </div>
        </div>
        
        <Skeleton className="h-5 w-32 mb-2" />
        <div className="flex border-b border-neutral-light pb-1">
          <Skeleton className="w-40 h-6 flex-shrink-0" />
          <div className="flex-grow flex gap-1">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </div>
        
        {[1, 2, 3].map(i => (
          <div key={i} className="flex mb-4 relative">
            <Skeleton className="w-40 h-8 flex-shrink-0" />
            <div className="flex-grow relative h-8">
              <Skeleton className="h-8 w-2/3 absolute" style={{ left: `${i * 20}px` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4" ref={ganttContainerRef}>
      {/* Resource Usage Chart */}
      <div className="mb-4">
        <h3 className="text-sm font-medium mb-2">Resource Utilization</h3>
        <div className="flex">
          <div className="w-40 flex-shrink-0"></div>
          <div className="resource-usage-chart flex-grow relative">
            {resourceUsage.map((usage, index) => (
              <div 
                key={index}
                className={`resource-bar ${getResourceBarColor(usage.status)}`} 
                style={{
                  left: `${index * cellWidth}px`, 
                  height: `${(usage.used / usage.capacity) * 100}%`, 
                  width: `${cellWidth - 4}px`,
                  minHeight: usage.used > 0 ? '15px' : '0'
                }}
              >
                <div className="text-xs text-white text-center">
                  {usage.used}/{usage.capacity}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Gantt Chart Header */}
      <div className="flex border-b border-neutral-light pb-1">
        <div className="w-40 flex-shrink-0 font-medium text-sm">Task</div>
        <div className="gantt-timeline flex-grow">
          {Array.from({ length: maxWeek }, (_, i) => (
            <div 
              key={i} 
              className="text-center text-sm font-medium"
              style={{ width: `${cellWidth}px`, display: 'inline-block' }}
            >
              Week {i + 1}
            </div>
          ))}
        </div>
      </div>
      
      {/* Gantt Chart Rows */}
      <div className="gantt-rows mt-2">
        {sortedTasks.map(task => (
          <div key={task.id} className="gantt-task-row flex mb-4 relative">
            <div className="w-40 flex-shrink-0 text-sm flex items-center">
              <span 
                className={`w-3 h-3 rounded-full mr-2 ${
                  (task.priority || DEFAULT_PRIORITY) <= 10 ? 'bg-red-600' : 
                  (task.priority || DEFAULT_PRIORITY) <= 100 ? 'bg-amber-500' : 
                  'bg-emerald-600'
                }`}
              ></span>
              {task.name}
            </div>
            <div className="gantt-row flex-grow relative h-8">
              <div 
                ref={el => {
                  if (el) ganttTaskRefs.current[task.id.toString()] = el;
                }}
                className={`gantt-task ${getTaskColor(task.priority)} text-white h-8`}
                style={{
                  left: `${(task.startWeek || 0) * cellWidth}px`, 
                  width: `${task.effort * cellWidth}px`,
                  position: 'absolute',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: '8px',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap'
                }}
              >
                {task.name} ({(task as any).originalEffort || task.effort}w • {(task as any).assignedResources || 1} eng)
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Priority Legend */}
      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-red-600"></div>
          <span className="text-xs">High Priority (1-10)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <span className="text-xs">Medium Priority (11-100)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-emerald-600"></div>
          <span className="text-xs">Low Priority (101+)</span>
        </div>
      </div>
    </div>
  );
}
