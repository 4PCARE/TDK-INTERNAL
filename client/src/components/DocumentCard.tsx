
import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Download,
  Eye,
  Trash2,
  Edit,
  Share,
  Tag,
  Star,
  Calendar,
  User,
  FileType,
  Clock,
} from "lucide-react";
import ShareDocumentDialog from "./ShareDocumentDialog";
import DocumentEndorsementDialog from "./DocumentEndorsementDialog";
import ContentSummaryModal from "./ContentSummaryModal";
import DocumentChatModal from "./Chat/DocumentChatModal";

interface DocumentCardProps {
  document: any;
  viewMode?: "grid" | "list";
  isSelected?: boolean;
  onSelect?: (documentId: number, isSelected: boolean) => void;
  showSelection?: boolean;
}

export default function DocumentCard({ 
  document, 
  viewMode = "grid", 
  isSelected = false, 
  onSelect, 
  showSelection = false 
}: DocumentCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isEndorsementDialogOpen, setIsEndorsementDialogOpen] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete document");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Document deleted successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting document",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/documents/${document.id}/favorite`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to toggle favorite");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({
        title: document.isFavorite ? "Removed from favorites" : "Added to favorites",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating favorite",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCheckboxChange = (checked: boolean) => {
    if (onSelect) {
      onSelect(document.id, checked);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Prevent selection when clicking on buttons or other interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[role="button"]') || target.closest('input')) {
      return;
    }

    // If selection mode is enabled and onSelect is provided, toggle selection
    if (showSelection && onSelect) {
      onSelect(document.id, !isSelected);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    const type = fileType?.toLowerCase();
    if (type?.includes("pdf")) return <FileText className="w-5 h-5 text-red-500" />;
    if (type?.includes("image")) return <FileType className="w-5 h-5 text-green-500" />;
    if (type?.includes("word") || type?.includes("doc")) return <FileText className="w-5 h-5 text-blue-500" />;
    if (type?.includes("excel") || type?.includes("sheet")) return <FileText className="w-5 h-5 text-green-600" />;
    if (type?.includes("powerpoint") || type?.includes("presentation")) return <FileText className="w-5 h-5 text-orange-500" />;
    return <FileText className="w-5 h-5 text-gray-500" />;
  };

  if (viewMode === "list") {
    return (
      <Card 
        className={`border border-slate-200 hover:shadow-md transition-all duration-200 cursor-pointer ${
          isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
        }`}
        onClick={handleCardClick}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              {showSelection && (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={handleCheckboxChange}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              
              <div className="flex-shrink-0">
                {getFileIcon(document.fileType)}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-slate-800 truncate">
                  {document.name || document.originalName}
                </h3>
                <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(document.createdAt).toLocaleDateString()}
                  </span>
                  {document.fileSize && (
                    <span className="flex items-center gap-1">
                      <FileType className="w-3 h-3" />
                      {formatFileSize(document.fileSize)}
                    </span>
                  )}
                  {document.aiCategory && (
                    <Badge variant="outline" className="text-xs">
                      {document.aiCategory}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant={document.isFavorite ? "default" : "outline"}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavoriteMutation.mutate();
                }}
                className={document.isFavorite ? "bg-yellow-500 hover:bg-yellow-600" : ""}
              >
                <Star className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsChatModalOpen(true);
                }}
              >
                <Eye className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsShareDialogOpen(true);
                }}
              >
                <Share className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMutation.mutate(document.id);
                }}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className={`border border-slate-200 hover:shadow-lg transition-all duration-200 cursor-pointer ${
        isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
      }`}
      onClick={handleCardClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {showSelection && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={handleCheckboxChange}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            
            <div className="flex-shrink-0 mt-1">
              {getFileIcon(document.fileType)}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-slate-800 leading-tight line-clamp-2">
                {document.name || document.originalName}
              </h3>
            </div>
          </div>

          <Button
            variant={document.isFavorite ? "default" : "ghost"}
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              toggleFavoriteMutation.mutate();
            }}
            className={`flex-shrink-0 ${
              document.isFavorite 
                ? "bg-yellow-500 hover:bg-yellow-600 text-white" 
                : "text-slate-400 hover:text-yellow-500"
            }`}
          >
            <Star className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3">
          {document.aiCategory && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              {document.aiCategory}
            </Badge>
          )}

          {document.tags && document.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {document.tags.slice(0, 3).map((tag: string, index: number) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {document.tags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{document.tags.length - 3}
                </Badge>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(document.createdAt).toLocaleDateString()}
            </span>
            {document.fileSize && (
              <span>{formatFileSize(document.fileSize)}</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsChatModalOpen(true);
              }}
              className="flex-1"
            >
              <Eye className="w-4 h-4 mr-1" />
              View
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsShareDialogOpen(true);
              }}
            >
              <Share className="w-4 h-4" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                deleteMutation.mutate(document.id);
              }}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Modals */}
      <ShareDocumentDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        document={document}
      />

      <DocumentEndorsementDialog
        isOpen={isEndorsementDialogOpen}
        onClose={() => setIsEndorsementDialogOpen(false)}
        document={document}
      />

      <ContentSummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        document={document}
      />

      <DocumentChatModal
        isOpen={isChatModalOpen}
        onClose={() => setIsChatModalOpen(false)}
        document={document}
      />
    </Card>
  );
}
