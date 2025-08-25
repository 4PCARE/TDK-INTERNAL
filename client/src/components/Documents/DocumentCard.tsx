import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Star, MoreHorizontal, FileText, File, Image, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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
    similarity?: number;
    content?: string;
    isChunkResult?: boolean;
  };
  isSelected?: boolean;
  onSelect?: (documentId: number, isSelected: boolean) => void;
  viewMode?: "grid" | "list";
}

export default function DocumentCard({ document, isSelected = false, onSelect, viewMode = "grid" }: DocumentCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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

  const deleteDocumentMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/documents/${document.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents/search"] });
      toast({
        title: "Document deleted",
        description: "Document has been successfully deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete document.",
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
    e.preventDefault();
    toggleFavoriteMutation.mutate();
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Only handle clicks on the card background, not on interactive elements
    const target = e.target as HTMLElement;
    
    // Check if we clicked on an interactive element or its children
    const isInteractiveElement = target.closest('button') || 
                                target.closest('input[type="checkbox"]') || 
                                target.closest('[data-radix-menu-content]') ||
                                target.closest('[role="menuitem"]') ||
                                target.hasAttribute('data-radix-menu-trigger') ||
                                target.closest('[data-radix-menu-trigger]');
    
    if (isInteractiveElement) {
      return;
    }
    
    // Only toggle selection if we have the onSelect handler
    if (onSelect) {
      onSelect(document.id, !isSelected);
    }
  };

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onSelect) {
      onSelect(document.id, !isSelected);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    const documentIds = isSelected ? [document.id] : [document.id];
    e.dataTransfer.setData("application/json", JSON.stringify(documentIds));
  };

  return (
    <div 
      className={cn(
        "bg-white border shadow-sm hover:shadow-md transition-all select-none rounded-lg",
        isSelected ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200" : "border-gray-200 hover:border-gray-300",
        viewMode === "list" ? "mb-2" : ""
      )}
      draggable
      onDragStart={handleDragStart}
      onClick={handleCardClick}
      onContextMenu={handleRightClick}
    >
      <CardContent className={cn("p-4", viewMode === "list" && "py-3")}>
        {/* Document Type Icon */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {onSelect && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  onSelect(document.id, e.target.checked);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
            )}
            <div className={`w-10 h-10 ${getFileIconBg()} rounded-lg flex items-center justify-center`}>
              {getFileIcon()}
            </div>
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
            <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="p-1.5 h-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIsDropdownOpen(!isDropdownOpen);
                  }}
                  data-radix-menu-trigger="true"
                >
                  <MoreHorizontal className="w-4 h-4 text-gray-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem 
                  className="text-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteDocumentMutation.mutate();
                    setIsDropdownOpen(false);
                  }}
                  disabled={deleteDocumentMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Document Info */}
        <h4 className="font-medium text-gray-900 mb-1 truncate" title={document.name}>
          {document.name}
        </h4>
        
        {/* Show similarity score for search results */}
        {document.similarity !== undefined && (
          <div className="mb-2">
            <Badge variant="outline" className="text-xs">
              {Math.round(document.similarity * 100)}% match
            </Badge>
          </div>
        )}
        
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {document.content || document.description || "No description available"}
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
    </div>
  );
}
