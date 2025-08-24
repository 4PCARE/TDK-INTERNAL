import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  User,
  Send,
  Plus,
  Settings,
  MoreVertical,
  Calendar,
  Clock,
  Trash2,
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
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

// Add CSS for line clamping
const lineClampStyles = `
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
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
  return response;
};

const isUnauthorizedError = (error: any): boolean => {
  return error.message?.includes('401') || error.message?.includes('Unauthorized');
};


interface Agent {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
  channels: string[];
  createdAt: string;
}

interface ChatSession {
  id: number;
  title: string;
  agentId: number;
  lastMessage?: string;
  lastMessageAt: string;
  messageCount: number;
}

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
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [input, setInput] = useState(""); // Renamed from newMessage to input to match mutation
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [hideAgentPanel, setHideAgentPanel] = useState(false);
  const [hideSessionPanel, setHideSessionPanel] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentSessionId = selectedSession?.id; // For use in mutations

  // Fetch agents
  const { data: agents = [], isLoading: isLoadingAgents } = useQuery({
    queryKey: ["/api/agent-chatbots"],
    queryFn: async () => {
      const response = await apiRequest("get", "/api/agent-chatbots");
      if (!response.ok) throw new Error("Failed to fetch agents");
      return response.json();
    },
  }) as { data: Agent[]; isLoading: boolean };

  // Fetch chat sessions for selected agent
  const { data: sessions = [], isLoading: isLoadingSessions } = useQuery({
    queryKey: ["/api/internal-agent-chat/sessions", selectedAgent?.id],
    queryFn: async () => {
      if (!selectedAgent) return [];
      const response = await apiRequest("get", `/api/internal-agent-chat/sessions?agentId=${selectedAgent.id}`);
      if (!response.ok) throw new Error("Failed to fetch sessions");
      return response.json();
    },
    enabled: !!selectedAgent,
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
            queryKey: ["/api/internal-agent-chat/sessions", selectedAgent?.id],
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
  }, [isAuthenticated, wsUrl, queryClient, selectedAgent?.id]);


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
        queryKey: ["/api/internal-agent-chat/sessions", selectedAgent?.id],
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
      console.log('🚀 Sending message:', { message, sessionId, agentId: selectedAgent?.id });

      const response = await apiRequest('POST', '/api/internal-agent-chat', {
        message,
        sessionId: sessionId.toString(),
        agentId: selectedAgent?.id?.toString()
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
          queryKey: ["/api/internal-agent-chat/sessions", selectedAgent?.id],
        });
        refetchMessages();
      }, 100);
      
      // Additional timeout to handle any delayed WebSocket messages
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: ["/api/internal-agent-chat/sessions", selectedAgent?.id],
        });
      }, 2000);
    },
    onError: (error) => {
      console.error('❌ Send message error:', error);
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
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
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
        queryKey: ["/api/internal-agent-chat/sessions", selectedAgent?.id],
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
        queryKey: ["/api/internal-agent-chat/sessions", selectedAgent?.id],
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

  // Auto-select first agent
  useEffect(() => {
    if (agents.length > 0 && !selectedAgent) {
      setSelectedAgent(agents[0]);
    }
  }, [agents, selectedAgent]);

  // Auto-select first session when agent changes
  useEffect(() => {
    if (sessions.length > 0 && selectedAgent) {
      setSelectedSession(sessions[0]);
    } else {
      setSelectedSession(null);
    }
  }, [sessions, selectedAgent]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedAgent || !currentSessionId || sendMessageMutation.isPending) return;

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
    if (selectedAgent) {
      createSessionMutation.mutate(selectedAgent.id);
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
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              {isLoadingAgents ? (
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
                agents.map((agent) => (
                  <div
                    key={agent.id}
                    className={cn(
                      "p-3 rounded-lg cursor-pointer transition-all border",
                      selectedAgent?.id === agent.id
                        ? "bg-blue-50 border-blue-200"
                        : "hover:bg-gray-50 border-transparent"
                    )}
                    onClick={() => setSelectedAgent(agent)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback>
                            <Bot className="w-4 h-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 break-words">{agent.name}</p>
                          <p className="text-sm text-gray-500 break-words line-clamp-2">{agent.description}</p>
                          <div className="flex items-center space-x-2 mt-1">
                            <Badge
                              variant={agent.isActive ? "default" : "secondary"}
                              className={agent.isActive ? "bg-green-100 text-green-800" : ""}
                            >
                              {agent.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="p-1 h-6 w-6">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => window.location.href = `/create-agent-chatbot?edit=${agent.id}`}
                          >
                            <Settings className="w-4 h-4 mr-2" />
                            Edit Agent
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
                {selectedAgent && (
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
              {!selectedAgent ? (
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
                      "p-3 rounded-lg transition-all border",
                      selectedSession?.id === session.id
                        ? "bg-blue-50 border-blue-200"
                        : "hover:bg-gray-50 border-transparent"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
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
                            <div className="flex items-center space-x-2">
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
                          <p className="font-medium text-gray-900 break-words line-clamp-2">{session.title}</p>
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
          {!selectedAgent || !selectedSession ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-gray-900 mb-2">
                  {!selectedAgent ? "Select an Agent" : "Select a Chat Session"}
                </h3>
                <p className="text-gray-500">
                  {!selectedAgent
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
                                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
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
                      <div className="flex-1">
                        <div className="bg-gray-100 rounded-lg rounded-tl-none px-3 py-2">
                          <div className="flex items-center space-x-1">
                            <div className="animate-bounce w-1 h-1 bg-gray-500 rounded-full"></div>
                            <div className="animate-bounce w-1 h-1 bg-gray-500 rounded-full" style={{ animationDelay: "0.1s" }}></div>
                            <div className="animate-bounce w-1 h-1 bg-gray-500 rounded-full" style={{ animationDelay: "0.2s" }}></div>
                          </div>
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
                    disabled={!selectedAgent || sendMessageMutation.isPending}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    disabled={!input.trim() || !selectedAgent || sendMessageMutation.isPending}
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
    </DashboardLayout>
  );
}