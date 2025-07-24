import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Link } from "wouter";
import { 
  Plus, 
  Settings, 
  MessageSquare,
  Check,
  X,
  ExternalLink,
  Zap,
  Users,
  Bot,
  ArrowLeft,
  Smartphone,
  MessageCircle,
  Video,
  Copy,
  Globe,
  LinkIcon
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import Sidebar from "@/components/Sidebar";

// WebhookUrlDisplay component for showing webhook URLs
function WebhookUrlDisplay({ integrationId }: { integrationId: number }) {
  const { toast } = useToast();
  
  const { data: webhookData } = useQuery({
    queryKey: [`/api/social-integrations/${integrationId}/webhook-url`],
    retry: false,
  });

  const copyToClipboard = (url: string, label: string) => {
    navigator.clipboard.writeText(url).then(() => {
      toast({
        title: "Copied to clipboard",
        description: `${label} webhook URL copied successfully`,
        duration: 2000,
      });
    });
  };

  if (!webhookData) return null;

  return (
    <div className="space-y-2 px-2">
      {/* Primary Webhook URL */}
      <div className="flex items-center justify-between text-xs bg-blue-50 dark:bg-blue-950 p-2 rounded">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Globe className="w-3 h-3 text-blue-600 flex-shrink-0" />
          <span className="font-medium text-blue-700 dark:text-blue-300">Webhook URL:</span>
          <code className="text-blue-800 dark:text-blue-200 bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded text-xs truncate">
            {webhookData.webhookUrl}
          </code>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
          onClick={() => copyToClipboard(webhookData.webhookUrl, "Primary")}
        >
          <Copy className="w-3 h-3" />
        </Button>
      </div>
      
      {/* Legacy Webhook URL */}
      {webhookData.legacyWebhookUrl && (
        <div className="flex items-center justify-between text-xs bg-orange-50 dark:bg-orange-950 p-2 rounded">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <LinkIcon className="w-3 h-3 text-orange-600 flex-shrink-0" />
            <span className="font-medium text-orange-700 dark:text-orange-300">Legacy URL:</span>
            <code className="text-orange-800 dark:text-orange-200 bg-orange-100 dark:bg-orange-900 px-1 py-0.5 rounded text-xs truncate">
              {webhookData.legacyWebhookUrl}
            </code>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-orange-600 hover:text-orange-800"
            onClick={() => copyToClipboard(webhookData.legacyWebhookUrl, "Legacy")}
          >
            <Copy className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

interface SocialIntegration {
  id: number;
  name: string;
  type: 'lineoa' | 'facebook' | 'tiktok';
  channelId?: string;
  channelSecret?: string;
  channelAccessToken?: string;
  botUserId?: string;
  isActive: boolean;
  isVerified: boolean;
  agentId?: number;
  agentName?: string;
  createdAt: string;
  updatedAt: string;
}

interface AgentChatbot {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
}

export default function Integrations() {
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);
  const [lineOaDialogOpen, setLineOaDialogOpen] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<SocialIntegration | null>(null);
  
  // Form states for Line OA
  const [lineOaForm, setLineOaForm] = useState({
    name: "",
    channelId: "",
    channelSecret: "",
    channelAccessToken: "",
    agentId: "",
    description: ""
  });

  // Fetch social integrations
  const { data: integrations = [], isLoading: integrationsLoading } = useQuery({
    queryKey: ['/api/social-integrations'],
    enabled: isAuthenticated,
    retry: false,
  }) as { data: SocialIntegration[], isLoading: boolean };

  // Fetch agent chatbots for selection
  const { data: agents = [] } = useQuery({
    queryKey: ['/api/agent-chatbots'],
    enabled: isAuthenticated,
    retry: false,
  }) as { data: AgentChatbot[] };

  // Create Line OA integration mutation
  const createLineOaMutation = useMutation({
    mutationFn: async (data: typeof lineOaForm) => {
      return await apiRequest("POST", "/api/social-integrations/lineoa", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Line OA integration created successfully!",
      });
      setLineOaDialogOpen(false);
      setLineOaForm({ name: "", channelId: "", channelSecret: "", channelAccessToken: "", agentId: "", description: "" });
      queryClient.invalidateQueries({ queryKey: ['/api/social-integrations'] });
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
        description: "Failed to create Line OA integration",
        variant: "destructive",
      });
    },
  });

  // Verify Line OA connection mutation
  const verifyLineOaMutation = useMutation({
    mutationFn: async (data: { channelId: string; channelSecret: string; channelAccessToken?: string }) => {
      console.log("🔍 Frontend: Sending verification request", data);
      const response = await apiRequest("POST", "/api/social-integrations/lineoa/verify", data);
      const result = await response.json();
      console.log("📨 Frontend: Received response", result);
      return result;
    },
    onSuccess: (result: any) => {
      console.log("✅ Frontend: Verification result", result);
      
      // Check if result has success property
      if (result && result.success === true) {
        toast({
          title: "การตรวจสอบสำเร็จ",
          description: result.message || "การเชื่อมต่อ Line OA ได้รับการตรวจสอบเรียบร้อยแล้ว",
        });
      } else {
        console.log("❌ Frontend: Verification failed", result);
        toast({
          title: "การตรวจสอบล้มเหลว",
          description: result?.message || "ไม่สามารถตรวจสอบการเชื่อมต่อ Line OA ได้",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      console.error("💥 Frontend: Verification error", error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถตรวจสอบการเชื่อมต่อ Line OA ได้",
        variant: "destructive",
      });
    },
  });

  const handleVerifyLineOa = () => {
    if (!lineOaForm.channelId || !lineOaForm.channelSecret) {
      toast({
        title: "Missing Information",
        description: "Please enter both Channel ID and Channel Secret",
        variant: "destructive",
      });
      return;
    }
    
    verifyLineOaMutation.mutate({
      channelId: lineOaForm.channelId,
      channelSecret: lineOaForm.channelSecret,
      channelAccessToken: lineOaForm.channelAccessToken
    });
  };

  const handleCreateLineOa = () => {
    if (!lineOaForm.name || !lineOaForm.channelId || !lineOaForm.channelSecret || !lineOaForm.agentId) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    createLineOaMutation.mutate(lineOaForm);
  };

  // Verify integration mutation
  const verifyIntegrationMutation = useMutation({
    mutationFn: async (integration: SocialIntegration) => {
      if (integration.type === 'lineoa') {
        return await apiRequest("POST", "/api/social-integrations/lineoa/verify", {
          channelId: integration.channelId,
          channelSecret: integration.channelSecret,
          channelAccessToken: integration.channelAccessToken,
          integrationId: integration.id // Include integration ID for database update
        });
      }
      throw new Error('Unsupported integration type');
    },
    onSuccess: (response, integration) => {
      toast({
        title: "Verification Successful",
        description: `${integration.name} has been verified successfully!`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/social-integrations'] });
    },
    onError: (error, integration) => {
      toast({
        title: "Verification Failed",
        description: `Failed to verify ${integration.name}. Please check your credentials.`,
        variant: "destructive",
      });
    },
  });

  const handleVerifyIntegration = (integration: SocialIntegration) => {
    verifyIntegrationMutation.mutate(integration);
  };

  const socialPlatforms = [
    {
      id: 'lineoa',
      name: 'LINE Official Account',
      description: 'Connect with customers through LINE messaging platform',
      icon: MessageCircle,
      color: 'bg-green-500',
      available: true,
      comingSoon: false
    },
    {
      id: 'facebook',
      name: 'Facebook Messenger',
      description: 'Integrate with Facebook Messenger for customer support',
      icon: MessageSquare,
      color: 'bg-blue-500',
      available: false,
      comingSoon: true
    },
    {
      id: 'instagram',
      name: 'Instagram',
      description: 'Connect with customers through Instagram Direct Messages',
      icon: Smartphone,
      color: 'bg-gradient-to-r from-purple-500 to-pink-500',
      available: false,
      comingSoon: true
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      description: 'Integrate with WhatsApp Business API for customer messaging',
      icon: MessageCircle,
      color: 'bg-green-600',
      available: false,
      comingSoon: true
    },
    {
      id: 'slack',
      name: 'Slack',
      description: 'Connect with Slack workspaces for internal communications',
      icon: MessageSquare,
      color: 'bg-purple-600',
      available: false,
      comingSoon: true
    },
    {
      id: 'teams',
      name: 'Microsoft Teams',
      description: 'Integrate with Microsoft Teams for enterprise communication',
      icon: Users,
      color: 'bg-blue-600',
      available: false,
      comingSoon: true
    },
    {
      id: 'discord',
      name: 'Discord',
      description: 'Connect with Discord servers for community support',
      icon: MessageSquare,
      color: 'bg-indigo-600',
      available: false,
      comingSoon: true
    }
  ];

  const lineOaIntegrations = integrations.filter(int => int.type === 'lineoa');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="flex">
        <Sidebar />
        <main className="flex-1 ml-64">
          <div className="p-8">
            <div className="max-w-6xl mx-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                    Social Media Integrations
                  </h1>
                  <p className="text-slate-600 dark:text-slate-400 mt-2">
                    Connect your AI agents with social media platforms to provide automated customer support
                  </p>
                </div>
                <Link href="/data-connections">
                  <Button variant="outline" className="flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Data Connections
                  </Button>
                </Link>
              </div>

              {/* Social Media Platforms Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {socialPlatforms.map((platform) => {
                  const Icon = platform.icon;
                  const existingIntegrations = integrations.filter(int => int.type === platform.id);
                  
                  return (
                    <Card key={platform.id} className="relative overflow-hidden">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className={`p-3 rounded-lg ${platform.color} text-white`}>
                            <Icon className="w-6 h-6" />
                          </div>
                          {platform.comingSoon && (
                            <Badge variant="secondary">Coming Soon</Badge>
                          )}
                          {existingIntegrations.length > 0 && (
                            <Badge variant="default" className="bg-green-500">
                              {existingIntegrations.length} Connected
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-lg">{platform.name}</CardTitle>
                        <CardDescription>
                          {platform.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {platform.available ? (
                          <div className="space-y-3">
                            {existingIntegrations.length > 0 && (
                              <div className="space-y-2">
                                {existingIntegrations.slice(0, 2).map((integration) => (
                                  <div key={integration.id} className="space-y-2">
                                    <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded">
                                      <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${integration.isVerified ? 'bg-green-500' : 'bg-orange-500'}`} />
                                        <span className="text-sm font-medium">{integration.name}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {!integration.isVerified && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-xs h-6"
                                            onClick={() => handleVerifyIntegration(integration)}
                                          >
                                            <Check className="w-3 h-3 mr-1" />
                                            Verify
                                          </Button>
                                        )}
                                        <Badge variant="outline" className="text-xs">
                                          {integration.agentName || 'No Agent'}
                                        </Badge>
                                      </div>
                                    </div>
                                    <WebhookUrlDisplay integrationId={integration.id} />
                                  </div>
                                ))}
                                {existingIntegrations.length > 2 && (
                                  <div className="text-xs text-slate-500 text-center">
                                    +{existingIntegrations.length - 2} more
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {platform.id === 'lineoa' && (
                              <Dialog open={lineOaDialogOpen} onOpenChange={setLineOaDialogOpen}>
                                <DialogTrigger asChild>
                                  <Button className="w-full" size="sm">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Line OA
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl">
                                  <DialogHeader>
                                    <DialogTitle>Create Line OA Integration</DialogTitle>
                                    <DialogDescription>
                                      Connect your Line Official Account to enable AI-powered customer support
                                    </DialogDescription>
                                  </DialogHeader>
                                  
                                  <div className="space-y-6">
                                    {/* Basic Information */}
                                    <div className="space-y-4">
                                      <div>
                                        <Label htmlFor="name">Integration Name *</Label>
                                        <Input
                                          id="name"
                                          placeholder="e.g., Customer Support Bot"
                                          value={lineOaForm.name}
                                          onChange={(e) => setLineOaForm(prev => ({ ...prev, name: e.target.value }))}
                                        />
                                      </div>
                                      
                                      <div>
                                        <Label htmlFor="description">Description</Label>
                                        <Textarea
                                          id="description"
                                          placeholder="Optional description for this integration"
                                          value={lineOaForm.description}
                                          onChange={(e) => setLineOaForm(prev => ({ ...prev, description: e.target.value }))}
                                        />
                                      </div>
                                    </div>

                                    <Separator />

                                    {/* Line OA Configuration */}
                                    <div className="space-y-4">
                                      <h4 className="text-sm font-medium text-slate-900 dark:text-white">
                                        Line OA Configuration
                                      </h4>
                                      
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                          <Label htmlFor="channelId">Channel ID *</Label>
                                          <Input
                                            id="channelId"
                                            placeholder="Enter your Line OA Channel ID"
                                            value={lineOaForm.channelId}
                                            onChange={(e) => setLineOaForm(prev => ({ ...prev, channelId: e.target.value }))}
                                          />
                                        </div>
                                        
                                        <div>
                                          <Label htmlFor="channelSecret">Channel Secret *</Label>
                                          <Input
                                            id="channelSecret"
                                            type="password"
                                            placeholder="Enter your Line OA Channel Secret"
                                            value={lineOaForm.channelSecret}
                                            onChange={(e) => setLineOaForm(prev => ({ ...prev, channelSecret: e.target.value }))}
                                          />
                                        </div>
                                        
                                        <div>
                                          <Label htmlFor="channelAccessToken">Channel Access Token *</Label>
                                          <Input
                                            id="channelAccessToken"
                                            type="password"
                                            placeholder="Enter your Line OA Channel Access Token"
                                            value={lineOaForm.channelAccessToken || ''}
                                            onChange={(e) => setLineOaForm(prev => ({ ...prev, channelAccessToken: e.target.value }))}
                                          />
                                          <p className="text-xs text-slate-500 mt-1">
                                            Required for sending messages back to Line users
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          onClick={handleVerifyLineOa}
                                          disabled={verifyLineOaMutation.isPending || !lineOaForm.channelId || !lineOaForm.channelSecret}
                                        >
                                          {verifyLineOaMutation.isPending ? (
                                            <>
                                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-400 mr-2"></div>
                                              Verifying...
                                            </>
                                          ) : (
                                            <>
                                              <Check className="w-4 h-4 mr-2" />
                                              Verify Connection
                                            </>
                                          )}
                                        </Button>
                                      </div>
                                    </div>

                                    <Separator />

                                    {/* Agent Selection */}
                                    <div className="space-y-4">
                                      <h4 className="text-sm font-medium text-slate-900 dark:text-white">
                                        Select AI Agent
                                      </h4>
                                      
                                      <div>
                                        <Label htmlFor="agentId">Choose Agent Bot *</Label>
                                        <Select
                                          value={lineOaForm.agentId}
                                          onValueChange={(value) => setLineOaForm(prev => ({ ...prev, agentId: value }))}
                                        >
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select an agent to handle Line OA conversations" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {agents.filter(agent => agent.isActive).map((agent) => (
                                              <SelectItem key={agent.id} value={agent.id.toString()}>
                                                <div className="flex items-center gap-2">
                                                  <Bot className="w-4 h-4" />
                                                  <div className="flex flex-col">
                                                    <span className="font-medium">{agent.name}</span>
                                                    {agent.description && (
                                                      <span className="text-xs text-slate-500">{agent.description}</span>
                                                    )}
                                                  </div>
                                                </div>
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        {agents.length === 0 && (
                                          <p className="text-xs text-slate-500 mt-1">
                                            No active agents found. <Link href="/create-agent-chatbot" className="text-blue-600 hover:underline">Create an agent first</Link>.
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex justify-end gap-3 pt-4 border-t">
                                      <Button
                                        variant="outline"
                                        onClick={() => {
                                          setLineOaDialogOpen(false);
                                          setLineOaForm({ name: "", channelId: "", channelSecret: "", channelAccessToken: "", agentId: "", description: "" });
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        onClick={handleCreateLineOa}
                                        disabled={createLineOaMutation.isPending}
                                        className="bg-green-600 hover:bg-green-700"
                                      >
                                        {createLineOaMutation.isPending ? (
                                          <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                            Creating...
                                          </>
                                        ) : (
                                          <>
                                            <Smartphone className="w-4 h-4 mr-2" />
                                            Create Integration
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                            
                            {platform.id !== 'lineoa' && (
                              <Button disabled className="w-full" size="sm" variant="outline">
                                Coming Soon
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Button disabled className="w-full" size="sm" variant="outline">
                            Coming Soon
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Existing Line OA Integrations */}
              {lineOaIntegrations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageCircle className="w-5 h-5 text-green-600" />
                      Line OA Integrations
                    </CardTitle>
                    <CardDescription>
                      Manage your existing Line Official Account integrations
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {lineOaIntegrations.map((integration) => (
                        <div key={integration.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${integration.isVerified ? 'bg-green-500' : 'bg-orange-500'}`} />
                            <div>
                              <h4 className="font-medium">{integration.name}</h4>
                              <div className="flex items-center gap-4 text-sm text-slate-500">
                                <span>Channel ID: {integration.channelId}</span>
                                <span>Agent: {integration.agentName || 'Not assigned'}</span>
                                <span>Status: {integration.isActive ? 'Active' : 'Inactive'}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={integration.isVerified ? "default" : "secondary"}>
                              {integration.isVerified ? "Verified" : "Unverified"}
                            </Badge>
                            <Button variant="outline" size="sm">
                              <Settings className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}