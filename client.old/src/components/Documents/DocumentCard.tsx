import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Star, MoreHorizontal, FileText, File, Image } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface DocumentCardProps {
  document: {
    id: number;
    name: string;
    description?: string;
    mimeType: string;
    fileSize: number;
    tags?: string[];
    isFavorite: boolean;
    createdAt: string;
  };
}

export default function DocumentCard({ document }: DocumentCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('PUT', `/api/documents/${document.id}/favorite`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({
        title: document.isFavorite ? "Removed from favorites" : "Added to favorites",
        description: document.name,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getFileIcon = () => {
    if (document.mimeType === 'application/pdf') {
      return <FileText className="w-6 h-6 text-red-600" />;
    } else if (document.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return <FileText className="w-6 h-6 text-blue-600" />;
    } else if (document.mimeType === 'text/plain') {
      return <File className="w-6 h-6 text-green-600" />;
    } else if (document.mimeType.startsWith('image/')) {
      return <Image className="w-6 h-6 text-purple-600" />;
    }
    return <File className="w-6 h-6 text-gray-600" />;
  };

  const getFileIconBg = () => {
    if (document.mimeType === 'application/pdf') {
      return 'bg-red-100';
    } else if (document.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return 'bg-blue-100';
    } else if (document.mimeType === 'text/plain') {
      return 'bg-green-100';
    } else if (document.mimeType.startsWith('image/')) {
      return 'bg-purple-100';
    }
    return 'bg-gray-100';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavoriteMutation.mutate();
  };

  return (
    <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
      <CardContent className="p-4">
        {/* Document Type Icon */}
        <div className="flex items-center justify-between mb-3">
          <div className={`w-10 h-10 ${getFileIconBg()} rounded-lg flex items-center justify-center`}>
            {getFileIcon()}
          </div>
          <div className="flex items-center space-x-1">
            <Button 
              variant="ghost" 
              size="sm" 
              className="p-1.5 h-auto"
              onClick={handleToggleFavorite}
              disabled={toggleFavoriteMutation.isPending}
            >
              <Star 
                className={`w-4 h-4 ${
                  document.isFavorite 
                    ? 'text-yellow-400 fill-yellow-400' 
                    : 'text-gray-400'
                }`} 
              />
            </Button>
            <Button variant="ghost" size="sm" className="p-1.5 h-auto">
              <MoreHorizontal className="w-4 h-4 text-gray-400" />
            </Button>
          </div>
        </div>

        {/* Document Info */}
        <h4 className="font-medium text-gray-900 mb-1 truncate" title={document.name}>
          {document.name}
        </h4>
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {document.description || "No description available"}
        </p>

        {/* Tags */}
        {document.tags && document.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {document.tags.slice(0, 3).map((tag, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {document.tags.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{document.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Document Meta */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{formatDistanceToNow(new Date(document.createdAt), { addSuffix: true })}</span>
          <span>{formatFileSize(document.fileSize)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
