import { useState } from "react";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useEffect } from "react";
import Sidebar from "@/components/Layout/Sidebar";
import TopBar from "@/components/TopBar";
import DocumentCard from "@/components/Documents/DocumentCard";
import SearchBar from "@/components/SearchBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  FileText, 
  Zap, 
  Clock,
  TrendingUp,
  Filter
} from "lucide-react";

export default function SearchPage() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"keyword" | "semantic">("keyword");
  const [hasSearched, setHasSearched] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: rawSearchResults, isLoading: searchLoading, error } = useQuery({
    queryKey: ["search", searchQuery, searchType],
    queryFn: async () => {
      if (!searchQuery || !searchQuery.trim()) return null;
      
      console.log(`🔍 Search triggered with query: "${searchQuery}", type: "${searchType}"`);
      
      const params = new URLSearchParams({
        q: searchQuery.trim(),
        type: searchType
      });
      
      const url = `/api/documents/search?${params}`;
      console.log(`🚀 Making search request to: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`📊 Search response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Search failed with status ${response.status}:`, errorText);
        throw new Error(`Search failed: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log(`✅ Search completed, got ${data?.length || 0} results`);
      return data;
    },
    enabled: !!searchQuery && hasSearched && searchQuery.trim().length > 0,
    retry: false,
  });

  // Process search results to show only the most similar chunk per document
  const searchResults = React.useMemo(() => {
    if (!rawSearchResults?.results) return rawSearchResults;

    if (searchType === "keyword") {
      // For keyword search, return as-is (no chunk processing needed)
      return rawSearchResults;
    }

    // For semantic search, group by document and keep only the most similar chunk
    const documentMap = new Map();
    
    rawSearchResults.results.forEach((result: any) => {
      // Extract document ID from chunk ID (format: "docId-chunkIndex")
      const docId = result.id.split('-')[0];
      
      if (!documentMap.has(docId) || result.similarity > documentMap.get(docId).similarity) {
        // Create a cleaned result without chunk information
        const cleanResult = {
          ...result,
          id: docId, // Use document ID
          name: result.name.replace(/ \(Chunk \d+\)$/, ''), // Remove chunk label
        };
        documentMap.set(docId, cleanResult);
      }
    });

    return {
      ...rawSearchResults,
      results: Array.from(documentMap.values()),
      count: documentMap.size
    };
  }, [rawSearchResults, searchType]);

  const handleSearch = (query: string, type: "keyword" | "semantic") => {
    setSearchQuery(query);
    setSearchType(type);
    setHasSearched(true);
  };

  if (isLoading || !isAuthenticated) {
    return null;
  }

  if (error && isUnauthorizedError(error)) {
    return null; // Already handled by redirect effect
  }

 const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar 
        isMobileOpen={false}
        onMobileClose={() => {}}
        onOpenChat={() => {}}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />

        <main className="flex-1 overflow-auto p-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-800 mb-2">Search & Discovery</h1>
            <p className="text-sm text-slate-500">
              Find documents using keyword search or AI-powered semantic search
            </p>
          </div>

          {/* Search Interface */}
          <Card className="border border-slate-200 mb-6">
            <CardContent className="p-6">
              <SearchBar onSearch={handleSearch} />
            </CardContent>
          </Card>

          {/* Search Results */}
          {hasSearched && (
            <Card className="border border-slate-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-slate-800">
                    Search Results
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    <Badge variant={searchType === "keyword" ? "default" : "secondary"}>
                      {searchType === "keyword" ? "Keyword" : "Semantic"}
                    </Badge>
                    {searchResults && (
                      <Badge variant="outline">
                        {searchResults.count} results
                      </Badge>
                    )}
                  </div>
                </div>
                {searchQuery && (
                  <p className="text-sm text-slate-500">
                    Results for "{searchQuery}"
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {searchLoading ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      <span className="ml-2 text-sm text-slate-500">
                        {searchType === "semantic" ? "Analyzing semantic meaning..." : "Searching..."}
                      </span>
                    </div>
                  </div>
                ) : searchResults && searchResults.results && searchResults.results.length > 0 ? (
                  <div className="space-y-4">
                    {/* Search Info */}
                    <div className="flex items-center space-x-4 text-sm text-slate-500 pb-4 border-b border-slate-200">
                      <div className="flex items-center space-x-1">
                        <Clock className="w-4 h-4" />
                        <span>Search completed</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        {searchType === "semantic" ? (
                          <Zap className="w-4 h-4 text-blue-500" />
                        ) : (
                          <Search className="w-4 h-4" />
                        )}
                        <span>
                          {searchType === "semantic" ? "AI-powered semantic search" : "Keyword search"}
                        </span>
                      </div>
                    </div>

                    {/* Results */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {searchResults.results.map((doc: any) => (
                        <DocumentCard 
                          key={doc.id} 
                          document={{
                            id: doc.id,
                            name: doc.name,
                            description: doc.description,
                            mimeType: doc.mimeType || 'application/octet-stream',
                            fileSize: doc.fileSize || 0,
                            tags: doc.tags || [],
                            isFavorite: doc.isFavorite || false,
                            createdAt: doc.createdAt || new Date().toISOString()
                          }} 
                        />
                      ))}
                    </div>
                  </div>
                ) : hasSearched ? (
                  <div className="text-center py-16 text-slate-500">
                    <Search className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                    <h3 className="text-lg font-medium text-slate-800 mb-2">
                      No results found
                    </h3>
                    <p className="text-sm text-slate-500 mb-6">
                      Try adjusting your search terms or switch between keyword and semantic search
                    </p>
                    <div className="flex items-center justify-center space-x-4">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearchQuery("");
                          setHasSearched(false);
                        }}
                      >
                        Clear Search
                      </Button>
                      <Button
                        onClick={() => handleSearch(searchQuery, searchType === "keyword" ? "semantic" : "keyword")}
                        className="bg-primary text-white hover:bg-blue-700"
                      >
                        Try {searchType === "keyword" ? "Semantic" : "Keyword"} Search
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* Search Tips */}
          {!hasSearched && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <Card className="border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-slate-800 flex items-center">
                    <Search className="w-5 h-5 mr-2" />
                    Keyword Search
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 mb-4">
                    Search for exact words and phrases in document titles and content.
                  </p>
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500">
                      <strong>Example:</strong> "financial report 2024"
                    </div>
                    <div className="text-xs text-slate-500">
                      <strong>Best for:</strong> Finding specific terms, dates, or names
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-slate-800 flex items-center">
                    <Zap className="w-5 h-5 mr-2 text-blue-500" />
                    Semantic Search
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 mb-4">
                    AI-powered search that understands meaning and context, not just keywords.
                  </p>
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500">
                      <strong>Example:</strong> "documents about company performance"
                    </div>
                    <div className="text-xs text-slate-500">
                      <strong>Best for:</strong> Conceptual searches and finding related content
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}