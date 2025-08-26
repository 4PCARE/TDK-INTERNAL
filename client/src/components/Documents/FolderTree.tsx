
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  Folder, 
  FolderOpen, 
  Plus, 
  Edit2, 
  Trash2, 
  ChevronRight, 
  ChevronDown,
  FileText
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface Folder {
  id: number;
  name: string;
  parentId?: number;
  children?: Folder[];
  documentCount?: number;
}

interface FolderTreeProps {
  selectedFolderId?: number;
  onFolderSelect: (folderId: number | null) => void;
  onFolderDrop: (folderId: number | null, documentIds: number[]) => void;
  className?: string;
}

export default function FolderTree({ selectedFolderId, onFolderSelect, onFolderDrop, className }: FolderTreeProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<number | null>(null);

  // Fetch folders
  const { data: folders, isLoading } = useQuery({
    queryKey: ["/api/folders"],
    queryFn: async () => {
      const response = await fetch("/api/folders");
      if (!response.ok) throw new Error("Failed to fetch folders");
      return await response.json();
    },
  }) as { data: Folder[] | undefined; isLoading: boolean };

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async ({ name, parentId }: { name: string; parentId?: number }) => {
      return await apiRequest("POST", "/api/folders", { name, parentId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setNewFolderName("");
      setShowCreateDialog(false);
      toast({ title: "Folder created successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating folder",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update folder mutation
  const updateFolderMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      return await apiRequest("PUT", `/api/folders/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setEditingFolderId(null);
      setEditingName("");
      toast({ title: "Folder updated successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating folder",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete folder mutation
  const deleteFolderMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/folders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      if (selectedFolderId === deleteFolderMutation.variables) {
        onFolderSelect(null);
      }
      toast({ title: "Folder deleted successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting folder",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleExpanded = (folderId: number) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const startEditing = (folder: Folder) => {
    setEditingFolderId(folder.id);
    setEditingName(folder.name);
  };

  const saveEdit = () => {
    if (editingFolderId && editingName.trim()) {
      updateFolderMutation.mutate({ id: editingFolderId, name: editingName.trim() });
    }
  };

  const cancelEdit = () => {
    setEditingFolderId(null);
    setEditingName("");
  };

  const handleDragOver = (e: React.DragEvent, folderId: number | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolderId(folderId);
  };

  const handleDragLeave = () => {
    setDragOverFolderId(null);
  };

  const handleDrop = (e: React.DragEvent, folderId: number | null) => {
    e.preventDefault();
    setDragOverFolderId(null);
    
    const documentIds = JSON.parse(e.dataTransfer.getData("application/json"));
    if (documentIds && documentIds.length > 0) {
      onFolderDrop(folderId, documentIds);
    }
  };

  const renderFolder = (folder: Folder, level: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const isEditing = editingFolderId === folder.id;
    const isDragOver = dragOverFolderId === folder.id;
    const hasChildren = folder.children && folder.children.length > 0;

    return (
      <div key={folder.id} className="select-none">
        <div
          className={cn(
            "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors",
            "hover:bg-slate-100",
            isSelected && "bg-blue-100 border border-blue-300",
            isDragOver && "bg-green-100 border border-green-300",
            level > 0 && "ml-4"
          )}
          style={{ marginLeft: level * 16 }}
          onClick={() => !isEditing && onFolderSelect(folder.id)}
          onDragOver={(e) => handleDragOver(e, folder.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, folder.id)}
        >
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              className="p-0 h-4 w-4"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(folder.id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          )}
          
          {!hasChildren && <div className="w-4" />}
          
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 text-blue-600" />
          ) : (
            <Folder className="h-4 w-4 text-blue-600" />
          )}

          {isEditing ? (
            <Input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") cancelEdit();
              }}
              onBlur={saveEdit}
              className="h-6 text-sm"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 text-sm font-medium">{folder.name}</span>
          )}

          {folder.documentCount !== undefined && (
            <Badge variant="secondary" className="text-xs">
              {folder.documentCount}
            </Badge>
          )}

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                startEditing(folder);
              }}
            >
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6 text-red-600 hover:text-red-700"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Are you sure you want to delete this folder?")) {
                  deleteFolderMutation.mutate(folder.id);
                }
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {isExpanded && hasChildren && (
          <div className="ml-4">
            {folder.children!.map((child) => renderFolder(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const buildFolderTree = (folders: Folder[]): Folder[] => {
    const folderMap = new Map<number, Folder>();
    const rootFolders: Folder[] = [];

    // First pass: create folder map
    folders.forEach((folder) => {
      folderMap.set(folder.id, { ...folder, children: [] });
    });

    // Second pass: build tree structure
    folders.forEach((folder) => {
      const folderNode = folderMap.get(folder.id)!;
      if (folder.parentId) {
        const parent = folderMap.get(folder.parentId);
        if (parent) {
          parent.children!.push(folderNode);
        } else {
          rootFolders.push(folderNode);
        }
      } else {
        rootFolders.push(folderNode);
      }
    });

    return rootFolders;
  };

  if (isLoading) {
    return (
      <Card className={cn("p-4", className)}>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-slate-200 rounded" />
          ))}
        </div>
      </Card>
    );
  }

  const folderTree = folders ? buildFolderTree(folders) : [];

  return (
    <div className={cn("", className)}>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">Folders</h3>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Folder</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFolderName.trim()) {
                      createFolderMutation.mutate({ name: newFolderName.trim() });
                    }
                  }}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (newFolderName.trim()) {
                        createFolderMutation.mutate({ name: newFolderName.trim() });
                      }
                    }}
                    disabled={!newFolderName.trim() || createFolderMutation.isPending}
                  >
                    Create
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* All Documents option */}
        <div
          className={cn(
            "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors mb-2",
            "hover:bg-slate-100",
            selectedFolderId === null && "bg-blue-100 border border-blue-300",
            dragOverFolderId === null && selectedFolderId !== null && "bg-green-100 border border-green-300"
          )}
          onClick={() => onFolderSelect(null)}
          onDragOver={(e) => handleDragOver(e, null)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, null)}
        >
          <div className="w-4" />
          <FileText className="h-4 w-4 text-slate-600" />
          <span className="flex-1 text-sm font-medium">Main Folder</span>
        </div>

        {/* Folder tree */}
        <div className="space-y-1 group">
          {folderTree.map((folder) => renderFolder(folder))}
        </div>

        {folderTree.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            <Folder className="h-12 w-12 mx-auto mb-2 text-slate-300" />
            <p className="text-sm">No folders yet</p>
            <p className="text-xs text-slate-400">Create your first folder to organize documents</p>
          </div>
        )}
      </div>
    </div>
  );
}
