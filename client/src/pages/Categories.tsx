import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/Layout/Sidebar";
import TopBar from "@/components/TopBar";
import ChatModal from "@/components/Chat/ChatModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Tags, 
  Plus, 
  Folder,
  Edit,
  Trash2,
  FileText,
  Hash
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function Categories() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ["/api/categories"],
    retry: false,
  });

  const { data: documents } = useQuery({
    queryKey: ["/api/documents"],
    retry: false,
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (categoryData: { name: string; description: string }) => {
      const response = await apiRequest('POST', '/api/categories', categoryData);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      setIsCreateDialogOpen(false);
      setNewCategoryName("");
      setNewCategoryDescription("");
      toast({
        title: "Category Created",
        description: "New category has been created successfully.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name: string; description: string } }) => {
      const response = await apiRequest('PUT', `/api/categories/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      setEditingCategory(null);
      toast({
        title: "Category Updated",
        description: "Category has been updated successfully.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      toast({
        title: "Category Deleted",
        description: "Category has been deleted successfully.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) return;
    createCategoryMutation.mutate({
      name: newCategoryName.trim(),
      description: newCategoryDescription.trim()
    });
  };

  const handleUpdateCategory = () => {
    if (!editingCategory?.name?.trim()) return;
    updateCategoryMutation.mutate({
      id: editingCategory.id,
      data: {
        name: editingCategory.name.trim(),
        description: editingCategory.description?.trim() || ""
      }
    });
  };

  const getDocumentCountForCategory = (categoryId: number) => {
    if (!documents || !Array.isArray(documents)) return 0;
    return documents.filter((doc: any) => doc.categoryId === categoryId).length;
  };

  const getAllTags = () => {
    if (!documents || !Array.isArray(documents)) return [];
    const allTags = new Set<string>();
    documents.forEach((doc: any) => {
      if (doc.tags && Array.isArray(doc.tags)) {
        doc.tags.forEach((tag: string) => allTags.add(tag));
      }
    });
    return Array.from(allTags);
  };

  const getDocumentCountForTag = (tag: string) => {
    if (!documents || !Array.isArray(documents)) return 0;
    return documents.filter((doc: any) => 
      doc.tags && Array.isArray(doc.tags) && doc.tags.includes(tag)
    ).length;
  };

  if (isLoading || !isAuthenticated) {
    return null;
  }

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
        <TopBar />

        <main className="flex-1 overflow-auto p-6 bg-gray-50">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-800 mb-2">Categories & Tags</h1>
            <p className="text-sm text-slate-500">
              Manage document categories and view all tags in your collection
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Categories Section */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  <Folder className="w-5 h-5" />
                  <span>Categories</span>
                </CardTitle>
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      New Category
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Category</DialogTitle>
                      <DialogDescription>
                        Add a new category to organize your documents.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-slate-700">Name</label>
                        <Input
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="Enter category name"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700">Description</label>
                        <Textarea
                          value={newCategoryDescription}
                          onChange={(e) => setNewCategoryDescription(e.target.value)}
                          placeholder="Enter category description (optional)"
                          rows={3}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleCreateCategory}
                        disabled={createCategoryMutation.isPending || !newCategoryName.trim()}
                      >
                        Create Category
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {categoriesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-16 bg-slate-200 rounded-lg"></div>
                      </div>
                    ))}
                  </div>
                ) : categories && Array.isArray(categories) && categories.length > 0 ? (
                  <div className="space-y-3">
                    {categories.map((category: any) => (
                      <div key={category.id} className="border border-slate-200 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-medium text-slate-800">{category.name}</h3>
                            {category.description && (
                              <p className="text-sm text-slate-500 mt-1">{category.description}</p>
                            )}
                            <div className="flex items-center space-x-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                <FileText className="w-3 h-3 mr-1" />
                                {category.documentCount || 0} documents
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingCategory(category)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteCategoryMutation.mutate(category.id)}
                              disabled={deleteCategoryMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <Folder className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p className="text-sm">No categories yet</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Categories are automatically created when documents are processed
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tags Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Tags className="w-5 h-5" />
                  <span>Document Tags</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const allTags = getAllTags();
                  return allTags.length > 0 ? (
                    <div className="space-y-3">
                      {allTags.map((tag) => (
                        <div key={tag} className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
                          <div className="flex items-center space-x-2">
                            <Hash className="w-4 h-4 text-slate-400" />
                            <span className="text-sm font-medium text-slate-700">{tag}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {getDocumentCountForTag(tag)} documents
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      <Tags className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                      <p className="text-sm">No tags yet</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Tags are automatically generated when documents are processed
                      </p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Edit Category Dialog */}
      {editingCategory && (
        <Dialog open={!!editingCategory} onOpenChange={() => setEditingCategory(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Category</DialogTitle>
              <DialogDescription>
                Update the category name and description.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Name</label>
                <Input
                  value={editingCategory.name || ""}
                  onChange={(e) => setEditingCategory({
                    ...editingCategory,
                    name: e.target.value
                  })}
                  placeholder="Enter category name"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Description</label>
                <Textarea
                  value={editingCategory.description || ""}
                  onChange={(e) => setEditingCategory({
                    ...editingCategory,
                    description: e.target.value
                  })}
                  placeholder="Enter category description (optional)"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingCategory(null)}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpdateCategory}
                disabled={updateCategoryMutation.isPending || !editingCategory.name?.trim()}
              >
                Update Category
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ChatModal 
        isOpen={isChatModalOpen} 
        onClose={() => setIsChatModalOpen(false)} 
      />
    </div>
  );
}