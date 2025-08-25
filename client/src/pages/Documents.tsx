import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  Upload,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import DocumentCard from "@/components/DocumentCard";
import ShareDocumentDialog from "@/components/ShareDocumentDialog";
import DocumentEndorsementDialog from "@/components/DocumentEndorsementDialog";
import ContentSummaryModal from "@/components/ContentSummaryModal";
import DocumentChatModal from "@/components/Chat/DocumentChatModal";
import UploadZone from "@/components/Upload/UploadZone";
import FolderTree from "@/components/Documents/FolderTree";
import { ChevronDown, Star, Grid3X3, List as ListIcon, SortAsc, SortDesc, FolderOpen, Move } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import VectorizeAllButton from "@/components/VectorizeAllButton";

export default function Documents() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingSearchQuery, setPendingSearchQuery] = useState("");
  const [searchFileName, setSearchFileName] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState(true);
  const [searchMeaning, setSearchMeaning] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  const documentsPerPage = 9;

  // Parse search query from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');
    if (searchParam) {
      setSearchQuery(searchParam);
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

  // Determine search type based on checkboxes
  const determineSearchType = () => {
    const selectedCount = [searchFileName, searchKeyword, searchMeaning].filter(Boolean).length;

    if (selectedCount === 0) {
      return "filename"; // Fallback to filename search if nothing selected
    }

    if (searchFileName && searchKeyword && searchMeaning) {
      return "hybrid-all"; // All three types
    } else if (searchKeyword && searchMeaning) {
      return "hybrid"; // Traditional hybrid
    } else if (searchMeaning) {
      return "semantic";
    } else if (searchKeyword) {
      return "keyword";
    } else {
      return "filename";
    }
  };

  // Enhanced search with semantic capabilities
  const { data: rawSearchResults, isLoading: documentsLoading, error: documentsError } = useQuery({
    queryKey: ["/api/documents/search", searchQuery, searchFileName, searchKeyword, searchMeaning, currentPage, selectedFolderId],
    queryFn: async () => {
      try {
        if (!searchQuery.trim()) {
          // Use server-side pagination for regular document loading
          const offset = (currentPage - 1) * documentsPerPage;
          let url = `/api/documents?limit=${documentsPerPage}&offset=${offset}`;
          if (selectedFolderId !== null) {
            url = `/api/folders/${selectedFolderId}/documents`;
          }
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`${response.status}: ${response.statusText}`);
          }
          return await response.json();
        }

        // Determine search type based on selected checkboxes
        let searchType = "keyword-name-priority";
        if (searchMeaning && !searchKeyword && !searchFileName) {
          searchType = "semantic";
        } else if (searchKeyword && !searchMeaning && !searchFileName) {
          searchType = "keyword";
        } else if (searchFileName && !searchKeyword && !searchMeaning) {
          searchType = "filename";
        }

        const params = new URLSearchParams({
          query: searchQuery,
          type: searchType,
          fileName: searchFileName.toString(),
          keyword: searchKeyword.toString(),
          meaning: searchMeaning.toString()
        });

        const response = await fetch(`/api/documents/search?${params}`);
        if (!response.ok) {
          throw new Error(`${response.status}: ${response.statusText}`);
        }
        const results = await response.json();

        if (!Array.isArray(results)) {
          return [];
        }

        return results;
      } catch (error) {
        console.error("Document query failed:", error);
        toast({
          title: "Error",
          description: "Failed to load documents. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    retry: false,
    enabled: isAuthenticated,
    staleTime: 30000, // Cache for 30 seconds to prevent excessive refetching
    refetchOnWindowFocus: false, // Don't refetch on window focus to prevent freezing
  }) as { data: Array<any>; isLoading: boolean; error: any };

  // Post-process search results to deduplicate documents
  const documents = useMemo(() => {
    if (!rawSearchResults) return [];

    // If it's already an array (non-search results), return as-is
    if (Array.isArray(rawSearchResults)) {
      return rawSearchResults;
    }

    // If it's a search result object with results array
    if ((rawSearchResults as any)?.results && Array.isArray((rawSearchResults as any).results)) {
      const documentMap = new Map();

      (rawSearchResults as any).results.forEach((result: any) => {
        // Extract original document ID from chunk ID (format: "docId-chunkIndex")
        const originalDocId = result.id.toString().includes('-') ? result.id.toString().split('-')[0] : result.id.toString();

        if (!documentMap.has(originalDocId)) {
          // First chunk for this document - use it as the main result
          documentMap.set(originalDocId, {
            ...result,
            id: parseInt(originalDocId), // Use original document ID
            name: result.name.replace(/ \(Chunk \d+\)$/, ''), // Remove chunk suffix
            content: result.summary || result.content, // Use summary if available
            isChunkResult: false
          });
        } else {
          // Additional chunk for existing document - keep highest similarity
          const existing = documentMap.get(originalDocId);
          if (result.similarity > existing.similarity) {
            documentMap.set(originalDocId, {
              ...existing,
              similarity: result.similarity,
              content: result.summary || result.content
            });
          }
        }
      });

      return Array.from(documentMap.values());
    }

    // Fallback to empty array
    return [];
  }, [rawSearchResults]);

  const { data: categories } = useQuery({
    queryKey: ["/api/categories"],
    retry: false,
  }) as { data: Array<{ id: number; name: string }> | undefined };

  // Get total document count for pagination info (only when not searching)
  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
    queryFn: async () => {
      const response = await fetch("/api/stats");
      if (!response.ok) throw new Error("Failed to fetch stats");
      return await response.json();
    },
    enabled: isAuthenticated && !searchQuery.trim(),
    retry: false,
  }) as { data: { totalDocuments: number; processedToday: number; storageUsed: number; aiQueries: number } | undefined };

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

  // Get unique AI categories and tags for filtering with memoization
  const aiCategories = useMemo(() => {
    if (!documents) return [];
    return Array.from(new Set(documents.map((doc: any) => doc.aiCategory).filter(Boolean)));
  }, [documents]);

  const allTags = useMemo(() => {
    if (!documents) return [];
    return Array.from(new Set(documents.flatMap((doc: any) => doc.tags || [])));
  }, [documents]);

  // For search results, apply client-side filtering and pagination
  // For regular document loading, documents are already paginated server-side
  const isSearchMode = useMemo(() => searchQuery.trim().length > 0, [searchQuery]);

  const allFilteredDocuments = useMemo(() => {
    if (!documents || documents.length === 0) return [];

    // Create filter function once
    const filterDoc = (doc: any) => {
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
    };

    const filtered = documents.filter(filterDoc);

    if (isSearchMode) {
      // For search results, apply sorting
      return filtered.sort((a: any, b: any) => {
        switch (sortBy) {
          case "newest":
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          case "oldest":
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          case "name":
            return (a.name || a.originalName).localeCompare(b.name || b.originalName);
          case "size":
            return (b.fileSize || 0) - (a.fileSize || 0);
          default:
            return 0;
        }
      });
    } else {
      // For regular document loading, documents are already sorted server-side
      return filtered;
    }
  }, [documents, isSearchMode, filterCategories, filterTags, showFavoritesOnly, sortBy, categories]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterCategories, filterTags, showFavoritesOnly, sortBy, selectedFolderId]);

  // Clear selection when folder changes
  useEffect(() => {
    setSelectedDocuments(new Set());
  }, [selectedFolderId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'a') {
          e.preventDefault();
          handleSelectAll();
        }
      }
      if (e.key === 'Escape') {
        if (selectedDocuments.size > 0) {
          setSelectedDocuments(new Set());
          setShowBulkActions(false);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedDocuments.size]); // Removed dependency on filteredDocuments

  // Bulk move documents mutation
  const { mutate: moveDocuments } = useMutation({
    mutationFn: async ({ documentIds, folderId }: { documentIds: number[]; folderId: number | null }) => {
      const response = await fetch('/api/folders/move-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds, folderId })
      });
      if (!response.ok) throw new Error('Failed to move documents');
      return response.json();
    },
    onSuccess: () => {
      // Refresh documents
      window.location.reload();
      setSelectedDocuments(new Set());
      toast({ title: "Documents moved successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error moving documents",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDocumentSelect = (documentId: number, isSelected: boolean) => {
    const newSelected = new Set(selectedDocuments);
    if (isSelected) {
      newSelected.add(documentId);
    } else {
      newSelected.delete(documentId);
    }
    setSelectedDocuments(newSelected);
    setShowBulkActions(newSelected.size > 0);
  };

  const isDocumentSelected = (documentId: number) => {
    return selectedDocuments.has(documentId);
  };

  const handleSelectAll = () => {
    if (selectedDocuments.size === allFilteredDocuments.length) {
      setSelectedDocuments(new Set());
      setShowBulkActions(false);
    } else {
      const allIds = new Set(allFilteredDocuments.map((doc: any) => doc.id));
      setSelectedDocuments(allIds);
      setShowBulkActions(true);
    }
  };

  const handleFolderDrop = (folderId: number | null, documentIds: number[]) => {
    moveDocuments({ documentIds, folderId });
  };

  const handleBulkMove = (folderId: number | null) => {
    if (selectedDocuments.size > 0) {
      moveDocuments({ documentIds: Array.from(selectedDocuments), folderId });
    }
  };

  // Displaying the documents based on view mode and search/filter results
  const displayedDocuments = isSearchMode ? allFilteredDocuments : allFilteredDocuments;
  const totalItems = isSearchMode ? allFilteredDocuments.length : (stats?.totalDocuments || 0);
  const totalPages = Math.ceil(totalItems / documentsPerPage);

  // Determine which documents to show for the current page
  const startIndex = (currentPage - 1) * documentsPerPage;
  const endIndex = startIndex + documentsPerPage;
  const paginatedDocuments = displayedDocuments.slice(startIndex, endIndex);

  return (
    <DashboardLayout>
      <div className="flex gap-6">
        {/* Folder Sidebar */}
        <div className="w-80 flex-shrink-0">
          <FolderTree
            selectedFolderId={selectedFolderId}
            onFolderSelect={setSelectedFolderId}
            onFolderDrop={handleFolderDrop}
            className="sticky top-6"
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl font-semibold text-slate-800">
                {selectedFolderId ? (
                  <>
                    <FolderOpen className="inline w-6 h-6 mr-2" />
                    Folder Documents
                  </>
                ) : (
                  "My Documents"
                )}
              </h1>
            </div>
            <p className="text-sm text-slate-500">
              {selectedFolderId ? "Documents in the selected folder" : "Manage and organize your document collection"}
            </p>
          </div>

            {/* Filters and Search */}
            <Card className="border border-slate-200 mb-6">
              <CardContent className="p-4">
                <div className="space-y-4">
                  {/* Search Row */}
                  <div className="space-y-3">
                    <div className="flex gap-4">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          placeholder="Search documents, content, or tags... (Press Enter to search)"
                          value={pendingSearchQuery}
                          onChange={(e) => setPendingSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              // Check if at least one checkbox is selected, otherwise default to filename
                              if (!searchFileName && !searchKeyword && !searchMeaning) {
                                toast({
                                  title: "Search Type Required",
                                  description: "Please select at least one search type or we'll search by filename only.",
                                  variant: "default",
                                });
                                setSearchFileName(true);
                              }
                              setSearchQuery(pendingSearchQuery);
                            }
                          }}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    {/* Search Type Checkboxes */}
                    <div className="flex items-center gap-6">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="search-filename" 
                          checked={searchFileName}
                          onCheckedChange={(checked) => setSearchFileName(checked as boolean)}
                        />
                        <label 
                          htmlFor="search-filename" 
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          File Name
                        </label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="search-keyword" 
                          checked={searchKeyword}
                          onCheckedChange={(checked) => setSearchKeyword(checked as boolean)}
                        />
                        <label 
                          htmlFor="search-keyword" 
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Content (Keyword)
                        </label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="search-meaning" 
                          checked={searchMeaning}
                          onCheckedChange={(checked) => setSearchMeaning(checked as boolean)}
                        />
                        <label 
                          htmlFor="search-meaning" 
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Content (Meaning)
                        </label>
                      </div>

                      <div className="text-xs text-slate-500 ml-4">
                        Press Enter to search • Meaning search may be slower
                      </div>
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

            {/* Document Selection Section */}
          <Card className="border border-slate-200 mb-6">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-slate-800">Document Selection</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-between min-w-[200px]">
                        <span>
                          {selectedDocuments.size === 0 
                            ? "Select Documents" 
                            : `${selectedDocuments.size} selected`
                          }
                        </span>
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0">
                      <Command>
                        <CommandInput placeholder="Search documents..." />
                        <CommandEmpty>No documents found.</CommandEmpty>
                        <CommandGroup className="max-h-64 overflow-auto">
                          <CommandItem
                            onSelect={handleSelectAll}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              checked={selectedDocuments.size === allFilteredDocuments.length && allFilteredDocuments.length > 0}
                              className="mr-2"
                            />
                            <span className="font-medium">
                              {selectedDocuments.size === allFilteredDocuments.length ? "Deselect All" : "Select All"}
                            </span>
                          </CommandItem>
                          <CommandItem
                            onSelect={() => {
                              setSelectedDocuments(new Set());
                              setShowBulkActions(false);
                            }}
                            className="flex items-center space-x-2"
                          >
                            <span className="text-slate-500">Clear Selection</span>
                          </CommandItem>
                          {allFilteredDocuments.map((doc: any) => (
                            <CommandItem
                              key={doc.id}
                              onSelect={() => handleDocumentSelect(doc.id, !selectedDocuments.has(doc.id))}
                              className="flex items-center space-x-2"
                            >
                              <Checkbox
                                checked={selectedDocuments.has(doc.id)}
                                className="mr-2"
                              />
                              <span className="flex-1 truncate" title={doc.name}>
                                {doc.name}
                              </span>
                              {selectedDocuments.has(doc.id) && (
                                <span className="text-green-600">✓</span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  
                  {selectedDocuments.size > 0 && (
                    <div className="text-sm text-slate-600">
                      {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected
                    </div>
                  )}
                </div>

                {/* Bulk Actions */}
                {selectedDocuments.size > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={selectedDocuments.size === 0}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete Selected
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="sm" className="h-8" disabled={selectedDocuments.size === 0}>
                          <Move className="w-4 h-4 mr-1" />
                          Move to Folder
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48">
                        <div className="space-y-1">
                          <Button
                            variant="ghost"
                            className="w-full justify-start"
                            onClick={() => handleBulkMove(null)}
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            Root (No Folder)
                          </Button>
                          {/* Add folder options here - you'd need to fetch folders */}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Documents Grid/List */}
          <Card className="border border-slate-200">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-slate-800">
                  Documents ({isSearchMode ? (allFilteredDocuments?.length || 0) : (stats?.totalDocuments || 0)})
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
                ) : paginatedDocuments && paginatedDocuments.length > 0 ? (
                  <div className={
                    viewMode === "grid" 
                      ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                      : "space-y-2"
                  }>
                    {paginatedDocuments.map((doc: any) => (
                      <DocumentCard 
                        key={doc.id} 
                        document={doc} 
                        viewMode={viewMode}
                        isSelected={isDocumentSelected(doc.id)}
                        onSelect={handleDocumentSelect}
                        showSelection={true}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-500">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                    <h3 className="text-lg font-medium text-slate-800 mb-2">
                      {searchQuery || filterCategories.length > 0 || filterTags.length > 0 || showFavoritesOnly ? "No documents found" : "No documents yet"}
                    </h3>
                    <p className="text-sm text-slate-500 mb-6">
                      {searchQuery || filterCategories.length > 0 || filterTags.length > 0 || showFavoritesOnly
                        ? "Try adjusting your search or filter criteria"
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

                {/* Pagination Controls */}
                {paginatedDocuments && paginatedDocuments.length > 0 && (totalPages > 1 || currentPage > 1) && (
                  <div className="mt-6 flex items-center justify-between">
                    <div className="text-sm text-slate-500">
                      {isSearchMode ? (
                        `Showing ${startIndex + 1}-${Math.min(endIndex, allFilteredDocuments.length)} of ${allFilteredDocuments.length} documents`
                      ) : (
                        `Showing ${startIndex + 1}-${endIndex} of ${stats?.totalDocuments || 0} documents`
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </Button>

                      <div className="flex items-center space-x-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }

                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPage(pageNum)}
                              className="w-8 h-8 p-0"
                            >
                              {pageNum}
                            </Button>
                          );
                        })}

                        {totalPages > 5 && currentPage < totalPages - 2 && (
                          <>
                            <span className="text-slate-400">...</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(totalPages)}
                              className="w-8 h-8 p-0"
                            >
                              {totalPages}
                            </Button>
                          </>
                        )}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}