import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { CloudUpload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DocumentMetadataModal, { DocumentMetadata } from "./DocumentMetadataModal";

interface UploadFile {
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'extracting' | 'embedding' | 'completed' | 'paused' | 'error';
  uploadedBytes: number;
  totalBytes: number;
}

interface UploadZoneProps {
  onUploadComplete: () => void;
  defaultFolderId?: number | null;
  onUploadStatusChange: (files: UploadFile[]) => void;
}

export default function UploadZone({ onUploadComplete, defaultFolderId, onUploadStatusChange }: UploadZoneProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [fileMetadataMap, setFileMetadataMap] = useState<Map<string, DocumentMetadata>>(new Map());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(defaultFolderId || null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);

  const uploadMutation = useMutation({
    mutationFn: async (payload: { files: File[], metadataMap: Map<string, DocumentMetadata> }) => {
      console.log('Starting upload mutation with files:', payload.files.map(f => f.name));

      setIsUploading(true);
      setUploadProgress(0);
      setIsPaused(false);

      const formData = new FormData();
      let totalSize = 0;

      payload.files.forEach(file => {
        formData.append('files', file);
        totalSize += file.size;
      });

      setTotalBytes(totalSize);

      // Initialize upload files status
      const initialUploadFiles: UploadFile[] = payload.files.map(file => ({
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'uploading' as const,
        uploadedBytes: 0,
        totalBytes: file.size
      }));
      setUploadFiles(initialUploadFiles);
      onUploadStatusChange(initialUploadFiles);

      // Add metadata for each file
      const metadataArray = payload.files.map(file => {
        const metadata = payload.metadataMap.get(file.name);
        const fileMetadata = {
          fileName: file.name,
          name: metadata?.name || file.name,
          effectiveStartDate: metadata?.effectiveStartDate?.toISOString() || null,
          effectiveEndDate: metadata?.effectiveEndDate?.toISOString() || null,
          folderId: metadata?.folderId || null,
        };
        console.log(`Client metadata for ${file.name}:`, fileMetadata);
        return fileMetadata;
      });

      formData.append('metadata', JSON.stringify(metadataArray));

      // Create abort controller for cancellation
      const controller = new AbortController();
      setAbortController(controller);

      try {
        // Create XMLHttpRequest for progress tracking
        const xhr = new XMLHttpRequest();
        
        return new Promise((resolve, reject) => {
          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              const progress = (event.loaded / event.total) * 100;
              setUploadProgress(progress);
              setUploadedBytes(event.loaded);
              
              // Update upload files status
              const updatedFiles = uploadFiles.map(file => ({
                ...file,
                progress: progress,
                uploadedBytes: Math.floor((event.loaded / payload.files.length)),
                status: progress >= 100 ? 'extracting' as const : 'uploading' as const
              }));
              setUploadFiles(updatedFiles);
              onUploadStatusChange(updatedFiles);
              
              console.log(`Upload progress: ${progress.toFixed(1)}%`);
            }
          });

          xhr.addEventListener('load', async () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const result = JSON.parse(xhr.responseText);
                console.log('Upload response:', result);
                setUploadProgress(100);
                resolve(result);
              } catch (error) {
                reject(new Error('Invalid response format'));
              }
            } else {
              reject(new Error(`Upload failed: ${xhr.status} - ${xhr.responseText}`));
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('Upload failed due to network error'));
          });

          xhr.addEventListener('abort', () => {
            reject(new Error('Upload was cancelled'));
          });

          // Handle abort signal
          controller.signal.addEventListener('abort', () => {
            xhr.abort();
          });

          xhr.open('POST', '/api/documents/upload');
          
          // Add authorization header if needed
          const token = localStorage.getItem('auth_token');
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }

          xhr.send(formData);
        });
      } finally {
        setIsUploading(false);
        setAbortController(null);
      }
    },
    onSuccess: (data) => {
      console.log('Upload success data:', data);
      
      // More robust handling of different response structures
      let uploadedCount = 1; // Default fallback
      
      if (Array.isArray(data)) {
        uploadedCount = data.length;
      } else if (data && typeof data === 'object') {
        if (data.documents && Array.isArray(data.documents)) {
          uploadedCount = data.documents.length;
        } else if (data.success && data.count) {
          uploadedCount = data.count;
        } else if (data.uploaded && Array.isArray(data.uploaded)) {
          uploadedCount = data.uploaded.length;
        } else if (data.results && Array.isArray(data.results)) {
          uploadedCount = data.results.length;
        }
      }
      
      toast({
        title: "Upload successful",
        description: `${uploadedCount} document(s) uploaded successfully`,
      });
      
      // Update files to completed status
      const completedFiles = uploadFiles.map(file => ({
        ...file,
        progress: 100,
        status: 'completed' as const
      }));
      setUploadFiles(completedFiles);
      onUploadStatusChange(completedFiles);
      
      // Reset upload state after a delay to show completion
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        setUploadedBytes(0);
        setTotalBytes(0);
        setIsPaused(false);
        setAbortController(null);
        setUploadFiles([]);
        onUploadStatusChange([]);
        
        // Reset file state
        setPendingFiles([]);
        setCurrentFileIndex(0);
        setFileMetadataMap(new Map());
      }, 2000);

      // Refresh all document-related data without page reload
      console.log('Refreshing all document queries...');
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents/search"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      
      onUploadComplete();
    },
    onError: (error) => {
      console.error('Upload error:', error);
      
      const errorMessage = error?.message || 'Unknown upload error occurred';
      
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Update files to error status
      const errorFiles = uploadFiles.map(file => ({
        ...file,
        status: 'error' as const
      }));
      setUploadFiles(errorFiles);
      onUploadStatusChange(errorFiles);
      
      // Reset upload state on error after delay
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        setUploadedBytes(0);
        setTotalBytes(0);
        setIsPaused(false);
        setAbortController(null);
        setUploadFiles([]);
        onUploadStatusChange([]);
        
        // Reset file state on error
        setPendingFiles([]);
        setCurrentFileIndex(0);
        setFileMetadataMap(new Map());
      }, 3000);
    },
  });

  const handleMetadataSubmit = (metadata: DocumentMetadata) => {
    // Allow metadata submission even if upload is in progress (for multi-file scenarios)
    console.log('Submitting metadata for file:', pendingFiles[currentFileIndex]?.name);

    const currentFile = pendingFiles[currentFileIndex];
    if (currentFile) {
      const newMetadataMap = new Map(fileMetadataMap);
      newMetadataMap.set(currentFile.name, metadata);
      setFileMetadataMap(newMetadataMap);

      // Update the current folder selection for the next file
      setCurrentFolderId(metadata.folderId);

      if (currentFileIndex < pendingFiles.length - 1) {
        // More files to process - move to next file
        setCurrentFileIndex(currentFileIndex + 1);
      } else {
        // All files have metadata, close modal and start upload
        setIsModalOpen(false);
        uploadMutation.mutate({ files: pendingFiles, metadataMap: newMetadataMap });
        // Reset state after upload starts
        setPendingFiles([]);
        setCurrentFileIndex(0);
        setFileMetadataMap(new Map());
        setCurrentFolderId(defaultFolderId || null);
      }
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setPendingFiles([]);
    setCurrentFileIndex(0);
    setFileMetadataMap(new Map());
    setCurrentFolderId(defaultFolderId || null);
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
      // Only prevent new uploads if we're actually uploading (not just pending metadata)
      if (isUploading) {
        toast({
          title: "Upload in progress",
          description: "Please wait for the current upload to complete before uploading new files.",
          variant: "destructive",
        });
        return;
      }

      // Start metadata collection process
      setPendingFiles(acceptedFiles);
      setCurrentFileIndex(0);
      setFileMetadataMap(new Map());
      setIsModalOpen(true);
    }
  }, [toast, uploadMutation.isPending, defaultFolderId]); // Added dependencies

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

  const handlePauseResume = () => {
    setIsPaused(!isPaused);
    
    const updatedFiles = uploadFiles.map(file => ({
      ...file,
      status: (!isPaused ? 'paused' : 'uploading') as const
    }));
    setUploadFiles(updatedFiles);
    onUploadStatusChange(updatedFiles);
  };

  const handleCancel = () => {
    if (abortController) {
      abortController.abort();
    }
    setIsUploading(false);
    setUploadProgress(0);
    setUploadedBytes(0);
    setTotalBytes(0);
    setIsPaused(false);
    setAbortController(null);
    setPendingFiles([]);
    setCurrentFileIndex(0);
    setFileMetadataMap(new Map());
    setUploadFiles([]);
    onUploadStatusChange([]);
    
    toast({
      title: "Upload cancelled",
      description: "Upload was cancelled successfully",
    });
  };

  const handleFileCancel = (fileName: string) => {
    const updatedFiles = uploadFiles.filter(file => file.name !== fileName);
    setUploadFiles(updatedFiles);
    onUploadStatusChange(updatedFiles);
    
    if (updatedFiles.length === 0) {
      handleCancel();
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <>
      <div 
        {...getRootProps()} 
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragActive 
            ? 'border-blue-400 bg-blue-50' 
            : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
        } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input {...getInputProps()} />

        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CloudUpload className="w-8 h-8 text-blue-600" />
        </div>

        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {isUploading ? 'Uploading...' : 'Upload Documents'}
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

        {isUploading && (
          <div className="mt-4 space-y-3">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <div className="text-sm text-gray-600">
              {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)} ({uploadProgress.toFixed(1)}%)
            </div>
            <div className="flex justify-center space-x-2">
              <button
                onClick={handlePauseResume}
                className="px-3 py-1 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600"
                disabled={!isUploading}
              >
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
              >
                Cancel
              </button>
            </div>
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
        defaultFolderId={currentFolderId}
      />
    </>
  );
}