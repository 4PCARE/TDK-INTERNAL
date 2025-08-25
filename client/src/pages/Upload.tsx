import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CloudUpload, FileText, Upload as UploadIcon, AlertCircle } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import CategoryStatsCards from "@/components/Stats/CategoryStatsCards";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import DocumentMetadataModal, { DocumentMetadata } from "@/components/Upload/DocumentMetadataModal";
import { useAuth } from "@/hooks/useAuth"; // Assuming this is needed for authentication context


interface UploadFile {
  file: File;
  id: string;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
}

export default function Upload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fileMetadataMap, setFileMetadataMap] = useState<Map<string, DocumentMetadata>>(new Map());
  const [isPageLoading, setIsPageLoading] = useState(false);
  const { user, isAuthenticated, isLoading } = useAuth();


  // Upload mutation with progress tracking
  const uploadMutation = useMutation({
    mutationFn: async (payload: { files: File[], metadataMap: Map<string, DocumentMetadata> }) => {
      try {
        const formData = new FormData();

        payload.files.forEach(file => {
          formData.append('files', file);
        });

        // Add metadata for each file
        const metadataArray = payload.files.map(file => {
          const metadata = payload.metadataMap.get(file.name);
          return {
            fileName: file.name,
            name: metadata?.name || file.name,
            effectiveStartDate: metadata?.effectiveStartDate?.toISOString() || null,
            effectiveEndDate: metadata?.effectiveEndDate?.toISOString() || null,
            folderId: metadata?.folderId || null,
          };
        });

        formData.append('metadata', JSON.stringify(metadataArray));

        const response = await apiRequest('POST', '/api/documents/upload', formData);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upload failed: ${response.status} - ${errorText}`);
        }
        return response.json();
      } catch (error) {
        console.error('Upload mutation error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      try {
        toast({
          title: "Upload successful",
          description: `${Array.isArray(data) ? data.length : 'Documents'} uploaded successfully`,
        });

        // Reset upload files
        setUploadFiles([]);
        setPendingFiles([]);
        setCurrentFileIndex(0);
        setFileMetadataMap(new Map());
        setIsPageLoading(false);

        // Invalidate all document-related queries to ensure fresh data
        queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
        queryClient.invalidateQueries({ queryKey: ["/api/documents/search"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stats/categories"] });
        queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      } catch (error) {
        console.error('Error in upload success handler:', error);
        setIsPageLoading(false);
      }
    },
    onError: (error) => {
      try {
        console.error('Upload failed:', error);
        toast({
          title: "Upload failed",
          description: error?.message || "An unexpected error occurred during upload",
          variant: "destructive",
        });

        // Reset upload files
        setUploadFiles([]);
        setPendingFiles([]);
        setCurrentFileIndex(0);
        setFileMetadataMap(new Map());
        setIsPageLoading(false);
      } catch (handlerError) {
        console.error('Error in upload error handler:', handlerError);
        setIsPageLoading(false);
      }
    },
  });

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'text/plain': ['.txt'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
    },
    multiple: true,
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  // Handle file drop event
  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    try {
      setIsPageLoading(true);
      console.log('Upload onDrop:', { 
        acceptedFiles: acceptedFiles.map(f => ({ name: f.name, type: f.type, size: f.size })),
        rejectedFiles: rejectedFiles.map(({ file, errors }) => ({ 
          name: file.name, 
          type: file.type, 
          errors: errors.map((e: any) => e.code) 
        }))
      });

      if (rejectedFiles.length > 0) {
        rejectedFiles.forEach(({ file, errors }) => {
          errors.forEach((error: any) => {
            const message = error.code === 'file-invalid-type' 
              ? `${file.name}: File type not supported`
              : error.code === 'file-too-large'
              ? `${file.name}: File too large`
              : `${file.name}: ${error.message}`;

            toast({
              title: "File rejected",
              description: message,
              variant: "destructive",
            });
          });
        });
      }

      if (acceptedFiles.length > 0) {
        // Start metadata collection process
        setPendingFiles(acceptedFiles);
        setCurrentFileIndex(0);
        setFileMetadataMap(new Map());
        setIsModalOpen(true);
      }

      setIsPageLoading(false);
    } catch (error) {
      console.error('Error in onDrop handler:', error);
      setIsPageLoading(false);
      toast({
        title: "Error",
        description: "Failed to process dropped files",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Handle metadata submission from modal
  const handleMetadataSubmit = useCallback((metadataMap: Map<string, DocumentMetadata>) => {
    if (pendingFiles.length === 0) return;
    
    uploadMutation.mutate({ files: pendingFiles, metadataMap });
    setIsModalOpen(false);
    setPendingFiles([]); // Clear pending files after mutation starts
    setUploadFiles(pendingFiles.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      status: 'uploading',
      progress: 0,
    })));
    setIsPageLoading(true); // Show loading state when upload starts
  }, [pendingFiles, uploadMutation]);

  // Handle modal close
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setPendingFiles([]);
    // Optionally, clear the uploadFiles state if the user cancels metadata
    // setUploadFiles([]); 
  }, []);

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
          <p className="text-gray-600">Loading authentication...</p>
        </div>
      </div>
    );
  }

  // Show loading state if page is loading
  if (isPageLoading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto py-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-600">Processing files...</p>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!isAuthenticated) {
    return null; // Or redirect to login page if not authenticated
  }

  const { getRootProps: getDocumentListRootProps, getInputProps: getDocumentListInputProps } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'text/plain': ['.txt'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
    },
    multiple: true,
    maxSize: 50 * 1024 * 1024, // 50MB
  });


  return (
    <DashboardLayout>
      <div className="container mx-auto py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Documents</h1>
            <p className="text-gray-600">
              Upload your documents and let AI automatically categorize and tag them for easy discovery.
            </p>
          </div>

          {/* Dropzone Area */}
          <Card>
            <CardHeader>
              <CardTitle>
                <CloudUpload className="w-5 h-5 mr-2 inline-block" />
                Drag & Drop Files
              </CardTitle>
              <CardDescription>
                Supported formats: PDF, JPG, PNG, TXT, DOCX, XLSX, PPTX (Max 50MB per file)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div {...getRootProps()} className={`border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-blue-500 bg-blue-50' : 'hover:border-blue-400 hover:bg-gray-50'}`}>
                <input {...getInputProps()} />
                <CloudUpload className="w-12 h-12 text-gray-400 mb-4 mx-auto" />
                <p className="text-gray-700 font-medium">
                  {isDragActive
                    ? "Drop the files here..."
                    : "Drag and drop files here, or click to select files"}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Your files will be processed securely.
                </p>
              </div>

              {/* Upload Progress Indicator */}
              {uploadFiles.length > 0 && (
                <div className="mt-6 space-y-3">
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

          {/* Metadata Modal */}
          {isModalOpen && (
            <DocumentMetadataModal
              files={pendingFiles}
              isOpen={isModalOpen}
              onClose={handleCloseModal}
              onSubmit={handleMetadataSubmit}
              currentFileIndex={currentFileIndex}
              onFileIndexChange={setCurrentFileIndex}
              fileMetadataMap={fileMetadataMap}
              setFileMetadataMap={setFileMetadataMap}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}