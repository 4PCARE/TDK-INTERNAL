
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { 
  Shield, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Save, 
  X,
  Users,
  Lock,
  Eye,
  FileText,
  Settings
} from "lucide-react";

interface Role {
  id: number;
  name: string;
  description: string;
  permissions: string[];
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
}

export default function RoleManagement() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["/api/roles", searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      
      const response = await fetch(`/api/roles?${params}`);
      if (!response.ok) throw new Error("Failed to fetch roles");
      return response.json();
    },
  }) as { data: Role[]; isLoading: boolean };

  const { data: permissions = [] } = useQuery({
    queryKey: ["/api/permissions"],
    queryFn: async () => {
      const response = await fetch("/api/permissions");
      if (!response.ok) throw new Error("Failed to fetch permissions");
      return response.json();
    },
  }) as { data: Permission[] };

  const createMutation = useMutation({
    mutationFn: async (data: Omit<Role, 'id' | 'userCount' | 'createdAt' | 'updatedAt'>) => {
      const response = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) throw new Error("Failed to create role");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Role Created",
        description: "The role has been successfully created.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      setIsCreating(false);
    },
    onError: () => {
      toast({
        title: "Creation Failed",
        description: "Failed to create role. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Role> }) => {
      const response = await fetch(`/api/roles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) throw new Error("Failed to update role");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Role Updated",
        description: "The role has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      setEditingId(null);
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update role. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/roles/${id}`, {
        method: "DELETE",
      });
      
      if (!response.ok) throw new Error("Failed to delete role");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Role Deleted",
        description: "The role has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
    },
    onError: () => {
      toast({
        title: "Deletion Failed",
        description: "Failed to delete role. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>, isEdit: boolean = false) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    // Get selected permissions
    const selectedPermissions: string[] = [];
    permissions.forEach(permission => {
      if (formData.get(`permission_${permission.id}`)) {
        selectedPermissions.push(permission.id);
      }
    });

    const data = {
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      permissions: selectedPermissions,
    };

    if (isEdit && editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const permissionCategories = Array.from(
    new Set(permissions.map(p => p.category))
  );

  const getPermissionIcon = (category: string) => {
    switch (category) {
      case 'documents': return FileText;
      case 'users': return Users;
      case 'admin': return Settings;
      case 'security': return Lock;
      default: return Eye;
    }
  };

  const RoleForm = ({ role, onCancel }: { 
    role?: Role; 
    onCancel: () => void; 
  }) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center space-x-2">
            <Shield className="w-5 h-5" />
            <span>{role ? 'Edit Role' : 'Create New Role'}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => handleSubmit(e, !!role)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Role Name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={role?.name}
                required
                placeholder="Enter role name"
              />
            </div>
            
            <div className="md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={role?.description}
                required
                placeholder="Describe the role and its responsibilities"
                className="min-h-[100px]"
              />
            </div>
          </div>
          
          <div>
            <Label className="text-base font-medium">Permissions</Label>
            <p className="text-sm text-gray-500 mb-4">
              Select the permissions for this role
            </p>
            
            <div className="space-y-4">
              {permissionCategories.map(category => {
                const categoryPermissions = permissions.filter(p => p.category === category);
                const Icon = getPermissionIcon(category);
                
                return (
                  <Card key={category} className="border border-gray-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center space-x-2">
                        <Icon className="w-4 h-4" />
                        <span className="capitalize">{category}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {categoryPermissions.map(permission => (
                          <div key={permission.id} className="flex items-center justify-between space-x-3">
                            <div className="flex-1">
                              <Label htmlFor={`permission_${permission.id}`} className="text-sm font-medium">
                                {permission.name}
                              </Label>
                              <p className="text-xs text-gray-500">
                                {permission.description}
                              </p>
                            </div>
                            <Switch
                              id={`permission_${permission.id}`}
                              name={`permission_${permission.id}`}
                              defaultChecked={role?.permissions?.includes(permission.id)}
                            />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex items-center space-x-2"
            >
              <Save className="w-4 h-4" />
              <span>{role ? 'Update' : 'Create'} Role</span>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Role Management</h1>
              <p className="text-gray-600">Manage user roles and permissions</p>
            </div>
          </div>
          
          <Button 
            onClick={() => setIsCreating(true)}
            className="flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>New Role</span>
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search roles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Create Form */}
        {isCreating && (
          <RoleForm onCancel={() => setIsCreating(false)} />
        )}

        {/* Roles List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rolesLoading ? (
            <div className="col-span-full text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading roles...</p>
            </div>
          ) : roles.length === 0 ? (
            <div className="col-span-full">
              <Card>
                <CardContent className="text-center py-8">
                  <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Roles</h3>
                  <p className="text-gray-500 mb-4">
                    {searchQuery ? 'No roles match your search.' : 'Get started by creating your first role.'}
                  </p>
                  {!searchQuery && (
                    <Button onClick={() => setIsCreating(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create First Role
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            roles.map((role) => (
              <div key={role.id}>
                {editingId === role.id ? (
                  <div className="col-span-full">
                    <RoleForm 
                      role={role} 
                      onCancel={() => setEditingId(null)} 
                    />
                  </div>
                ) : (
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{role.name}</CardTitle>
                          <p className="text-sm text-gray-500 mt-1">{role.description}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingId(role.id)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteMutation.mutate(role.id)}
                            className="text-red-600 hover:text-red-700"
                            disabled={role.name === 'admin' || role.name === 'user'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center space-x-2">
                          <Users className="w-4 h-4 text-gray-500" />
                          <span className="text-sm text-gray-600">
                            {role.userCount} {role.userCount === 1 ? 'user' : 'users'}
                          </span>
                        </div>
                        
                        <div>
                          <p className="text-sm font-medium text-gray-700 mb-2">Permissions</p>
                          <div className="flex flex-wrap gap-1">
                            {role.permissions.length > 0 ? (
                              role.permissions.slice(0, 3).map(permissionId => {
                                const permission = permissions.find(p => p.id === permissionId);
                                return permission ? (
                                  <Badge key={permission.id} variant="secondary" className="text-xs">
                                    {permission.name}
                                  </Badge>
                                ) : null;
                              })
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                No permissions
                              </Badge>
                            )}
                            {role.permissions.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{role.permissions.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
