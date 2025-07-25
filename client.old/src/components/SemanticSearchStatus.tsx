import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Brain, Database, RefreshCw, CheckCircle, AlertCircle, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function SemanticSearchStatus() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isReindexing, setIsReindexing] = useState(false);

  // Get user stats to check embedding status
  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
  });

  // Get vector database stats
  const { data: vectorStats } = useQuery({
    queryKey: ["/api/vector/stats"],
  });

  // Get documents to check embedding status
  const { data: documents } = useQuery({
    queryKey: ["/api/documents"],
  });

  const reindexMutation = useMutation({
    mutationFn: async () => {
      setIsReindexing(true);
      return await apiRequest("/api/vector/reindex-all", "POST");
    },
    onSuccess: (data: any) => {
      setIsReindexing(false);
      toast({
        title: "Re-indexing Complete",
        description: `Successfully processed ${data.processed} documents. ${data.errors} failed.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vector/stats"] });
    },
    onError: (error: Error) => {
      setIsReindexing(false);
      toast({
        title: "Reindexing Failed",
        description: error.message || "Failed to reindex documents",
        variant: "destructive",
      });
    },
  });

  if (!documents || !stats || !vectorStats) {
    return null;
  }

  const documentsArray = Array.isArray(documents) ? documents : [];
  const vectorizedDocs = Array.isArray((vectorStats as any)?.vectorized) ? (vectorStats as any).vectorized : [];
  const totalDocuments = documentsArray.length;
  const totalChunks = (vectorStats as any)?.userDocuments || 0;
  const uniqueDocuments = (vectorStats as any)?.uniqueDocuments || 0;
  const embeddingProgress = totalDocuments > 0 ? (uniqueDocuments / totalDocuments) * 100 : 0;

  const getStatusColor = () => {
    if (embeddingProgress === 100) return "text-green-600";
    if (embeddingProgress > 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getStatusIcon = () => {
    if (embeddingProgress === 100) return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (embeddingProgress > 0) return <AlertCircle className="w-4 h-4 text-yellow-600" />;
    return <AlertCircle className="w-4 h-4 text-red-600" />;
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center space-x-2 text-lg">
          <Brain className="w-5 h-5 text-blue-600" />
          <span>Semantic Search Status</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Embedding Status */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Vector Embeddings</span>
              {getStatusIcon()}
            </div>
            <Progress value={embeddingProgress} className="h-2" />
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>{uniqueDocuments} / {totalDocuments} documents</span>
              <span className={getStatusColor()}>{Math.round(embeddingProgress)}%</span>
            </div>
          </div>

          {/* Search Capabilities */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium">Search Capabilities</span>
            </div>
            <div className="space-y-1">
              <Badge variant="outline" className="text-xs">
                <Zap className="w-3 h-3 mr-1" />
                Hybrid Search
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Brain className="w-3 h-3 mr-1" />
                Semantic Understanding
              </Badge>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <RefreshCw className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium">Actions</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => reindexMutation.mutate()}
              disabled={isReindexing}
              className="w-full"
            >
              {isReindexing ? (
                <>
                  <RefreshCw className="w-3 h-3 mr-2 animate-spin" />
                  Reindexing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3 h-3 mr-2" />
                  Reindex All
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Status Messages */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <div className="flex items-start space-x-2">
            <Brain className="w-4 h-4 text-blue-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900">AI-Powered Search</p>
              <p className="text-blue-700">
                {embeddingProgress === 100 
                  ? "All documents are indexed for semantic search. You can now search by meaning and context." 
                  : embeddingProgress > 0
                  ? `${uniqueDocuments} of ${totalDocuments} documents are indexed. Reindex to enable semantic search for all documents.`
                  : "No documents are indexed yet. Click 'Reindex All' to enable AI-powered semantic search."
                }
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}