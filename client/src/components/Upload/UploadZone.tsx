import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { CloudUpload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DocumentMetadataModal, { DocumentMetadata } from "./DocumentMetadataModal";

interface UploadZoneProps {
  onUploadComplete: () => void;
}

export default function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fileMetadataMap, setFileMetadataMap] = useState<Map<string, DocumentMetadata>>(new Map());

  const uploadMutation = useMutation({
    mutationFn: async (payload: { files: File[], metadataMap: Map<string, DocumentMetadata> }) => {
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
        };
      });
      
      formData.append('metadata', JSON.stringify(metadataArray));
      
      const response = await apiRequest('POST', '/api/documents/upload', formData);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Upload successful",
        description: `${data.length} document(s) uploaded successfully`,
      });
      // Reset state
      setPendingFiles([]);
      setCurrentFileIndex(0);
      setFileMetadataMap(new Map());
      
      // Invalidate all document-related queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents/search"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      onUploadComplete();
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
      // Reset state on error
      setPendingFiles([]);
      setCurrentFileIndex(0);
      setFileMetadataMap(new Map());
    },
  });

  const handleMetadataSubmit = (metadata: DocumentMetadata) => {
    const currentFile = pendingFiles[currentFileIndex];
    if (currentFile) {
      const newMetadataMap = new Map(fileMetadataMap);
      newMetadataMap.set(currentFile.name, metadata);
      setFileMetadataMap(newMetadataMap);

      if (currentFileIndex < pendingFiles.length - 1) {
        // More files to process
        setCurrentFileIndex(currentFileIndex + 1);
      } else {
        // All files have metadata, proceed with upload
        setIsModalOpen(false);
        uploadMutation.mutate({ files: pendingFiles, metadataMap: newMetadataMap });
      }
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setPendingFiles([]);
    setCurrentFileIndex(0);
    setFileMetadataMap(new Map());
  };

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    console.log('UploadZone onDrop:', { 
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
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/msword': ['.doc'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
      'application/json': ['.json'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp']
    },
    maxFiles: 10,
    maxSize: 25 * 1024 * 1024, // 25MB
  });

  const currentFile = pendingFiles[currentFileIndex];

  return (
    <>
      <div 
        {...getRootProps()} 
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragActive 
            ? 'border-blue-400 bg-blue-50' 
            : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
        } ${uploadMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input {...getInputProps()} />
        
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CloudUpload className="w-8 h-8 text-blue-600" />
        </div>
        
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {uploadMutation.isPending ? 'Uploading...' : 'Upload Documents'}
        </h3>
        
        <p className="text-gray-600 mb-4">
          {isDragActive 
            ? 'Drop files here...' 
            : 'Drag and drop files here, or click to select files'
          }
        </p>
        
        <p className="text-sm text-gray-500">
          Supports PDF, DOCX, XLSX, PPTX, TXT, CSV, JSON, and image files up to 25MB each
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Files are automatically classified and tagged using AI
        </p>
        
        {uploadMutation.isPending && (
          <div className="mt-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
          </div>
        )}
      </div>

      {/* Document Metadata Modal */}
      <DocumentMetadataModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmit={handleMetadataSubmit}
        fileName={currentFile?.name || ''}
        currentFileIndex={currentFileIndex}
        totalFiles={pendingFiles.length}
      />
    </>
  );
}
