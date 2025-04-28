import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Task, insertTaskSchema, DEFAULT_PRIORITY } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";

// Form schema for editing tasks
const editTaskSchema = insertTaskSchema.extend({
  name: z.string().min(1, "Task name is required").max(100, "Task name is too long"),
  effort: z.number().int().min(1, "Effort must be at least 1").max(52, "Effort cannot exceed 52 weeks"),
  dependencies: z.array(z.string()).default([]),
  priority: z.number().int().min(1).max(1000).default(DEFAULT_PRIORITY),
});

type EditFormValues = z.infer<typeof editTaskSchema>;

interface EditTaskDialogProps {
  task: Task;
  tasks: Task[];
  onClose: () => void;
}

export default function EditTaskDialog({ task, tasks, onClose }: EditTaskDialogProps) {
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>(
    task.dependencies?.map(String) || []
  );
  const { toast } = useToast();

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editTaskSchema),
    defaultValues: {
      name: task.name,
      effort: task.effort,
      dependencies: task.dependencies?.map(String) || [],
      priority: typeof task.priority === 'number' ? task.priority : DEFAULT_PRIORITY,
    },
  });

  // Update dependencies when task changes
  useEffect(() => {
    setSelectedDependencies(task.dependencies?.map(String) || []);
    form.reset({
      name: task.name,
      effort: task.effort,
      dependencies: task.dependencies?.map(String) || [],
      priority: typeof task.priority === 'number' ? task.priority : DEFAULT_PRIORITY,
    });
  }, [task, form]);

  const updateTaskMutation = useMutation({
    mutationFn: async (values: EditFormValues) => {
      const response = await apiRequest('PATCH', `/api/tasks/${task.id}`, values);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({
        title: "Task updated",
        description: "Your changes have been saved",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Failed to update task",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const onSubmit = (values: EditFormValues) => {
    // Check for circular dependencies
    const taskId = task.id.toString();
    if (hasCyclicDependency(taskId, selectedDependencies, tasks)) {
      toast({
        title: "Invalid dependencies",
        description: "Circular dependencies detected. Please remove them to continue.",
        variant: "destructive",
      });
      return;
    }

    updateTaskMutation.mutate({
      ...values,
      dependencies: selectedDependencies,
    });
  };

  const handleDependencySelect = (taskId: string) => {
    if (!selectedDependencies.includes(taskId)) {
      setSelectedDependencies([...selectedDependencies, taskId]);
      form.setValue('dependencies', [...selectedDependencies, taskId]);
    }
  };

  const removeDependency = (taskId: string) => {
    const updatedDependencies = selectedDependencies.filter(id => id !== taskId);
    setSelectedDependencies(updatedDependencies);
    form.setValue('dependencies', updatedDependencies);
  };

  // Get task names by IDs for display
  const getTaskNameById = (taskId: string) => {
    const foundTask = tasks.find(t => t.id.toString() === taskId);
    return foundTask ? foundTask.name : (task.id.toString() === taskId ? task.name : taskId);
  };

  // Get styling for priority based on its value (lower = higher priority)
  const getPriorityColor = (priority: number) => {
    if (priority <= 10) return "text-red-600 font-medium"; // High priority
    if (priority <= 100) return "text-amber-600"; // Medium priority
    return "text-green-600"; // Low priority
  };

  // Check for circular dependencies
  const hasCyclicDependency = (
    taskId: string, 
    dependencies: string[], 
    allTasks: Task[], 
    visited: Set<string> = new Set()
  ): boolean => {
    if (visited.has(taskId)) return true;
    visited.add(taskId);

    for (const depId of dependencies) {
      if (depId === taskId) return true;
      
      const depTask = allTasks.find(t => t.id.toString() === depId);
      if (depTask && depTask.dependencies?.length) {
        if (hasCyclicDependency(taskId, depTask.dependencies.map(String), allTasks, new Set(visited))) {
          return true;
        }
      }
    }

    return false;
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="effort"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Level of Effort</FormLabel>
                  <div className="flex items-center">
                    <FormControl>
                      <Input 
                        type="number" 
                        min={1}
                        max={52}
                        {...field}
                        onChange={e => field.onChange(parseInt(e.target.value) || 1)}
                      />
                    </FormControl>
                    <span className="ml-2 text-sm text-neutral-dark">Person-weeks</span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <div className="flex justify-between">
                    <FormLabel>Priority (Sequence)</FormLabel>
                    <span className={`text-sm font-medium ${getPriorityColor(field.value)}`}>
                      {field.value <= 10 ? 'High' : field.value <= 100 ? 'Medium' : 'Low'} Priority
                    </span>
                  </div>
                  <div className="flex gap-4 items-center">
                    <FormControl className="flex-1">
                      <Slider
                        min={1}
                        max={1000}
                        step={1}
                        defaultValue={[field.value]}
                        onValueChange={(values) => field.onChange(values[0])}
                        className="w-full"
                      />
                    </FormControl>
                    <FormControl className="w-20">
                      <Input
                        type="number"
                        min={1}
                        max={1000}
                        value={field.value}
                        onChange={(e) => field.onChange(Number(e.target.value) || DEFAULT_PRIORITY)}
                      />
                    </FormControl>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Lower number = higher priority. Tasks with lower sequence numbers will be scheduled first.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="dependencies"
              render={() => (
                <FormItem>
                  <FormLabel>Dependencies</FormLabel>
                  <div className="space-y-2">
                    {tasks.length > 0 ? (
                      <>
                        <Select onValueChange={handleDependencySelect}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select dependencies" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {tasks.map(t => (
                                <SelectItem 
                                  key={t.id} 
                                  value={t.id.toString()}
                                  disabled={selectedDependencies.includes(t.id.toString())}
                                >
                                  {t.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        
                        {selectedDependencies.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {selectedDependencies.map(depId => (
                              <Badge key={depId} variant="secondary" className="flex items-center gap-1">
                                {getTaskNameById(depId)}
                                <X 
                                  className="h-3 w-3 cursor-pointer" 
                                  onClick={() => removeDependency(depId)}
                                />
                              </Badge>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-neutral-dark">No other tasks available</p>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button 
                type="submit" 
                disabled={updateTaskMutation.isPending}
              >
                {updateTaskMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                ) : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
