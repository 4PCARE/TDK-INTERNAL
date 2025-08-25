import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DocumentCard from "./DocumentCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Move, Trash2 } from "lucide-react";

export default function DocumentGrid() {
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["/api/documents"],
  });
  
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set());

  const handleDocumentSelect = (documentId: number, isSelected: boolean) => {
    setSelectedDocuments(prev => {
      const newSelected = new Set(prev);
      if (isSelected) {
        newSelected.add(documentId);
      } else {
        newSelected.delete(documentId);
      }
      return newSelected;
    });
  };

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Documents</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
              <Skeleton className="h-10 w-10 rounded-lg mb-3" />
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-full mb-3" />
              <div className="flex gap-1 mb-3">
                <Skeleton className="h-5 w-12 rounded-md" />
                <Skeleton className="h-5 w-16 rounded-md" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recent Documents</h3>
        <a href="#" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
          View all
        </a>
      </div>

      {/* Bulk Actions Bar */}
      {selectedDocuments.size > 0 && (
        <Card className="border border-blue-200 bg-blue-50 mb-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-slate-800">
                  {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDocuments(new Set())}
                >
                  Clear Selection
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline">
                  <Move className="w-4 h-4 mr-1" />
                  Move to Folder
                </Button>
                <Button size="sm" variant="destructive">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {documents.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v12h8V4H6z" clipRule="evenodd" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No documents yet</h3>
          <p className="text-gray-600">Upload your first document to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {documents.map((document: any) => (
            <DocumentCard 
              key={document.id} 
              document={document}
              isSelected={selectedDocuments.has(document.id)}
              onSelect={handleDocumentSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
