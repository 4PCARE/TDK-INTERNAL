import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  FileText, FileImage, FileVideo, FileSpreadsheet, FilePen, Download, Share, 
  Eye, Trash2, MoreHorizontal, Calendar, HardDrive, Hash, Star, StarOff,
  BookOpen, Database, Plus, MessageSquare, ThumbsUp, Shield, Trophy
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import DocumentChatModal from "./Chat/DocumentChatModal";
import ContentSummaryModal from "./ContentSummaryModal";
import ShareDocumentDialog from "./ShareDocumentDialog";
import DocumentEndorsementDialog from "./DocumentEndorsementDialog";

// Helper function to format effective date range
const formatEffectiveDateRange = (startDate?: string, endDate?: string) => {
  if (!startDate && !endDate) return null;
  
  const start = startDate ? format(new Date(startDate), 'MMM d, yyyy') : null;
  const end = endDate ? format(new Date(endDate), 'MMM d, yyyy') : null;
  
  if (start && end) {
    return `Effective: ${start} – ${end}`;
  } else if (start) {
    return `Effective from: ${start}`;
  } else if (end) {
    return `Effective until: ${end}`;
  }
  
  return null;
};

interface DocumentCardProps {
  document: {
    id: number;
    name: string;
    originalName?: string;
    fileName: string;
    fileType?: string;
    mimeType: string;
    fileSize: number;
    status?: string;
    createdAt: string;
    categoryId?: number;
    categoryName?: string;
    aiCategory?: string;
    aiCategoryColor?: string;
    isInVectorDb?: boolean;
    isFavorite?: boolean;
    isEndorsed?: boolean;
    endorsedAt?: string;
    effectiveStartDate?: string;
    effectiveEndDate?: string;
    tags?: string[];
    summary?: string;
  };
  viewMode?: "grid" | "list";
  categories?: Array<{ id: number; name: string; color: string; icon: string }>;
}

export default function DocumentCard({ document: doc, viewMode = "grid", categories }: DocumentCardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showSummary, setShowSummary] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showChatWithDocument, setShowChatWithDocument] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showEndorsementDialog, setShowEndorsementDialog] = useState(false);
  
  // Use doc.isFavorite directly instead of local state to prevent sync issues
  const isFavorite = doc.isFavorite || false;

  // Fetch document details when needed
  const { data: documentDetails, isLoading: detailsLoading } = useQuery({
    queryKey: [`/api/documents/${doc.id}`],
    enabled: showDetails,
    retry: false,
  });

  const getFileIcon = (mimeType: string) => {
    if (!mimeType) return FileText;
    if (mimeType.includes('pdf')) return FilePen;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
    if (mimeType.includes('image')) return FileImage;
    if (mimeType.includes('video')) return FileVideo;
    return FileText;
  };

  const getFileIconColor = (mimeType: string) => {
    if (!mimeType) return 'bg-gray-100 text-gray-600';
    if (mimeType.includes('pdf')) return 'bg-red-100 text-red-600';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'bg-green-100 text-green-600';
    if (mimeType.includes('image')) return 'bg-purple-100 text-purple-600';
    if (mimeType.includes('video')) return 'bg-blue-100 text-blue-600';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'bg-blue-100 text-blue-600';
    return 'bg-gray-100 text-gray-600';
  };

  const formatFileSize = (bytes: number | null | undefined) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    if (isNaN(bytes)) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "Copied to clipboard",
        description: "Share link has been copied.",
      });
    });
  };

  // Delete document mutation
  const deleteDocumentMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(`/api/documents/${doc.id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({
        title: "Document deleted",
        description: "Document has been successfully deleted.",
      });
      // Add notification
      if ((window as any).addNotification) {
        (window as any).addNotification({
          type: 'delete',
          title: 'Document Deleted',
          message: `Document "${doc.name || doc.originalName}" has been deleted.`
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete document.",
        variant: "destructive",
      });
    },
  });

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/documents/${doc.id}/favorite`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents/search"] });
      toast({
        title: isFavorite ? "Removed from favorites" : "Added to favorites",
        description: `Document ${isFavorite ? 'removed from' : 'added to'} your favorites.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update favorites.",
        variant: "destructive",
      });
    },
  });

  // Add to vector database mutation
  const addToVectorMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(`/api/documents/${doc.id}/vectorize`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({
        title: "Added to Vector DB",
        description: "Document has been added to the vector database for AI search.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add to vector database.",
        variant: "destructive",
      });
    },
  });

  const handleView = () => {
    setShowDetails(true);
  };

  const handleViewSummary = () => {
    if (doc.summary) {
      setShowSummary(true);
    } else {
      toast({
        title: "No summary available",
        description: "This document doesn't have a generated summary yet.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = `/api/documents/${doc.id}/download`;
    link.download = doc.originalName || doc.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: "Download started",
      description: "Document download has started.",
    });
  };

  const handleShare = () => {
    setShowShareDialog(true);
  };

  const FileIcon = getFileIcon(doc.mimeType);
  const iconColorClass = getFileIconColor(doc.mimeType);

  // List view layout
  if (viewMode === "list") {
    return (
      <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors">
        <div className="flex items-center space-x-4">
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", iconColorClass)}>
            <FileIcon className="w-5 h-5" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-gray-900 truncate flex-1">
                {doc.name || doc.originalName}
              </h3>
              <div className="flex items-center gap-1 flex-shrink-0">
                {doc.isEndorsed && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Trophy className="w-4 h-4 text-yellow-600 fill-yellow-500" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatEffectiveDateRange(doc.effectiveStartDate, doc.effectiveEndDate) || "Endorsed Document"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {isFavorite && (
                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-400" />
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
              <span className="flex items-center">
                <Calendar className="w-3 h-3 mr-1" />
                {format(new Date(doc.createdAt), 'MMM d, yyyy')}
              </span>
              <span className="flex items-center">
                <HardDrive className="w-3 h-3 mr-1" />
                {formatFileSize(doc.fileSize)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {doc.aiCategory && (
            <Badge 
              variant="outline" 
              className="text-xs"
              style={{ 
                backgroundColor: doc.aiCategoryColor ? `${doc.aiCategoryColor}15` : undefined,
                borderColor: doc.aiCategoryColor || undefined,
                color: doc.aiCategoryColor || undefined
              }}
            >
              {doc.aiCategory}
            </Badge>
          )}
          
          {doc.categoryId && categories && (
            (() => {
              const category = categories.find(c => c.id === doc.categoryId);
              return category ? (
                <Badge 
                  variant="outline" 
                  className="text-xs"
                  style={{ 
                    backgroundColor: category.color ? `${category.color}15` : undefined,
                    borderColor: category.color || undefined,
                    color: category.color || undefined
                  }}
                >
                  {category.name}
                </Badge>
              ) : null;
            })()
          )}
          
          {doc.categoryName && !doc.categoryId && (
            <Badge variant="outline" className="text-xs">
              {doc.categoryName}
            </Badge>
          )}

          {doc.tags && doc.tags.length > 0 && (
            <div className="flex items-center space-x-1">
              {doc.tags.slice(0, 2).map((tag: string, index: number) => (
                <Badge key={index} variant="outline" className="text-xs">
                  <Hash className="w-2 h-2 mr-1" />
                  {tag}
                </Badge>
              ))}
              {doc.tags.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{doc.tags.length - 2}
                </Badge>
              )}
            </div>
          )}

          {doc.status === 'processing' && (
            <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-600 border-yellow-200">
              Processing
            </Badge>
          )}
          
          {doc.isInVectorDb && (
            <Badge variant="outline" className="text-xs">
              <Database className="w-3 h-3 mr-1" />
              Vector DB
            </Badge>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleViewSummary}>
                <BookOpen className="mr-2 h-4 w-4" />
                Content Summary
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleShare}>
                <Share className="mr-2 h-4 w-4" />
                Share
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowChatWithDocument(true)}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Chat with Document
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.location.href = `/user-feedback?documentId=${doc.id}`}>
                <ThumbsUp className="mr-2 h-4 w-4" />
                View Feedback
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => toggleFavoriteMutation.mutate()}
                disabled={toggleFavoriteMutation.isPending}
              >
                {isFavorite ? <StarOff className="mr-2 h-4 w-4" /> : <Star className="mr-2 h-4 w-4" />}
                {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              </DropdownMenuItem>
              {!doc.isInVectorDb && doc.status === 'processed' && (
                <DropdownMenuItem 
                  onClick={() => addToVectorMutation.mutate()}
                  disabled={addToVectorMutation.isPending}
                >
                  <Database className="mr-2 h-4 w-4" />
                  Add to Vector DB
                </DropdownMenuItem>
              )}
              <DropdownMenuItem 
                className="text-red-600"
                onClick={() => deleteDocumentMutation.mutate()}
                disabled={deleteDocumentMutation.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  // Grid view layout
  return (
    <>
      <Card className="border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer group">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", iconColorClass)}>
              <FileIcon className="w-5 h-5" />
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleView}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleViewSummary}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Content Summary
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownload}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleShare}>
                  <Share className="mr-2 h-4 w-4" />
                  Share
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowChatWithDocument(true)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Chat with Document
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => toggleFavoriteMutation.mutate()}
                  disabled={toggleFavoriteMutation.isPending}
                >
                  {isFavorite ? <StarOff className="mr-2 h-4 w-4" /> : <Star className="mr-2 h-4 w-4" />}
                  {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                </DropdownMenuItem>
                {!doc.isEndorsed && (
                  <DropdownMenuItem onClick={() => setShowEndorsementDialog(true)}>
                    <ThumbsUp className="mr-2 h-4 w-4" />
                    Endorse Document
                  </DropdownMenuItem>
                )}
                {!doc.isInVectorDb && doc.status === 'processed' && (
                  <DropdownMenuItem 
                    onClick={() => addToVectorMutation.mutate()}
                    disabled={addToVectorMutation.isPending}
                  >
                    <Database className="mr-2 h-4 w-4" />
                    Add to Vector DB
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  className="text-red-600"
                  onClick={() => deleteDocumentMutation.mutate()}
                  disabled={deleteDocumentMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm text-gray-900 line-clamp-2 leading-tight flex-1">
                {doc.name || doc.originalName}
              </h3>
              <div className="flex items-center gap-1 flex-shrink-0">
                {doc.isEndorsed && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Trophy className="w-4 h-4 text-yellow-600 fill-yellow-500" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatEffectiveDateRange(doc.effectiveStartDate, doc.effectiveEndDate) || "Endorsed Document"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {isFavorite && (
                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-400" />
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span className="flex items-center">
                <Calendar className="w-3 h-3 mr-1" />
                {format(new Date(doc.createdAt), 'MMM d, yyyy')}
              </span>
              <span className="flex items-center">
                <HardDrive className="w-3 h-3 mr-1" />
                {formatFileSize(doc.fileSize)}
              </span>
            </div>

            {/* AI Category */}
            {doc.aiCategory && (
              <Badge 
                variant="outline" 
                className="text-xs w-fit"
                style={{ 
                  backgroundColor: doc.aiCategoryColor ? `${doc.aiCategoryColor}15` : undefined,
                  borderColor: doc.aiCategoryColor || undefined,
                  color: doc.aiCategoryColor || undefined
                }}
              >
                {doc.aiCategory}
              </Badge>
            )}

            {/* Summary */}
            {doc.summary && (
              <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                {doc.summary}
              </p>
            )}

            {/* User Category */}
            {doc.categoryId && categories && (
              (() => {
                const category = categories.find(c => c.id === doc.categoryId);
                return category ? (
                  <Badge variant="outline" className="text-xs w-fit">
                    {category.name}
                  </Badge>
                ) : null;
              })()
            )}

            {/* Tags */}
            {doc.tags && doc.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {doc.tags.slice(0, 3).map((tag: string, index: number) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    <Hash className="w-2 h-2 mr-1" />
                    {tag}
                  </Badge>
                ))}
                {doc.tags.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{doc.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}

            {/* Status and Vector DB badges */}
            <div className="flex items-center gap-2">
              {doc.status === 'processing' && (
                <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-600 border-yellow-200">
                  Processing
                </Badge>
              )}
              
              {doc.isInVectorDb && (
                <Badge variant="outline" className="text-xs">
                  <Database className="w-3 h-3 mr-1" />
                  Vector DB
                </Badge>
              )}
              
              {doc.isEndorsed && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
                  <Shield className="w-3 h-3 mr-1" />
                  Endorsed
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Summary Dialog */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <BookOpen className="w-5 h-5" />
              <span>Content Summary</span>
            </DialogTitle>
            <DialogDescription>
              AI-generated summary of {doc.name || doc.originalName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {doc.summary ? (
              <div className="prose prose-sm max-w-none">
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{doc.summary}</p>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No summary available for this document.</p>
                <p className="text-sm text-gray-400 mt-1">The document may not contain extractable text content.</p>
              </div>
            )}
            
            {doc.tags && doc.tags.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Related Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {doc.tags.map((tag: string, index: number) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      <Hash className="w-2 h-2 mr-1" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat with Document Modal */}
      <DocumentChatModal
        isOpen={showChatWithDocument}
        onClose={() => setShowChatWithDocument(false)}
        documentId={doc.id}
        documentName={doc.name || doc.originalName || ""}
      />

      {/* Document Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Eye className="w-5 h-5" />
              <span>Document Details</span>
            </DialogTitle>
            <DialogDescription>
              Complete information and content for {doc.name || doc.originalName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {detailsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span className="ml-2 text-gray-600">Loading document details...</span>
              </div>
            ) : documentDetails ? (
              <>
                {/* Document Info */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="text-sm font-medium text-gray-700">File Name</label>
                    <p className="text-sm text-gray-900">{(documentDetails as any).name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">File Size</label>
                    <p className="text-sm text-gray-900">{formatFileSize((documentDetails as any).fileSize)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">File Type</label>
                    <p className="text-sm text-gray-900">{(documentDetails as any).mimeType}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Created</label>
                    <p className="text-sm text-gray-900">
                      {(documentDetails as any).createdAt 
                        ? format(new Date((documentDetails as any).createdAt), 'PPP') 
                        : 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Uploaded By</label>
                    <p className="text-sm text-gray-900">
                      {(documentDetails as any).uploaderName || 'Unknown User'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Department</label>
                    <p className="text-sm text-gray-900">
                      {(documentDetails as any).departmentName || 'No Department'}
                    </p>
                  </div>
                </div>

                {/* User Information */}
                {((documentDetails as any).uploaderEmail || (documentDetails as any).uploaderRole) && (
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Uploader Information</h4>
                    <div className="space-y-1">
                      {(documentDetails as any).uploaderEmail && (
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Email:</span> {(documentDetails as any).uploaderEmail}
                        </p>
                      )}
                      {(documentDetails as any).uploaderRole && (
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Role:</span> {(documentDetails as any).uploaderRole}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* AI Classification */}
                {(documentDetails as any).aiCategory && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">AI Classification</h4>
                    <Badge 
                      variant="outline" 
                      className="text-sm"
                      style={{ 
                        backgroundColor: (documentDetails as any).aiCategoryColor ? `${(documentDetails as any).aiCategoryColor}15` : undefined,
                        borderColor: (documentDetails as any).aiCategoryColor || undefined,
                        color: (documentDetails as any).aiCategoryColor || undefined
                      }}
                    >
                      {(documentDetails as any).aiCategory}
                    </Badge>
                  </div>
                )}

                {/* Tags */}
                {(documentDetails as any).tags && (documentDetails as any).tags.length > 0 && (
                  <div className="p-4 bg-green-50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {(documentDetails as any).tags.map((tag: string, index: number) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          <Hash className="w-2 h-2 mr-1" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Summary */}
                {(documentDetails as any).summary && (
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Summary</h4>
                    <p className="text-sm text-gray-700 leading-relaxed">{(documentDetails as any).summary}</p>
                  </div>
                )}

                {/* Content */}
                {(documentDetails as any).content && (
                  <div className="p-4 bg-white border rounded-lg">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Document Content</h4>
                    <div className="max-h-64 overflow-y-auto">
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                        {(documentDetails as any).content}
                      </pre>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Eye className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Document details not available.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Content Summary Modal with Translation */}
      <ContentSummaryModal
        isOpen={showSummary}
        onClose={() => setShowSummary(false)}
        documentId={doc.id}
        documentName={doc.name || doc.originalName || ""}
        summary={doc.summary || ""}
        tags={doc.tags}
      />

      {/* Share Document Dialog */}
      <ShareDocumentDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        documentId={doc.id}
        documentName={doc.name || doc.originalName || ""}
      />

      {/* Document Endorsement Dialog */}
      <DocumentEndorsementDialog
        isOpen={showEndorsementDialog}
        onClose={() => setShowEndorsementDialog(false)}
        documentId={doc.id}
        documentName={doc.name || doc.originalName || ""}
      />
    </>
  );
}