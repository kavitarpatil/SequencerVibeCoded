import { Download, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Header() {
  // Function to export the current schedule as CSV
  const handleExport = () => {
    // Fetch the tasks
    fetch('/api/tasks')
      .then(res => res.json())
      .then(tasks => {
        // Create CSV content
        const headers = "Task Name,Effort (person-weeks),Start Week,Dependencies\n";
        const rows = tasks.map((task: any) => {
          const dependencies = task.dependencies?.length 
            ? task.dependencies.join(', ') 
            : 'None';
          return `"${task.name}",${task.effort},${task.startWeek},"${dependencies}"`;
        }).join('\n');
        
        const csvContent = `data:text/csv;charset=utf-8,${headers}${rows}`;
        
        // Create download link
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "project_schedule.csv");
        document.body.appendChild(link);
        
        // Trigger download and clean up
        link.click();
        document.body.removeChild(link);
      });
  };

  return (
    <header className="bg-primary text-white shadow-md py-4 px-6 flex items-center justify-between">
      <div className="flex items-center">
        <span className="material-icons mr-2">assignment</span>
        <h1 className="text-xl font-medium">Engineering Work Sequencer</h1>
      </div>
      <div className="hidden md:flex space-x-4">
        <Button
          onClick={handleExport}
          variant="outline"
          className="bg-white text-primary font-medium hover:bg-gray-100"
        >
          <Download className="w-4 h-4 mr-2" /> Export
        </Button>
      </div>
    </header>
  );
}
