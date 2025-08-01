
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Star, MoreHorizontal, FileText, File, Image, Trash2, Eye, MessageSquare, Download, Share, Hash } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import DocumentChatModal from "@/components/Chat/DocumentChatModal";
import ShareDocumentDialog from "@/components/ShareDocumentDialog";

interface DocumentCardProps {
  document: {
    id: number;
    name: string;
    originalName?: string;
    fileName?: string;
    description?: string;
    summary?: string;
    mimeType: string;
    fileType?: string;
    fileSize: number;
    tags?: string[];
    isFavorite: boolean;
    isEndorsed?: boolean;
    createdAt: string;
    updatedAt?: string;
    uploaderName?: string;
    uploaderEmail?: string;
    uploaderRole?: string;
    departmentName?: string;
    categoryName?: string;
    aiCategory?: string;
    content?: string;
    status?: string;
  };
  viewMode?: "grid" | "list";
  categories?: Array<{ id: number; name: string }>;
}

export default function DocumentCard({ document: doc, viewMode = "grid", categories }: DocumentCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDetails, setShowDetails] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);

  // Fetch document details when dialog opens
  const { data: documentDetails, isLoading: detailsLoading } = useQuery({
    queryKey: [`/api/documents/${doc.id}`, showDetails],
    queryFn: async () => {
      if (!showDetails) return null;
      try {
        const response = await fetch(`/api/documents/${doc.id}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch document details: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        console.error("Error fetching document details:", error);
        throw error;
      }
    },
    enabled: showDetails,
    retry: 1,
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('PUT', `/api/documents/${doc.id}/favorite`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents/search"] });
      toast({
        title: doc.isFavorite ? "Removed from favorites" : "Added to favorites",
        description: doc.name || doc.originalName,
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
      return await apiRequest("DELETE", `/api/documents/${doc.id}`);
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
    if (doc.mimeType === 'application/pdf') {
      return <FileText className="w-6 h-6 text-red-600" />;
    } else if (doc.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return <FileText className="w-6 h-6 text-blue-600" />;
    } else if (doc.mimeType === 'text/plain') {
      return <File className="w-6 h-6 text-green-600" />;
    } else if (doc.mimeType.startsWith('image/')) {
      return <Image className="w-6 h-6 text-purple-600" />;
    }
    return <File className="w-6 h-6 text-gray-600" />;
  };

  const getFileIconBg = () => {
    if (doc.mimeType === 'application/pdf') {
      return 'bg-red-100';
    } else if (doc.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return 'bg-blue-100';
    } else if (doc.mimeType === 'text/plain') {
      return 'bg-green-100';
    } else if (doc.mimeType.startsWith('image/')) {
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

  const handleView = () => {
    setShowDetails(true);
  };

  const handleChat = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowChatModal(true);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowShareDialog(true);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/api/documents/${doc.id}/download`);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = doc.originalName || doc.fileName || doc.name || `document-${doc.id}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Download started",
        description: `Downloading ${doc.name || doc.originalName}`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Unable to download the document. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (viewMode === "list") {
    return (
      <>
        <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4 flex-1 min-w-0">
                <div className={`w-10 h-10 ${getFileIconBg()} rounded-lg flex items-center justify-center flex-shrink-0`}>
                  {getFileIcon()}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 truncate" title={doc.name || doc.originalName}>
                    {doc.name || doc.originalName}
                  </h4>
                  <p className="text-sm text-gray-600 truncate">
                    {doc.description || doc.summary || "No description available"}
                  </p>
                  <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                    <span>{formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}</span>
                    <span>{formatFileSize(doc.fileSize)}</span>
                    {doc.uploaderName && <span>by {doc.uploaderName}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2 flex-shrink-0">
                {doc.tags && doc.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 max-w-48">
                    {doc.tags.slice(0, 2).map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {doc.tags.length > 2 && (
                      <Badge variant="secondary" className="text-xs">
                        +{doc.tags.length - 2}
                      </Badge>
                    )}
                  </div>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleView}
                  className="text-blue-600 hover:text-blue-800"
                >
                  <Eye className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleChat}
                  className="text-green-600 hover:text-green-800"
                >
                  <MessageSquare className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="p-1.5 h-auto"
                  onClick={handleToggleFavorite}
                  disabled={toggleFavoriteMutation.isPending}
                >
                  <Star 
                    className={`w-4 h-4 ${
                      doc.isFavorite 
                        ? 'text-yellow-400 fill-yellow-400' 
                        : 'text-gray-400'
                    }`} 
                  />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="p-1.5 h-auto">
                      <MoreHorizontal className="w-4 h-4 text-gray-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={handleDownload}>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleShare}>
                      <Share className="mr-2 h-4 w-4" />
                      Share
                    </DropdownMenuItem>
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
          </CardContent>
        </Card>

        {/* Modals */}
        {showChatModal && (
          <DocumentChatModal
            document={doc}
            isOpen={showChatModal}
            onClose={() => setShowChatModal(false)}
          />
        )}

        {showShareDialog && (
          <ShareDocumentDialog
            document={doc}
            isOpen={showShareDialog}
            onClose={() => setShowShareDialog(false)}
          />
        )}

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

                  {/* Document Content */}
                  {(documentDetails as any).content && (
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Content Preview</h4>
                      <div className="text-sm text-gray-700 max-h-64 overflow-y-auto">
                        <pre className="whitespace-pre-wrap font-sans">
                          {(documentDetails as any).content.substring(0, 2000)}
                          {(documentDetails as any).content.length > 2000 && "..."}
                        </pre>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">Document details not available.</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Grid view
  return (
    <>
      <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={handleView}>
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
                    doc.isFavorite 
                      ? 'text-yellow-400 fill-yellow-400' 
                      : 'text-gray-400'
                  }`} 
                />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="p-1.5 h-auto">
                    <MoreHorizontal className="w-4 h-4 text-gray-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={handleChat}>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Chat with Document
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDownload}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShare}>
                    <Share className="mr-2 h-4 w-4" />
                    Share
                  </DropdownMenuItem>
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
          <h4 className="font-medium text-gray-900 mb-1 truncate" title={doc.name || doc.originalName}>
            {doc.name || doc.originalName}
          </h4>
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {doc.description || doc.summary || "No description available"}
          </p>

          {/* Tags */}
          {doc.tags && doc.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {doc.tags.slice(0, 3).map((tag, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {doc.tags.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{doc.tags.length - 3}
                </Badge>
              )}
            </div>
          )}

          {/* Document Meta */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}</span>
            <span>{formatFileSize(doc.fileSize)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      {showChatModal && (
        <DocumentChatModal
          document={doc}
          isOpen={showChatModal}
          onClose={() => setShowChatModal(false)}
        />
      )}

      {showShareDialog && (
        <ShareDocumentDialog
          document={doc}
          isOpen={showShareDialog}
          onClose={() => setShowShareDialog(false)}
        />
      )}

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

                {/* Document Content */}
                {(documentDetails as any).content && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Content Preview</h4>
                    <div className="text-sm text-gray-700 max-h-64 overflow-y-auto">
                      <pre className="whitespace-pre-wrap font-sans">
                        {(documentDetails as any).content.substring(0, 2000)}
                        {(documentDetails as any).content.length > 2000 && "..."}
                      </pre>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">Document details not available.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
