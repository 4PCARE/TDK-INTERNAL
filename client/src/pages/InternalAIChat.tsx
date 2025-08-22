
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Send,
  User,
  MessageSquare,
  Settings,
  FileText,
  Trash2,
  Plus,
} from "lucide-react";
import { FeedbackButtons } from "@/components/FeedbackButtons";

interface AgentChatbot {
  id: number;
  name: string;
  description?: string;
  personality?: string;
  profession?: string;
  isActive: boolean;
  memoryEnabled?: boolean;
  memoryLimit?: number;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ChatSession {
  id: string;
  agentId: number;
  agentName: string;
  createdAt: string;
  messageCount: number;
}

export default function InternalAIChat() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();

  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

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

  // Fetch user's agents
  const { data: agents = [], isLoading: isLoadingAgents } = useQuery({
    queryKey: ["/api/agent-chatbots"],
    enabled: isAuthenticated,
    retry: false,
  }) as { data: AgentChatbot[]; isLoading: boolean };

  // Fetch chat sessions for selected agent
  const { data: sessions = [] } = useQuery({
    queryKey: ["/api/internal-chat/sessions", selectedAgentId],
    enabled: isAuthenticated && !!selectedAgentId,
    retry: false,
  }) as { data: ChatSession[]; isLoading: boolean };

  // Create new chat session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (agentId: number) => {
      const response = await apiRequest("POST", "/api/internal-chat/sessions", {
        agentId,
        title: `Chat with ${agents.find(a => a.id === agentId)?.name || 'Agent'} - ${new Date().toLocaleDateString()}`,
      });
      return response.json();
    },
    onSuccess: (session) => {
      setCurrentSessionId(session.id);
      setChatHistory([]);
      queryClient.invalidateQueries({
        queryKey: ["/api/internal-chat/sessions", selectedAgentId],
      });
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
        description: "Failed to create chat session",
        variant: "destructive",
      });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!currentSessionId || !selectedAgentId) {
        throw new Error("No active session");
      }

      const response = await apiRequest("POST", "/api/internal-chat/message", {
        sessionId: currentSessionId,
        agentId: selectedAgentId,
        content,
      });
      return response.json();
    },
    onSuccess: (data) => {
      // Add user message and AI response to chat history
      const userMessage: ChatMessage = {
        id: Date.now(),
        role: "user",
        content: messageInput,
        createdAt: new Date().toISOString(),
      };
      
      const assistantMessage: ChatMessage = {
        id: Date.now() + 1,
        role: "assistant", 
        content: data.response,
        createdAt: new Date().toISOString(),
      };

      setChatHistory(prev => [...prev, userMessage, assistantMessage]);
      setMessageInput("");

      // Auto-scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
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
        title: "Error sending message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle agent selection
  const handleAgentSelect = (agentId: string) => {
    const id = parseInt(agentId);
    setSelectedAgentId(id);
    setCurrentSessionId(null);
    setChatHistory([]);
  };

  // Handle new chat session
  const handleNewChat = () => {
    if (!selectedAgentId) {
      toast({
        title: "No Agent Selected",
        description: "Please select an agent first",
        variant: "destructive",
      });
      return;
    }
    createSessionMutation.mutate(selectedAgentId);
  };

  // Handle send message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || sendMessageMutation.isPending) return;

    if (!currentSessionId) {
      toast({
        title: "No Active Session",
        description: "Please start a new chat first",
        variant: "destructive",
      });
      return;
    }

    sendMessageMutation.mutate(messageInput.trim());
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

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
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Internal AI Chat Studio</h1>
              <p className="text-gray-600">Test and interact with your AI agents directly</p>
            </div>
          </div>

          {selectedAgentId && (
            <Button onClick={handleNewChat} disabled={createSessionMutation.isPending}>
              <Plus className="w-4 h-4 mr-2" />
              New Chat
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Agent Selection Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            {/* Agent Selector */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Select Agent</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={selectedAgentId?.toString() || ""} onValueChange={handleAgentSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an agent to chat with" />
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
                {agents.filter(agent => agent.isActive).length === 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    No active agents found. Create and activate an agent first.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Selected Agent Info */}
            {selectedAgent && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Agent Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">{selectedAgent.name}</p>
                    {selectedAgent.description && (
                      <p className="text-xs text-slate-600">{selectedAgent.description}</p>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-1">
                    {selectedAgent.personality && (
                      <Badge variant="secondary" className="text-xs">
                        {selectedAgent.personality}
                      </Badge>
                    )}
                    {selectedAgent.profession && (
                      <Badge variant="outline" className="text-xs">
                        {selectedAgent.profession}
                      </Badge>
                    )}
                  </div>

                  {selectedAgent.memoryEnabled && (
                    <div className="text-xs text-slate-600">
                      <Settings className="w-3 h-3 inline mr-1" />
                      Memory: {selectedAgent.memoryLimit} messages
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Recent Sessions */}
            {selectedAgentId && sessions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Recent Sessions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {sessions.slice(0, 5).map((session) => (
                      <div
                        key={session.id}
                        className={`p-2 rounded cursor-pointer text-xs transition-colors ${
                          currentSessionId === session.id
                            ? "bg-blue-100 border border-blue-200"
                            : "hover:bg-slate-50"
                        }`}
                        onClick={() => setCurrentSessionId(session.id)}
                      >
                        <div className="font-medium truncate">{session.agentName}</div>
                        <div className="text-slate-500">
                          {session.messageCount} messages • {new Date(session.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Chat Interface */}
          <div className="lg:col-span-3">
            <Card className="h-[600px] flex flex-col">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center space-x-2">
                    <Bot className="w-5 h-5 text-purple-500" />
                    <span>
                      {selectedAgent ? `Chat with ${selectedAgent.name}` : "Select an Agent to Start"}
                    </span>
                  </CardTitle>
                  {currentSessionId && (
                    <Badge variant="outline" className="text-xs">
                      Session Active
                    </Badge>
                  )}
                </div>
              </CardHeader>

              {/* Chat Messages */}
              <CardContent className="flex-1 flex flex-col p-0">
                <ScrollArea className="flex-1 px-6" ref={scrollAreaRef}>
                  <div className="space-y-4 py-4">
                    {!selectedAgent ? (
                      <div className="flex items-center justify-center h-64 text-slate-500">
                        <div className="text-center">
                          <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>Select an agent from the sidebar to start chatting</p>
                        </div>
                      </div>
                    ) : !currentSessionId ? (
                      <div className="flex items-center justify-center h-64 text-slate-500">
                        <div className="text-center">
                          <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>Click "New Chat" to start a conversation with {selectedAgent.name}</p>
                        </div>
                      </div>
                    ) : chatHistory.length === 0 ? (
                      <div className="flex items-start space-x-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback>
                            <Bot className="w-5 h-5 text-purple-600" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="text-sm text-gray-900">
                            Hello! I'm {selectedAgent.name}. How can I help you today?
                          </p>
                          <p className="text-xs text-gray-500 mt-1">Just now</p>
                        </div>
                      </div>
                    ) : (
                      chatHistory.map((message) => (
                        <div key={message.id} className="flex items-start space-x-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback>
                              {message.role === "assistant" ? (
                                <Bot className="w-5 h-5 text-purple-600" />
                              ) : (
                                <User className="w-5 h-5 text-gray-600" />
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="text-sm text-gray-900 whitespace-pre-wrap">
                              {message.content}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(message.createdAt).toLocaleTimeString()}
                            </p>
                            {message.role === "assistant" && (
                              <div className="mt-2">
                                <FeedbackButtons
                                  messageId={message.id}
                                  userQuery={chatHistory[chatHistory.findIndex(m => m.id === message.id) - 1]?.content || ""}
                                  assistantResponse={message.content}
                                  conversationId={null}
                                  documentContext={{ mode: "internal_chat", agentId: selectedAgentId }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}

                    {sendMessageMutation.isPending && (
                      <div className="flex items-start space-x-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback>
                            <Bot className="w-5 h-5 text-purple-600" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <div className="animate-bounce w-2 h-2 bg-gray-400 rounded-full"></div>
                            <div
                              className="animate-bounce w-2 h-2 bg-gray-400 rounded-full"
                              style={{ animationDelay: "0.1s" }}
                            ></div>
                            <div
                              className="animate-bounce w-2 h-2 bg-gray-400 rounded-full"
                              style={{ animationDelay: "0.2s" }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Chat Input */}
                {selectedAgent && currentSessionId && (
                  <div className="flex-shrink-0 p-4 border-t border-gray-200">
                    <form
                      onSubmit={handleSendMessage}
                      className="flex items-center space-x-3"
                    >
                      <Input
                        type="text"
                        placeholder={`Message ${selectedAgent.name}...`}
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={sendMessageMutation.isPending}
                        className="flex-1"
                      />
                      <Button
                        type="submit"
                        disabled={
                          !messageInput.trim() || sendMessageMutation.isPending
                        }
                        className="bg-purple-500 hover:bg-purple-600"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </form>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
