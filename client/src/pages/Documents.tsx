import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  FileText, 
  Search, 
  Filter, 
  Calendar,
  User,
  Download,
  Eye,
  Trash2,
  Edit,
  Share,
  Tag,
  Plus,
  Grid,
  List,
  Clock,
  FileType,
  Users,
  Upload
} from "lucide-react";
import DocumentCard from "@/components/DocumentCard";
import ShareDocumentDialog from "@/components/ShareDocumentDialog";
import DocumentEndorsementDialog from "@/components/DocumentEndorsementDialog";
import ContentSummaryModal from "@/components/ContentSummaryModal";
import DocumentChatModal from "@/components/Chat/DocumentChatModal";
import UploadZone from "@/components/Upload/UploadZone";
import { ChevronDown, Star, Grid3X3, List as ListIcon, SortAsc, SortDesc } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import VectorizeAllButton from "@/components/VectorizeAllButton";

export default function Documents() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFileName, setSearchFileName] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState(true);
  const [searchMeaning, setSearchMeaning] = useState(false); // Default unchecked for speed
  const [sortBy, setSortBy] = useState("newest");
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showUploadZone, setShowUploadZone] = useState(false);

  // Parse search query from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');
    if (searchParam) {
      setSearchQuery(searchParam);
      setCurrentSearchQuery(searchParam);
      setHasSearched(true);
    }
  }, []);

  // Debug auth state
  useEffect(() => {
    console.log("Auth state:", { isLoading, isAuthenticated });
  }, [isLoading, isAuthenticated]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      console.log("Redirecting to login...");
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

  const [hasSearched, setHasSearched] = useState(false);
  const [currentSearchQuery, setCurrentSearchQuery] = useState("");
  const [currentSearchFileName, setCurrentSearchFileName] = useState(true);
  const [currentSearchKeyword, setCurrentSearchKeyword] = useState(true);
  const [currentSearchMeaning, setCurrentSearchMeaning] = useState(false);

  // Enhanced search with checkbox-based search types
  const { data: documents, isLoading: documentsLoading, error: documentsError } = useQuery({
    queryKey: ["/api/documents/search", currentSearchQuery, currentSearchFileName, currentSearchKeyword, currentSearchMeaning, hasSearched],
    queryFn: async () => {
      try {
        if (!hasSearched || !currentSearchQuery.trim()) {
          const response = await fetch("/api/documents");
          if (!response.ok) {
            throw new Error(`${response.status}: ${response.statusText}`);
          }
          return await response.json();
        }

        // Determine search type based on checkbox combinations
        let searchType = "keyword"; // Default fallback
        if (currentSearchFileName && currentSearchKeyword && currentSearchMeaning) {
          searchType = "document-priority"; // All three enabled
        } else if (currentSearchFileName && currentSearchKeyword && !currentSearchMeaning) {
          searchType = "keyword-name-priority"; // Name + keyword only (faster, no vector search)
        } else if (currentSearchKeyword && currentSearchMeaning && !currentSearchFileName) {
          searchType = "hybrid"; // Content search with both keyword and semantic
        } else if (currentSearchMeaning && !currentSearchKeyword && !currentSearchFileName) {
          searchType = "semantic"; // Semantic only
        } else if (currentSearchKeyword && !currentSearchMeaning && !currentSearchFileName) {
          searchType = "keyword"; // Keyword only
        } else if (currentSearchFileName && !currentSearchKeyword && !currentSearchMeaning) {
          searchType = "filename-only"; // File name only
        } else if (!currentSearchFileName && !currentSearchKeyword && !currentSearchMeaning) {
          searchType = "filename-only"; // Default to filename-only when all are disabled
        }

        const params = new URLSearchParams({
          query: currentSearchQuery,
          type: searchType,
          massSelectionPercentage: "0.6",
          searchFileName: currentSearchFileName.toString(),
          searchKeyword: currentSearchKeyword.toString(),
          searchMeaning: currentSearchMeaning.toString()
        });

        console.log(`Frontend search: "${currentSearchQuery}" with fileName:${currentSearchFileName}, keyword:${currentSearchKeyword}, meaning:${currentSearchMeaning} (type: ${searchType})`);
        const response = await fetch(`/api/documents/search?${params}`);
        if (!response.ok) {
          const errorText = await response.text();
          console.error("Search API error:", response.status, errorText);
          throw new Error(`Search failed: ${response.status} ${response.statusText}`);
        }
        const results = await response.json();
        console.log(`Frontend received ${Array.isArray(results) ? results.length : 'non-array'} search results`);
        
        // Post-process semantic search results to show best chunk per document
        if (Array.isArray(results) && results.length > 0) {
          // Check if these are chunk-based results (from semantic search)
          const hasChunkIds = results.some(result => 
            typeof result.id === 'string' && result.id.includes('-')
          );
          
          if (hasChunkIds) {
            console.log('Post-processing chunk-based search results...');
            
            // Group chunks by document ID and select best chunk per document
            const documentMap = new Map();
            
            results.forEach(result => {
              if (typeof result.id === 'string' && result.id.includes('-')) {
                const documentId = result.id.split('-')[0];
                
                // Keep the chunk with highest similarity for each document
                if (!documentMap.has(documentId) || 
                    (result.similarity || 0) > (documentMap.get(documentId).similarity || 0)) {
                  
                  // Convert chunk result back to document format
                  const cleanName = result.name.replace(/ \(Chunk \d+\)$/, '');
                  const documentResult = {
                    ...result,
                    id: parseInt(documentId), // Convert back to document ID
                    name: cleanName,
                    originalName: cleanName, // Use cleaned name as originalName
                    fileName: cleanName, // Ensure fileName exists for DocumentCard
                    content: result.content, // Keep original content
                    summary: result.summary, // Keep summary if available
                    // Ensure essential document properties exist with proper types
                    status: result.status || 'processed',
                    fileSize: typeof result.fileSize === 'number' ? result.fileSize : 0,
                    createdAt: result.createdAt || new Date().toISOString(),
                    categoryId: result.categoryId || null,
                    category: result.category || null,
                    aiCategory: result.aiCategory || 'General',
                    tags: Array.isArray(result.tags) ? result.tags : [],
                    isFavorite: Boolean(result.isFavorite),
                    isEndorsed: Boolean(result.isEndorsed),
                    isInVectorDb: result.isInVectorDb !== undefined ? Boolean(result.isInVectorDb) : true,
                    uploaderEmail: result.uploaderEmail || null,
                    uploaderRole: result.uploaderRole || null,
                    // Ensure mimeType exists for DocumentCard
                    mimeType: result.mimeType || 'application/octet-stream',
                    fileType: result.fileType || 'unknown',
                    // Remove chunk-specific properties that might interfere
                    similarity: undefined,
                    matchedTerms: undefined,
                    matchDetails: undefined,
                  };
                  
                  documentMap.set(documentId, documentResult);
                }
              } else {
                // Non-chunk result, keep as is
                documentMap.set(result.id.toString(), result);
              }
            });
            
            const processedResults = Array.from(documentMap.values());
            console.log(`Post-processing: ${results.length} chunks → ${processedResults.length} documents`);
            
            return processedResults;
          }
        }
        
        // Ensure we always return an array
        return Array.isArray(results) ? results : [];
      } catch (error) {
        console.error("Document query failed:", error);
        toast({
          title: "Search Error",
          description: error.message || "Failed to load documents. Please try again.",
          variant: "destructive",
        });
        // Return empty array instead of throwing to prevent UI crashes
        return [];
      }
    },
    retry: (failureCount, error) => {
      // Retry up to 2 times for network errors, but not for auth errors
      return failureCount < 2 && !error.message?.includes('401');
    },
    enabled: isAuthenticated,
  }) as { data: Array<any>; isLoading: boolean; error: any };

  const handleSearch = () => {
    setCurrentSearchQuery(searchQuery);
    setCurrentSearchFileName(searchFileName);
    setCurrentSearchKeyword(searchKeyword);
    setCurrentSearchMeaning(searchMeaning);
    setHasSearched(true);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setCurrentSearchQuery("");
    setHasSearched(false);
  };

  const { data: categories } = useQuery({
    queryKey: ["/api/categories"],
    retry: false,
  }) as { data: Array<{ id: number; name: string }> | undefined };

  // Show loading state instead of null
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading documents...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-gray-600">Redirecting to login...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Get unique AI categories and tags for filtering
  const documentsArray = Array.isArray(documents) ? documents : [];
  const aiCategories = documentsArray.length > 0 ? Array.from(new Set(documentsArray.map((doc: any) => doc.aiCategory).filter(Boolean))) : [];
  const allTags = documentsArray.length > 0 ? Array.from(new Set(documentsArray.flatMap((doc: any) => doc.tags || []))) : [];

  // Filter and sort documents with multi-select support
  const filteredDocuments = documentsArray.length > 0 ? documentsArray.filter((doc: any) => {
    // Apply category filters
    const matchesCategory = filterCategories.length === 0 || 
                           filterCategories.includes(doc.aiCategory) ||
                           filterCategories.includes(doc.category) ||
                           (categories && categories.some((c: any) => 
                             filterCategories.includes(c.name) && c.id === doc.categoryId
                           ));

    // Apply tag filters  
    const matchesTag = filterTags.length === 0 || 
                      (doc.tags && filterTags.some((tag: string) => doc.tags.includes(tag)));

    // Apply favorites filter
    const matchesFavorites = !showFavoritesOnly || doc.isFavorite;

    return matchesCategory && matchesTag && matchesFavorites;
  }).sort((a: any, b: any) => {
    // For searches with file name enabled, preserve the backend ordering which prioritizes by score
    if (hasSearched && currentSearchFileName) {
      // If documents have equal importance (same search result position), sort by recency
      const aIndex = documentsArray.indexOf(a);
      const bIndex = documentsArray.indexOf(b);
      if (aIndex !== bIndex) {
        return aIndex - bIndex; // Preserve backend order
      }
      // If same position (shouldn't happen), fall back to recency
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }

    // For other search types or when no search is applied, use the selected sort option
    switch (sortBy) {
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "name":
        return (a.name || a.originalName).localeCompare(b.name || b.originalName);
      case "size":
        return b.fileSize - a.fileSize;
      default:
        return 0;
    }
  }) : [];

  // Handle errors with user-friendly messages
  useEffect(() => {
    if (documentsError && !documentsLoading) {
      console.error("Documents error:", documentsError);
      toast({
        title: "Failed to Load Documents",
        description: "There was an issue loading your documents. Please refresh the page or try again later.",
        variant: "destructive",
      });
    }
  }, [documentsError, documentsLoading, toast]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-slate-800 mb-2">My Documents</h1>
              <p className="text-sm text-slate-500">
                Manage and organize your document collection
              </p>
            </div>

            {/* Filters and Search */}
            <Card className="border border-slate-200 mb-6">
              <CardContent className="p-4">
                <div className="space-y-4">
                  {/* Search Row */}
                  <div className="flex gap-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Search documents, content, or tags..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="pl-10"
                      />
                    </div>

                    <Button 
                      onClick={handleSearch}
                      disabled={!searchQuery.trim()}
                      className="bg-primary text-white hover:bg-blue-700"
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </Button>

                    {hasSearched && (
                      <Button 
                        variant="outline"
                        onClick={handleClearSearch}
                      >
                        Clear
                      </Button>
                    )}
                  </div>

                  {/* Search Options Row */}
                  <div className="flex items-center gap-6">
                    <div className="text-sm font-medium text-slate-600">Search in:</div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="searchFileName"
                        checked={searchFileName}
                        onCheckedChange={setSearchFileName}
                        disabled={true}
                        className="opacity-50"
                      />
                      <label htmlFor="searchFileName" className="text-sm text-slate-500 cursor-not-allowed">
                        File name (always enabled)
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="searchKeyword"
                        checked={searchKeyword}
                        onCheckedChange={setSearchKeyword}
                      />
                      <label htmlFor="searchKeyword" className="text-sm text-slate-700 cursor-pointer">
                        Content (keyword)
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="searchMeaning"
                        checked={searchMeaning}
                        onCheckedChange={setSearchMeaning}
                      />
                      <label htmlFor="searchMeaning" className="text-sm text-slate-700 cursor-pointer">
                        Content (meaning)
                      </label>
                      <span className="text-xs text-slate-500 ml-1">
                        {searchMeaning ? "search by meaning enabled – may take longer" : "search by meaning disabled – faster"}
                      </span>
                    </div>
                  </div>

                  {/* Filters Row */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="border-dashed min-w-[120px] justify-between">
                            <span>Categories ({filterCategories.length})</span>
                            <ChevronDown className="w-4 h-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-0">
                          <Command>
                            <CommandInput placeholder="Search categories..." />
                            <CommandEmpty>No categories found.</CommandEmpty>
                            <CommandGroup className="max-h-64 overflow-auto">
                              {aiCategories.map((category: string) => (
                                <CommandItem
                                  key={category}
                                  onSelect={() => {
                                    setFilterCategories(prev =>
                                      prev.includes(category)
                                        ? prev.filter(c => c !== category)
                                        : [...prev, category]
                                    );
                                  }}
                                >
                                  <Checkbox
                                    checked={filterCategories.includes(category)}
                                    className="mr-2"
                                  />
                                  {category}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </Command>
                        </PopoverContent>
                      </Popover>

                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="border-dashed min-w-[100px] justify-between">
                            <span>Tags ({filterTags.length})</span>
                            <ChevronDown className="w-4 h-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-0">
                          <Command>
                            <CommandInput placeholder="Search tags..." />
                            <CommandEmpty>No tags found.</CommandEmpty>
                            <CommandGroup className="max-h-64 overflow-auto">
                              {allTags.map((tag: string) => (
                                <CommandItem
                                  key={tag}
                                  onSelect={() => {
                                    setFilterTags(prev =>
                                      prev.includes(tag)
                                        ? prev.filter(t => t !== tag)
                                        : [...prev, tag]
                                    );
                                  }}
                                >
                                  <Checkbox
                                    checked={filterTags.includes(tag)}
                                    className="mr-2"
                                  />
                                  {tag}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </Command>
                        </PopoverContent>
                      </Popover>

                      <Button
                        variant={showFavoritesOnly ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                        className={showFavoritesOnly ? "bg-yellow-500 hover:bg-yellow-600 text-white" : ""}
                      >
                        <Star className="w-4 h-4 mr-1" />
                        Favorites
                      </Button>

                      {(filterCategories.length > 0 || filterTags.length > 0 || showFavoritesOnly) && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setFilterCategories([]);
                            setFilterTags([]);
                            setShowFavoritesOnly(false);
                          }}
                          className="text-slate-500 hover:text-slate-700"
                        >
                          Clear All
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-36">
                          <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newest">Newest First</SelectItem>
                          <SelectItem value="oldest">Oldest First</SelectItem>
                          <SelectItem value="name">Name</SelectItem>
                          <SelectItem value="size">File Size</SelectItem>
                        </SelectContent>
                      </Select>

                      <div className="flex items-center space-x-1">
                        <Button
                          variant={viewMode === "grid" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setViewMode("grid")}
                        >
                          <Grid3X3 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant={viewMode === "list" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setViewMode("list")}
                        >
                          <ListIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Documents Grid/List */}
            <Card className="border border-slate-200">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-slate-800">
                    Documents ({filteredDocuments?.length || 0})
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    <VectorizeAllButton />
                    <Button 
                      onClick={() => setShowUploadZone(!showUploadZone)}
                      className="bg-primary text-white hover:bg-blue-700"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Documents
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Upload Zone */}
                {showUploadZone && (
                  <div className="mb-6 p-4 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50">
                    <UploadZone 
                      onUploadComplete={() => {
                        setShowUploadZone(false);
                        // Refresh documents list
                        window.location.reload();
                      }} 
                    />
                  </div>
                )}

                {documentsLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-32 bg-slate-200 rounded-lg"></div>
                      </div>
                    ))}
                  </div>
                ) : filteredDocuments && filteredDocuments.length > 0 ? (
                  <div className={
                    viewMode === "grid" 
                      ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                      : "space-y-2"
                  }>
                    {filteredDocuments.map((doc: any) => (
                      <DocumentCard key={doc.id} document={doc} viewMode={viewMode} categories={categories} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-500">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                    <h3 className="text-lg font-medium text-slate-800 mb-2">
                      {hasSearched && currentSearchQuery ? "No documents found" : 
                       filterCategories.length > 0 || filterTags.length > 0 || showFavoritesOnly ? "No documents found" : 
                       "No documents yet"}
                    </h3>
                    <p className="text-sm text-slate-500 mb-6">
                      {hasSearched && currentSearchQuery ? "Try adjusting your search terms or search type" :
                       filterCategories.length > 0 || filterTags.length > 0 || showFavoritesOnly
                        ? "Try adjusting your filter criteria"
                        : "Upload your first document to get started with AI-powered knowledge management"
                      }
                    </p>
                    <Button 
                      onClick={() => window.location.href = "/upload"}
                      className="bg-primary text-white hover:bg-blue-700"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Documents
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
      </div>
    </DashboardLayout>
  );
}