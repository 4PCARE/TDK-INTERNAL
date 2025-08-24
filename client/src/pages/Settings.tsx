import { useState, useEffect } from "react";
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
  RefreshCw,
  Bot,
  Zap
} from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

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

interface LLMConfig {
  provider: string;
  embeddingProvider: string;
  openAIConfig?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  geminiConfig?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

export default function Settings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'profile' | 'system' | 'security' | 'llm'>('profile');
  
  // LLM provider states - moved to component level to fix hooks violation
  const [currentProvider, setCurrentProvider] = useState<string>("");
  const [currentEmbeddingProvider, setCurrentEmbeddingProvider] = useState<string>("");

  const { data: userProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
  }) as { data: UserProfile | undefined; isLoading: boolean };

  const { data: systemSettings, isLoading: systemLoading } = useQuery({
    queryKey: ["/api/admin/settings"],
    enabled: user?.role === 'admin',
  }) as { data: SystemSettings | undefined; isLoading: boolean };

  const { data: llmConfig, isLoading: llmLoading } = useQuery({
    queryKey: ["/api/llm/config"],
    enabled: !!user,
  }) as { data: LLMConfig | undefined; isLoading: boolean };

  // Update provider states when llmConfig changes
  useEffect(() => {
    if (llmConfig) {
      setCurrentProvider(llmConfig.provider || "OpenAI");
      setCurrentEmbeddingProvider(llmConfig.embeddingProvider || "OpenAI");
    }
  }, [llmConfig]);

  const { data: documents } = useQuery({
    queryKey: ["/api/documents"],
    enabled: !!user,
  });

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

  const [revectorizeProgress, setRevectorizeProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [revectorizeController, setRevectorizeController] = useState<AbortController | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [hasConfigChanged, setHasConfigChanged] = useState(false);
  const [hasForceVectorized, setHasForceVectorized] = useState(false);

  const revectorizeAllMutation = useMutation({
    mutationFn: async ({ preserveExistingEmbeddings }: { preserveExistingEmbeddings: boolean }) => {
      // Reset progress
      setRevectorizeProgress({ current: 0, total: 0, percentage: 0 });
      
      // Create abort controller for cancellation
      const controller = new AbortController();
      setRevectorizeController(controller);

      const response = await fetch("/api/documents/vectorize-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preserveExistingEmbeddings }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Failed to re-vectorize documents");
      return response.json();
    },
    onSuccess: (data) => {
      setRevectorizeProgress({ current: data.vectorizedCount, total: data.vectorizedCount, percentage: 100 });
      setRevectorizeController(null);
      setHasForceVectorized(true);
      toast({
        title: "Re-vectorization Complete",
        description: `Successfully processed ${data.vectorizedCount} documents with the new embedding provider.`,
      });
    },
    onError: (error: any) => {
      setRevectorizeProgress({ current: 0, total: 0, percentage: 0 });
      setRevectorizeController(null);
      
      if (error.name === 'AbortError') {
        toast({
          title: "Re-vectorization Cancelled",
          description: "Process was stopped by user. Use 'Revert Changes' to restore previous embeddings.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Re-vectorization Failed",
          description: error.message || "Failed to re-vectorize documents",
          variant: "destructive",
        });
      }
    },
  });

  const stopRevectorization = () => {
    if (revectorizeController) {
      revectorizeController.abort();
      setRevectorizeController(null);
      revectorizeAllMutation.reset();
    }
  };

  const revertChangesMutation = useMutation({
    mutationFn: async () => {
      setIsReverting(true);
      const response = await fetch("/api/documents/revert-vectorization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to revert changes");
      return response.json();
    },
    onSuccess: (data) => {
      setIsReverting(false);
      toast({
        title: "Changes Reverted",
        description: `Successfully restored previous embeddings for ${data.revertedCount} documents.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/llm/config"] });
    },
    onError: (error: any) => {
      setIsReverting(false);
      toast({
        title: "Revert Failed",
        description: error.message || "Failed to revert changes",
        variant: "destructive",
      });
    },
  });

  // Simulate progress tracking during re-vectorization
  useEffect(() => {
    if (revectorizeAllMutation.isPending) {
      // Get estimated total documents for progress calculation
      const estimatedTotal = (documents as any)?.length || 100;
      setRevectorizeProgress(prev => ({ ...prev, total: estimatedTotal }));

      // Simulate progress updates every 500ms
      const progressInterval = setInterval(() => {
        setRevectorizeProgress(prev => {
          if (prev.current >= prev.total) {
            clearInterval(progressInterval);
            return prev;
          }
          
          const newCurrent = Math.min(prev.current + 1, prev.total);
          const newPercentage = Math.round((newCurrent / prev.total) * 100);
          
          return {
            current: newCurrent,
            total: prev.total,
            percentage: newPercentage
          };
        });
      }, 500);

      return () => clearInterval(progressInterval);
    }
  }, [revectorizeAllMutation.isPending, documents]);

  const updateLlmMutation = useMutation({
    mutationFn: async (config: any) => {
      const response = await fetch("/api/llm/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error("Failed to update LLM configuration");
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/llm/config"] });

      // Check if embedding provider changed
      const currentEmbeddingProvider = llmConfig?.embeddingProvider;
      const newEmbeddingProvider = variables.embeddingProvider;

      if (currentEmbeddingProvider && currentEmbeddingProvider !== newEmbeddingProvider) {
        setHasConfigChanged(true);
        toast({
          title: "Configuration Updated",
          description: "LLM configuration saved. Starting re-vectorization with new embedding provider...",
        });

        // Automatically trigger re-vectorization with preserve mode
        revectorizeAllMutation.mutate({ preserveExistingEmbeddings: true });
      } else {
        toast({
          title: "Configuration Updated",
          description: "LLM configuration has been saved successfully.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update LLM configuration",
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

  const handleLlmSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const newProvider = formData.get("provider") as string;
    const newEmbeddingProvider = formData.get("embeddingProvider") as string;
    
    // Check if provider changed
    const providerChanged = llmConfig?.provider !== newProvider || llmConfig?.embeddingProvider !== newEmbeddingProvider;
    if (providerChanged) {
      setHasConfigChanged(true);
    }

    const llmData = {
      provider: newProvider,
      embeddingProvider: newEmbeddingProvider,
      openAIConfig: {
        model: formData.get("openaiModel") as string,
        temperature: parseFloat(formData.get("openaiTemperature") as string),
        maxTokens: parseInt(formData.get("openaiMaxTokens") as string),
      },
      geminiConfig: {
        model: formData.get("geminiModel") as string,
        temperature: parseFloat(formData.get("geminiTemperature") as string),
        maxTokens: parseInt(formData.get("geminiMaxTokens") as string),
      },
    };

    updateLlmMutation.mutate(llmData);
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
          <TabButton
            id="llm"
            icon={Bot}
            label="LLM Provider"
            isActive={activeTab === 'llm'}
            onClick={() => setActiveTab('llm')}
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

        {activeTab === 'llm' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Bot className="w-5 h-5" />
                <span>LLM Provider Configuration</span>
              </CardTitle>
              <p className="text-sm text-gray-600 mt-2">
                Configure which LLM provider to use for chat and document embeddings. 
                Changing providers will require re-embedding all documents.
              </p>
            </CardHeader>
            <CardContent>
              {llmLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <form onSubmit={handleLlmSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="provider">Chat Provider</Label>
                      <Select 
                        name="provider" 
                        value={currentProvider}
                        onValueChange={(value) => setCurrentProvider(value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select chat provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OpenAI">OpenAI (GPT-4)</SelectItem>
                          <SelectItem value="Gemini">Google Gemini</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">Provider for AI chat responses</p>
                    </div>

                    <div>
                      <Label htmlFor="embeddingProvider">Embedding Provider</Label>
                      <Select 
                        name="embeddingProvider" 
                        value={currentEmbeddingProvider}
                        onValueChange={(value) => setCurrentEmbeddingProvider(value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select embedding provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OpenAI">OpenAI Embeddings</SelectItem>
                          <SelectItem value="Gemini">Google Gemini Embeddings</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">Provider for document embeddings and search</p>
                    </div>
                  </div>

                    <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Zap className="w-4 h-4 text-blue-600" />
                        <h4 className="font-medium text-blue-800">Provider Status</h4>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>OpenAI:</span>
                          <Badge variant="outline" className="text-green-700 border-green-300">
                            Available
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span>Gemini:</span>
                          <Badge variant="outline" className="text-green-700 border-green-300">
                            Available
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {/* Show OpenAI Configuration only if OpenAI is selected as chat provider */}
                  {currentProvider === "OpenAI" && (
                    <div className="space-y-4">
                      <h4 className="font-medium text-gray-900">OpenAI Settings</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label htmlFor="openaiModel">Model</Label>
                          <Select name="openaiModel" defaultValue={llmConfig?.openAIConfig?.model || "gpt-4o"}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="gpt-4o">GPT-4o (Latest)</SelectItem>
                              <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                              <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="openaiTemperature">Temperature</Label>
                          <Input
                            name="openaiTemperature"
                            type="number"
                            step="0.1"
                            min="0"
                            max="2"
                            defaultValue={llmConfig?.openAIConfig?.temperature || 0.7}
                          />
                        </div>
                        <div>
                          <Label htmlFor="openaiMaxTokens">Max Tokens</Label>
                          <Input
                            name="openaiMaxTokens"
                            type="number"
                            min="100"
                            max="8000"
                            defaultValue={llmConfig?.openAIConfig?.maxTokens || 4000}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Show Gemini Configuration only if Gemini is selected as chat provider */}
                  {currentProvider === "Gemini" && (
                    <div className="space-y-4">
                      <h4 className="font-medium text-gray-900">Gemini Settings</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label htmlFor="geminiModel">Model</Label>
                          <Select name="geminiModel" defaultValue={llmConfig?.geminiConfig?.model || "gemini-2.5-flash"}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                              <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                              <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="geminiTemperature">Temperature</Label>
                          <Input
                            name="geminiTemperature"
                            type="number"
                            step="0.1"
                            min="0"
                            max="2"
                            defaultValue={llmConfig?.geminiConfig?.temperature || 0.7}
                          />
                        </div>
                        <div>
                          <Label htmlFor="geminiMaxTokens">Max Tokens</Label>
                          <Input
                            name="geminiMaxTokens"
                            type="number"
                            min="100"
                            max="8000"
                            defaultValue={llmConfig?.geminiConfig?.maxTokens || 4000}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-medium text-yellow-800 mb-2">Important Notice</h4>
                    <p className="text-sm text-yellow-700 mb-2">
                      Changing the embedding provider will invalidate existing document embeddings. 
                      All documents will need to be re-embedded with the new provider for search to work properly.
                    </p>
                    <p className="text-sm text-yellow-700">
                      Use the "Force Re-vectorize All" button to immediately re-process all documents with the current embedding provider, 
                      replacing all existing embeddings.
                    </p>
                  </div>

                  {/* Progress Bar for Re-vectorization */}
                  {revectorizeAllMutation.isPending && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-blue-800">Re-vectorizing Documents</h4>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-blue-600 font-medium">
                            {revectorizeProgress.percentage}%
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={stopRevectorization}
                            className="text-red-600 border-red-300 hover:bg-red-50"
                          >
                            Stop
                          </Button>
                        </div>
                      </div>
                      <Progress value={revectorizeProgress.percentage} className="h-3" />
                      <p className="text-sm text-blue-700">
                        Processing {revectorizeProgress.current} of {revectorizeProgress.total} documents with new embedding provider...
                      </p>
                    </div>
                  )}

                  {/* Revert Changes Section - Only show if config has changed or force vectorization occurred */}
                  {!revectorizeAllMutation.isPending && revectorizeController === null && (hasConfigChanged || hasForceVectorized) && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-orange-800 mb-1">Revert Changes</h4>
                          <p className="text-sm text-orange-700">
                            If re-vectorization was incomplete or caused issues, you can revert to previous embeddings.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            revertChangesMutation.mutate();
                            setHasConfigChanged(false);
                            setHasForceVectorized(false);
                          }}
                          disabled={isReverting}
                          className="text-orange-600 border-orange-300 hover:bg-orange-50"
                        >
                          {isReverting ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              <span>Reverting...</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              <span>Revert Changes</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={() => revectorizeAllMutation.mutate({ preserveExistingEmbeddings: false })}
                      disabled={updateLlmMutation.isPending || revectorizeAllMutation.isPending || isReverting}
                      className="flex items-center space-x-2 text-orange-600 border-orange-300 hover:bg-orange-50"
                    >
                      {revectorizeAllMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Force Re-vectorizing...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          <span>Force Re-vectorize All</span>
                        </>
                      )}
                    </Button>

                    <Button 
                      type="submit" 
                      disabled={updateLlmMutation.isPending || revectorizeAllMutation.isPending || isReverting}
                      className="flex items-center space-x-2"
                    >
                      {updateLlmMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Saving Configuration...</span>
                        </>
                      ) : revectorizeAllMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Re-vectorizing Documents...</span>
                        </>
                      ) : isReverting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Reverting Changes...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Save Configuration</span>
                        </>
                      )}
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