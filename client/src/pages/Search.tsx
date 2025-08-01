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
  const [rawSearchResultsState, setRawSearchResultsState] = useState<any[]>([]);

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

      try {
        console.log("\n" + "🌟".repeat(50));
        console.log("🔍 FRONTEND SEARCH INITIATED");
        console.log("🌟".repeat(50));
        console.log(`⏰ TIME: ${new Date().toISOString()}`);
        console.log(`🔤 QUERY: "${searchQuery}"`);
        console.log(`🏷️  TYPE: ${searchType}`);
        console.log(`📏 QUERY LENGTH: ${searchQuery.length}`);
        console.log(`🧹 TRIMMED QUERY: "${searchQuery.trim()}"`);

        const params = new URLSearchParams({
          q: searchQuery.trim(),
          type: searchType
        });

        const url = `/api/documents/search?${params}`;
        console.log(`🚀 FULL REQUEST URL: ${url}`);
        console.log(`📋 URL PARAMS:`, {
          q: searchQuery.trim(),
          type: searchType
        });

        console.log(`🌐 MAKING FETCH REQUEST...`);
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`);
        }

        const data = await response.json();
        console.log(`📊 Search response received:`, data);
        console.log(`📊 Response structure analysis:`, {
          isArray: Array.isArray(data),
          hasResults: !!data?.results,
          resultsIsArray: Array.isArray(data?.results),
          resultsLength: data?.results?.length,
          hasCount: !!data?.count,
          countValue: data?.count,
          firstResult: data?.results?.[0]
        });

        // API always returns { results: [...], count: number } format
        if (data && Array.isArray(data.results)) {
          console.log(`✅ Setting search response with ${data.results.length} results`);
          console.log(`📋 Sample results:`, data.results.slice(0, 3));
          setRawSearchResultsState(data);
          return data;
        } else {
          console.error('Frontend received invalid search results format:', data);
          setRawSearchResultsState({ results: [], count: 0 });
          return { results: [], count: 0 };
        }
      } catch (error) {
        console.error("Search API error:", error);
        toast({
          title: "Search Error",
          description: "Failed to retrieve search results.",
          variant: "destructive",
        });
        setRawSearchResultsState([]);
        throw error;
      }
    },
    enabled: !!searchQuery && hasSearched && searchQuery.trim().length > 0,
    retry: false,
  });

  // Process search results to show only the most similar chunk per document
  const searchResults = React.useMemo(() => {
    console.log(`🔄 PROCESSING SEARCH RESULTS:`, {
      hasRawResults: !!rawSearchResults,
      isArray: Array.isArray(rawSearchResults),
      hasResults: !!rawSearchResults?.results,
      resultCount: rawSearchResults?.results?.length || 0,
      searchType: searchType
    });

    // The API always returns { results: [...], count: number } format
    if (!rawSearchResults?.results || !Array.isArray(rawSearchResults.results)) {
      console.log(`❌ NO VALID SEARCH RESULTS TO PROCESS`);
      return [];
    }

    const resultsArray = rawSearchResults.results;

    console.log(`📊 RAW SEARCH RESULTS:`, {
      count: resultsArray.length,
      firstResult: resultsArray[0] ? {
        id: resultsArray[0].id,
        name: resultsArray[0].name,
        hasContent: !!resultsArray[0].content,
        contentLength: resultsArray[0].content?.length || 0
      } : null
    });

    if (searchType === "keyword") {
      // For keyword search, return results array directly
      console.log(`🔤 KEYWORD SEARCH: Returning results as-is`);
      return resultsArray;
    }

    // For semantic search, group by document and keep only the most similar chunk
    console.log(`🧠 SEMANTIC SEARCH: Processing chunks by document`);
    const documentMap = new Map();

    resultsArray.forEach((result: any, index: number) => {
      console.log(`   Processing result ${index + 1}:`, {
        originalId: result.id,
        name: result.name,
        similarity: result.similarity,
        hasChunkInfo: result.id?.includes('-') || result.name?.includes('Chunk')
      });

      // Extract document ID from chunk ID (format: "docId-chunkIndex")
      let docId = result.id;

      // Check if this looks like a chunk ID
      if (typeof result.id === 'string' && result.id.includes('-')) {
        docId = result.id.split('-')[0];
        console.log(`   Extracted document ID: ${docId} from chunk ID: ${result.id}`);
      }

      // Validate the extracted document ID
      if (!docId || docId === 'NaN' || isNaN(Number(docId))) {
        console.log(`❌ INVALID DOCUMENT ID EXTRACTED: ${docId} from original ID: ${result.id}`);
        return; // Skip this result
      }

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

    const processedResults = Array.from(documentMap.values());

    console.log(`✅ SEMANTIC PROCESSING COMPLETE:`, {
      originalCount: resultsArray.length,
      processedCount: processedResults.length,
      documentMapSize: documentMap.size
    });

    return processedResults;
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
                        {searchResults.length} results
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
                ) : searchResults && searchResults.length > 0 ? (
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
                      {searchResults.map((doc: any) => (
                      <DocumentCard 
                        key={doc.id} 
                        document={{
                          id: doc.id,
                          name: doc.name,
                          description: doc.description || doc.summary,
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