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
  FileText
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';

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
  const [newMessage, setNewMessage] = useState("");
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch agents
  const { data: agents = [], isLoading: isLoadingAgents } = useQuery({
    queryKey: ["/api/agent-chatbots"],
    queryFn: async () => {
      const response = await fetch("/api/agent-chatbots");
      if (!response.ok) throw new Error("Failed to fetch agents");
      return response.json();
    },
  }) as { data: Agent[]; isLoading: boolean };

  // Fetch chat sessions for selected agent
  const { data: sessions = [], isLoading: isLoadingSessions } = useQuery({
    queryKey: ["/api/internal-agent-chat/sessions", selectedAgent?.id],
    queryFn: async () => {
      if (!selectedAgent) return [];
      const response = await fetch(`/api/internal-agent-chat/sessions?agentId=${selectedAgent.id}`);
      if (!response.ok) throw new Error("Failed to fetch sessions");
      return response.json();
    },
    enabled: !!selectedAgent,
  }) as { data: ChatSession[]; isLoading: boolean };

  // Fetch messages for selected session
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery({
    queryKey: ["/api/internal-agent-chat/messages", selectedSession?.id],
    queryFn: async () => {
      if (!selectedSession) return [];
      const response = await fetch(`/api/internal-agent-chat/messages?sessionId=${selectedSession.id}`);
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    enabled: !!selectedSession,
  }) as { data: ChatMessage[]; isLoading: boolean };

  // Create new session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (agentId: number) => {
      const response = await fetch("/api/internal-agent-chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          title: `New Chat - ${new Date().toLocaleDateString()}`,
        }),
      });
      if (!response.ok) throw new Error("Failed to create session");
      return response.json();
    },
    onSuccess: (newSession) => {
      setSelectedSession(newSession);
      queryClient.invalidateQueries({
        queryKey: ["/api/internal-agent-chat/sessions", selectedAgent?.id],
      });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedSession || !selectedAgent) throw new Error("No session or agent selected");

      const response = await fetch("/api/internal-agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          agentId: selectedAgent.id,
          sessionId: selectedSession.id,
        }),
      });
      if (!response.ok) throw new Error("Failed to send message");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/internal-agent-chat/messages", selectedSession?.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/internal-agent-chat/sessions", selectedAgent?.id],
      });
      setNewMessage("");
    },
    onError: (error) => {
      toast({
        title: "Error sending message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const response = await fetch(`/api/internal-agent-chat/sessions/${sessionId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete session");
    },
    onSuccess: () => {
      setSelectedSession(null);
      queryClient.invalidateQueries({
        queryKey: ["/api/internal-agent-chat/sessions", selectedAgent?.id],
      });
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sendMessageMutation.isPending) return;

    if (!selectedSession && selectedAgent) {
      // Create new session first
      setIsCreatingSession(true);
      createSessionMutation.mutate(selectedAgent.id, {
        onSuccess: (newSession) => {
          setIsCreatingSession(false);
          // Wait a bit for the session to be created, then send the message
          setTimeout(() => {
            sendMessageMutation.mutate(newMessage.trim());
          }, 100);
        },
        onError: () => {
          setIsCreatingSession(false);
        },
      });
    } else if (selectedSession) {
      sendMessageMutation.mutate(newMessage.trim());
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
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
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
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
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
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-start space-x-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback>
                          <Bot className="w-4 h-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="bg-gray-100 rounded-lg p-3">
                          <p className="text-sm text-gray-900">
                            Hello! I'm {selectedAgent.name}. How can I help you today?
                          </p>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Just now</p>
                      </div>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div key={message.id} className="flex items-start space-x-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback>
                            {message.role === "assistant" ? (
                              <Bot className="w-4 h-4" />
                            ) : (
                              <User className="w-4 h-4" />
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div
                            className={cn(
                              "rounded-lg p-3",
                              message.role === "assistant"
                                ? "bg-gray-100"
                                : "bg-blue-500 text-white"
                            )}
                          >
                            {message.role === "assistant" ? (
                              <ReactMarkdown className="text-sm prose prose-sm max-w-none">
                                {message.content}
                              </ReactMarkdown>
                            ) : (
                              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatTime(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))
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
                <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
                  <Input
                    type="text"
                    placeholder={`Ask ${selectedAgent.name} anything...`}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    disabled={sendMessageMutation.isPending || isCreatingSession}
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    disabled={!newMessage.trim() || sendMessageMutation.isPending || isCreatingSession}
                    className="bg-blue-500 hover:bg-blue-600"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}