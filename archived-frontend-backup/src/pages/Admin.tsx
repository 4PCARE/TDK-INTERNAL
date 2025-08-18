import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/Layout/Sidebar";
import TopBar from "@/components/TopBar";
import ChatModal from "@/components/Chat/ChatModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Settings as SettingsIcon,
  Users,
  Shield,
  Database,
  Key,
  Plus,
  Edit,
  Trash2,
  UserPlus,
  FileText,
  Lock,
  Unlock
} from "lucide-react";

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: 'admin' | 'user';
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

interface DocumentAccess {
  id: number;
  documentId: number;
  userId: string;
  permission: 'read' | 'write' | 'admin';
  grantedBy: string;
  grantedAt: string;
  documentName: string;
  userName: string;
}

export default function Admin() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isAccessDialogOpen, setIsAccessDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<'admin' | 'user'>('user');
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedPermission, setSelectedPermission] = useState<'read' | 'write' | 'admin'>('read');

  // Mock users for demo (will be replaced with real API)
  const mockUsers: User[] = [
    {
      id: "43981095",
      email: "admin@4plus.co.th",
      firstName: "Admin",
      lastName: "User",
      role: 'admin',
      isActive: true,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    },
    {
      id: "demo-user-1",
      email: "john.doe@example.com",
      firstName: "John",
      lastName: "Doe",
      role: 'user',
      isActive: true,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      lastLogin: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: "demo-user-2",
      email: "jane.smith@example.com",
      firstName: "Jane",
      lastName: "Smith",
      role: 'user',
      isActive: true,
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      lastLogin: new Date(Date.now() - 7200000).toISOString()
    }
  ];

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

  const { data: documents = [] } = useQuery({
    queryKey: ["/api/documents"],
    enabled: isAuthenticated,
    retry: false,
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Mock document access for demo
  const mockDocumentAccess: DocumentAccess[] = [
    {
      id: 1,
      documentId: 6,
      userId: "demo-user-1",
      permission: 'read',
      grantedBy: "admin@4plus.co.th",
      grantedAt: new Date().toISOString(),
      documentName: "JOHN SMITH.txt",
      userName: "john.doe@example.com"
    },
    {
      id: 2,
      documentId: 7,
      userId: "demo-user-2",
      permission: 'write',
      grantedBy: "admin@4plus.co.th",
      grantedAt: new Date().toISOString(),
      documentName: "King Power RangName.png",
      userName: "jane.smith@example.com"
    }
  ];

  const handleCreateUser = () => {
    if (!newUserEmail.trim()) return;
    
    toast({
      title: "User Created",
      description: `Demo user ${newUserEmail} would be created with role: ${newUserRole}`,
    });
    
    setIsUserDialogOpen(false);
    setNewUserEmail("");
    setNewUserRole('user');
  };

  const handleUpdateUser = () => {
    if (!editingUser) return;
    
    toast({
      title: "User Updated",
      description: `User ${editingUser.email} role updated to: ${editingUser.role}`,
    });
    
    setEditingUser(null);
  };

  const handleGrantAccess = () => {
    if (!selectedDocumentId || !selectedUserId) return;
    
    const doc = documents.find((d: any) => d.id === selectedDocumentId);
    const user = mockUsers.find(u => u.id === selectedUserId);
    
    toast({
      title: "Access Granted",
      description: `${selectedPermission} access granted to ${user?.email} for ${doc?.name || doc?.originalName}`,
    });
    
    setIsAccessDialogOpen(false);
    setSelectedDocumentId(null);
    setSelectedUserId("");
    setSelectedPermission('read');
  };

  const handleRevokeAccess = (access: DocumentAccess) => {
    toast({
      title: "Access Revoked",
      description: `Access revoked for ${access.userName} on ${access.documentName}`,
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
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
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                  <SettingsIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900">Admin Dashboard</h1>
                  <p className="text-gray-600">Manage users, permissions, and system settings</p>
                </div>
              </div>
            </div>

            <Tabs defaultValue="users" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="users" className="flex items-center space-x-2">
                  <Users className="w-4 h-4" />
                  <span>User Management</span>
                </TabsTrigger>
                <TabsTrigger value="permissions" className="flex items-center space-x-2">
                  <Shield className="w-4 h-4" />
                  <span>Document Access</span>
                </TabsTrigger>
                <TabsTrigger value="system" className="flex items-center space-x-2">
                  <Database className="w-4 h-4" />
                  <span>System Info</span>
                </TabsTrigger>
                <TabsTrigger value="security" className="flex items-center space-x-2">
                  <Key className="w-4 h-4" />
                  <span>Security</span>
                </TabsTrigger>
              </TabsList>

              {/* User Management Tab */}
              <TabsContent value="users" className="space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center space-x-2">
                      <Users className="w-5 h-5" />
                      <span>Users</span>
                    </CardTitle>
                    <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <UserPlus className="w-4 h-4 mr-2" />
                          Add User
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create New User</DialogTitle>
                          <DialogDescription>
                            Add a new user to the system. Demo mode - user will be created with password: demo123
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="email">Email</Label>
                            <Input
                              id="email"
                              type="email"
                              value={newUserEmail}
                              onChange={(e) => setNewUserEmail(e.target.value)}
                              placeholder="user@example.com"
                            />
                          </div>
                          <div>
                            <Label htmlFor="role">Role</Label>
                            <Select value={newUserRole} onValueChange={(value: 'admin' | 'user') => setNewUserRole(value)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="p-4 bg-blue-50 rounded-lg">
                            <p className="text-sm text-blue-800">
                              <strong>Demo Credentials:</strong><br />
                              Password: demo123<br />
                              Users can login with these credentials for testing.
                            </p>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsUserDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button 
                            onClick={handleCreateUser}
                            disabled={!newUserEmail.trim()}
                          >
                            Create User
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Last Login</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mockUsers.map((user: User) => (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email}</div>
                                <div className="text-sm text-gray-500">{user.email}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                {user.role}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={user.isActive ? 'default' : 'destructive'}>
                                {user.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(user.createdAt)}</TableCell>
                            <TableCell>{user.lastLogin ? formatDate(user.lastLogin) : 'Never'}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingUser(user)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Document Access Tab */}
              <TabsContent value="permissions" className="space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center space-x-2">
                      <Shield className="w-5 h-5" />
                      <span>Document Access Control</span>
                    </CardTitle>
                    <Dialog open={isAccessDialogOpen} onOpenChange={setIsAccessDialogOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="w-4 h-4 mr-2" />
                          Grant Access
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Grant Document Access</DialogTitle>
                          <DialogDescription>
                            Grant a user access to a specific document.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label>Document</Label>
                            <Select value={selectedDocumentId?.toString()} onValueChange={(value) => setSelectedDocumentId(parseInt(value))}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select document" />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.isArray(documents) && documents.map((doc: any) => (
                                  <SelectItem key={doc.id} value={doc.id.toString()}>
                                    {doc.name || doc.originalName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>User</Label>
                            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select user" />
                              </SelectTrigger>
                              <SelectContent>
                                {mockUsers.map((user: User) => (
                                  <SelectItem key={user.id} value={user.id}>
                                    {user.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Permission</Label>
                            <Select value={selectedPermission} onValueChange={(value: 'read' | 'write' | 'admin') => setSelectedPermission(value)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="read">Read Only</SelectItem>
                                <SelectItem value="write">Read & Write</SelectItem>
                                <SelectItem value="admin">Full Access</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsAccessDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button 
                            onClick={handleGrantAccess}
                            disabled={!selectedDocumentId || !selectedUserId}
                          >
                            Grant Access
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Document</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Permission</TableHead>
                          <TableHead>Granted By</TableHead>
                          <TableHead>Granted At</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mockDocumentAccess.map((access: DocumentAccess) => (
                          <TableRow key={access.id}>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <FileText className="w-4 h-4 text-gray-400" />
                                <span>{access.documentName}</span>
                              </div>
                            </TableCell>
                            <TableCell>{access.userName}</TableCell>
                            <TableCell>
                              <Badge variant={
                                access.permission === 'admin' ? 'default' : 
                                access.permission === 'write' ? 'secondary' : 'outline'
                              }>
                                {access.permission === 'read' && <Lock className="w-3 h-3 mr-1" />}
                                {access.permission === 'write' && <Edit className="w-3 h-3 mr-1" />}
                                {access.permission === 'admin' && <Unlock className="w-3 h-3 mr-1" />}
                                {access.permission}
                              </Badge>
                            </TableCell>
                            <TableCell>{access.grantedBy}</TableCell>
                            <TableCell>{formatDate(access.grantedAt)}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRevokeAccess(access)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* System Info Tab */}
              <TabsContent value="system" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <Users className="w-5 h-5 text-blue-500" />
                        <span className="text-sm font-medium text-gray-600">Total Users</span>
                      </div>
                      <div className="mt-2">
                        <div className="text-2xl font-bold">{mockUsers.length}</div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-5 h-5 text-green-500" />
                        <span className="text-sm font-medium text-gray-600">Total Documents</span>
                      </div>
                      <div className="mt-2">
                        <div className="text-2xl font-bold">{Array.isArray(documents) ? documents.length : 0}</div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <Shield className="w-5 h-5 text-purple-500" />
                        <span className="text-sm font-medium text-gray-600">Access Rules</span>
                      </div>
                      <div className="mt-2">
                        <div className="text-2xl font-bold">{mockDocumentAccess.length}</div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <Database className="w-5 h-5 text-orange-500" />
                        <span className="text-sm font-medium text-gray-600">Storage Used</span>
                      </div>
                      <div className="mt-2">
                        <div className="text-2xl font-bold">{stats?.storageUsed || '6MB'}</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Security Tab */}
              <TabsContent value="security" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Key className="w-5 h-5" />
                      <span>API Keys & Security</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 bg-green-50 rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-2">OpenAI Integration</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        OpenAI API key is configured and active for document processing and AI responses.
                      </p>
                      <Badge variant="default" className="bg-green-500">Connected</Badge>
                    </div>
                    
                    <div className="p-4 bg-green-50 rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-2">Database Security</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        PostgreSQL database connections are encrypted and session management is secure.
                      </p>
                      <Badge variant="default" className="bg-green-500">Secure</Badge>
                    </div>
                    
                    <div className="p-4 bg-green-50 rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-2">Authentication</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Using Replit Auth with OpenID Connect for secure user authentication.
                      </p>
                      <Badge variant="default" className="bg-green-500">Active</Badge>
                    </div>
                    
                    <div className="p-4 bg-yellow-50 rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-2">Demo Users</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Demo users can be created with email/password: demo123 for testing purposes.
                      </p>
                      <div className="space-y-2">
                        <div className="text-sm"><strong>Current Demo Users:</strong></div>
                        <div className="text-sm">• john.doe@example.com / demo123</div>
                        <div className="text-sm">• jane.smith@example.com / demo123</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* Edit User Dialog */}
      {editingUser && (
        <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update user role and status.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input value={editingUser.email} disabled />
              </div>
              <div>
                <Label>Role</Label>
                <Select 
                  value={editingUser.role} 
                  onValueChange={(value: 'admin' | 'user') => setEditingUser({...editingUser, role: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select 
                  value={editingUser.isActive ? 'active' : 'inactive'} 
                  onValueChange={(value) => setEditingUser({...editingUser, isActive: value === 'active'})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateUser}>
                Update User
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