import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  FileText, 
  Upload, 
  MoreVertical, 
  Eye, 
  Download,
  Star,
  Trash2
} from "lucide-react";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import StatsCards from "@/components/Stats/StatsCards";
import CategoryStatsCards from "@/components/Stats/CategoryStatsCards";
import UploadZone from "@/components/Upload/UploadZone";
import ChatModal from "@/components/Chat/ChatModal";
import { apiRequest } from "@/lib/queryClient";

interface UploadFile {
  file: File;
  id: string;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
}

export default function Dashboard() {
  const { user, isAuthenticated, isLoading, getToken } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [selectedDocumentSummary, setSelectedDocumentSummary] = useState<string | null>(null);

  const { data: documents = [] } = useQuery({
    queryKey: ["/api/documents"],
    queryFn: async () => {
      const response = await fetch("/api/python/documents", {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
    enabled: isAuthenticated,
  }) as { data: Array<any> };

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const response = await fetch("/api/stats", {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch stats");
      return response.json();
    },
    enabled: isAuthenticated,
    retry: 1,
  });

  // Upload mutation with progress tracking
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      // Initialize upload tracking
      const fileTracking = files.map(file => ({
        file,
        id: Math.random().toString(36).substr(2, 9),
        status: 'uploading' as const,
        progress: 0
      }));
      setUploadFiles(fileTracking);

      // Simulate progress updates
      fileTracking.forEach((fileTrack, index) => {
        let progress = 0;
        const interval = setInterval(() => {
          progress += Math.random() * 20;
          if (progress >= 90) {
            setUploadFiles(prev => prev.map(f => 
              f.id === fileTrack.id ? { ...f, status: 'processing', progress: 90 } : f
            ));
            clearInterval(interval);
          } else {
            setUploadFiles(prev => prev.map(f => 
              f.id === fileTrack.id ? { ...f, progress } : f
            ));
          }
        }, 500);
      });

      const response = await fetch("/api/python/documents/upload", {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      // Mark as completed
      setUploadFiles(prev => prev.map(f => ({ ...f, status: 'completed', progress: 100 })));

      // Clear after 3 seconds
      setTimeout(() => setUploadFiles([]), 3000);

      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast({
        title: "Upload successful",
        description: "Documents have been uploaded and processed with AI classification.",
      });
    },
    onError: (error: Error) => {
      setUploadFiles(prev => prev.map(f => ({ ...f, status: 'error', error: error.message })));
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Content summary mutation
  const summaryMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const response = await fetch(`/api/python/documents/${documentId}/summary`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch summary");
      const data = await response.json();
      return data;
    },
    onSuccess: (data: { summary: string }) => {
      setSelectedDocumentSummary(data.summary);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to generate summary",
        description: error.message,
        variant: "destructive",
      });
    },
  });

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const recentDocuments = Array.isArray(documents) ? documents.slice(0, 5) : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
            {/* Render StatsCards component */}
            {stats && <StatsCards stats={stats} />}

            {/* Upload and Category Stats Section */}
            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="h-[400px] flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Upload className="w-5 h-5" />
                    <span>Upload Documents</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  <UploadZone onUploadComplete={() => {}} onFilesSelected={(files) => uploadMutation.mutate(files)} />

                  {/* Upload Progress */}
                  {uploadFiles.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <Separator />
                      <h4 className="text-sm font-medium">Upload Progress</h4>
                      {uploadFiles.map((file) => (
                        <div key={file.id} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="truncate">{file.file.name}</span>
                            <Badge variant={
                              file.status === 'completed' ? 'default' :
                              file.status === 'error' ? 'destructive' :
                              'secondary'
                            }>
                              {file.status}
                            </Badge>
                          </div>
                          <Progress value={file.progress} className="h-2" />
                          {file.error && (
                            <p className="text-xs text-red-600">{file.error}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Category Statistics */}
              <CategoryStatsCards />
            </div>

            {/* Recent Upload Documents */}
            <Card className="h-[500px] flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <FileText className="w-5 h-5" />
                  <span>Recent Upload Documents</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
                {documents.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No documents uploaded yet</p>
                    <p className="text-sm text-gray-400 mt-1">Upload your first document to get started</p>
                  </div>
                ) : (
                  <div className="h-full overflow-y-auto space-y-3 pr-2">
                    {documents.map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">{doc.name}</h4>
                            <div className="text-sm text-gray-500 flex items-center space-x-2">
                              {doc.aiCategory && (
                                <Badge variant="outline">
                                  {doc.aiCategory}
                                </Badge>
                              )}
                              <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {doc.isFavorite && (
                            <Star className="w-4 h-4 text-yellow-500 fill-current" />
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">

                              <DropdownMenuItem onClick={() => window.open(`/api/python/documents/${doc.id}/download`, '_blank')}>
                                <Download className="w-4 h-4 mr-2" />
                                Download
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => summaryMutation.mutate(doc.id)}>
                                <FileText className="w-4 h-4 mr-2" />
                                Content Summary
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                    {documents.length > 5 && (
                      <div className="text-center pt-3">
                        <Button variant="outline" onClick={() => window.location.href = '/documents'}>
                          View All Documents ({documents.length})
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Content Summary Modal */}
            {selectedDocumentSummary && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <Card className="max-w-2xl w-full max-h-96 overflow-auto">
                  <CardHeader>
                    <CardTitle>Content Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-700 whitespace-pre-wrap">{selectedDocumentSummary}</p>
                    <div className="mt-4 flex justify-end">
                      <Button onClick={() => setSelectedDocumentSummary(null)}>
                        Close
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

      <ChatModal 
        isOpen={isChatModalOpen} 
        onClose={() => setIsChatModalOpen(false)} 
      />
    </DashboardLayout>
  );
}