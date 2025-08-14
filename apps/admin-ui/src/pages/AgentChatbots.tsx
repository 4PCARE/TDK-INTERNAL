import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Bot,
  Plus,
  Edit,
  Trash2,
  MessageSquare,
  MessageCircle,
  Settings,
  Calendar,
  Users,
  Power,
  PowerOff,
  FileText,
} from "lucide-react";
import { Link } from "wouter";
import DashboardLayout from "@/components/Layout/DashboardLayout";

interface AgentChatbot {
  id: number;
  name: string;
  description?: string;
  systemPrompt: string;
  isActive: boolean;
  channels: string[];
  personality?: string;
  profession?: string;
  responseStyle?: string;
  specialSkills?: string[];
  contentFiltering?: boolean;
  toxicityPrevention?: boolean;
  privacyProtection?: boolean;
  factualAccuracy?: boolean;
  responseLength?: string;
  allowedTopics?: string[];
  blockedTopics?: string[];
  lineOaConfig?: {
    lineOaId?: string;
    lineOaName?: string;
    accessToken?: string;
  };
  facebookConfig?: {
    pageId: string;
    accessToken: string;
  };
  tiktokConfig?: {
    appId: string;
    appSecret: string;
  };
  createdAt: string;
  updatedAt: string;
}

export default function AgentChatbots() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [expandedAgents, setExpandedAgents] = useState<string[]>([]);

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

  // Fetch agent chatbots
  const { data: agents = [], isLoading: isLoadingAgents } = useQuery({
    queryKey: ["/api/agent-chatbots"],
    enabled: isAuthenticated,
    retry: false,
    refetchInterval: 60000, // Refresh every 60 seconds for real-time updates
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true, // Refresh when user comes back to this page
    refetchOnMount: true,
  }) as { data: AgentChatbot[]; isLoading: boolean };

  // Add manual refresh functionality
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && isAuthenticated) {
        // When user comes back to this page, refresh all agent document queries
        queryClient.invalidateQueries({ 
          predicate: (query) => {
            return query.queryKey[0] === "/api/agent-chatbots" || 
                   (typeof query.queryKey[0] === "string" && 
                    query.queryKey[0].includes("/api/agent-chatbots") && 
                    query.queryKey[0].includes("/documents"));
          }
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAuthenticated, queryClient]);

  // Component to display agent document list
  const AgentDocumentList = ({ agentId }: { agentId: number }) => {
    const { data: agentDocuments = [], isLoading } = useQuery({
      queryKey: [`/api/agent-chatbots/${agentId}/documents`],
      enabled: isAuthenticated && !!agentId,
      retry: false,
      refetchInterval: 120000, // Refresh every 120 seconds
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      staleTime: 0, // Always consider data stale for immediate refresh
    }) as { data: any[]; isLoading: boolean };

    // Also fetch document details
    const { data: allDocuments = [] } = useQuery({
      queryKey: ["/api/documents"],
      enabled: isAuthenticated,
      retry: false,
    }) as { data: any[]; isLoading: boolean };

    if (isLoading) {
      return (
        <div className="flex items-center space-x-1 text-xs text-slate-500">
          <FileText className="w-3 h-3" />
          <span>Loading...</span>
        </div>
      );
    }

    if (agentDocuments.length === 0) {
      return (
        <div className="flex items-center space-x-1 text-xs text-slate-500">
          <FileText className="w-3 h-3" />
          <span>No documents</span>
        </div>
      );
    }

    // Get document names
    const documentNames = agentDocuments
      .map((agentDoc) => {
        const doc = allDocuments.find((d) => d.id === agentDoc.documentId);
        return doc ? doc.name : `Document ${agentDoc.documentId}`;
      })
      .filter(Boolean);

    const maxDisplay = 2;
    const displayNames = documentNames.slice(0, maxDisplay);
    const remainingCount = documentNames.length - maxDisplay;

    return (
      <div className="text-xs text-slate-500">
        <div className="flex items-center space-x-1 mb-1">
          <FileText className="w-3 h-3" />
          <span>{documentNames.length} documents:</span>
        </div>
        <div className="ml-4 space-y-0.5">
          {displayNames.map((name, index) => (
            <div key={index} className="text-slate-600 truncate max-w-48">
              • {name}
            </div>
          ))}
          {remainingCount > 0 && (
            <div className="text-slate-400 italic">
              ...และอีก {remainingCount} ไฟล์
            </div>
          )}
        </div>
      </div>
    );
  };

  // Delete agent mutation
  const deleteAgentMutation = useMutation({
    mutationFn: async (agentId: number) => {
      return await apiRequest("DELETE", `/api/agent-chatbots/${agentId}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Agent chatbot deleted successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-chatbots"] });
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
        description: "Failed to delete agent chatbot",
        variant: "destructive",
      });
    },
  });

  // Toggle agent status mutation
  const toggleAgentMutation = useMutation({
    mutationFn: async ({
      agentId,
      isActive,
    }: {
      agentId: number;
      isActive: boolean;
    }) => {
      return await apiRequest("PUT", `/api/agent-chatbots/${agentId}`, {
        isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-chatbots"] });
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
        description: "Failed to update agent status",
        variant: "destructive",
      });
    },
  });

  const handleDeleteAgent = (agentId: number) => {
    if (window.confirm("Are you sure you want to delete this agent chatbot?")) {
      deleteAgentMutation.mutate(agentId);
    }
  };

  const handleToggleAgent = (agentId: number, currentStatus: boolean) => {
    toggleAgentMutation.mutate({ agentId, isActive: !currentStatus });
  };

  // Function to handle edit button click with cache invalidation
  const handleEditAgent = (agentId: number) => {
    // Force refresh of the specific agent data before navigation
    queryClient.invalidateQueries({ 
      queryKey: [`/api/agent-chatbots/${agentId}`] 
    });
    queryClient.invalidateQueries({ 
      queryKey: [`/api/agent-chatbots/${agentId}/documents`] 
    });

    // Navigate to edit page
    window.location.href = `/create-agent-chatbot?edit=${agentId}`;
  };

  const getChannelBadges = (channels: string[]) => {
    const channelColors: Record<string, string> = {
      lineoa: "bg-green-100 text-green-800",
      facebook: "bg-blue-100 text-blue-800",
      tiktok: "bg-pink-100 text-pink-800",
    };

    return channels.map((channel) => (
      <Badge
        key={channel}
        variant="secondary"
        className={`text-xs ${channelColors[channel] || "bg-gray-100 text-gray-800"}`}
      >
        {channel === "lineoa"
          ? "LINE OA"
          : channel.charAt(0).toUpperCase() + channel.slice(1)}
      </Badge>
    ));
  };

  if (isLoading || isLoadingAgents) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Agent Chatbots</h1>
              <p className="text-gray-600">Create and manage intelligent chatbots for your documents</p>
            </div>
          </div>

          <Button asChild>
            <a href="/create-agent-chatbot" className="flex items-center space-x-2">
              <Plus className="w-4 h-4" />
              <span>Create Agent</span>
            </a>
          </Button>
        </div>

        {/* Agent List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <Card key={agent.id} className="bg-white shadow-sm rounded-lg overflow-hidden">
              <CardHeader className="flex items-center space-x-4">
                <Avatar className="w-10 h-10">
                  <AvatarFallback>
                    <Bot className="w-6 h-6" />
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <CardTitle className="text-lg font-medium">{agent.name}</CardTitle>
                  <p className="text-sm text-gray-500">{agent.description}</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Channels */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Channels:</p>
                  <div className="flex flex-wrap gap-1">
                    {getChannelBadges(agent.channels)}
                  </div>
                </div>

                {/* Documents */}
                <div className="pt-3 border-t border-gray-100">
                  {/* Conditionally render AgentDocumentList only when agent is expanded */}
                  <div onClick={() => {
                    setExpandedAgents((prev: any[]) => {
                      const next = new Set(prev);
                      if (next.has(agent.id)) {
                        next.delete(agent.id);
                      } else {
                        next.add(agent.id);
                      }
                      return next;
                    });
                  }} className="cursor-pointer">
                    <AgentDocumentList agentId={agent.id} />
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100">
                  <div className="flex items-center space-x-1">
                    <Calendar className="w-3 h-3" />
                    <span>Created {new Date(agent.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <MessageCircle className="w-3 h-3" />
                    <span>0 chats</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                  <div className="flex items-center space-x-2">
                    <Badge 
                      variant={agent.isActive ? "default" : "secondary"}
                      className={agent.isActive ? "bg-green-100 text-green-800" : ""}
                    >
                      {agent.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex space-x-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleAgent(agent.id, agent.isActive)}
                      className="p-1 h-7 w-7"
                    >
                      {agent.isActive ? (
                        <PowerOff className="w-3 h-3" />
                      ) : (
                        <Power className="w-3 h-3" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditAgent(agent.id)}
                      className="p-1 h-7 w-7"
                    >
                      <Edit className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteAgent(agent.id)}
                      className="p-1 h-7 w-7 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}