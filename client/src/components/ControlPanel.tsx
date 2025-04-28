import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ControlPanelProps {
  zoomLevel: number;
  setZoomLevel: (level: number) => void;
  weeks: number;
  isLoading: boolean;
  teamCapacity: number;
  maxEngineersPerTask: number;
  onConfigUpdate: (config: { teamCapacity: number, maxEngineersPerTask: number }) => Promise<void>;
}

export default function ControlPanel({ 
  zoomLevel, 
  setZoomLevel, 
  weeks, 
  isLoading,
  teamCapacity,
  maxEngineersPerTask, 
  onConfigUpdate
}: ControlPanelProps) {
  const [isRecalculating, setIsRecalculating] = useState(false);
  const { toast } = useToast();
  
  const handleZoomIn = () => {
    setZoomLevel(Math.min(zoomLevel + 20, 200));
  };

  const handleZoomOut = () => {
    setZoomLevel(Math.max(zoomLevel - 20, 40));
  };
  
  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      // Force a refetch of the tasks to trigger recalculation
      await queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({
        title: "Schedule recalculated",
        description: "The task schedule has been recalculated with the current settings.",
      });
    } catch (error) {
      toast({
        title: "Recalculation failed",
        description: "Unable to recalculate the schedule. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  const [localTeamCapacity, setLocalTeamCapacity] = useState(teamCapacity);
  const [localMaxEngineers, setLocalMaxEngineers] = useState(maxEngineersPerTask);
  
  const handleConfigUpdate = async () => {
    if (localTeamCapacity !== teamCapacity || localMaxEngineers !== maxEngineersPerTask) {
      await onConfigUpdate({
        teamCapacity: localTeamCapacity,
        maxEngineersPerTask: localMaxEngineers
      });
      
      // Recalculate after config update
      handleRecalculate();
    }
  };

  return (
    <div className="bg-white border-b border-neutral-light p-3 flex flex-col shadow-sm">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <Button 
              variant="outline"
              size="icon"
              className="rounded-l border border-neutral-light bg-neutral-lightest hover:bg-neutral-light"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 40 || isLoading}
            >
              <ZoomOut className="h-4 w-4 text-neutral-dark" />
            </Button>
            <Button 
              variant="outline"
              size="icon"
              className="rounded-r border-t border-r border-b border-neutral-light bg-neutral-lightest hover:bg-neutral-light"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 200 || isLoading}
            >
              <ZoomIn className="h-4 w-4 text-neutral-dark" />
            </Button>
          </div>
          
          <div className="text-sm">
            {weeks > 0 ? (
              <span>Weeks 1-{weeks}</span>
            ) : (
              <span>No weeks scheduled</span>
            )}
          </div>
        </div>
        
        <Button
          variant="outline"
          onClick={handleRecalculate}
          disabled={isRecalculating || isLoading}
          className="bg-primary text-white hover:bg-primary-dark"
        >
          {isRecalculating ? (
            <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1" />
          )}
          Recalculate
        </Button>
      </div>
      
      <div className="flex mt-3 space-x-6">
        <div className="flex items-center space-x-4">
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="teamCapacity" className="text-xs">Team Capacity</Label>
            <Input
              id="teamCapacity"
              type="number"
              min={1}
              max={10}
              value={localTeamCapacity}
              onChange={(e) => setLocalTeamCapacity(parseInt(e.target.value) || 1)}
              className="w-20 h-8"
              onBlur={handleConfigUpdate}
            />
          </div>
          
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="maxEngineers" className="text-xs">Max Engineers Per Task</Label>
            <Input
              id="maxEngineers"
              type="number"
              min={1}
              max={5}
              value={localMaxEngineers}
              onChange={(e) => setLocalMaxEngineers(parseInt(e.target.value) || 1)}
              className="w-20 h-8"
              onBlur={handleConfigUpdate}
            />
          </div>
        </div>
        
        <div className="flex items-end space-x-2">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 rounded-full bg-success"></div>
            <span className="text-xs">Available</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 rounded-full bg-warning"></div>
            <span className="text-xs">Full Capacity</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 rounded-full bg-error"></div>
            <span className="text-xs">Over Capacity</span>
          </div>
        </div>
      </div>
    </div>
  );
}
