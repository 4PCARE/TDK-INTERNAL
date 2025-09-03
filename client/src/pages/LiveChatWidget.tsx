import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/Layout/Sidebar";
import TopBar from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  Code,
  Copy,
  Check,
  Settings,
  ExternalLink,
  Plus,
  Trash2,
  Eye
} from "lucide-react";
import DashboardLayout from "@/components/Layout/DashboardLayout";

interface ChatWidget {
  id: number;
  name: string;
  widgetKey: string;
  isActive: boolean;
  agentId: number | null;
  agentName?: string;
  primaryColor: string;
  textColor: string;
  position: string;
  welcomeMessage: string;
  offlineMessage: string;
  enableHrLookup: boolean;
  hrApiEndpoint: string;
  isPlatformWidget: boolean;
  createdAt: string;
}

export default function LiveChatWidget() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedWidget, setSelectedWidget] = useState<ChatWidget | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingWidget, setEditingWidget] = useState<ChatWidget | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isDialogOpen, setDialogOpen] = useState(false);

  // Form state for creating/editing widgets
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    welcomeMessage: "Hi! How can I help you today?",
    primaryColor: "#2563eb",
    textColor: "#ffffff",
    position: "bottom-right",
    enableHrLookup: false,
    hrApiEndpoint: '',
    agentId: null as number | null,
  });

  // Get chat widgets
  const { data: widgets, isLoading: widgetsLoading } = useQuery({
    queryKey: ["/api/chat-widgets"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Get available agents
  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ["/api/agent-chatbots"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Create widget mutation
  const createWidgetMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("/api/chat-widgets", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-widgets"] });
      toast({
        title: "Widget created",
        description: "Your chat widget has been created successfully.",
      });
      setIsCreating(false);
      setFormData({
        name: "",
        welcomeMessage: "Hi! How can I help you today?",
        position: "bottom-right",
        primaryColor: "#2563eb",
        textColor: "#ffffff",
        enableHrLookup: false,
        hrApiEndpoint: '',
        agentId: null
      });
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create widget.",
        variant: "destructive",
      });
    },
  });

  // Update widget mutation
  const updateWidgetMutation = useMutation({
    mutationFn: async (data: { id: number } & typeof formData) => {
      const { id, ...updateData } = data;
      return await apiRequest("PUT", `/api/chat-widgets/${id}`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-widgets"] });
      toast({
        title: "Widget updated",
        description: "Your chat widget has been updated successfully.",
      });
      setEditingWidget(null);
      setFormData({
        name: "",
        welcomeMessage: "Hi! How can I help you today?",
        position: "bottom-right",
        primaryColor: "#2563eb",
        textColor: "#ffffff",
        enableHrLookup: false,
        hrApiEndpoint: '',
        agentId: null
      });
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update widget.",
        variant: "destructive",
      });
    },
  });

  // Delete widget mutation
  const deleteWidgetMutation = useMutation({
    mutationFn: async (widgetId: number) => {
      return await apiRequest("DELETE", `/api/chat-widgets/${widgetId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-widgets"] });
      toast({
        title: "Widget deleted",
        description: "Your chat widget has been deleted successfully.",
      });
      setSelectedWidget(null);
      setEditingWidget(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete widget.",
        variant: "destructive",
      });
    },
  });

  // Toggle widget status mutation
  const toggleWidgetMutation = useMutation({
    mutationFn: async ({ widgetId, isActive }: { widgetId: number; isActive: boolean }) => {
      return await apiRequest("PUT", `/api/chat-widgets/${widgetId}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-widgets"] });
      toast({
        title: "Widget status updated",
        description: "The status of your chat widget has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update widget status.",
        variant: "destructive",
      });
    },
  });

  // Set platform widget mutation
  const setPlatformWidgetMutation = useMutation({
    mutationFn: async (widgetId: number) => {
      return await apiRequest("PUT", `/api/chat-widgets/${widgetId}/set-platform`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-widgets"] });
      toast({
        title: "Platform widget set",
        description: "This widget is now the platform's default widget.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set platform widget.",
        variant: "destructive",
      });
    },
  });

  // Unset platform widget mutation
  const unsetPlatformWidgetMutation = useMutation({
    mutationFn: async (widgetId: number) => {
      return await apiRequest("PUT", `/api/chat-widgets/${widgetId}/unset-platform`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-widgets"] });
      toast({
        title: "Platform widget unset",
        description: "This widget is no longer the platform's default widget.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unset platform widget.",
        variant: "destructive",
      });
    },
  });


  const generateEmbedCode = (widget: ChatWidget) => {
    const baseUrl = window.location.origin;
    const version = Date.now(); // Cache busting parameter
    return `<!-- AI-KMS Live Chat Widget -->
<script>
  (function() {
    var script = document.createElement('script');
    script.src = '${baseUrl}/widget/${widget.widgetKey}/embed.js?v=${version}';
    script.async = true;
    document.head.appendChild(script);
  })();
</script>`;
  };

  const copyEmbedCode = (widget: ChatWidget) => {
    const embedCode = generateEmbedCode(widget);
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopiedCode(true);
      toast({
        title: "Embed code copied",
        description: "The embed code has been copied to your clipboard.",
      });
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  const handleEdit = (widget: ChatWidget) => {
    setEditingWidget(widget);
    setFormData({
      name: widget.name,
      welcomeMessage: widget.welcomeMessage,
      primaryColor: widget.primaryColor,
      textColor: widget.textColor,
      position: widget.position,
      enableHrLookup: widget.enableHrLookup || false,
      hrApiEndpoint: widget.hrApiEndpoint || '',
      agentId: widget.agentId || null, // Initialize agentId from widget data
    });
    setDialogOpen(true);
  };

  const handleCreateNew = () => {
    setEditingWidget(null);
    setFormData({
      name: "",
      welcomeMessage: "Hi! How can I help you today?",
      primaryColor: "#2563eb",
      textColor: "#ffffff",
      position: "bottom-right",
      enableHrLookup: false,
      hrApiEndpoint: '',
      agentId: null,
    });
    setDialogOpen(true);
  };


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Widget name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      const widgetData = {
        name: formData.name,
        welcomeMessage: formData.welcomeMessage,
        primaryColor: formData.primaryColor,
        textColor: formData.textColor,
        position: formData.position,
        enableHrLookup: formData.enableHrLookup,
        hrApiEndpoint: formData.hrApiEndpoint,
        agentId: formData.agentId // Add agentId to the submission data
      };

      if (editingWidget) {
        updateWidgetMutation.mutate({ id: editingWidget.id, ...widgetData });
      } else {
        createWidgetMutation.mutate(widgetData);
      }
    } catch (error) {
      console.error("Error submitting form:", error);
    }
  };

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Live Chat Widget</h1>
              <p className="text-gray-600">Create embeddable chat widgets for your websites</p>
            </div>
          </div>
          <Button onClick={handleCreateNew}>
            <Plus className="w-4 h-4 mr-2" />
            Create Widget
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Widget List */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Your Chat Widgets</CardTitle>
              </CardHeader>
              <CardContent>
                {widgetsLoading ? (
                  <div className="text-center py-8 text-gray-500">Loading widgets...</div>
                ) : !widgets || widgets.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No chat widgets yet</p>
                    <Button className="mt-4" onClick={handleCreateNew}>
                      Create Your First Widget
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {widgets.map((widget: ChatWidget) => (
                      <div
                        key={widget.id}
                        className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedWidget(widget)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium">{widget.name}</h3>
                            <p className="text-sm text-gray-500">Key: {widget.widgetKey}</p>
                            {widget.agentName && (
                              <p className="text-sm text-blue-600 font-medium">
                                AI Agent: {widget.agentName}
                              </p>
                            )}
                            <div className="flex items-center space-x-2 mt-2">
                              <Badge variant={widget.isActive ? "default" : "secondary"}>
                                {widget.isActive ? "Active" : "Inactive"}
                              </Badge>
                              {widget.enableHrLookup && (
                                <Badge variant="outline">HR Lookup</Badge>
                              )}
                              {widget.agentName && (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                  AI-Powered
                                </Badge>
                              )}
                              {widget.isPlatformWidget && (
                                <Badge variant="default" className="bg-purple-100 text-purple-700">
                                  Platform Widget
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            <Button size="sm" variant="outline" onClick={(e) => {
                              e.stopPropagation();
                              copyEmbedCode(widget);
                            }}>
                              {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(widget);
                              }}
                            >
                              <Settings className="w-4 h-4" />
                            </Button>
                            {/* Admin-only platform widget controls */}
                            {user?.email?.includes('admin') && (
                              <Button
                                size="sm"
                                variant="outline"
                                className={widget.isPlatformWidget ? "text-purple-600 hover:text-purple-700" : "text-gray-500 hover:text-gray-700"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (widget.isPlatformWidget) {
                                    if (window.confirm("Remove this widget as the platform's default widget?")) {
                                      unsetPlatformWidgetMutation.mutate(widget.id);
                                    }
                                  } else {
                                    if (window.confirm("Make this widget the platform's default widget? This will replace any existing platform widget.")) {
                                      setPlatformWidgetMutation.mutate(widget.id);
                                    }
                                  }
                                }}
                                title={widget.isPlatformWidget ? "Unset as platform widget" : "Set as platform widget"}
                              >
                                {widget.isPlatformWidget ? "🏢" : "🏢"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-500 hover:text-red-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm("Are you sure you want to delete this widget?")) {
                                  deleteWidgetMutation.mutate(widget.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Widget Preview */}
            {selectedWidget && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Widget Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-100 p-4 rounded-lg relative h-64">
                    <div className="absolute bottom-4 right-4">
                      <div
                        className="w-14 h-14 rounded-full flex items-center justify-center cursor-pointer shadow-lg"
                        style={{ backgroundColor: selectedWidget.primaryColor }}
                      >
                        <MessageCircle className="w-6 h-6" style={{ color: selectedWidget.textColor }} />
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">Website preview:</p>
                    <div className="text-xs text-gray-500">
                      Chat widget will appear as a floating button in the {selectedWidget.position} corner
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Widget Form / Details */}
          <div>
            {isDialogOpen && ( // Show form when dialog is open
              <Card>
                <CardHeader>
                  <CardTitle>{editingWidget ? "Edit Widget" : "Create New Widget"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="name">Widget Name</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        placeholder="My Website Chat"
                      />
                    </div>

                    <div>
                      <Label htmlFor="agentId">AI Agent</Label>
                      <select
                        id="agentId"
                        value={formData.agentId || ""}
                        onChange={(e) => setFormData({...formData, agentId: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      >
                        <option value="">Select an AI Agent (Optional)</option>
                        {agents?.map((agent: any) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name} - {agent.description}
                          </option>
                        ))}
                      </select>
                      <p className="text-sm text-gray-500 mt-1">
                        Choose an AI agent to power your chat widget with advanced capabilities
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="primaryColor">Primary Color</Label>
                      <Input
                        id="primaryColor"
                        type="color"
                        value={formData.primaryColor}
                        onChange={(e) => setFormData({...formData, primaryColor: e.target.value})}
                      />
                    </div>

                    <div>
                      <Label htmlFor="textColor">Text Color</Label>
                      <Input
                        id="textColor"
                        type="color"
                        value={formData.textColor}
                        onChange={(e) => setFormData({...formData, textColor: e.target.value})}
                      />
                    </div>

                    <div>
                      <Label htmlFor="position">Position</Label>
                      <select
                        id="position"
                        value={formData.position}
                        onChange={(e) => setFormData({...formData, position: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      >
                        <option value="bottom-right">Bottom Right</option>
                        <option value="bottom-left">Bottom Left</option>
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="welcomeMessage">Welcome Message</Label>
                      <Textarea
                        id="welcomeMessage"
                        value={formData.welcomeMessage}
                        onChange={(e) => setFormData({...formData, welcomeMessage: e.target.value})}
                        rows={3}
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="enableHrLookup"
                        checked={formData.enableHrLookup}
                        onCheckedChange={(checked) => setFormData({...formData, enableHrLookup: checked})}
                      />
                      <Label htmlFor="enableHrLookup">Enable HR Employee Lookup</Label>
                    </div>

                    {formData.enableHrLookup && (
                      <div>
                        <Label htmlFor="hrApiEndpoint">HR API Endpoint</Label>
                        <Input
                          id="hrApiEndpoint"
                          value={formData.hrApiEndpoint || ""}
                          onChange={(e) => setFormData({...formData, hrApiEndpoint: e.target.value})}
                          placeholder="/api/public/hr/employee"
                        />
                      </div>
                    )}

                    <div className="flex space-x-2">
                      <Button type="submit" disabled={createWidgetMutation.isPending || updateWidgetMutation.isPending}>
                        {editingWidget ? (updateWidgetMutation.isPending ? "Saving..." : "Save Changes") : (createWidgetMutation.isPending ? "Creating..." : "Create Widget")}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => { 
                        setIsCreating(false); 
                        setEditingWidget(null); 
                        setDialogOpen(false);
                        setFormData({
                          name: "",
                          welcomeMessage: "Hi! How can I help you today?",
                          position: "bottom-right",
                          primaryColor: "#2563eb",
                          textColor: "#ffffff",
                          enableHrLookup: false,
                          hrApiEndpoint: '',
                          agentId: null
                        });
                      }}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Display details when a widget is selected */}
          {!isCreating && selectedWidget && (
            <Card>
              <CardHeader>
                <CardTitle>Embed Code</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Copy and paste this code into your website's HTML to add the chat widget:
                  </p>
                  <div className="bg-gray-100 p-3 rounded-lg">
                    <pre className="text-xs overflow-x-auto">
                      <code>{generateEmbedCode(selectedWidget)}</code>
                    </pre>
                  </div>
                  <Button onClick={() => copyEmbedCode(selectedWidget)} className="w-full">
                    {copiedCode ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Code
                      </>
                    )}
                  </Button>

                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Widget Settings</h4>
                    <div className="space-y-2 text-sm">
                      <div>Position: {selectedWidget.position}</div>
                      <div>Primary Color: {selectedWidget.primaryColor}</div>
                      <div>HR Lookup: {selectedWidget.enableHrLookup ? "Enabled" : "Disabled"}</div>
                      <div>Status: {selectedWidget.isActive ? "Active" : "Inactive"}</div>
                      {selectedWidget.isPlatformWidget && (
                        <div className="text-purple-600 font-medium">Platform Widget: Yes</div>
                      )}
                      {selectedWidget.agentName && (
                        <div>AI Agent: {selectedWidget.agentName}</div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Getting Started Guide */}
          {!isCreating && !selectedWidget && (
            <Card>
              <CardHeader>
                <CardTitle>Getting Started</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">1</div>
                    <div>
                      <h4 className="font-medium">Create a Widget</h4>
                      <p className="text-sm text-gray-600">Set up your chat widget with custom styling and messages</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">2</div>
                    <div>
                      <h4 className="font-medium">Copy Embed Code</h4>
                      <p className="text-sm text-gray-600">Get the HTML code to add to your website</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">3</div>
                    <div>
                      <h4 className="font-medium">Enable HR Lookup</h4>
                      <p className="text-sm text-gray-600">Allow visitors to check employee status using Thai Citizen ID</p>
                    </div>
                  </div>
                  {user?.email?.includes('admin') && (
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-medium">🏢</div>
                      <div>
                        <h4 className="font-medium">Set Platform Widget (Admin)</h4>
                        <p className="text-sm text-gray-600">Designate one widget as the platform's default widget for organization-wide use</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}