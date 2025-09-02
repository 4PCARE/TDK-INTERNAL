import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { CloudUpload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DocumentMetadataModal, { DocumentMetadata } from "./DocumentMetadataModal";
import { useAuth } from '@/hooks/useAuth';
import { io, Socket } from 'socket.io-client';

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
  const { getToken } = useAuth(); // Assuming useAuth provides a getToken function
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
  const [socket, setSocket] = useState<Socket | null>(null);

  // Initialize Socket.IO connection
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const newSocket = io('http://localhost:3000', { // Replace with your server URL
      auth: {
        token: token,
      },
    });

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket server');
      setSocket(newSocket);
    });

    newSocket.on('upload_status', (data: { fileName: string, progress: number, status: string, uploadedBytes: number }) => {
      console.log('Received upload status:', data);
      setUploadFiles(currentFiles =>
        currentFiles.map(file => {
          if (file.name === data.fileName) {
            return {
              ...file,
              progress: data.progress,
              status: data.status as UploadFile['status'], // Cast to UploadFile status type
              uploadedBytes: data.uploadedBytes,
            };
          }
          return file;
        })
      );
      // Update overall upload progress if needed, or just the file progress
      const totalProgress = (data.uploadedBytes / totalBytes) * 100;
      setUploadProgress(totalProgress);
      setUploadedBytes(data.uploadedBytes);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      setSocket(null);
    });

    newSocket.on('connect_error', (err) => {
      console.error('WebSocket connection error:', err);
      toast({
        title: "Connection Error",
        description: "Could not connect to the status update server.",
        variant: "destructive",
      });
    });

    // Cleanup on component unmount
    return () => {
      newSocket.disconnect();
    };
  }, [getToken, toast, totalBytes]); // Re-run if token or totalBytes changes

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
        // Use fetch API for easier progress and status handling
        const response = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${getToken()}`,
          },
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upload failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('Upload response:', result);
        setUploadProgress(100);
        return result;

      } catch (error: any) {
        if (error.name === 'AbortError') {
          throw new Error('Upload was cancelled');
        }
        console.error('Upload error in mutationFn:', error);
        throw error; // Re-throw the error to be caught by onError
      } finally {
        setIsUploading(false);
        setAbortController(null);
        // Resetting progress and bytes here might be too early if socket updates are still coming
        // Let socket updates handle the final state
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

      // Update files to completed status via onUploadStatusChange after a delay
      setTimeout(() => {
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
      }, 500); // Small delay before marking as completed to ensure socket updates are processed
    },
    onError: (error: any) => {
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
    console.log('Submitting metadata for file:', pendingFiles[currentFileIndex]?.name);

    const currentFile = pendingFiles[currentFileIndex];
    if (currentFile) {
      const newMetadataMap = new Map(fileMetadataMap);
      newMetadataMap.set(currentFile.name, metadata);
      setFileMetadataMap(newMetadataMap);

      setCurrentFolderId(metadata.folderId);

      if (currentFileIndex < pendingFiles.length - 1) {
        setCurrentFileIndex(currentFileIndex + 1);
      } else {
        setIsModalOpen(false);
        // Initiate the upload mutation
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
      if (isUploading) {
        toast({
          title: "Upload in progress",
          description: "Please wait for the current upload to complete before uploading new files.",
          variant: "destructive",
        });
        return;
      }

      setPendingFiles(acceptedFiles);
      setCurrentFileIndex(0);
      setFileMetadataMap(new Map());
      setIsModalOpen(true);
    }
  }, [toast, isUploading]); 

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
    if (socket) {
      const action = isPaused ? 'resume_upload' : 'pause_upload';
      socket.emit(action, { fileName: uploadFiles[0]?.name }); // Assuming we are uploading one file at a time for pause/resume
    }
    setIsPaused(!isPaused);

    const updatedFiles = uploadFiles.map(file => ({
      ...file,
      status: (!isPaused ? 'paused' : 'uploading') as const
    }));
    setUploadFiles(updatedFiles);
    onUploadStatusChange(updatedFiles);
  };

  const handleCancel = () => {
    if (socket) {
      socket.emit('cancel_upload', { fileName: uploadFiles[0]?.name }); // Assuming we are cancelling one file at a time
    }
    if (abortController) {
      abortController.abort();
    }
    setIsUploading(false);
    setUploadProgress(0);
    setUploadedBytes(0);
    setTotalBytes(0);
    setIsPaused(false);
    setAbortController(null);
    setUploadFiles([]);
    onUploadStatusChange([]);

    toast({
      title: "Upload cancelled",
      description: "Upload was cancelled successfully",
    });
  };

  const handleFileCancel = (fileName: string) => {
    if (socket) {
      socket.emit('cancel_file_upload', { fileName: fileName }); // Emit event for specific file cancellation
    }
    const updatedFiles = uploadFiles.filter(file => file.name !== fileName);
    setUploadFiles(updatedFiles);
    onUploadStatusChange(updatedFiles);

    if (updatedFiles.length === 0) {
      handleCancel(); // If all files are cancelled, trigger general cancel
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

        {isUploading && uploadFiles.length > 0 && (
          <div className="mt-4 space-y-3">
            {uploadFiles.map((file) => (
              <div key={file.name}>
                <div className="flex justify-between text-sm text-gray-700">
                  <span>{file.name}</span>
                  <span>{file.status}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${file.progress}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-600">
                  {formatBytes(file.uploadedBytes)} / {formatBytes(file.totalBytes)} ({file.progress.toFixed(1)}%)
                </div>
                <button
                  onClick={() => handleFileCancel(file.name)}
                  className="mt-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Cancel
                </button>
              </div>
            ))}
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
                Cancel All
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