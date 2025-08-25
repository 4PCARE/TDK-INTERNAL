import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Star, MoreHorizontal, FileText, File, Image, Trash2, Database, Shield } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
    status?: string;
    isInVectorDb?: boolean;
    isEndorsed?: boolean;
    aiCategory?: string;
    aiCategoryColor?: string;
    summary?: string;
    categoryId?: number;
  };
  isSelected?: boolean;
  onSelect?: (documentId: number, isSelected: boolean) => void;
  viewMode?: "grid" | "list";
  showSelection?: boolean;
}

export default function DocumentCard({ document, isSelected = false, onSelect, viewMode = "grid", showSelection = false }: DocumentCardProps) {
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
    toggleFavoriteMutation.mutate();
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Only handle selection if showSelection is true and it's not a button/dropdown click
    if (showSelection && !e.defaultPrevented) {
      e.preventDefault();
      onSelect?.(document.id, !isSelected);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    console.log("Checkbox clicked:", document.id, !isSelected);
    e.stopPropagation();
    onSelect?.(document.id, !isSelected);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    const documentIds = isSelected ? [document.id] : [document.id];
    e.dataTransfer.setData("application/json", JSON.stringify(documentIds));
  };

  return (
    <Card 
      className={cn(
        "bg-white border shadow-sm hover:shadow-md transition-all cursor-pointer",
        isSelected ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200" : "border-gray-200 hover:border-gray-300",
        viewMode === "list" ? "mb-2" : ""
      )}
      draggable
      onDragStart={handleDragStart}
      onClick={(e) => {
        console.log("Card clicked:", document.id, { isSelected, showSelection });
        handleCardClick(e);
      }}
    >
      <CardContent className={cn("p-4", viewMode === "list" && "py-3")}>
        {/* Document Type Icon */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {showSelection && (
              <div className="flex items-center" onClick={handleCheckboxClick}>
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => {
                    console.log("Checkbox onCheckedChange:", document.id, checked);
                    onSelect?.(document.id, checked as boolean);
                  }}
                  className="w-4 h-4"
                />
              </div>
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
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleToggleFavorite(e);
              }}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="p-1.5 h-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
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

        {/* Status and Vector DB badges */}
        <div className="flex items-center gap-2 mb-2">
          {document.status === 'processing' && (
            <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-600 border-yellow-200">
              Processing
            </Badge>
          )}
          
          {document.isInVectorDb && (
            <Badge variant="outline" className="text-xs">
              <Database className="w-3 h-3 mr-1" />
              Vector DB
            </Badge>
          )}
          
          {document.isEndorsed && (
            <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
              <Shield className="w-3 h-3 mr-1" />
              Endorsed
            </Badge>
          )}
        </div>

        {/* AI Category */}
        {document.aiCategory && (
          <div className="mb-2">
            <Badge 
              variant="outline" 
              className="text-xs w-fit"
              style={{ 
                backgroundColor: document.aiCategoryColor ? `${document.aiCategoryColor}15` : undefined,
                borderColor: document.aiCategoryColor || undefined,
                color: document.aiCategoryColor || undefined
              }}
            >
              {document.aiCategory}
            </Badge>
          </div>
        )}
        
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {document.summary || document.content || document.description || "No description available"}
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
