import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Task, DEFAULT_PRIORITY } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Edit, Trash2, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface TaskListProps {
  tasks: Task[];
  isLoading: boolean;
  onEditTask: (task: Task) => void;
}

export default function TaskList({ tasks, isLoading, onEditTask }: TaskListProps) {
  const { toast } = useToast();

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      await apiRequest('DELETE', `/api/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({
        title: "Task deleted",
        description: "The task has been removed from your project",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete task",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleDelete = (taskId: number) => {
    if (confirm('Are you sure you want to delete this task?')) {
      deleteTaskMutation.mutate(taskId);
    }
  };

  // Get task names by IDs for displaying dependencies
  const getTaskNameById = (taskId: string) => {
    const task = tasks.find(t => t.id.toString() === taskId);
    return task ? task.name : taskId;
  };

  // Get priority badge variant and styling based on numeric priority
  const getPriorityBadge = (priority: number | null) => {
    if (!priority) priority = DEFAULT_PRIORITY;
    
    if (priority <= 10) {
      return { variant: "destructive" as const, label: "High Priority" };
    } else if (priority <= 100) {
      return { variant: "default" as const, label: "Medium Priority" };
    } else {
      return { variant: "secondary" as const, label: "Low Priority" };
    }
  };

  if (isLoading) {
    return (
      <div className="mt-4 space-y-2">
        <h3 className="text-md font-medium mb-2">Task List</h3>
        {[1, 2, 3].map(i => (
          <Card key={i} className="border border-neutral-light">
            <CardContent className="p-3">
              <div className="flex justify-between items-start">
                <Skeleton className="h-5 w-32" />
                <div className="flex space-x-1">
                  <Skeleton className="h-5 w-5" />
                  <Skeleton className="h-5 w-5" />
                </div>
              </div>
              <Skeleton className="h-4 w-24 mt-1" />
              <Skeleton className="h-3 w-28 mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <h3 className="text-md font-medium mb-2">Task List</h3>
      {tasks.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No tasks added yet</p>
      ) : (
        tasks.map(task => {
          const priorityBadge = getPriorityBadge(task.priority);
          
          return (
            <Card 
              key={task.id} 
              className={`task-card border ${(task.priority || DEFAULT_PRIORITY) <= 10 ? 'border-red-200' : 'border-neutral-light'} shadow-sm`}
            >
              <CardContent className="p-3">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <h4 className="font-medium">{task.name}</h4>
                    <Badge 
                      variant={priorityBadge.variant} 
                      className="mt-1 w-fit text-xs"
                    >
                      {priorityBadge.label}
                    </Badge>
                  </div>
                  <div className="flex space-x-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-neutral-medium hover:text-primary hover:bg-neutral-50"
                      onClick={() => onEditTask(task)}
                      disabled={deleteTaskMutation.isPending}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-neutral-medium hover:text-red-500 hover:bg-neutral-50"
                      onClick={() => handleDelete(task.id)}
                      disabled={deleteTaskMutation.isPending}
                    >
                      {deleteTaskMutation.isPending && deleteTaskMutation.variables === task.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="mt-2 text-sm text-neutral-dark">
                  Effort: {task.effort} person-{task.effort === 1 ? 'week' : 'weeks'}
                </div>
                <div className="mt-1 text-xs text-neutral-dark">
                  Dependencies: {task.dependencies?.length ? (
                    task.dependencies.map(depId => getTaskNameById(depId)).join(', ')
                  ) : 'None'}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
