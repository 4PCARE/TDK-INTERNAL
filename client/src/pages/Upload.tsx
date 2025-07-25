import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import Sidebar from "@/components/Layout/Sidebar";
import TopBar from "@/components/TopBar";
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
    <div className="flex h-screen overflow-hidden">
      <Sidebar 
        isMobileOpen={false}
        onMobileClose={() => {}}
        onOpenChat={() => {}}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar isSidebarCollapsed={isSidebarCollapsed} />
        
        <main className="flex-1 overflow-auto p-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-800 mb-2">Upload Documents</h1>
            <p className="text-sm text-slate-500">
              Upload multiple documents for automatic classification and AI-powered processing
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Upload Area */}
            <div className="lg:col-span-2">
              <Card className="border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-slate-800">
                    Document Upload
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <FileUpload onFilesSelected={handleFilesSelected} />
                  
                  {uploadFiles.length > 0 && (
                    <div className="mt-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-slate-800">
                          Upload Queue ({uploadFiles.length})
                        </h3>
                        <div className="flex space-x-2">
                          {pendingFiles.length > 0 && (
                            <Button 
                              onClick={handleUpload}
                              disabled={uploadMutation.isPending}
                              className="bg-primary text-white hover:bg-blue-700"
                            >
                              {uploadMutation.isPending ? "Uploading..." : "Upload All"}
                            </Button>
                          )}
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleClearAll}
                          >
                            Clear All
                          </Button>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        {uploadFiles.map((uploadFile) => (
                          <div 
                            key={uploadFile.id}
                            className="flex items-center space-x-4 p-3 bg-slate-50 rounded-lg"
                          >
                            <div className="flex-shrink-0">
                              {getStatusIcon(uploadFile.status)}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-medium text-slate-800 truncate">
                                  {uploadFile.file.name}
                                </p>
                                {getStatusBadge(uploadFile.status)}
                              </div>
                              
                              <div className="flex items-center space-x-2 text-xs text-slate-500">
                                <span>{(uploadFile.file.size / 1024 / 1024).toFixed(2)} MB</span>
                                <span>•</span>
                                <span>{uploadFile.file.type}</span>
                              </div>
                              
                              {uploadFile.status === 'uploading' && (
                                <Progress value={uploadFile.progress} className="mt-2" />
                              )}
                              
                              {uploadFile.error && (
                                <p className="text-xs text-red-600 mt-1">
                                  {uploadFile.error}
                                </p>
                              )}
                            </div>
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveFile(uploadFile.id)}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Upload Statistics */}
            <div className="space-y-6">
              <Card className="border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-slate-800">
                    Upload Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Total Files</span>
                      <span className="text-sm font-medium text-slate-800">
                        {uploadFiles.length}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Pending</span>
                      <span className="text-sm font-medium text-amber-600">
                        {pendingFiles.length}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Uploaded</span>
                      <span className="text-sm font-medium text-emerald-600">
                        {successFiles.length}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Failed</span>
                      <span className="text-sm font-medium text-red-600">
                        {errorFiles.length}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-slate-800">
                    Processing Info
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          AI Classification
                        </p>
                        <p className="text-xs text-slate-500">
                          Documents are automatically classified and tagged using AI
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start space-x-3">
                      <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          Processing Time
                        </p>
                        <p className="text-xs text-slate-500">
                          Average processing time is 2-5 minutes per document
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start space-x-3">
                      <FileText className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          Supported Formats
                        </p>
                        <p className="text-xs text-slate-500">
                          PDF, DOCX, TXT, XLSX, PPTX, CSV, JSON
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
