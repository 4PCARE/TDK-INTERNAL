import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { 
  Save, 
  Settings as SettingsIcon, 
  User, 
  Bell, 
  Database,
  Shield,
  Trash2,
  RefreshCw
} from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  name?: string;
  department?: string;
  role: string;
  preferences?: {
    notifications?: boolean;
    emailUpdates?: boolean;
    theme?: string;
  };
}

interface SystemSettings {
  maxFileSize: number;
  allowedFileTypes: string[];
  retentionDays: number;
  autoBackup: boolean;
  enableAnalytics: boolean;
}

export default function Settings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'profile' | 'system' | 'security'>('profile');

  const { data: userProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
  }) as { data: UserProfile | undefined; isLoading: boolean };

  const { data: systemSettings, isLoading: systemLoading } = useQuery({
    queryKey: ["/api/admin/settings"],
    enabled: user?.role === 'admin',
  }) as { data: SystemSettings | undefined; isLoading: boolean };

  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<UserProfile>) => {
      const response = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to update profile");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateSystemMutation = useMutation({
    mutationFn: async (data: Partial<SystemSettings>) => {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to update system settings");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings Updated",
        description: "System settings have been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update system settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleProfileSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const profileData = {
      name: formData.get("name") as string,
      department: formData.get("department") as string,
      preferences: {
        notifications: formData.get("notifications") === "on",
        emailUpdates: formData.get("emailUpdates") === "on",
        theme: formData.get("theme") as string,
      },
    };

    updateProfileMutation.mutate(profileData);
  };

  const handleSystemSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const systemData = {
      maxFileSize: parseInt(formData.get("maxFileSize") as string),
      allowedFileTypes: (formData.get("allowedFileTypes") as string).split(",").map(t => t.trim()),
      retentionDays: parseInt(formData.get("retentionDays") as string),
      autoBackup: formData.get("autoBackup") === "on",
      enableAnalytics: formData.get("enableAnalytics") === "on",
    };

    updateSystemMutation.mutate(systemData);
  };

  const TabButton = ({ id, icon: Icon, label, isActive, onClick }: {
    id: string;
    icon: any;
    label: string;
    isActive: boolean;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
        isActive 
          ? 'bg-blue-100 text-blue-700 border border-blue-200' 
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
            <SettingsIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600">Manage your account and system preferences</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-2 border-b border-gray-200 pb-4">
          <TabButton
            id="profile"
            icon={User}
            label="Profile"
            isActive={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
          />
          {user?.role === 'admin' && (
            <>
              <TabButton
                id="system"
                icon={Database}
                label="System"
                isActive={activeTab === 'system'}
                onClick={() => setActiveTab('system')}
              />
              <TabButton
                id="security"
                icon={Shield}
                label="Security"
                isActive={activeTab === 'security'}
                onClick={() => setActiveTab('security')}
              />
            </>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'profile' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="w-5 h-5" />
                <span>User Profile</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {profileLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <form onSubmit={handleProfileSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={userProfile?.email || ''}
                        disabled
                        className="bg-gray-50"
                      />
                      <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                    </div>

                    <div>
                      <Label htmlFor="role">Role</Label>
                      <div className="pt-2">
                        <Badge variant={userProfile?.role === 'admin' ? 'default' : 'secondary'}>
                          {userProfile?.role}
                        </Badge>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="name">Display Name</Label>
                      <Input
                        id="name"
                        name="name"
                        defaultValue={userProfile?.name || ''}
                        placeholder="Enter your display name"
                      />
                    </div>

                    <div>
                      <Label htmlFor="department">Department</Label>
                      <Input
                        id="department"
                        name="department"
                        defaultValue={userProfile?.department || ''}
                        placeholder="Enter your department"
                      />
                    </div>
                  </div>

                  <div className="border-t pt-6">
                    <h3 className="text-lg font-medium mb-4 flex items-center space-x-2">
                      <Bell className="w-5 h-5" />
                      <span>Notification Preferences</span>
                    </h3>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="notifications">Push Notifications</Label>
                          <p className="text-sm text-gray-500">Receive in-app notifications</p>
                        </div>
                        <Switch
                          id="notifications"
                          name="notifications"
                          defaultChecked={userProfile?.preferences?.notifications}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="emailUpdates">Email Updates</Label>
                          <p className="text-sm text-gray-500">Receive email notifications</p>
                        </div>
                        <Switch
                          id="emailUpdates"
                          name="emailUpdates"
                          defaultChecked={userProfile?.preferences?.emailUpdates}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={updateProfileMutation.isPending}
                      className="flex items-center space-x-2"
                    >
                      {updateProfileMutation.isPending ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      <span>Save Changes</span>
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'system' && user?.role === 'admin' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Database className="w-5 h-5" />
                <span>System Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {systemLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <form onSubmit={handleSystemSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="maxFileSize">Max File Size (MB)</Label>
                      <Input
                        id="maxFileSize"
                        name="maxFileSize"
                        type="number"
                        defaultValue={systemSettings?.maxFileSize || 10}
                      />
                    </div>

                    <div>
                      <Label htmlFor="retentionDays">Data Retention (Days)</Label>
                      <Input
                        id="retentionDays"
                        name="retentionDays"
                        type="number"
                        defaultValue={systemSettings?.retentionDays || 365}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="allowedFileTypes">Allowed File Types</Label>
                    <Textarea
                      id="allowedFileTypes"
                      name="allowedFileTypes"
                      placeholder="pdf, docx, xlsx, pptx, txt"
                      defaultValue={systemSettings?.allowedFileTypes?.join(", ") || ""}
                      className="min-h-[100px]"
                    />
                    <p className="text-xs text-gray-500 mt-1">Comma-separated list of file extensions</p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="autoBackup">Automatic Backup</Label>
                        <p className="text-sm text-gray-500">Enable automatic daily backups</p>
                      </div>
                      <Switch
                        id="autoBackup"
                        name="autoBackup"
                        defaultChecked={systemSettings?.autoBackup}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="enableAnalytics">Analytics</Label>
                        <p className="text-sm text-gray-500">Enable usage analytics</p>
                      </div>
                      <Switch
                        id="enableAnalytics"
                        name="enableAnalytics"
                        defaultChecked={systemSettings?.enableAnalytics}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={updateSystemMutation.isPending}
                      className="flex items-center space-x-2"
                    >
                      {updateSystemMutation.isPending ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      <span>Save Changes</span>
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'security' && user?.role === 'admin' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="w-5 h-5" />
                <span>Security Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-medium text-yellow-800 mb-2">Security Features</h4>
                  <p className="text-sm text-yellow-700">
                    Advanced security settings will be available in a future update.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Data Management</h4>
                    <Button variant="outline" className="flex items-center space-x-2">
                      <Trash2 className="w-4 h-4" />
                      <span>Clear Cache</span>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}