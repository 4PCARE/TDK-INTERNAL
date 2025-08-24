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
  Loader2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [input, setInput] = useState(""); // Renamed from newMessage to input to match mutation
  const [isCreatingSession, setIsCreatingSession] = useState(false);
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
    onSuccess: (data) => {
      console.log('✅ Message sent successfully:', data);
      setInput("");

      // Force refetch messages to ensure UI updates
      setTimeout(() => {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/internal-agent-chat/messages', currentSessionId] 
        });
        refetchMessages();
      }, 100);
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

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-120px)] bg-gray-50 gap-4 p-4">
        {/* Left Panel - Agent List */}
        <div className="w-80 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">AI Agents</h2>
              <Button
                size="sm"
                onClick={() => window.location.href = '/agent-chatbots'}
                className="bg-blue-500 hover:bg-blue-600"
              >
                <Plus className="w-4 h-4 mr-2" />
                Manage
              </Button>
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
                          <p className="font-medium text-gray-900 truncate">{agent.name}</p>
                          <p className="text-sm text-gray-500 truncate">{agent.description}</p>
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

        {/* Middle Panel - Session History */}
        <div className="w-80 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Chat History</h2>
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
                      "p-3 rounded-lg cursor-pointer transition-all border",
                      selectedSession?.id === session.id
                        ? "bg-blue-50 border-blue-200"
                        : "hover:bg-gray-50 border-transparent"
                    )}
                    onClick={() => setSelectedSession(session)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{session.title}</p>
                        {session.lastMessage && (
                          <p className="text-sm text-gray-500 truncate mt-1">
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
                              <AvatarFallback>
                                <Bot className="w-4 h-4 text-white" />
                              </AvatarFallback>
                            </Avatar>
                          )}

                          <div className={`flex-1 max-w-xs lg:max-w-md ${message.role === 'user' ? 'flex justify-end' : ''}`}>
                            <div className={`rounded-lg px-4 py-3 ${
                              message.role === 'user' 
                                ? 'bg-blue-500 text-white rounded-tr-none' 
                                : 'bg-gray-100 text-gray-900 rounded-tl-none'
                            }`}>
                              <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                            </div>
                            <p className={`text-xs text-gray-500 mt-1 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                              {formatTime(message.createdAt)}
                            </p>
                          </div>

                          {message.role === 'user' && (
                            <Avatar className="w-8 h-8 flex-shrink-0">
                              <AvatarFallback>
                                <User className="w-4 h-4" />
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

                  {(sendMessageMutation.isPending || isCreatingSession) && (
                    <div className="flex items-start space-x-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback>
                          <Bot className="w-4 h-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="bg-gray-100 rounded-lg p-3">
                          <div className="flex items-center space-x-2">
                            <div className="animate-bounce w-2 h-2 bg-gray-400 rounded-full"></div>
                            <div className="animate-bounce w-2 h-2 bg-gray-400 rounded-full" style={{ animationDelay: "0.1s" }}></div>
                            <div className="animate-bounce w-2 h-2 bg-gray-400 rounded-full" style={{ animationDelay: "0.2s" }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
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