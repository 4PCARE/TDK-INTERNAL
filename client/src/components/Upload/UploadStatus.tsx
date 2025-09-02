
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { FileText, Pause, Play, Square, Clock, Zap } from "lucide-react";

interface UploadFile {
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'extracting' | 'embedding' | 'completed' | 'paused' | 'error';
  uploadedBytes: number;
  totalBytes: number;
}

interface UploadStatusProps {
  uploadFiles: UploadFile[];
  onPauseResume: (fileName: string) => void;
  onStop: (fileName: string) => void;
  isVisible: boolean;
}

export default function UploadStatus({ 
  uploadFiles, 
  onPauseResume, 
  onStop, 
  isVisible 
}: UploadStatusProps) {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case 'uploading':
        return <FileText className="w-4 h-4 text-blue-500" />;
      case 'extracting':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'embedding':
        return <Zap className="w-4 h-4 text-purple-500" />;
      case 'completed':
        return <FileText className="w-4 h-4 text-green-500" />;
      case 'paused':
        return <Pause className="w-4 h-4 text-gray-500" />;
      case 'error':
        return <FileText className="w-4 h-4 text-red-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = (status: UploadFile['status']) => {
    switch (status) {
      case 'uploading':
        return 'Uploading...';
      case 'extracting':
        return 'Extracting text...';
      case 'embedding':
        return 'Generating AI embedding...';
      case 'completed':
        return 'Completed';
      case 'paused':
        return 'Paused';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  if (!isVisible || uploadFiles.length === 0) {
    return null;
  }

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <FileText className="w-5 h-5" />
          <span>Upload Status</span>
          <span className="text-sm text-gray-500">({uploadFiles.length} files)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        <div className="space-y-4">
          {uploadFiles.map((file, index) => (
            <div key={index} className="border rounded-lg p-4 space-y-3">
              {/* File Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(file.status)}
                  <div>
                    <div className="font-medium text-sm truncate max-w-[200px]" title={file.name}>
                      {file.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatBytes(file.size)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPauseResume(file.name)}
                    disabled={file.status === 'completed' || file.status === 'error'}
                    className="h-8 w-8 p-0"
                  >
                    {file.status === 'paused' ? (
                      <Play className="w-3 h-3" />
                    ) : (
                      <Pause className="w-3 h-3" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onStop(file.name)}
                    disabled={file.status === 'completed'}
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                  >
                    <Square className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-600">{getStatusText(file.status)}</span>
                  <span className="text-gray-500">{file.progress.toFixed(1)}%</span>
                </div>
                <Progress 
                  value={file.progress} 
                  className="h-2"
                />
                {file.status === 'uploading' && (
                  <div className="text-xs text-gray-500 text-center">
                    {formatBytes(file.uploadedBytes)} / {formatBytes(file.totalBytes)}
                  </div>
                )}
              </div>

              {/* Status Details */}
              {file.status === 'extracting' && (
                <div className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
                  Processing document content with AI...
                </div>
              )}
              {file.status === 'embedding' && (
                <div className="text-xs text-purple-600 bg-purple-50 p-2 rounded">
                  Creating semantic embeddings for search...
                </div>
              )}
              {file.status === 'completed' && (
                <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
                  Upload completed successfully
                </div>
              )}
              {file.status === 'error' && (
                <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                  Upload failed - please try again
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
