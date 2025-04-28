import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Header from "@/components/Header";
import TaskForm from "@/components/TaskForm";
import TaskList from "@/components/TaskList";
import GanttChart from "@/components/GanttChart";
import ControlPanel from "@/components/ControlPanel";
import EditTaskDialog from "@/components/EditTaskDialog";
import { calculateSchedule } from "@/lib/schedulingAlgorithm";
import { Task, ProjectConfig } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function Home() {
  const [openEditTask, setOpenEditTask] = useState<Task | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const { toast } = useToast();

  // Fetch tasks
  const { 
    data: tasks = [], 
    isLoading: isLoadingTasks,
    isError: isTasksError
  } = useQuery<Task[]>({
    queryKey: ['/api/tasks'],
  });

  // Fetch project configuration
  const { 
    data: config = { teamCapacity: 3, maxEngineersPerTask: 2 }, 
    isLoading: isLoadingConfig,
    isError: isConfigError
  } = useQuery<ProjectConfig>({
    queryKey: ['/api/config'],
  });

  // Update project configuration mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (newConfig: ProjectConfig) => {
      const response = await apiRequest('POST', '/api/config', newConfig);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/config'] });
      toast({
        title: "Configuration updated",
        description: "The project configuration has been updated",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update configuration",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Generate schedule mutation
  const generateScheduleMutation = useMutation({
    mutationFn: async () => {
      // In a real application, we might want to perform this calculation on the server
      // For simplicity, we're doing it client-side
      const scheduledTasks = calculateSchedule(tasks, config.teamCapacity, config.maxEngineersPerTask || 2);
      
      // Update the start weeks of all tasks
      const promises = scheduledTasks.map(task => 
        apiRequest('PATCH', `/api/tasks/${task.id}`, { startWeek: task.startWeek })
      );
      
      await Promise.all(promises);
      return scheduledTasks;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({
        title: "Schedule generated",
        description: "Tasks have been scheduled based on dependencies and team capacity",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to generate schedule",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Reset all tasks
  const resetMutation = useMutation({
    mutationFn: async () => {
      const deletePromises = tasks.map(task => 
        apiRequest('DELETE', `/api/tasks/${task.id}`)
      );
      await Promise.all(deletePromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({
        title: "Reset complete",
        description: "All tasks have been removed",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to reset",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Calculate the scheduled tasks (with dependency info for visualization)
  const scheduledTasks = tasks.length > 0 
    ? calculateSchedule(tasks, config.teamCapacity, config.maxEngineersPerTask || 2) 
    : [];

  // Calculate resource usage by week
  const maxWeek = scheduledTasks.reduce((max, task) => 
    Math.max(max, (task.startWeek || 0) + task.effort), 0);
  
  const resourceUsage = Array(maxWeek).fill(0).map((_, weekIndex) => {
    // Sum up the engineers assigned to each task this week
    const usedResources = scheduledTasks
      .filter(task => 
        (task.startWeek || 0) <= weekIndex && 
        weekIndex < (task.startWeek || 0) + task.effort
      )
      .reduce((sum, task) => {
        // Use the assignedResources property if available (from scheduling algorithm)
        return sum + ((task as any).assignedResources || 1);
      }, 0);
    
    return {
      week: weekIndex + 1,
      used: usedResources,
      capacity: config.teamCapacity,
      status: (usedResources > config.teamCapacity 
        ? 'over' 
        : usedResources === config.teamCapacity 
          ? 'full' 
          : 'available') as 'over' | 'full' | 'available'
    };
  });

  const handleConfigUpdate = async (newConfig: ProjectConfig) => {
    updateConfigMutation.mutate(newConfig);
  };

  const handleGenerateSchedule = () => {
    generateScheduleMutation.mutate();
  };

  const handleResetTasks = () => {
    if (confirm('Are you sure you want to remove all tasks?')) {
      resetMutation.mutate();
    }
  };

  const isLoading = 
    isLoadingTasks || 
    isLoadingConfig || 
    updateConfigMutation.isPending || 
    generateScheduleMutation.isPending || 
    resetMutation.isPending;

  return (
    <div className="flex flex-col h-screen">
      <Header />
      <div className="flex flex-grow overflow-hidden">
        {/* Sidebar */}
        <div className="bg-white shadow-md w-64 md:w-80 flex-shrink-0 border-r border-neutral-light overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-medium mb-4">Project Configuration</h2>
            
            {/* Priority Information */}
            <div className="p-3 bg-blue-50 rounded-md mb-4 text-sm">
              <h4 className="font-medium text-blue-800 mb-1">Priority-Based Scheduling</h4>
              <ul className="list-disc pl-4 text-blue-700 space-y-1">
                <li>High priority tasks are assigned more engineers to complete faster</li>
                <li>High priority tasks are scheduled first when possible</li>
                <li>Lower priority tasks may be delayed to accommodate high priority work</li>
              </ul>
            </div>

            {/* Task Management */}
            <h3 className="text-md font-medium mt-6 mb-2">Task Management</h3>
            
            {/* Add Task Form */}
            <TaskForm existingTasks={tasks} />
            
            {/* Task List */}
            <TaskList 
              tasks={tasks} 
              isLoading={isLoadingTasks}
              onEditTask={setOpenEditTask}
            />
            
            <div className="flex justify-between mt-6">
              <Button 
                onClick={handleGenerateSchedule}
                className="bg-secondary text-white font-medium"
                disabled={isLoading || tasks.length === 0}
              >
                {generateScheduleMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calculating</>
                ) : (
                  <>
                    <span className="material-icons text-sm mr-1">calculate</span>
                    Generate Schedule
                  </>
                )}
              </Button>
              <Button 
                onClick={handleResetTasks}
                variant="outline"
                className="border border-neutral-medium text-neutral-dark font-medium"
                disabled={isLoading || tasks.length === 0}
              >
                <span className="material-icons text-sm mr-1">refresh</span>
                Reset
              </Button>
            </div>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-grow overflow-hidden flex flex-col">
          <ControlPanel 
            zoomLevel={zoomLevel}
            setZoomLevel={setZoomLevel}
            weeks={maxWeek}
            isLoading={isLoading}
            teamCapacity={config.teamCapacity}
            maxEngineersPerTask={config.maxEngineersPerTask || 2}
            onConfigUpdate={handleConfigUpdate}
          />
          
          {(isTasksError || isConfigError) ? (
            <div className="flex-grow flex items-center justify-center">
              <Card className="w-96 p-6">
                <h3 className="text-xl font-bold text-red-500 mb-2">Error Loading Data</h3>
                <p>There was a problem loading the application data. Please try refreshing the page.</p>
              </Card>
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex-grow flex items-center justify-center">
              <Card className="w-96 p-6">
                <h3 className="text-xl font-bold mb-2">No Tasks Yet</h3>
                <p>Add some tasks to start planning your project schedule.</p>
              </Card>
            </div>
          ) : (
            <GanttChart 
              tasks={scheduledTasks} 
              resourceUsage={resourceUsage}
              zoomLevel={zoomLevel}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>

      {/* Edit Task Dialog */}
      {openEditTask && (
        <EditTaskDialog
          task={openEditTask}
          tasks={tasks.filter(t => t.id !== openEditTask.id)}
          onClose={() => setOpenEditTask(null)}
        />
      )}
    </div>
  );
}
