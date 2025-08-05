
import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { MessageSquare, X, Send, Loader2, Bot, User, Minimize2, Maximize2, Menu, ArrowLeft, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
}

interface Conversation {
  id: string;
  title: string;
  lastMessage?: string;
  updatedAt: string;
}

export default function FloatingAIWidget() {
  // Always call all hooks in the same order
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showConversations, setShowConversations] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();

  // Always call useQuery hooks
  const { data: conversations = [] } = useQuery({
    queryKey: ["/api/chat/conversations"],
    queryFn: async () => {
      if (!isAuthenticated) return [];
      const response = await fetch("/api/chat/conversations", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch conversations");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const { data: messages = [], isLoading: isLoadingMessages } = useQuery({
    queryKey: ["/api/chat/conversations", currentConversationId, "messages"],
    queryFn: async () => {
      if (!currentConversationId) return [];
      const response = await fetch(`/api/chat/conversations/${currentConversationId}/messages`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    enabled: isAuthenticated && !!currentConversationId,
  });

  // Always call useMutation hooks
  const sendMessageMutation = useMutation({
    mutationFn: async ({ message, conversationId }: { message: string; conversationId?: string }) => {
      const response = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message,
          conversationId,
          source: "floating-widget"
        }),
      });
      if (!response.ok) throw new Error("Failed to send message");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.conversationId) {
        setCurrentConversationId(data.conversationId);
        queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
        queryClient.invalidateQueries({ 
          queryKey: ["/api/chat/conversations", data.conversationId, "messages"] 
        });
      }
      setInputMessage("");
    },
  });

  const createConversationMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          title: `New Chat ${new Date().toLocaleTimeString()}`,
        }),
      });
      if (!response.ok) throw new Error("Failed to create conversation");
      return response.json();
    },
    onSuccess: (data) => {
      setCurrentConversationId(data.id);
      setShowConversations(false);
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/chat/conversations", data.id, "messages"] 
      });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (conversations.length > 0 && !currentConversationId) {
      setCurrentConversationId(conversations[0].id);
    }
  }, [conversations, currentConversationId]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !isAuthenticated) return;

    try {
      let conversationId = currentConversationId;
      
      if (!conversationId) {
        const newConversation = await createConversationMutation.mutateAsync();
        conversationId = newConversation.id;
      }

      await sendMessageMutation.mutateAsync({
        message: inputMessage,
        conversationId: conversationId,
      });
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startNewConversation = async () => {
    try {
      await createConversationMutation.mutateAsync();
    } catch (error) {
      console.error("Failed to create new conversation:", error);
    }
  };

  const selectConversation = (conversationId: string) => {
    setCurrentConversationId(conversationId);
    setShowConversations(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (messageDate.getTime() === today.getTime()) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  // Don't render anything if not authenticated or still loading
  if (!isAuthenticated || authLoading) {
    return null;
  }

  // Get widget dimensions and positioning
  const getWidgetStyles = () => {
    if (isFullscreen) {
      return {
        position: 'fixed' as const,
        top: '0',
        right: '0',
        width: '50vw',
        height: '100vh',
        zIndex: 50,
        borderRadius: '0',
      };
    }
    return {
      position: 'fixed' as const,
      bottom: '24px',
      right: '24px',
      width: '400px',
      height: '600px',
      zIndex: 50,
    };
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-purple-600 hover:bg-purple-700 shadow-lg z-50"
          size="icon"
        >
          <MessageSquare className="h-6 w-6 text-white" />
        </Button>
      )}

      {/* Widget */}
      {isOpen && (
        <Card className="shadow-xl flex flex-col" style={getWidgetStyles()}>
          {/* Header */}
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 bg-purple-600 text-white" style={{ borderRadius: isFullscreen ? '0' : '8px 8px 0 0' }}>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              {showConversations ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowConversations(false)}
                    className="h-8 w-8 text-white hover:bg-purple-700 mr-1"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <span>Chat History</span>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowConversations(true)}
                    className="h-8 w-8 text-white hover:bg-purple-700 mr-1"
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                  <Bot className="w-5 h-5" />
                  <span>AI Assistant</span>
                </>
              )}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="h-8 w-8 text-white hover:bg-purple-700"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 text-white hover:bg-purple-700"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          {!isMinimized && (
            <CardContent className="flex-1 flex flex-col p-0 min-h-0">
              {showConversations ? (
                /* Conversations List View */
                <div className="flex-1 flex flex-col">
                  <div className="p-4 border-b bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="outline" className="text-sm">
                        {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
                      </Badge>
                      <Button
                        onClick={startNewConversation}
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        New Chat
                      </Button>
                    </div>
                  </div>
                  
                  <ScrollArea className="flex-1">
                    <div className="p-4 space-y-2">
                      {conversations.map((conversation: Conversation) => (
                        <div
                          key={conversation.id}
                          onClick={() => selectConversation(conversation.id)}
                          className={`p-3 rounded-lg cursor-pointer border transition-colors hover:bg-gray-50 ${
                            currentConversationId === conversation.id ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate text-gray-900">
                                {conversation.title}
                              </p>
                              {conversation.lastMessage && (
                                <p className="text-xs text-gray-500 mt-1 truncate">
                                  {conversation.lastMessage}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center text-xs text-gray-400 ml-2">
                              <Clock className="w-3 h-3 mr-1" />
                              {formatDate(conversation.updatedAt)}
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {conversations.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                          <p className="text-sm">No conversations yet</p>
                          <p className="text-xs mt-1">Start a new chat to begin</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                /* Chat View */
                <>
                  <div className="p-3 border-b bg-gray-50">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
                      </Badge>
                      <Button
                        onClick={startNewConversation}
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                      >
                        New Chat
                      </Button>
                    </div>
                  </div>

                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {isLoadingMessages ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                        </div>
                      ) : messages.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <Bot className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                          <p className="text-sm">Start a conversation with the AI assistant</p>
                          <div className="mt-4 space-y-2">
                            <div className="text-xs text-gray-400">Try asking:</div>
                            <div className="space-y-1 text-xs">
                              <div className="bg-gray-100 rounded px-2 py-1">"Help me find information about..."</div>
                              <div className="bg-gray-100 rounded px-2 py-1">"What documents do you have on..."</div>
                              <div className="bg-gray-100 rounded px-2 py-1">"Can you summarize..."</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        messages.map((message: Message) => (
                          <div
                            key={message.id}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[85%] rounded-lg px-3 py-2 ${
                                message.role === 'user'
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-gray-100 text-gray-900'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                {message.role === 'assistant' && (
                                  <Bot className="w-4 h-4 mt-1 flex-shrink-0" />
                                )}
                                {message.role === 'user' && (
                                  <User className="w-4 h-4 mt-1 flex-shrink-0" />
                                )}
                                <div className="text-sm whitespace-pre-wrap break-words">{message.content}</div>
                              </div>
                              <div className={`text-xs mt-1 ${message.role === 'user' ? 'text-purple-200' : 'text-gray-500'}`}>
                                {formatDate(message.timestamp)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  <div className="p-3 border-t bg-white">
                    <div className="flex gap-2">
                      <Input
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Ask me anything..."
                        className="flex-1"
                        disabled={sendMessageMutation.isPending}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!inputMessage.trim() || sendMessageMutation.isPending}
                        size="icon"
                        className="bg-purple-600 hover:bg-purple-700 flex-shrink-0"
                      >
                        {sendMessageMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </>
  );
}
