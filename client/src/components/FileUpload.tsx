import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { 
  CloudUpload, 
  File, 
  X, 
  FileText,
  FilePen,
  FileSpreadsheet,
  FileImage,
  AlertCircle
} from "lucide-react";

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  maxSize?: number; // in bytes
  acceptedTypes?: string[];
}

export default function FileUpload({ 
  onFilesSelected, 
  maxFiles = 10, 
  maxSize = 50 * 1024 * 1024, // 50MB
  acceptedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/json',
  ]
}: FileUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    console.log('FileUpload onDrop:', { 
      acceptedFiles: acceptedFiles.map(f => ({ name: f.name, type: f.type, size: f.size })),
      rejectedFiles: rejectedFiles.map(({ file, errors }) => ({ 
        name: file.name, 
        type: file.type, 
        errors: errors.map((e: any) => e.code) 
      }))
    });
    
    const newErrors: string[] = [];
    
    // Handle rejected files
    rejectedFiles.forEach(({ file, errors }) => {
      errors.forEach((error: any) => {
        if (error.code === 'file-too-large') {
          newErrors.push(`${file.name}: File is too large (max ${maxSize / 1024 / 1024}MB)`);
        } else if (error.code === 'file-invalid-type') {
          newErrors.push(`${file.name}: Unsupported file type`);
        } else {
          newErrors.push(`${file.name}: ${error.message}`);
        }
      });
    });

    // Check total file count
    if (selectedFiles.length + acceptedFiles.length > maxFiles) {
      newErrors.push(`Cannot upload more than ${maxFiles} files at once`);
      setErrors(newErrors);
      return;
    }

    const newFiles = [...selectedFiles, ...acceptedFiles];
    setSelectedFiles(newFiles);
    setErrors(newErrors);
    onFilesSelected(newFiles);
  }, [selectedFiles, maxFiles, maxSize, onFilesSelected]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
      'application/json': ['.json'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp']
    },
    maxSize,
    multiple: true,
  });

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
  };

  const clearAll = () => {
    setSelectedFiles([]);
    setErrors([]);
    onFilesSelected([]);
  };

  const getFileIcon = (file: File) => {
    if (file.type.includes('pdf')) return FilePen;
    if (file.type.includes('word')) return FileText;
    if (file.type.includes('spreadsheet') || file.type.includes('excel')) return FileSpreadsheet;
    if (file.type.includes('image')) return FileImage;
    if (file.type === 'application/json' || file.name.endsWith('.json')) return FileText;
    return File;
  };

  const getFileIconColor = (file: File) => {
    if (file.type.includes('pdf')) return 'text-red-500';
    if (file.type.includes('word')) return 'text-blue-500';
    if (file.type.includes('spreadsheet') || file.type.includes('excel')) return 'text-green-500';
    if (file.type.includes('image')) return 'text-purple-500';
    return 'text-slate-500';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      <Card
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed cursor-pointer transition-colors duration-200",
          isDragActive
            ? "border-primary bg-blue-50"
            : "border-slate-300 hover:border-primary hover:bg-slate-50"
        )}
      >
        <CardContent className="py-12 px-6">
          <input {...getInputProps()} />
          <div className="text-center">
            <CloudUpload className={cn(
              "w-12 h-12 mx-auto mb-4",
              isDragActive ? "text-primary" : "text-slate-400"
            )} />
            
            {isDragActive ? (
              <div>
                <h3 className="text-lg font-semibold text-primary mb-2">
                  Drop files here
                </h3>
                <p className="text-sm text-slate-600">
                  Release to upload your documents
                </p>
              </div>
            ) : (
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">
                  Upload Documents
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  Drag and drop files here, or click to browse
                </p>
                <Button variant="outline" type="button">
                  Choose Files
                </Button>
                <p className="text-xs text-slate-500 mt-4">
                  Supports PDF, DOCX, TXT, XLSX, PPTX, CSV, JSON (max {maxSize / 1024 / 1024}MB each)
                </p>
                <p className="text-xs text-slate-500">
                  Maximum {maxFiles} files at once
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error Messages */}
      {errors.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-red-800 mb-2">Upload Errors</h4>
                <ul className="text-sm text-red-700 space-y-1">
                  {errors.map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium text-slate-800">
                Selected Files ({selectedFiles.length})
              </h4>
              <Button variant="outline" size="sm" onClick={clearAll}>
                Clear All
              </Button>
            </div>
            
            <div className="space-y-2">
              {selectedFiles.map((file, index) => {
                const FileIcon = getFileIcon(file);
                const iconColor = getFileIconColor(file);
                
                return (
                  <div key={index} className="flex items-center space-x-3 p-2 bg-slate-50 rounded-lg">
                    <FileIcon className={cn("w-5 h-5", iconColor)} />
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {file.name}
                      </p>
                      <div className="flex items-center space-x-2 text-xs text-slate-500">
                        <span>{formatFileSize(file.size)}</span>
                        <span>•</span>
                        <span>{file.type || 'Unknown type'}</span>
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
