import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertTaskSchema, DEFAULT_PRIORITY } from "@shared/schema";
import { Task } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";

// Extend the task schema with client-side validation
const formSchema = insertTaskSchema.extend({
  name: z.string().min(1, "Task name is required").max(100, "Task name is too long"),
  effort: z.number().int().min(1, "Effort must be at least 1").max(52, "Effort cannot exceed 52 weeks"),
  dependencies: z.array(z.string()).default([]),
  priority: z.number().int().min(1).max(1000).default(DEFAULT_PRIORITY),
});

type FormValues = z.infer<typeof formSchema>;

interface TaskFormProps {
  existingTasks: Task[];
}

export default function TaskForm({ existingTasks }: TaskFormProps) {
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>([]);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      effort: 1,
      dependencies: [],
      priority: DEFAULT_PRIORITY,
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const response = await apiRequest('POST', '/api/tasks', values);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      form.reset();
      setSelectedDependencies([]);
      toast({
        title: "Task added",
        description: "The task has been added to your project",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to add task",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const onSubmit = (values: FormValues) => {
    createTaskMutation.mutate({
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
    const task = existingTasks.find(t => t.id.toString() === taskId);
    return task ? task.name : taskId;
  };

  // Get styling for priority based on its value (lower = higher priority)
  const getPriorityColor = (priority: number) => {
    if (priority <= 10) return "text-red-600 font-medium"; // High priority
    if (priority <= 100) return "text-amber-600"; // Medium priority
    return "text-green-600"; // Low priority
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="bg-neutral-lightest p-3 rounded mb-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="mb-3">
              <FormLabel className="text-sm font-medium">Task Name</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Enter task name" 
                  {...field}
                  className="w-full px-3 py-2"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="effort"
          render={({ field }) => (
            <FormItem className="mb-3">
              <FormLabel className="text-sm font-medium">Level of Effort</FormLabel>
              <div className="flex items-center">
                <FormControl>
                  <Input 
                    type="number" 
                    min={1}
                    max={52}
                    {...field}
                    onChange={e => field.onChange(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2"
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
            <FormItem className="mb-3">
              <div className="flex justify-between">
                <FormLabel className="text-sm font-medium">Priority (Sequence)</FormLabel>
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
            <FormItem className="mb-3">
              <FormLabel className="text-sm font-medium">Dependencies</FormLabel>
              <div className="space-y-2">
                {existingTasks.length > 0 ? (
                  <>
                    <Select onValueChange={handleDependencySelect}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select dependencies" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {existingTasks.map(task => (
                            <SelectItem 
                              key={task.id} 
                              value={task.id.toString()}
                              disabled={selectedDependencies.includes(task.id.toString())}
                            >
                              {task.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    
                    {selectedDependencies.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedDependencies.map(taskId => (
                          <Badge key={taskId} variant="secondary" className="flex items-center gap-1">
                            {getTaskNameById(taskId)}
                            <X 
                              className="h-3 w-3 cursor-pointer" 
                              onClick={() => removeDependency(taskId)}
                            />
                          </Badge>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-neutral-dark">No existing tasks to depend on</p>
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex justify-end mt-4">
          <Button
            type="submit" 
            className="bg-primary text-white font-medium"
            disabled={createTaskMutation.isPending}
          >
            {createTaskMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</>
            ) : (
              <><Plus className="mr-2 h-4 w-4" /> Add Task</>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
