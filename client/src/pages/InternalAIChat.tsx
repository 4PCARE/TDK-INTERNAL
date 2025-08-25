import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import {
  MessageSquare,
  Bot,
  Plus,
  Send,
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  User,
  ArrowLeft,
  X,
  FileText,
  Search,
  Settings,
  MoreVertical,
  Calendar,
  Clock,
  Edit3
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Add CSS for line clamping, syntax highlighting, and markdown tables
const lineClampStyles = `
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  
  /* Syntax highlighting styles */
  .hljs {
    background: #f8f9fa !important;
    color: #333 !important;
    padding: 12px !important;
    border-radius: 6px !important;
    font-size: 14px !important;
    line-height: 1.4 !important;
  }
  
  .hljs-keyword { color: #d73a49 !important; }
  .hljs-string { color: #032f62 !important; }
  .hljs-comment { color: #6a737d !important; }
  .hljs-number { color: #005cc5 !important; }
  .hljs-function { color: #6f42c1 !important; }
  .hljs-variable { color: #e36209 !important; }
  
  /* Markdown table styles */
  .markdown-content table {
    border-collapse: collapse !important;
    margin: 12px 0 !important;
    width: 100% !important;
    background: white !important;
    border-radius: 6px !important;
    overflow: hidden !important;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1) !important;
  }
  
  .markdown-content th {
    background: #f8f9fa !important;
    font-weight: 600 !important;
    text-align: left !important;
    padding: 12px 16px !important;
    border: 1px solid #e5e7eb !important;
    color: #374151 !important;
    font-size: 14px !important;
  }
  
  .markdown-content td {
    padding: 12px 16px !important;
    border: 1px solid #e5e7eb !important;
    color: #374151 !important;
    font-size: 14px !important;
    line-height: 1.5 !important;
  }
  
  .markdown-content tr:nth-child(even) {
    background: #f9fafb !important;
  }
  
  .markdown-content tr:hover {
    background: #f3f4f6 !important;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = lineClampStyles;
  document.head.appendChild(style);
}

// Real API request function
const apiRequest = async (method: string, url: string, body?: any) => {
  const options: RequestInit = {
    method: method.toUpperCase(),
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body && method.toUpperCase() !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    // Attempt to get error details from response body
    let errorDetail = `Status: ${response.status}`;
    try {
      const errorData = await response.json();
      errorDetail += `, Message: ${errorData.message || JSON.stringify(errorData)}`;
    } catch (e) {
      const text = await response.text();
      errorDetail += `, Raw: ${text}`;
    }
    const error = new Error(`API request failed: ${errorDetail}`);
    // Attach status to the error object for easier checking
    (error as any).status = response.status;
    throw error;
  }
  return response;
};

const isUnauthorizedError = (error: any): boolean => {
  return error.status === 401 || error.message?.includes('401') || error.message?.includes('Unauthorized');
};


interface Agent {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
  channels: string[];
  createdAt: string;
}

// Renamed AgentChatbot to Agent for consistency with the rest of the code
type AgentChatbot = Agent;

interface Session {
  id: number;
  title: string;
  agentId: number;
  lastMessage?: string;
  lastMessageAt: string;
  messageCount: number;
}

// Renamed ChatSession to Session for consistency with the rest of the code
type ChatSession = Session;

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export default function InternalAIChat() {
  const { toast } = useToast();
  const { user, isAuthenticated, wsUrl } = useAuth(); // Assuming wsUrl is provided by useAuth
  const queryClient = useQueryClient();
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [input, setInput] = useState(""); // Renamed from newMessage to input to match mutation
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [hideAgentPanel, setHideAgentPanel] = useState(false);
  const [hideSessionPanel, setHideSessionPanel] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [botSearchTerm, setBotSearchTerm] = useState(""); // Added for bot search
  const [viewingAgentDocuments, setViewingAgentDocuments] = useState<number | null>(null); // State for the modal
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentSessionId = selectedSession?.id; // For use in mutations

  // Fetch available agents
  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ["/api/agent-chatbots"],
    queryFn: async () => {
      const response = await apiRequest("get", "/api/agent-chatbots");
      if (!response.ok) throw new Error("Failed to fetch agents");
      return response.json();
    },
    enabled: isAuthenticated,
  }) as { data: Agent[]; isLoading: boolean };

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

  // Use selectedAgentId to find the selected agent object
  const selectedAgent = (agents || []).find(agent => agent.id === selectedAgentId) || null;

  // Fetch agent documents for each agent
  const agentDocumentQueries = useQueries({
    queries: agents.map(agent => ({
      queryKey: [`/api/agent-chatbots/${agent.id}/documents`],
      queryFn: async () => {
        const response = await apiRequest("GET", `/api/agent-chatbots/${agent.id}/documents`);
        if (!response.ok) throw new Error(`Failed to fetch documents for agent ${agent.id}`);
        const data = await response.json();
        console.log(`📋 Agent ${agent.id} documents response:`, data);
        return data.map((doc: any) => doc.name || doc.documentName || `Document ${doc.documentId}`);
      },
      enabled: isAuthenticated && !!agent.id,
    }))
  });

  // Fetch all documents to get names
  const { data: allDocuments = [] } = useQuery({
    queryKey: ["/api/documents"],
    queryFn: async () => {
      const response = await apiRequest("get", "/api/documents");
      if (!response.ok) throw new Error("Failed to fetch all documents");
      return response.json();
    },
    enabled: isAuthenticated,
  }) as { data: any[]; isLoading: boolean };

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
  const filteredAndSortedAgents = agents
    .filter(agent =>
      agent.name.toLowerCase().includes(botSearchTerm.toLowerCase()) ||
      (agent.description && agent.description.toLowerCase().includes(botSearchTerm.toLowerCase()))
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

  // Helper to get document names for a given agent ID
  const getAgentDocumentNames = (agentId: number): string[] => {
    const queryIndex = agents.findIndex(agent => agent.id === agentId);
    if (queryIndex === -1 || !agentDocumentQueries[queryIndex] || agentDocumentQueries[queryIndex].isLoading) {
      return [];
    }
    return agentDocumentQueries[queryIndex].data || [];
  };

  // Fetch chat sessions for selected agent
  const { data: sessions = [], isLoading: isLoadingSessions } = useQuery({
    queryKey: ["/api/internal-agent-chat/sessions", selectedAgentId],
    queryFn: async () => {
      if (!selectedAgentId) return [];
      const response = await apiRequest("get", `/api/internal-agent-chat/sessions?agentId=${selectedAgentId}`);
      if (!response.ok) throw new Error("Failed to fetch sessions");
      return response.json();
    },
    enabled: !!selectedAgentId,
  }) as { data: ChatSession[]; isLoading: boolean };

  // Fetch messages for selected session
  const { data: messages = [], isLoading: isLoadingMessages, refetch: refetchMessages } = useQuery<ChatMessage[]>({
    queryKey: ["/api/internal-agent-chat/messages", selectedSession?.id],
    queryFn: async () => {
      if (!selectedSession) return [];
      const response = await apiRequest("get", `/api/internal-agent-chat/messages?sessionId=${selectedSession.id}`);
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    enabled: !!selectedSession,
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!isAuthenticated || !wsUrl) return;

    const ws = new WebSocket(`${wsUrl}/ws`);

    ws.onopen = () => {
      console.log('🔌 WebSocket connected for InternalAIChat');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 WebSocket message received:', data);

        // Handle session updates (like auto-generated titles)
        if (data.type === 'session_updated' && data.data?.sessionId) {
          console.log('🏷️ Session updated, refreshing sessions list');

          // Update the selected session immediately if it matches
          setSelectedSession(prev => {
            if (prev?.id === data.data.sessionId && data.data.title) {
              console.log('✅ Updated selected session title from WebSocket:', data.data.title);
              return { ...prev, title: data.data.title };
            }
            return prev;
          });

          // Invalidate sessions query to refresh the list
          queryClient.invalidateQueries({
            queryKey: ["/api/internal-agent-chat/sessions", selectedAgentId],
          });
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket disconnected for InternalAIChat');
    };

    return () => {
      ws.close();
    };
  }, [isAuthenticated, wsUrl, queryClient, selectedAgentId]);


  // Create new session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (agentId: number) => {
      const response = await apiRequest("post", "/api/internal-agent-chat/sessions", {
        agentId,
        title: `New Chat - ${new Date().toLocaleDateString()}`,
      });
      if (!response.ok) throw new Error("Failed to create session");
      return response.json();
    },
    onSuccess: (newSession) => {
      setSelectedSession(newSession);
      queryClient.invalidateQueries({
        queryKey: ["/api/internal-agent-chat/sessions", selectedAgentId],
      });
      toast({
        title: "New chat created",
        description: `Started a new conversation with ${selectedAgent?.name}.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error creating session",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ message, sessionId }: { message: string; sessionId: number }) => {
      console.log('🚀 Sending message:', { message, sessionId, agentId: selectedAgentId });

      const response = await apiRequest('POST', '/api/internal-agent-chat', {
        message,
        sessionId: sessionId.toString(),
        agentId: selectedAgentId?.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Send message failed:', errorText);
        throw new Error(`Failed to send message: ${response.status} ${errorText}`);
      }

      return await response.json();
    },
    onMutate: async ({ message, sessionId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['/api/internal-agent-chat/messages', sessionId]
      });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData(['/api/internal-agent-chat/messages', sessionId]) as ChatMessage[] || [];

      // Optimistically update to the new value
      const optimisticMessage: ChatMessage = {
        id: Date.now(), // Temporary ID
        role: "user",
        content: message,
        createdAt: new Date().toISOString()
      };

      queryClient.setQueryData(
        ['/api/internal-agent-chat/messages', sessionId],
        [...previousMessages, optimisticMessage]
      );

      // Return a context object with the snapshotted value
      return { previousMessages };
    },
    onError: (err, { sessionId }, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousMessages) {
        queryClient.setQueryData(['/api/internal-agent-chat/messages', sessionId], context.previousMessages);
      }
    },
    onSuccess: (data) => {
      console.log('✅ Message sent successfully:', data);
      setInput("");

      // Force refetch messages and sessions to ensure UI updates
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: ['/api/internal-agent-chat/messages', currentSessionId]
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/internal-agent-chat/sessions", selectedAgentId],
        });
        refetchMessages();
      }, 100);

      // Additional timeout to handle any delayed WebSocket messages
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: ["/api/internal-agent-chat/sessions", selectedAgentId],
        });
      }, 2000);
    },
  });

  // Delete session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const response = await apiRequest("delete", `/api/internal-agent-chat/sessions/${sessionId}`);
      if (!response.ok) throw new Error("Failed to delete session");
    },
    onSuccess: () => {
      setSelectedSession(null);
      queryClient.invalidateQueries({
        queryKey: ["/api/internal-agent-chat/sessions", selectedAgentId],
      });
      toast({
        title: "Chat deleted",
        description: "The selected chat session has been removed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting chat",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Rename session mutation
  const renameSessionMutation = useMutation({
    mutationFn: async ({ sessionId, title }: { sessionId: number; title: string }) => {
      const response = await apiRequest("put", `/api/internal-agent-chat/sessions/${sessionId}/title`, { title });
      if (!response.ok) throw new Error("Failed to rename session");
      return response.json();
    },
    onSuccess: (updatedSession) => {
      // Update selected session immediately
      if (selectedSession?.id === updatedSession.id) {
        setSelectedSession(updatedSession);
        console.log('✅ Updated selected session after rename:', updatedSession.title);
      }

      // Then invalidate and refetch the sessions list
      queryClient.invalidateQueries({
        queryKey: ["/api/internal-agent-chat/sessions", selectedAgentId],
      });

      setEditingSessionId(null);
      setEditingTitle("");
      toast({
        title: "Chat renamed",
        description: "The chat title has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error renaming chat",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current && messages?.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [messages]);

  // Auto-select first agent and its first session when component mounts or agents change
  useEffect(() => {
    if (agentsLoading || agents.length === 0) return;

    // If no agent is selected, or the currently selected agent is no longer available, select the first agent.
    if (!selectedAgentId || !agents.some(agent => agent.id === selectedAgentId)) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, agentsLoading, selectedAgentId]);

  // Auto-select first session when agent changes
  useEffect(() => {
    if (sessions.length > 0 && selectedAgentId) {
      // If no session is selected, or the selected session belongs to a different agent, select the first session.
      if (!selectedSession || selectedSession.agentId !== selectedAgentId) {
        setSelectedSession(sessions[0]);
      }
    } else {
      setSelectedSession(null);
    }
  }, [sessions, selectedAgentId, selectedSession]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedAgentId || !currentSessionId || sendMessageMutation.isPending) return;

    const messageToSend = input.trim();
    console.log('📝 Sending message:', messageToSend);

    try {
      await sendMessageMutation.mutateAsync({
        message: messageToSend,
        sessionId: currentSessionId
      });
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      // Restore input on error for user to retry
      setInput(messageToSend);
    }
  };

  const handleCreateNewChat = () => {
    if (selectedAgentId) {
      createSessionMutation.mutate(selectedAgentId);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const handleStartEditing = (session: ChatSession) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const handleCancelEditing = () => {
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const handleSaveTitle = (sessionId: number) => {
    if (editingTitle.trim().length === 0) {
      toast({
        title: "Invalid title",
        description: "Chat title cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    if (editingTitle.trim() === selectedSession?.title) {
      // No changes made, just cancel editing
      handleCancelEditing();
      return;
    }

    renameSessionMutation.mutate({
      sessionId,
      title: editingTitle.trim()
    });
  };

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-120px)] bg-gray-50 gap-4 p-4">
        {/* Left Panel - Agent List */}
        {!hideAgentPanel && (
          <div className="w-80 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">AI Agents</h2>
                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    onClick={() => window.location.href = '/agent-chatbots'}
                    className="bg-blue-500 hover:bg-blue-600"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Manage
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setHideAgentPanel(true)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">Select an agent to start chatting</p>

              {/* Search input for bots */}
              <div className="mt-3 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Search agents..."
                  value={botSearchTerm}
                  onChange={(e) => setBotSearchTerm(e.target.value)}
                  className="pl-10 h-9"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-2">
                {agentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : agents.length === 0 ? (
                  <div className="text-center py-8">
                    <Bot className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 mb-4">No agents available</p>
                    <Button
                      onClick={() => window.location.href = '/create-agent-chatbot'}
                      className="bg-blue-500 hover:bg-blue-600"
                    >
                      Create Your First Agent
                    </Button>
                  </div>
                ) : (
                  filteredAndSortedAgents.map((agent) => {
                    const documentNames = getAgentDocumentNames(agent.id);
                    return (
                      <div
                        key={agent.id}
                        className={cn(
                          "p-4 rounded-lg transition-all border cursor-pointer",
                          selectedAgentId === agent.id
                            ? "bg-blue-50 border-blue-200"
                            : "hover:bg-gray-50 border-transparent"
                        )}
                        onClick={() => setSelectedAgentId(agent.id)}
                      >
                        <div className="flex items-start space-x-3">
                          <Avatar className="w-10 h-10">
                            <AvatarFallback>
                              <Bot className="w-6 h-6" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 break-words">{agent.name}</h4>
                            {agent.description && (
                              <p className="text-sm text-gray-500 mt-1 break-words line-clamp-2">{agent.description}</p>
                            )}

                            {/* Document names display */}
                            {documentNames.length > 0 && (
                              <div className="mt-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation(); // Prevent selecting the agent
                                    setViewingAgentDocuments(agent.id);
                                  }}
                                  className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 mb-1 text-left w-full cursor-pointer hover:underline transition-colors"
                                >
                                  <FileText className="w-3 h-3" />
                                  <span>{documentNames.length} document{documentNames.length !== 1 ? 's' : ''} (click to view)</span>
                                </button>
                              </div>
                            )}

                            <div className="flex items-center justify-between mt-3">
                              <div className="flex items-center space-x-2">
                                <Badge
                                  variant={agent.isActive ? "default" : "secondary"}
                                  className={agent.isActive ? "bg-green-100 text-green-800" : ""}
                                >
                                  {agent.isActive ? "Active" : "Inactive"}
                                </Badge>
                                <span className="text-xs text-gray-400">
                                  {(() => {
                                    const latestSessionTime = getLatestSessionTimestamp(agent.id);
                                    if (latestSessionTime) {
                                      return `Last used ${formatDate(latestSessionTime)}`;
                                    } else {
                                      return `Created ${formatDate(agent.createdAt)}`;
                                    }
                                  })()}
                                </span>
                              </div>
                              <span className="text-xs text-gray-400">
                                {allSessions.filter(session => session.agentId === agent.id).length} chats
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                {filteredAndSortedAgents.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <Bot className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No agents found matching your search</p>
                    </div>
                  )}
                </div>
            </ScrollArea>
          </div>
        )}

        {/* Collapsed Agent Panel */}
        {hideAgentPanel && (
          <div className="w-12 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col items-center justify-start p-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setHideAgentPanel(false)}
              className="text-gray-500 hover:text-gray-700 mb-2"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <div className="text-xs text-gray-400 rotate-90 whitespace-nowrap mt-4">
              Agents
            </div>
          </div>
        )}

        {/* Middle Panel - Session History */}
        {!hideSessionPanel && (
          <div className="w-80 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Chat History</h2>
                <div className="flex items-center space-x-2">
                  {selectedAgentId && (
                    <Button
                      size="sm"
                      onClick={handleCreateNewChat}
                      disabled={createSessionMutation.isPending}
                      className="bg-green-500 hover:bg-green-600"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      New Chat
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setHideSessionPanel(true)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {selectedAgent && (
                <p className="text-sm text-gray-500 mt-1">
                  Chats with {selectedAgent.name}
                </p>
              )}
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-2">
                {!selectedAgentId ? (
                  <div className="text-center py-8">
                    <MessageSquare className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">Select an agent to view chat history</p>
                  </div>
                ) : isLoadingSessions ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500 mb-4">No chat history yet</p>
                    <Button
                      onClick={handleCreateNewChat}
                      disabled={createSessionMutation.isPending}
                      className="bg-green-500 hover:bg-green-600"
                    >
                      Start First Chat
                    </Button>
                  </div>
                ) : (
                  sessions.map((session) => (
                    <div
                      key={session.id}
                      className={cn(
                        "p-3 rounded-lg transition-all border cursor-pointer",
                        selectedSession?.id === session.id
                          ? "bg-blue-50 border-blue-200"
                          : "hover:bg-gray-50 border-transparent"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div
                          className="flex-1 min-w-0"
                          onClick={() => editingSessionId !== session.id && setSelectedSession(session)}
                        >
                          {editingSessionId === session.id ? (
                            <div className="space-y-2 mb-1">
                              <Input
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                className="text-sm font-medium h-8"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleSaveTitle(session.id);
                                  } else if (e.key === 'Escape') {
                                    handleCancelEditing();
                                  }
                                }}
                                autoFocus
                              />
                              <div className="flex items-center justify-end space-x-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleCancelEditing}
                                  className="h-6 px-2 text-xs"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveTitle(session.id)}
                                  disabled={editingTitle.trim().length === 0 || renameSessionMutation.isPending}
                                  className="h-6 px-2 text-xs bg-blue-500 hover:bg-blue-600"
                                >
                                  {renameSessionMutation.isPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    "Save"
                                  )}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="font-medium text-gray-900 break-words line-clamp-2" onClick={() => setSelectedSession(session)}>{session.title}</p>
                          )}

                          {session.lastMessage && (
                            <p className="text-sm text-gray-500 break-words line-clamp-2 mt-1">
                              {session.lastMessage}
                            </p>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center space-x-1 text-xs text-gray-400">
                              <Calendar className="w-3 h-3" />
                              <span>{formatDate(session.lastMessageAt)}</span>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {session.messageCount} messages
                            </Badge>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="p-1 h-6 w-6 ml-2">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleStartEditing(session)}
                            >
                              <Edit3 className="w-4 h-4 mr-2" />
                              Rename Chat
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deleteSessionMutation.mutate(session.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Chat
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Collapsed Session Panel */}
        {hideSessionPanel && (
          <div className="w-12 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col items-center justify-start p-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setHideSessionPanel(false)}
              className="text-gray-500 hover:text-gray-700 mb-2"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <div className="text-xs text-gray-400 rotate-90 whitespace-nowrap mt-4">
              Sessions
            </div>
          </div>
        )}

        {/* Right Panel - Chat Interface */}
        <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
          {!selectedAgentId || !selectedSession ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-gray-900 mb-2">
                  {!selectedAgentId ? "Select an Agent" : "Select a Chat Session"}
                </h3>
                <p className="text-gray-500">
                  {!selectedAgentId
                    ? "Choose an AI agent from the left panel to start chatting"
                    : "Select a chat session from the middle panel or create a new one"
                  }
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center space-x-3">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback>
                      <Bot className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-medium text-gray-900">{selectedAgent.name}</h3>
                    <p className="text-sm text-gray-500">{selectedSession.title}</p>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {isLoadingMessages ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                      <span className="ml-2 text-sm text-gray-500">Loading messages...</span>
                    </div>
                  ) : messages && messages.length > 0 ? (
                      messages.map((message, index) => (
                        <div
                          key={`msg-${message.id}-${index}`}
                          className={`flex space-x-3 ${
                            message.role === 'user' ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          {message.role === 'assistant' && (
                            <Avatar className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 flex-shrink-0">
                              <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-600">
                                <Bot className="w-4 h-4 text-white" />
                              </AvatarFallback>
                            </Avatar>
                          )}

                          <div className={`flex-1 max-w-xs lg:max-w-md ${message.role === 'user' ? 'flex justify-end' : ''}`}>
                            <div className="flex flex-col">
                              <div className={`rounded-lg px-4 py-3 ${
                                message.role === 'user'
                                  ? 'bg-blue-500 text-white rounded-tr-none'
                                  : 'bg-gray-100 text-gray-900 rounded-tl-none'
                              }`}>
                                {message.role === 'assistant' ? (
                                  <div className="text-sm prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-900 prose-strong:text-gray-900 prose-code:text-gray-800 prose-code:bg-gray-200 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-gray-200 prose-pre:text-gray-800 markdown-content">
                                    <ReactMarkdown
                                      remarkPlugins={[remarkGfm]}
                                      rehypePlugins={[rehypeHighlight]}
                                    >
                                      {message.content && typeof message.content === 'string' && message.content.trim()
                                        ? message.content
                                        : "Empty message"}
                                    </ReactMarkdown>
                                  </div>
                                ) : (
                                  <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                                )}
                              </div>
                              <p className={`text-xs text-gray-500 mt-1 px-1 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                                {formatTime(message.createdAt)}
                              </p>
                            </div>
                          </div>

                          {message.role === 'user' && (
                            <Avatar className="w-8 h-8 bg-gray-500 flex-shrink-0">
                              <AvatarFallback className="bg-gray-500">
                                <User className="w-4 h-4 text-white" />
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p className="text-sm">Start a conversation with your AI assistant!</p>
                      </div>
                    )}

                  <div ref={messagesEndRef} />

                  {(sendMessageMutation.isPending || isCreatingSession) && (
                    <div className="flex items-start space-x-3 mt-4">
                      <Avatar className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600">
                        <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-600">
                          <Bot className="w-4 h-4 text-white" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="bg-gray-100 rounded-lg rounded-tl-none px-3 py-2 inline-block">
                        <div className="flex items-center space-x-1">
                          <div className="animate-bounce w-1 h-1 bg-gray-500 rounded-full"></div>
                          <div className="animate-bounce w-1 h-1 bg-gray-500 rounded-full" style={{ animationDelay: "0.1s" }}></div>
                          <div className="animate-bounce w-1 h-1 bg-gray-500 rounded-full" style={{ animationDelay: "0.2s" }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="p-4 border-t border-gray-200">
                <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                  <Input
                    type="text"
                    placeholder={selectedAgent ? `Ask ${selectedAgent.name} something...` : "Select an agent first..."}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="flex-1"
                    disabled={!selectedAgentId || sendMessageMutation.isPending}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    disabled={!input.trim() || !selectedAgentId || sendMessageMutation.isPending}
                    className="bg-blue-500 hover:bg-blue-600 text-white min-w-[44px]"
                  >
                    {sendMessageMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </form>

                {sendMessageMutation.isPending && (
                  <div className="text-center text-xs text-gray-500 mt-2">
                    <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                    Processing your message...
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Agent Documents Popup */}
      <Dialog open={viewingAgentDocuments !== null} onOpenChange={() => setViewingAgentDocuments(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <FileText className="w-5 h-5" />
              <span>Agent Documents</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {viewingAgentDocuments && (() => {
              const agent = agents.find(a => a.id === viewingAgentDocuments);
              const documentNames = getAgentDocumentNames(viewingAgentDocuments);

              return (
                <div>
                  <p className="text-sm text-gray-600 mb-3">
                    Documents linked to <strong>{agent?.name}</strong>:
                  </p>
                  {documentNames.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No documents found</p>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {documentNames.map((name, index) => (
                        <div key={index} className="flex items-center space-x-2 p-2 rounded bg-gray-50 text-sm">
                          <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="truncate" title={name}>
                            {name || `Document ${index + 1}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-3">
                    Total: {documentNames.length} document{documentNames.length !== 1 ? 's' : ''}
                  </p>
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}