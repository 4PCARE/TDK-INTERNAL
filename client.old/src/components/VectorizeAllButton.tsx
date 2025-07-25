import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Database, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function VectorizeAllButton() {
  const { toast } = useToast();
  
  const vectorizeAllMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/documents/vectorize-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Vectorization Complete",
        description: `Successfully vectorized ${data.vectorizedCount} documents, skipped ${data.skippedCount}`,
      });
    },
    onError: (error) => {
      console.error("Vectorization error:", error);
      toast({
        title: "Vectorization Failed", 
        description: error.message || "Failed to vectorize documents",
        variant: "destructive",
      });
    },
  });

  return (
    <Button
      variant="outline"
      onClick={() => vectorizeAllMutation.mutate()}
      disabled={vectorizeAllMutation.isPending}
      className="text-purple-600 border-purple-200 hover:bg-purple-50"
    >
      {vectorizeAllMutation.isPending ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Database className="w-4 h-4 mr-2" />
      )}
      {vectorizeAllMutation.isPending ? "Vectorizing..." : "Vectorize All"}
    </Button>
  );
}