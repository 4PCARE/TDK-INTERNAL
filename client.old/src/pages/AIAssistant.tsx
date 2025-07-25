import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/Layout/Sidebar";
import TopBar from "@/components/TopBar";
import ChatModal from "@/components/Chat/ChatModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  MessageSquare, 
  Send, 
  Bot, 
  User, 
  FileText,
  Plus,
  Loader2,
  Sparkles,
  Clock,
  Hash,
  Database,
  Globe
} from "lucide-react";

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ title: string; id: number }>;
  createdAt: string;
}

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
}

export default function AIAssistant() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"documents" | "database" | "api">("documents");
  const [selectedConnection, setSelectedConnection] = useState<number | null>(null);

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

  // Get conversations
  const { data: conversations } = useQuery({
    queryKey: ["/api/chat/conversations"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Get messages for current conversation
  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["/api/chat/conversations", currentConversationId, "messages"],
    queryFn: async () => {
      if (!currentConversationId) return [];
      const response = await apiRequest('GET', `/api/chat/conversations/${currentConversationId}/messages`);
      return await response.json();
    },
    enabled: !!currentConversationId && isAuthenticated,
    retry: false,
  });

  // Get documents for context
  const { data: documents } = useQuery({
    queryKey: ["/api/documents"],
    enabled: isAuthenticated && activeTab === "documents",
    retry: false,
  });

  // Get data connections for database and API chat
  const { data: dataConnections } = useQuery({
    queryKey: ["/api/data-connections"],
    enabled: isAuthenticated && (activeTab === "database" || activeTab === "api"),
    retry: false,
  });

  // Create new conversation
  const createConversationMutation = useMutation({
    mutationFn: async (title: string) => {
      const response = await apiRequest('POST', '/api/chat/conversations', { title });
      return await response.json();
    },
    onSuccess: (conversation) => {
      setCurrentConversationId(conversation.id);
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
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
        description: "Failed to create conversation",
        variant: "destructive",
      });
    },
  });

  // Send message
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!currentConversationId) {
        throw new Error("No conversation selected");
      }

      // Handle different chat types
      if (activeTab === "database" && selectedConnection) {
        const response = await apiRequest('POST', '/api/chat/database', {
          message: content,
          connectionId: selectedConnection,
        });
        const result = await response.json();
        
        // Create a chat message with the database response
        const messageResponse = await apiRequest('POST', '/api/chat/messages', {
          conversationId: currentConversationId,
          content: result.response,
          role: 'assistant',
        });
        return await messageResponse.json();
      } else if (activeTab === "api" && selectedConnection) {
        // For API connections, use regular chat for now
        const response = await apiRequest('POST', '/api/chat/messages', {
          conversationId: currentConversationId,
          content,
        });
        return await response.json();
      } else {
        // Default document chat
        const response = await apiRequest('POST', '/api/chat/messages', {
          conversationId: currentConversationId,
          content,
        });
        return await response.json();
      }
    },
    onSuccess: () => {
      setMessageInput("");
      queryClient.invalidateQueries({ 
        queryKey: ["/api/chat/conversations", currentConversationId, "messages"] 
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
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    // Validate based on active tab
    if ((activeTab === "database" || activeTab === "api") && !selectedConnection) {
      toast({
        title: "Connection Required",
        description: `Please select a ${activeTab} connection before sending a message.`,
        variant: "destructive",
      });
      return;
    }

    // Create conversation if none exists
    if (!currentConversationId) {
      const title = messageInput.slice(0, 50) + (messageInput.length > 50 ? "..." : "");
      const conversation = await createConversationMutation.mutateAsync(title);
      if (conversation) {
        setCurrentConversationId(conversation.id);
        // Now send the message
        setTimeout(() => {
          sendMessageMutation.mutate(messageInput);
        }, 100);
      }
      return;
    }

    sendMessageMutation.mutate(messageInput);
  };

  const handleNewConversation = () => {
    setCurrentConversationId(null);
    setMessageInput("");
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getRecentDocuments = () => {
    if (!documents || !Array.isArray(documents)) return [];
    return documents.slice(0, 5);
  };

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar 
        isMobileOpen={isMobileMenuOpen} 
        onMobileClose={() => setIsMobileMenuOpen(false)}
        onOpenChat={() => setIsChatModalOpen(true)}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900">AI Assistant</h1>
                  <p className="text-gray-600">Query your knowledge base and get intelligent insights</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Chat Interface */}
              <div className="lg:col-span-2">
                <Card className="h-[600px] flex flex-col">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <CardTitle className="flex items-center space-x-2">
                        <Bot className="w-5 h-5 text-blue-500" />
                        <span>AI Assistant Chat</span>
                      </CardTitle>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleNewConversation}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        New Chat
                      </Button>
                    </div>
                    
                    {/* Chat Categories */}
                    <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                      <button
                        onClick={() => setActiveTab("documents")}
                        className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          activeTab === "documents"
                            ? "bg-white text-blue-600 shadow-sm"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                        <span>Documents</span>
                      </button>
                      <button
                        onClick={() => setActiveTab("database")}
                        className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          activeTab === "database"
                            ? "bg-white text-blue-600 shadow-sm"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        <Database className="w-4 h-4" />
                        <span>Database</span>
                      </button>
                      <button
                        onClick={() => setActiveTab("api")}
                        className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          activeTab === "api"
                            ? "bg-white text-blue-600 shadow-sm"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        <Globe className="w-4 h-4" />
                        <span>API</span>
                      </button>
                    </div>

                    {/* Connection Selection for Database and API */}
                    {(activeTab === "database" || activeTab === "api") && dataConnections && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Select {activeTab === "database" ? "Database" : "API"} Connection:
                        </label>
                        <select
                          value={selectedConnection || ""}
                          onChange={(e) => setSelectedConnection(e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Select a connection...</option>
                          {Array.isArray(dataConnections) && dataConnections
                            .filter((conn: any) => 
                              activeTab === "database" 
                                ? conn.type === "database" 
                                : conn.type === "api"
                            )
                            .map((conn: any) => (
                              <option key={conn.id} value={conn.id}>
                                {conn.name} ({conn.dbType || conn.apiUrl})
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </CardHeader>
                  
                  <CardContent className="flex-1 flex flex-col min-h-0 p-4 pt-0">
                    <ScrollArea className="flex-1 pr-4">
                      <div className="space-y-4">
                        {!currentConversationId ? (
                          // Welcome message based on active tab
                          <div className="flex space-x-3">
                            <Avatar className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 flex-shrink-0">
                              <AvatarFallback>
                                <Bot className="w-4 h-4 text-white" />
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="bg-gray-100 rounded-lg rounded-tl-none p-4">
                                {activeTab === "documents" && (
                                  <>
                                    <p className="text-sm text-gray-700 mb-3">
                                      Hello! I can help you explore your uploaded documents.
                                    </p>
                                    <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                                      <li>Search through your uploaded documents</li>
                                      <li>Answer questions about document content</li>
                                      <li>Summarize information across multiple files</li>
                                      <li>Help with document classification and organization</li>
                                    </ul>
                                  </>
                                )}
                                {activeTab === "database" && (
                                  <>
                                    <p className="text-sm text-gray-700 mb-3">
                                      I can help you query and analyze your database connections.
                                    </p>
                                    <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                                      <li>Generate SQL queries based on your questions</li>
                                      <li>Explain database schema and relationships</li>
                                      <li>Analyze data patterns and insights</li>
                                      <li>Help with data exploration and reporting</li>
                                    </ul>
                                    {!selectedConnection && (
                                      <p className="text-sm text-orange-600 mt-3">
                                        Please select a database connection above to start chatting.
                                      </p>
                                    )}
                                  </>
                                )}
                                {activeTab === "api" && (
                                  <>
                                    <p className="text-sm text-gray-700 mb-3">
                                      I can help you interact with your API connections.
                                    </p>
                                    <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                                      <li>Make API calls and analyze responses</li>
                                      <li>Help with API endpoint exploration</li>
                                      <li>Format and interpret API data</li>
                                      <li>Assist with API integration questions</li>
                                    </ul>
                                    {!selectedConnection && (
                                      <p className="text-sm text-orange-600 mt-3">
                                        Please select an API connection above to start chatting.
                                      </p>
                                    )}
                                  </>
                                )}
                                <p className="text-sm text-gray-700 mt-3">
                                  What would you like to know?
                                </p>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">AI Assistant</p>
                            </div>
                          </div>
                        ) : messagesLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                          </div>
                        ) : messages && Array.isArray(messages) && messages.length > 0 ? (
                          messages.map((message: Message) => (
                            <div key={message.id} className={`flex space-x-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
                              {message.role === 'assistant' && (
                                <Avatar className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 flex-shrink-0">
                                  <AvatarFallback>
                                    <Bot className="w-4 h-4 text-white" />
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              
                              <div className={`flex-1 ${message.role === 'user' ? 'max-w-xs' : ''}`}>
                                <div className={`rounded-lg p-3 ${
                                  message.role === 'user' 
                                    ? 'bg-blue-500 text-white rounded-tr-none' 
                                    : 'bg-gray-100 text-gray-700 rounded-tl-none'
                                }`}>
                                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                  
                                  {/* Sources for AI messages */}
                                  {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                                    <div className="border-t border-gray-200 pt-2 mt-3">
                                      <p className="text-xs font-medium text-gray-600 mb-2">Sources:</p>
                                      <div className="space-y-1">
                                        {message.sources.map((source, index) => (
                                          <div key={index} className="flex items-center space-x-2 text-xs text-gray-500">
                                            <FileText className="w-3 h-3 text-blue-500" />
                                            <span className="truncate">{source.title}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <p className={`text-xs text-gray-500 mt-1 ${message.role === 'user' ? 'text-right' : ''}`}>
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
                            <p className="text-sm">Start a conversation by asking a question!</p>
                          </div>
                        )}
                        
                        {/* Loading indicator for pending messages */}
                        {(sendMessageMutation.isPending || createConversationMutation.isPending) && (
                          <div className="flex space-x-3">
                            <Avatar className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 flex-shrink-0">
                              <AvatarFallback>
                                <Bot className="w-4 h-4 text-white" />
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="bg-gray-100 rounded-lg rounded-tl-none p-3">
                                <div className="flex items-center space-x-2">
                                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                  <p className="text-sm text-gray-500">Thinking...</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </ScrollArea>

                    {/* Chat Input */}
                    <form onSubmit={handleSendMessage} className="flex items-center space-x-2 mt-4">
                      <Input
                        type="text"
                        placeholder={currentConversationId ? "Ask about your documents..." : "Start a new conversation..."}
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        className="flex-1"
                        disabled={sendMessageMutation.isPending || createConversationMutation.isPending}
                      />
                      <Button 
                        type="submit"
                        disabled={!messageInput.trim() || sendMessageMutation.isPending || createConversationMutation.isPending}
                        className="bg-blue-500 text-white hover:bg-blue-600"
                      >
                        {sendMessageMutation.isPending || createConversationMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar with document context and conversation history */}
              <div className="space-y-6">
                {/* Recent Documents */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <FileText className="w-5 h-5 text-blue-500" />
                      <span>Available Documents</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {getRecentDocuments().length > 0 ? (
                      <div className="space-y-3">
                        {getRecentDocuments().map((doc: any) => (
                          <div key={doc.id} className="border border-gray-200 rounded-lg p-3">
                            <h4 className="font-medium text-gray-800 text-sm truncate">
                              {doc.name || doc.originalName}
                            </h4>
                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center space-x-2">
                                {doc.aiCategory && (
                                  <Badge variant="outline" className="text-xs">
                                    {doc.aiCategory}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-gray-500">
                                {new Date(doc.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            {doc.tags && doc.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {doc.tags.slice(0, 3).map((tag: string) => (
                                  <Badge key={tag} variant="secondary" className="text-xs">
                                    <Hash className="w-2 h-2 mr-1" />
                                    {tag}
                                  </Badge>
                                ))}
                                {doc.tags.length > 3 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{doc.tags.length - 3}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        {documents && Array.isArray(documents) && documents.length > 5 && (
                          <p className="text-xs text-gray-500 text-center">
                            +{documents.length - 5} more documents available
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-500">
                        <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">No documents uploaded yet</p>
                        <p className="text-xs text-gray-400">Upload documents to start chatting</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Conversation History */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Clock className="w-5 h-5 text-blue-500" />
                      <span>Recent Conversations</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {conversations && Array.isArray(conversations) && conversations.length > 0 ? (
                      <div className="space-y-2">
                        {conversations.slice(0, 5).map((conversation: Conversation) => (
                          <button
                            key={conversation.id}
                            onClick={() => setCurrentConversationId(conversation.id)}
                            className={`w-full text-left p-3 rounded-lg border transition-colors ${
                              currentConversationId === conversation.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <h4 className="font-medium text-gray-800 text-sm truncate">
                              {conversation.title}
                            </h4>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(conversation.createdAt).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-500">
                        <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">No conversations yet</p>
                        <p className="text-xs text-gray-400">Start chatting to see history</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>

      <ChatModal 
        isOpen={isChatModalOpen} 
        onClose={() => setIsChatModalOpen(false)} 
      />
    </div>
  );
}