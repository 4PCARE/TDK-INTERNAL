import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import FileUpload from "@/components/FileUpload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  CloudUpload, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock,
  AlertCircle,
  Upload as UploadIcon
} from "lucide-react";

interface UploadFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  documentId?: number;
}

export default function Upload() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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
          <CardContent>
            <FileUpload onFilesSelected={handleFilesSelected} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}