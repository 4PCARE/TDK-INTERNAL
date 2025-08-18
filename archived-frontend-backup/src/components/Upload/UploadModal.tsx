import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { X, FileText } from "lucide-react";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UploadModal({ isOpen, onClose }: UploadModalProps) {
  // Mock upload progress for demonstration
  const uploadQueue = [
    { name: "document.pdf", progress: 75 },
    { name: "report.docx", progress: 45 },
    { name: "notes.txt", progress: 90 }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Uploading Files</DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogDescription>
            Processing your documents with AI...
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {uploadQueue.map((file, index) => (
            <div key={index} className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">{file.name}</span>
                  <span className="text-xs text-gray-500">{file.progress}%</span>
                </div>
                <Progress value={file.progress} className="h-2" />
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
