import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Shield, UserCog, Settings } from "lucide-react";

type User = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  departmentName: string | null;
  createdAt: string;
};

export default function RoleManagement() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated,
    retry: false,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      console.log(`Updating role for user ${userId} to ${role}`);
      
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        console.error("Role update failed:", response.status, errorData);
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to update role`);
      }

      return await response.json();
    },
    onSuccess: (data, variables) => {
      console.log(`Successfully updated role for user ${variables.userId} to ${variables.role}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Role Updated",
        description: "User role has been updated successfully.",
      });
    },
    onError: (error: any, variables) => {
      console.error(`Failed to update role for user ${variables.userId}:`, error);
      
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
        description: error.message || "Failed to update user role. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "destructive";
      case "user":
        return "default";
      case "viewer":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Shield className="w-4 h-4" />;
      case "user":
        return <UserCog className="w-4 h-4" />;
      case "viewer":
        return <Users className="w-4 h-4" />;
      default:
        return <Users className="w-4 h-4" />;
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="flex">
          <Sidebar />
          <div className="flex-1">
            <TopBar />
            <main className="p-6">
              <div className="space-y-6">
                <div className="flex items-center space-x-2">
                  <Settings className="w-6 h-6" />
                  <h1 className="text-2xl font-bold">Role Management</h1>
                </div>
                <div className="text-center py-8">Loading...</div>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex">
        <Sidebar />
        <div className="flex-1">
          <TopBar />
          <main className="p-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Settings className="w-6 h-6" />
                  <h1 className="text-2xl font-bold">Role Management</h1>
                </div>
                <Badge variant="outline" className="px-3 py-1">
                  {users.length} Total Users
                </Badge>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>User Roles & Permissions</CardTitle>
                  <CardDescription>
                    Manage user roles and access permissions. Admin users have
                    full access to all features.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                        <div className="flex items-center space-x-2 mb-2">
                          <Shield className="w-4 h-4 text-red-600" />
                          <span className="font-semibold text-red-800">
                            Admin
                          </span>
                        </div>
                        <p className="text-sm text-red-700">
                          Full system access, user management, settings, and all
                          features
                        </p>
                      </div>

                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <div className="flex items-center space-x-2 mb-2">
                          <UserCog className="w-4 h-4 text-blue-600" />
                          <span className="font-semibold text-blue-800">
                            User
                          </span>
                        </div>
                        <p className="text-sm text-blue-700">
                          Upload, view, and manage documents. Access to AI
                          features
                        </p>
                      </div>

                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <div className="flex items-center space-x-2 mb-2">
                          <Users className="w-4 h-4 text-gray-600" />
                          <span className="font-semibold text-gray-800">
                            Viewer
                          </span>
                        </div>
                        <p className="text-sm text-gray-700">
                          Read-only access to documents and basic search
                          functionality
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>User List</CardTitle>
                  <CardDescription>
                    View and modify user roles. Changes take effect immediately.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {users.map((user: User) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                            {getRoleIcon(user.role)}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-medium">
                                {user.firstName && user.lastName
                                  ? `${user.firstName} ${user.lastName}`
                                  : user.email}
                              </span>
                              <Badge variant={getRoleBadgeVariant(user.role)}>
                                {user.role}
                              </Badge>
                            </div>
                            <div className="text-sm text-gray-500">
                              {user.email}
                              {user.departmentName && (
                                <span className="ml-2">
                                  • {user.departmentName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3">
                          <Select
                            value={user.role}
                            onValueChange={(newRole) => {
                              console.log("Old Role:", user.role);
                              console.log("New Role:", newRole);
                              if (newRole !== user.role) {
                                updateRoleMutation.mutate({
                                  userId: user.id,
                                  role: newRole,
                                });
                              } else {
                                console.log(
                                  "Role is the same, not sending update request.",
                                );
                              }
                            }}
                            disabled={updateRoleMutation.isPending}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
