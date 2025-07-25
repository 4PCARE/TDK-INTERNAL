import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Building, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ShareDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: number;
  documentName: string;
}

export default function ShareDocumentDialog({ 
  open, 
  onOpenChange, 
  documentId, 
  documentName 
}: ShareDocumentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [userPermission, setUserPermission] = useState("read");
  const [departmentPermission, setDepartmentPermission] = useState("read");

  // Fetch users and departments
  const { data: users = [] } = useQuery({
    queryKey: ["/api/admin/users"],
    enabled: open,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["/api/admin/departments"],
    enabled: open,
  });

  const { data: existingPermissions = [] } = useQuery({
    queryKey: ["/api/admin/permissions"],
    enabled: open,
  });

  // Filter existing permissions for this document
  const documentPermissions = existingPermissions.filter(
    (perm: any) => perm.documentId === documentId
  );

  // Share with user mutation
  const shareWithUserMutation = useMutation({
    mutationFn: () => 
      apiRequest('POST', '/api/admin/permissions', {
        userId: selectedUserId,
        documentId,
        permission: userPermission
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/permissions"] });
      setSelectedUserId("");
      setUserPermission("read");
      toast({
        title: "Document shared successfully",
        description: "Document has been shared with the selected user.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to share document",
        description: error.message || "An error occurred while sharing.",
        variant: "destructive",
      });
    },
  });

  // Share with department mutation
  const shareWithDepartmentMutation = useMutation({
    mutationFn: () => 
      apiRequest('POST', '/api/admin/permissions', {
        departmentId: parseInt(selectedDepartmentId),
        documentId,
        permission: departmentPermission
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/permissions"] });
      setSelectedDepartmentId("");
      setDepartmentPermission("read");
      toast({
        title: "Document shared successfully",
        description: "Document has been shared with the selected department.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to share document",
        description: error.message || "An error occurred while sharing.",
        variant: "destructive",
      });
    },
  });

  const handleShareWithUser = () => {
    if (!selectedUserId) {
      toast({
        title: "Please select a user",
        variant: "destructive",
      });
      return;
    }
    shareWithUserMutation.mutate();
  };

  const handleShareWithDepartment = () => {
    if (!selectedDepartmentId) {
      toast({
        title: "Please select a department",
        variant: "destructive",
      });
      return;
    }
    shareWithDepartmentMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share Document</DialogTitle>
          <DialogDescription>
            Share "{documentName}" with specific users or departments
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Existing Permissions */}
          {documentPermissions.length > 0 && (
            <div>
              <Label className="text-sm font-medium">Current Access</Label>
              <div className="mt-2 space-y-2">
                {documentPermissions.map((perm: any) => (
                  <div key={perm.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                    <div className="flex items-center space-x-2">
                      {perm.userId ? (
                        <>
                          <Users className="w-4 h-4 text-blue-500" />
                          <span className="text-sm">
                            {users.find((u: any) => u.id === perm.userId)?.firstName || "Unknown User"}
                          </span>
                        </>
                      ) : (
                        <>
                          <Building className="w-4 h-4 text-green-500" />
                          <span className="text-sm">
                            {departments.find((d: any) => d.id === perm.departmentId)?.name || "Unknown Department"}
                          </span>
                        </>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {perm.permission}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Share Options */}
          <Tabs defaultValue="user" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="user">
                <Users className="w-4 h-4 mr-2" />
                Share with User
              </TabsTrigger>
              <TabsTrigger value="department">
                <Building className="w-4 h-4 mr-2" />
                Share with Department
              </TabsTrigger>
            </TabsList>

            <TabsContent value="user" className="space-y-4">
              <div>
                <Label>Select User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a user to share with" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user: any) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.firstName} {user.lastName} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Permission Level</Label>
                <Select value={userPermission} onValueChange={setUserPermission}>
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

              <Button 
                onClick={handleShareWithUser}
                disabled={shareWithUserMutation.isPending || !selectedUserId}
                className="w-full"
              >
                {shareWithUserMutation.isPending ? "Sharing..." : "Share with User"}
              </Button>
            </TabsContent>

            <TabsContent value="department" className="space-y-4">
              <div>
                <Label>Select Department</Label>
                <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a department to share with" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept: any) => (
                      <SelectItem key={dept.id} value={dept.id.toString()}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Permission Level</Label>
                <Select value={departmentPermission} onValueChange={setDepartmentPermission}>
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

              <Button 
                onClick={handleShareWithDepartment}
                disabled={shareWithDepartmentMutation.isPending || !selectedDepartmentId}
                className="w-full"
              >
                {shareWithDepartmentMutation.isPending ? "Sharing..." : "Share with Department"}
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}