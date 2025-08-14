import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Save, 
  X,
  Users,
  Shield,
  Mail,
  Calendar,
  Building,
  UserCheck,
  UserX,
  MoreHorizontal,
  MoreVertical,
  User
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface UserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: string;
  departmentId?: number;
  department?: { id: number; name: string };
  createdAt: string;
}

interface Department {
  id: number;
  name: string;
  description?: string;
}

interface Document {
  id: number;
  name: string;
  aiCategory?: string;
}

interface Permission {
  id: number;
  documentId: number;
  userId?: string;
  departmentId?: number;
  permission: string;
  type: 'user' | 'department';
}

// Interface for generic useQuery calls (as per changes)
interface UserQueryType {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}


export default function UserManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [showBootstrap, setShowBootstrap] = useState(false);

  // State for dialogs
  const [isCreateDepartmentOpen, setIsCreateDepartmentOpen] = useState(false);
  const [isAssignUserOpen, setIsAssignUserOpen] = useState(false);
  const [isCreatePermissionOpen, setIsCreatePermissionOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);

  // State for forms
  const [newDepartment, setNewDepartment] = useState({ name: "", description: "" });
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const [selectedPermissionUserId, setSelectedPermissionUserId] = useState<string>("");
  const [selectedPermissionDepartmentId, setSelectedPermissionDepartmentId] = useState<string>("");
  const [permissionType, setPermissionType] = useState<string>("read");

  // Queries
  const { data: users = [], isLoading: usersLoading } = useQuery<UserData[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: departments = [], isLoading: departmentsLoading } = useQuery<Department[]>({
    queryKey: ["/api/admin/departments"],
  });

  const { data: permissions = [], isLoading: permissionsLoading } = useQuery<Permission[]>({
    queryKey: ["/api/admin/permissions"],
  });

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  // Mutations
  const createDepartmentMutation = useMutation({
    mutationFn: (departmentData: { name: string; description: string }) => 
      apiRequest('POST', '/api/admin/departments', departmentData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/departments'] });
      setIsCreateDepartmentOpen(false);
      setNewDepartment({ name: "", description: "" });
      toast({ title: "Department created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create department", variant: "destructive" });
    }
  });

  const updateUserDepartmentMutation = useMutation({
    mutationFn: ({ userId, departmentId }: { userId: string; departmentId: number }) => 
      apiRequest('PUT', `/api/admin/users/${userId}/department`, { departmentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setIsAssignUserOpen(false);
      setSelectedUserId("");
      setSelectedDepartmentId("");
      toast({ title: "User department updated successfully" });
    },
    onError: (error: any) => {
      console.error("Error updating user department:", error);
      toast({ 
        title: "Failed to update user department", 
        description: error.message || "An unexpected error occurred",
        variant: "destructive" 
      });
    }
  });

  const createPermissionMutation = useMutation({
    mutationFn: ({ type, targetId, documentId, permission }: { type: string; targetId: string; documentId: number; permission: string }) => {
      const payload = type === 'user' 
        ? { userId: targetId, documentId, permission }
        : { departmentId: parseInt(targetId), documentId, permission };

      return apiRequest('POST', '/api/admin/permissions', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/permissions'] });
      setIsCreatePermissionOpen(false);
      setSelectedDocumentId("");
      setSelectedPermissionUserId("");
      setSelectedPermissionDepartmentId("");
      setPermissionType("read");
      toast({ title: "Permission created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create permission", variant: "destructive" });
    }
  });

  const handleCreateDepartment = () => {
    if (!newDepartment.name.trim()) return;
    createDepartmentMutation.mutate(newDepartment);
  };

  const handleAssignUser = () => {
    if (!selectedUserId || !selectedDepartmentId) return;
    updateUserDepartmentMutation.mutate({ 
      userId: selectedUserId, 
      departmentId: parseInt(selectedDepartmentId) 
    });
  };

  // Edit user mutation
  const editUserMutation = useMutation({
    mutationFn: (updatedUser: { firstName: string; lastName: string; departmentId?: number }) => 
      apiRequest('PUT', `/api/users/${editingUser?.id}`, updatedUser),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setIsEditUserOpen(false);
      setEditingUser(null);
      toast({ title: "User updated successfully" });
    },
    onError: (error: any) => {
      console.error("Error updating user:", error);
      toast({ 
        title: "Failed to update user", 
        description: error.message || "An unexpected error occurred",
        variant: "destructive" 
      });
    }
  });

  // Role update mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to update role: ${response.status}`);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ 
        title: "Role updated successfully",
        description: "User role has been changed"
      });
    },
    onError: (error: any) => {
      console.error("Error updating user role:", error);
      toast({ 
        title: "Failed to update role", 
        description: error.message || "An unexpected error occurred",
        variant: "destructive" 
      });
    }
  });

  const bootstrapAdminMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/bootstrap-admin', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({ title: "Successfully promoted to admin! Please refresh the page." });
      setTimeout(() => window.location.reload(), 2000);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to become admin", 
        description: error.message || "An unexpected error occurred",
        variant: "destructive" 
      });
    }
  });

  // Check if user needs admin bootstrap
  React.useEffect(() => {
    if (usersLoading) return;

    // If we get 401 on admin endpoints, check if we can bootstrap
    if (users && users.length === 0 && user && user.role !== 'admin') {
      setShowBootstrap(true);
    }
  }, [users, usersLoading, user]);

  const handleEditUser = (user: UserData) => {
    setEditingUser(user);
    setIsEditUserOpen(true);
  };

  const handleUpdateUser = () => {
    if (!editingUser) return;
    editUserMutation.mutate({
      firstName: editingUser.firstName,
      lastName: editingUser.lastName,
      departmentId: editingUser.departmentId || undefined
    });
  };

  const handleCreatePermission = () => {
    if (!selectedDocumentId) return;

    const type = selectedPermissionUserId ? 'user' : 'department';
    const targetId = selectedPermissionUserId || selectedPermissionDepartmentId;

    if (!targetId) return;

    createPermissionMutation.mutate({
      type,
      targetId,
      documentId: parseInt(selectedDocumentId),
      permission: permissionType
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
              <p className="text-gray-600">Manage user accounts, roles, and permissions</p>
            </div>
          </div>

          <div className="flex gap-2">
            {showBootstrap && (
              <Button 
                onClick={() => bootstrapAdminMutation.mutate()}
                disabled={bootstrapAdminMutation.isPending}
                variant="outline"
                className="flex items-center space-x-2"
              >
                <Shield className="w-4 h-4" />
                <span>{bootstrapAdminMutation.isPending ? "Promoting..." : "Become Admin"}</span>
              </Button>
            )}
            <Button 
              onClick={() => setIsCreating(true)}
              className="flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add User</span>
            </Button>
          </div>
        </div>

        {showBootstrap && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <Shield className="w-5 h-5 text-amber-600" />
                <div>
                  <h3 className="font-medium text-amber-800">Admin Setup Required</h3>
                  <p className="text-sm text-amber-700">
                    No admin user exists yet. Click "Become Admin" to get administrative privileges.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

            {/* Quick Actions */}
            <div className="flex gap-4">
              <Dialog open={isCreateDepartmentOpen} onOpenChange={setIsCreateDepartmentOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Department
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Department</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="dept-name">Department Name</Label>
                      <Input
                        id="dept-name"
                        value={newDepartment.name}
                        onChange={(e) => setNewDepartment({ ...newDepartment, name: e.target.value })}
                        placeholder="Enter department name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="dept-desc">Description</Label>
                      <Textarea
                        id="dept-desc"
                        value={newDepartment.description}
                        onChange={(e) => setNewDepartment({ ...newDepartment, description: e.target.value })}
                        placeholder="Enter department description"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsCreateDepartmentOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateDepartment} disabled={createDepartmentMutation.isPending}>
                        {createDepartmentMutation.isPending ? "Creating..." : "Create"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={isAssignUserOpen} onOpenChange={setIsAssignUserOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Users className="w-4 h-4 mr-2" />
                    Assign User to Department
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign User to Department</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Select User</Label>
                      <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a user" />
                        </SelectTrigger>
                        <SelectContent>
                          {(users as UserData[]).map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.firstName} {user.lastName} ({user.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Select Department</Label>
                      <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a department" />
                        </SelectTrigger>
                        <SelectContent>
                          {(departments as Department[]).map((dept) => (
                            <SelectItem key={dept.id} value={dept.id.toString()}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsAssignUserOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAssignUser} disabled={updateUserDepartmentMutation.isPending}>
                        {updateUserDepartmentMutation.isPending ? "Assigning..." : "Assign"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={isCreatePermissionOpen} onOpenChange={setIsCreatePermissionOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Shield className="w-4 h-4 mr-2" />
                    Manage Permissions
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Document Permission</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Select Document</Label>
                      <Select value={selectedDocumentId} onValueChange={setSelectedDocumentId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a document" />
                        </SelectTrigger>
                        <SelectContent>
                          {(documents as Document[]).map((doc) => (
                            <SelectItem key={doc.id} value={doc.id.toString()}>
                              {doc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Assign to User</Label>
                      <Select value={selectedPermissionUserId} onValueChange={(value) => {
                        setSelectedPermissionUserId(value);
                        setSelectedPermissionDepartmentId("");
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a user (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {(users as UserData[]).map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.firstName} {user.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Or Assign to Department</Label>
                      <Select value={selectedPermissionDepartmentId} onValueChange={(value) => {
                        setSelectedPermissionDepartmentId(value);
                        setSelectedPermissionUserId("");
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a department (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {(departments as Department[]).map((dept) => (
                            <SelectItem key={dept.id} value={dept.id.toString()}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Permission Type</Label>
                      <Select value={permissionType} onValueChange={setPermissionType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="read">Read</SelectItem>
                          <SelectItem value="write">Write</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsCreatePermissionOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreatePermission} disabled={createPermissionMutation.isPending}>
                        {createPermissionMutation.isPending ? "Creating..." : "Create Permission"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Users Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="w-5 h-5" />
                  <span>Users ({Array.isArray(users) ? users.length : 0})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="text-center py-8">Loading users...</div>
                ) : !Array.isArray(users) || users.length === 0 ? (
                  <div className="text-center py-8">
                    <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No users found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(users as UserData[]).map((user, index) => (
                      <div key={`user-${user.id}-${index}`} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <User className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-medium">{user.firstName} {user.lastName}</h4>
                            <p className="text-sm text-gray-500">{user.email}</p>
                            {user.department && (
                              <Badge variant="outline" className="mt-1">
                                {user.department.name}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-500">Role:</span>
                            <Select
                              value={user.role || "user"}
                              onValueChange={(newRole) => {
                                if (newRole !== user.role) {
                                  updateRoleMutation.mutate({
                                    userId: user.id,
                                    role: newRole,
                                  });
                                }
                              }}
                              disabled={updateRoleMutation.isPending}
                            >
                              <SelectTrigger className="w-28 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">
                                  <div className="flex items-center space-x-1">
                                    <Shield className="w-3 h-3" />
                                    <span>Admin</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="user">
                                  <div className="flex items-center space-x-1">
                                    <User className="w-3 h-3" />
                                    <span>User</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="viewer">
                                  <div className="flex items-center space-x-1">
                                    <Users className="w-3 h-3" />
                                    <span>Viewer</span>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditUser(user)}>
                                <Edit className="w-4 h-4 mr-2" />
                                Edit User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Departments Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Building className="w-5 h-5" />
                  <span>Departments ({Array.isArray(departments) ? departments.length : 0})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {departmentsLoading ? (
                  <div className="text-center py-8">Loading departments...</div>
                ) : !Array.isArray(departments) || departments.length === 0 ? (
                  <div className="text-center py-8">
                    <Building className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No departments found</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(departments as Department[]).map((dept) => (
                      <div key={dept.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">{dept.name}</h4>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Edit className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-red-600">
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {dept.description && (
                          <p className="text-sm text-gray-500">{dept.description}</p>
                        )}
                        <div className="mt-2">
                          <Badge variant="outline">
                            {(users as UserData[]).filter(u => u.departmentId === dept.id).length} users
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Edit User Dialog */}
            <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit User</DialogTitle>
                </DialogHeader>
                {editingUser && (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="edit-firstName">First Name</Label>
                      <Input
                        id="edit-firstName"
                        value={editingUser.firstName}
                        onChange={(e) => setEditingUser({ ...editingUser, firstName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-lastName">Last Name</Label>
                      <Input
                        id="edit-lastName"
                        value={editingUser.lastName}
                        onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Department</Label>
                      <Select 
                        value={editingUser.departmentId?.toString() || ""} 
                        onValueChange={(value) => setEditingUser({ ...editingUser, departmentId: value ? parseInt(value) : undefined })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a department" />
                        </SelectTrigger>
                        <SelectContent>
                          {(departments as Department[]).map((dept) => (
                            <SelectItem key={dept.id} value={dept.id.toString()}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsEditUserOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleUpdateUser} disabled={editUserMutation.isPending}>
                        {editUserMutation.isPending ? "Updating..." : "Update"}
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Permissions Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="w-5 h-5" />
                  <span>Document Permissions ({Array.isArray(permissions) ? permissions.length : 0})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {permissionsLoading ? (
                  <div className="text-center py-8">Loading permissions...</div>
                ) : !Array.isArray(permissions) || permissions.length === 0 ? (
                  <div className="text-center py-8">
                    <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No permissions configured</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(permissions as Permission[]).map((permission) => {
                      const document = (documents as Document[]).find(d => d.id === permission.documentId);
                      const user = permission.userId ? (users as UserData[]).find(u => u.id === permission.userId) : null;
                      const department = permission.departmentId ? (departments as Department[]).find(d => d.id === permission.departmentId) : null;

                      return (
                        <div key={permission.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div>
                            <h4 className="font-medium">{document?.name || `Document #${permission.documentId}`}</h4>
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge variant="outline">{permission.permission}</Badge>
                              {user && (
                                <Badge variant="secondary">User: {user.firstName} {user.lastName}</Badge>
                              )}
                              {department && (
                                <Badge variant="secondary">Dept: {department.name}</Badge>
                              )}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem className="text-red-600">
                                <Trash2 className="w-4 h-4 mr-2" />
                                Remove Permission
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
    </DashboardLayout>
  );
}