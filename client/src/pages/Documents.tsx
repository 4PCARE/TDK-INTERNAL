import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useEffect } from "react";
import Sidebar from "@/components/Layout/Sidebar";
import TopBar from "@/components/TopBar";
import DocumentCard from "@/components/DocumentCard";
import ChatModal from "@/components/Chat/ChatModal";
import UploadZone from "@/components/Upload/UploadZone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  FileText, 
  Search, 
  Filter, 
  Grid3X3, 
  List,
  SortAsc,
  SortDesc,
  Calendar,
  Upload,
  Tag,
  ChevronDown,
  Star
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import VectorizeAllButton from "@/components/VectorizeAllButton";

export default function Documents() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"keyword" | "semantic" | "hybrid">("hybrid");
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
    }
  }, []);

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

  // Enhanced search with semantic capabilities  
  const { data: documents, isLoading: documentsLoading } = useQuery({
    queryKey: ["/api/documents/search", searchQuery, searchType],
    queryFn: async () => {
      if (!searchQuery.trim()) {
        const response = await fetch("/api/documents");
        if (!response.ok) {
          throw new Error(`${response.status}: ${response.statusText}`);
        }
        return await response.json();
      }
      
      const params = new URLSearchParams({
        query: searchQuery,
        type: searchType
      });
      
      console.log(`Frontend search: "${searchQuery}" (${searchType})`);
      const response = await fetch(`/api/documents/search?${params}`);
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      const results = await response.json();
      console.log(`Frontend received ${results.length} search results`);
      return results;
    },
    retry: false,
  }) as { data: Array<any>; isLoading: boolean };

  const { data: categories } = useQuery({
    queryKey: ["/api/categories"],
    retry: false,
  }) as { data: Array<{ id: number; name: string }> | undefined };

  if (isLoading || !isAuthenticated) {
    return null;
  }

  // Get unique AI categories and tags for filtering
  const aiCategories = documents ? Array.from(new Set(documents.map((doc: any) => doc.aiCategory).filter(Boolean))) : [];
  const allTags = documents ? Array.from(new Set(documents.flatMap((doc: any) => doc.tags || []))) : [];

  // Filter and sort documents with multi-select support
  const filteredDocuments = documents ? documents.filter((doc: any) => {
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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar 
        isMobileOpen={isMobileMenuOpen} 
        onMobileClose={() => setIsMobileMenuOpen(false)}
        onOpenChat={() => setIsChatModalOpen(true)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar isSidebarCollapsed={isSidebarCollapsed} />
        
        <main className="flex-1 overflow-auto p-6 bg-gray-50">
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
                      className="pl-10"
                    />
                  </div>
                  
                  <Select value={searchType} onValueChange={(value: "keyword" | "semantic" | "hybrid") => setSearchType(value)}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keyword">Keyword Search</SelectItem>
                      <SelectItem value="semantic">AI Semantic Search</SelectItem>
                      <SelectItem value="hybrid">Hybrid Search</SelectItem>
                    </SelectContent>
                  </Select>
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
                        <List className="w-4 h-4" />
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
            </CardContent>
          </Card>
        </main>
      </div>
      
      <ChatModal 
        isOpen={isChatModalOpen} 
        onClose={() => setIsChatModalOpen(false)} 
      />
    </div>
  );
}
