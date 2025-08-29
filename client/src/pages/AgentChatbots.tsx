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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Search,
  ChevronLeft,
  ChevronRight,
  Database
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
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedAgents, setExpandedAgents] = useState<Set<number>>(new Set());
  const itemsPerPage = 6;

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

  // Fetch all sessions to get latest session timestamps
  const { data: allSessions = [] } = useQuery({
    queryKey: ["/api/internal-agent-chat/sessions"],
    enabled: isAuthenticated,
    retry: false,
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  }) as { data: any[]; isLoading: boolean };

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

    // Get document names - use the name from agent documents response directly
    const documentNames = agentDocuments
      .map((agentDoc) => {
        // Use the name from agent documents API response (which already includes document name resolution)
        return agentDoc.name || agentDoc.documentName || `Document ${agentDoc.documentId}`;
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

  // Component to display agent database list
  const AgentDatabaseList = ({ agentId }: { agentId: number }) => {
    const { data: agentDatabases = [], isLoading } = useQuery({
      queryKey: [`/api/agent-chatbots/${agentId}/databases`],
      enabled: isAuthenticated && !!agentId,
      retry: false,
      refetchInterval: 120000, // Refresh every 120 seconds
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      staleTime: 0, // Always consider data stale for immediate refresh
    }) as { data: any[]; isLoading: boolean };

    if (isLoading) {
      return (
        <div className="flex items-center space-x-1 text-xs text-slate-500">
          <Database className="w-3 h-3" />
          <span>Loading...</span>
        </div>
      );
    }

    if (agentDatabases.length === 0) {
      return (
        <div className="flex items-center space-x-1 text-xs text-slate-500">
          <Database className="w-3 h-3" />
          <span>No databases</span>
        </div>
      );
    }

    const databaseNames = agentDatabases
      .map((agentDb) => agentDb.name || `Database ${agentDb.databaseId}`)
      .filter(Boolean);

    const maxDisplay = 2;
    const displayNames = databaseNames.slice(0, maxDisplay);
    const remainingCount = databaseNames.length - maxDisplay;

    return (
      <div className="text-xs text-slate-500">
        <div className="flex items-center space-x-1 mb-1">
          <Database className="w-3 h-3" />
          <span>{databaseNames.length} databases:</span>
        </div>
        <div className="ml-4 space-y-0.5">
          {displayNames.map((name, index) => (
            <div key={index} className="text-slate-600 truncate max-w-48">
              • {name}
            </div>
          ))}
          {remainingCount > 0 && (
            <div className="text-slate-400 italic">
              ...and {remainingCount} more
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
    queryClient.invalidateQueries({ 
      queryKey: [`/api/agent-chatbots/${agentId}/databases`] 
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

  // Helper function to get the latest session timestamp for an agent
  const getLatestSessionTimestamp = (agentId: number): string => {
    const agentSessions = allSessions.filter(session => session.agentId === agentId);
    if (agentSessions.length === 0) {
      return ""; // No sessions found
    }

    // Find the most recent session
    const latestSession = agentSessions.reduce((latest, current) => {
      const latestTime = new Date(latest.lastMessageAt || latest.createdAt).getTime();
      const currentTime = new Date(current.lastMessageAt || current.createdAt).getTime();
      return currentTime > latestTime ? current : latest;
    });

    return latestSession.lastMessageAt || latestSession.createdAt;
  };

  // Filter and sort agents based on search term and latest session recency
  const filteredAgents = agents
    .filter((agent) =>
      agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (agent.description && agent.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      agent.channels.some(channel => channel.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => {
      const aLatestSession = getLatestSessionTimestamp(a.id);
      const bLatestSession = getLatestSessionTimestamp(b.id);

      // If both have sessions, sort by latest session timestamp (most recent first)
      if (aLatestSession && bLatestSession) {
        return new Date(bLatestSession).getTime() - new Date(aLatestSession).getTime();
      }

      // If only one has sessions, prioritize the one with sessions
      if (aLatestSession && !bLatestSession) return -1;
      if (!aLatestSession && bLatestSession) return 1;

      // If neither has sessions, sort by creation date (most recent first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // Pagination logic
  const totalPages = Math.ceil(filteredAgents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAgents = filteredAgents.slice(startIndex, endIndex);

  // Reset to first page when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

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

        {/* Search Bar */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Search agents by name, description, or channel..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 w-full"
          />
        </div>

        {/* Results Summary */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {searchTerm ? (
              <>Showing {filteredAgents.length} of {agents.length} agents</>
            ) : (
              <>Total: {agents.length} agents</>
            )}
          </div>
          {totalPages > 1 && (
            <div className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </div>
          )}
        </div>

        {/* Agent List */}
        {paginatedAgents.length === 0 ? (
          <div className="text-center py-12">
            <Bot className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? "No agents found" : "No agents yet"}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchTerm 
                ? "Try adjusting your search terms or clear the search to see all agents."
                : "Create your first AI agent to get started with automated conversations."
              }
            </p>
            {!searchTerm && (
              <Button asChild>
                <a href="/create-agent-chatbot" className="flex items-center space-x-2">
                  <Plus className="w-4 h-4" />
                  <span>Create Your First Agent</span>
                </a>
              </Button>
            )}
            {searchTerm && (
              <Button 
                variant="outline" 
                onClick={() => setSearchTerm("")}
              >
                Clear Search
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedAgents.map((agent) => (
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

                {/* Documents & Databases */}
                <div className="pt-3 border-t border-gray-100">
                  <div onClick={() => {
                    setExpandedAgents(prev => {
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
                    <AgentDatabaseList agentId={agent.id} />
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100">
                  <div className="flex items-center space-x-1">
                    <Calendar className="w-3 h-3" />
                    {(() => {
                      const latestSessionTime = getLatestSessionTimestamp(agent.id);
                      if (latestSessionTime) {
                        return <span>Last used {new Date(latestSessionTime).toLocaleDateString()}</span>;
                      } else {
                        return <span>Created {new Date(agent.createdAt).toLocaleDateString()}</span>;
                      }
                    })()}
                  </div>
                  <div className="flex items-center space-x-1">
                    <MessageCircle className="w-3 h-3" />
                    <span>{allSessions.filter(session => session.agentId === agent.id).length} chats</span>
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center space-x-2 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="flex items-center space-x-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </Button>

                <div className="flex items-center space-x-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      // Show first page, last page, current page, and adjacent pages
                      return page === 1 || 
                             page === totalPages || 
                             Math.abs(page - currentPage) <= 1;
                    })
                    .map((page, index, array) => {
                      // Add ellipsis if there's a gap
                      const showEllipsis = index > 0 && page - array[index - 1] > 1;

                      return (
                        <div key={page} className="flex items-center">
                          {showEllipsis && (
                            <span className="px-2 text-gray-400">...</span>
                          )}
                          <Button
                            variant={currentPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(page)}
                            className="w-8 h-8 p-0"
                          >
                            {page}
                          </Button>
                        </div>
                      );
                    })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="flex items-center space-x-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}