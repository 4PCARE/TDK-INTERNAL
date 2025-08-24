import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import {
  Brain,
  Send,
  User,
  Bot,
  Copy,
  RefreshCw,
  MessageSquare,
  Sparkles,
  Loader2
} from "lucide-react";

// Real API implementation
const apiRequest = async (method: string, url: string, body?: any) => {
  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies for authentication
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    return response;
  } catch (error) {
    console.error('API Request Error:', error);
    throw error;
  }
};


interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface Agent {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
}

export default function InternalAIChat() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Get available documents for context
  const { data: documents = [] } = useQuery({
    queryKey: ["/api/documents"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/documents");
      if (!response.ok) {
        throw new Error("Failed to fetch documents");
      }
      return response.json();
    },
    retry: false,
  });

  // Get available agents
  const { data: agents = [] } = useQuery({
    queryKey: ["/api/agent-chatbots"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/agent-chatbots");
      if (!response.ok) {
        throw new Error("Failed to fetch agents");
      }
      return response.json();
    },
    retry: false,
  }) as { data: Agent[] };

  // Using state to keep track of selected agent and document for clarity in mutations
  const selectedBot = selectedAgentId ? parseInt(selectedAgentId) : null;
  const selectedDocument = documents.length > 0 ? documents[0].id : null; // Assuming first document is selected for now

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      // If a bot is selected, use agent chat endpoint
      if (selectedBot) {
        const response = await apiRequest("POST", "/api/agent-chatbots/test-chat", {
          message: content,
          agentConfig: {
            id: selectedBot,
            name: agents.find(a => a.id === selectedBot)?.name || "Selected Agent"
          },
          documentIds: selectedDocument ? [selectedDocument] : [],
          chatHistory: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Unauthorized - Please log in again");
          }
          const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
          throw new Error(errorData.message || "Failed to send message to agent");
        }
        return response.json();
      }

      // Otherwise use the search endpoint for regular chat with document context
      const response = await apiRequest("POST", "/api/search", {
        query: content,
        searchType: "smart_hybrid",
        documentIds: selectedDocument ? [selectedDocument] : undefined,
        keywordWeight: 0.4,
        vectorWeight: 0.6
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Unauthorized - Please log in again");
        }
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || "Failed to send message");
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Add user message first
      setMessages(prev => [...prev, {
        id: Date.now().toString() + "-user",
        role: "user" as const,
        content: inputMessage,
        timestamp: new Date().toISOString()
      }]);

      // Handle different response formats
      let assistantContent = "";

      if (selectedBot) {
        // Handle agent chatbot response
        assistantContent = data?.response || "No response received from agent";
      } else {
        // Handle search API response
        if (data?.aiResponse) {
          assistantContent = data.aiResponse;
        } else if (data?.response) {
          assistantContent = data.response;
        } else if (data?.content) {
          assistantContent = data.content;
        } else {
          assistantContent = "No response received from search";
        }
      }

      // Add assistant response
      setMessages(prev => [...prev, {
        id: Date.now().toString() + "-assistant",
        role: "assistant" as const,
        content: assistantContent,
        timestamp: new Date().toISOString()
      }]);

      setInputMessage(""); // Clear input after successful send
      setIsLoading(false);
    },
    onError: (error: any) => {
      console.error("Chat error:", error);
      toast({
        title: "Message Failed",
        description: error.message || "Failed to send message to AI assistant.",
        variant: "destructive",
      });
      setIsLoading(false);
    },
  });

  const handleSendMessage = (content: string = inputMessage) => {
    if (!content.trim()) return;

    setInputMessage(""); // Clear input immediately
    setIsLoading(true);
    sendMessageMutation.mutate(content.trim());
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Message copied to clipboard.",
    });
  };

  const clearChat = () => {
    setMessages([]);
    toast({
      title: "Chat Cleared",
      description: "All messages have been cleared.",
    });
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Live Chat</h1>
              <p className="text-gray-600">Chat with your AI assistant using your knowledge base</p>
            </div>
          </div>

          <Button variant="outline" onClick={clearChat}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Clear Chat
          </Button>
        </div>

        {/* Agent Selection */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <Label htmlFor="agent-select">Select AI Agent</Label>
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger id="agent-select">
                  <SelectValue placeholder="Choose an AI agent to chat with" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default AI Assistant</SelectItem>
                  {agents.filter(agent => agent.isActive).map((agent) => (
                    <SelectItem key={agent.id} value={agent.id.toString()}>
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4" />
                        <div className="flex flex-col">
                          <span className="font-medium">{agent.name}</span>
                          {agent.description && (
                            <span className="text-xs text-gray-500">{agent.description}</span>
                          )}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {selectedAgentId && selectedAgentId !== "default"
                  ? `Chatting with ${agents.find(a => a.id.toString() === selectedAgentId)?.name || 'selected agent'}`
                  : 'Using default AI assistant for general questions'
                }
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Chat Interface */}
        <div className="flex-1 flex flex-col min-h-0">
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MessageSquare className="w-5 h-5" />
                <span>Live AI Chat</span>
                {selectedAgentId && selectedAgentId !== "default" && (
                  <div className="flex items-center space-x-1 text-sm text-purple-600">
                    <Bot className="w-4 h-4" />
                    <span>{agents.find(a => a.id.toString() === selectedAgentId)?.name}</span>
                  </div>
                )}
                <div className="ml-auto text-sm text-gray-500">
                  {documents.length} documents available
                </div>
              </CardTitle>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col space-y-4 min-h-0">
              {/* Messages Container */}
              <ScrollArea className="flex-1 pr-4 min-h-0" style={{ maxHeight: "calc(100vh - 300px)" }}>
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <div className="text-center py-8">
                      {selectedAgentId ? (
                        <Bot className="w-12 h-12 text-purple-400 mx-auto mb-4" />
                      ) : (
                        <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      )}
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        {selectedAgentId && selectedAgentId !== "default"
                          ? `Chat with ${agents.find(a => a.id.toString() === selectedAgentId)?.name}`
                          : 'Welcome to AI Live Chat'
                        }
                      </h3>
                      <p className="text-gray-500 mb-4">
                        {selectedAgentId && selectedAgentId !== "default"
                          ? `Start a conversation with your selected AI agent. ${agents.find(a => a.id.toString() === selectedAgentId)?.description || 'This agent can help answer your questions using the knowledge base.'}`
                          : 'Start a conversation with your AI assistant. I can help answer questions about your documents and provide insights from your knowledge base.'
                        }
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSendMessage("What documents do I have available?")}
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          What documents are available?
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSendMessage("Help me search for information")}
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Help me search
                        </Button>
                        {(!selectedAgentId || selectedAgentId === "default") && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSendMessage("What can you help me with?")}
                          >
                            <Brain className="w-4 h-4 mr-2" />
                            What can you help with?
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex space-x-3 ${
                          message.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {message.role === 'assistant' && (
                          <Avatar className="w-8 h-8 bg-purple-100 flex-shrink-0">
                            <AvatarFallback>
                              <Bot className="w-4 h-4 text-purple-600" />
                            </AvatarFallback>
                          </Avatar>
                        )}

                        <div
                          className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                            message.role === 'user'
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          <div className="text-sm whitespace-pre-wrap">
                            {message.content}
                          </div>
                          <div className="text-xs mt-1 opacity-70">
                            {formatTime(message.timestamp)}
                          </div>

                          {message.role === 'assistant' && (
                            <div className="flex items-center space-x-2 mt-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(message.content)}
                                className="h-6 px-2"
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {message.role === 'user' && (
                          <Avatar className="w-8 h-8 bg-blue-100 flex-shrink-0">
                            <AvatarFallback>
                              <User className="w-4 h-4 text-blue-600" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    ))
                  )}

                  {isLoading && (
                    <div className="flex space-x-3 justify-start">
                      <Avatar className="w-8 h-8 bg-purple-100">
                        <AvatarFallback>
                          <Bot className="w-4 h-4 text-purple-600" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="bg-gray-100 px-4 py-2 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                          <span className="text-sm text-gray-500">AI is thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input Area */}
              <div className="flex space-x-2">
                <Textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Ask me anything about your documents or knowledge base..."
                  className="flex-1 min-h-[80px] resize-none"
                  onKeyDown={handleKeyDown}
                />
                <Button
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim() || isLoading}
                  className="px-4"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}