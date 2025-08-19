import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "../lib/authUtils";
import { apiRequest } from "../lib/queryClient";
import DashboardLayout from "../components/Layout/DashboardLayout";
import FileUpload from "../components/FileUpload";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Badge } from "../components/ui/badge";
import { 
  CloudUpload, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock,
  AlertCircle,
  Upload as UploadIcon,
  X
} from "lucide-react";

interface UploadFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  documentId?: number;
}

export default function UploadPage() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });

      const response = await apiRequest('POST', '/api/documents/upload', formData);
      return await response.json();
    },
    onSuccess: (data) => {
      // Update file statuses
      setUploadFiles(prev => prev.map(uploadFile => {
        const uploadedDoc = data.documents.find((doc: any) => 
          doc.originalName === uploadFile.file.name
        );

        if (uploadedDoc) {
          return {
            ...uploadFile,
            status: 'success' as const,
            progress: 100,
            documentId: uploadedDoc.id
          };
        }
        return uploadFile;
      }));

      // Invalidate queries to refresh document lists
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });

      toast({
        title: "Upload Successful",
        description: `${data.documents.length} document(s) uploaded and queued for processing.`,
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }

      // Update file statuses to error
      setUploadFiles(prev => prev.map(uploadFile => ({
        ...uploadFile,
        status: 'error' as const,
        error: error.message
      })));

      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFilesSelected = (files: File[]) => {
    const newUploadFiles: UploadFile[] = files.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      status: 'pending',
      progress: 0,
    }));

    setUploadFiles(prev => [...prev, ...newUploadFiles]);
  };

  const handleUpload = () => {
    const pendingFiles = uploadFiles.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    // Update status to uploading
    setUploadFiles(prev => prev.map(f => 
      f.status === 'pending' ? { ...f, status: 'uploading' as const } : f
    ));

    // Simulate progress for UI feedback
    const progressInterval = setInterval(() => {
      setUploadFiles(prev => prev.map(f => 
        f.status === 'uploading' && f.progress < 90 
          ? { ...f, progress: f.progress + 10 }
          : f
      ));
    }, 200);

    uploadMutation.mutate(pendingFiles.map(f => f.file));

    // Clear progress simulation when done
    setTimeout(() => {
      clearInterval(progressInterval);
    }, 2000);
  };

  const handleRemoveFile = (id: string) => {
    setUploadFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleClearAll = () => {
    setUploadFiles([]);
  };

  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'uploading':
        return <UploadIcon className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: UploadFile['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'uploading':
        return <Badge className="bg-blue-100 text-blue-800">Uploading</Badge>;
      case 'success':
        return <Badge className="bg-emerald-100 text-emerald-800">Uploaded</Badge>;
      case 'error':
        return <Badge variant="destructive">Failed</Badge>;
    }
  };

  if (isLoading || !isAuthenticated) {
    return null;
  }

  const pendingFiles = uploadFiles.filter(f => f.status === 'pending');
  const successFiles = uploadFiles.filter(f => f.status === 'success');
  const errorFiles = uploadFiles.filter(f => f.status === 'error');

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
            <UploadIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Upload Documents</h1>
            <p className="text-gray-600">Upload and manage your documents with AI-powered processing</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <FileUpload onFilesSelected={handleFilesSelected} />
          </CardContent>
        </Card>

        {/* Upload Queue */}
        {uploadFiles.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-slate-800">Upload Queue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {uploadFiles.map((uploadFile) => (
                  <div key={uploadFile.id} className="flex items-center space-x-4 p-4 bg-slate-50 rounded-lg">
                    <div className="flex-shrink-0">
                      {getStatusIcon(uploadFile.status)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {uploadFile.file.name}
                      </p>
                      <div className="flex items-center space-x-2 mt-1">
                        {getStatusBadge(uploadFile.status)}
                        {uploadFile.status === 'uploading' && (
                          <Progress value={uploadFile.progress} className="w-32" />
                        )}
                      </div>
                      {uploadFile.error && (
                        <p className="text-xs text-red-600 mt-1">{uploadFile.error}</p>
                      )}
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFile(uploadFile.id)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                
                <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                  <div className="text-sm text-slate-500">
                    {successFiles.length} uploaded, {errorFiles.length} failed, {pendingFiles.length} pending
                  </div>
                  <div className="space-x-2">
                    <Button variant="outline" onClick={handleClearAll}>
                      Clear All
                    </Button>
                    {pendingFiles.length > 0 && (
                      <Button 
                        onClick={handleUpload}
                        disabled={uploadMutation.isPending}
                        className="bg-primary text-white hover:bg-blue-700"
                      >
                        {uploadMutation.isPending ? 'Uploading...' : `Upload ${pendingFiles.length} Files`}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}