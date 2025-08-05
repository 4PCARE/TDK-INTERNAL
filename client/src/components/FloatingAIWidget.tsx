import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { MessageSquare, X, Send, Loader2, Bot, User, Minimize2, Maximize2 } from "lucide-react";
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
        body: JSON.stringify({ title: "New Chat" }),
      });
      if (!response.ok) throw new Error("Failed to create conversation");
      return response.json();
    },
    onSuccess: (data) => {
      setCurrentConversationId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
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
      if (!currentConversationId) {
        await createConversationMutation.mutateAsync();
      }

      await sendMessageMutation.mutateAsync({
        message: inputMessage,
        conversationId: currentConversationId || undefined,
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

  const startNewConversation = () => {
    createConversationMutation.mutate();
  };

  // Don't render anything if not authenticated or still loading
  if (!isAuthenticated || authLoading) {
    return null;
  }

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
        <Card className="fixed bottom-6 right-6 w-96 h-[500px] shadow-xl z-50 flex flex-col">
          {/* Header */}
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 bg-purple-600 text-white rounded-t-lg">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Bot className="w-5 h-5" />
              AI Assistant
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMinimized(!isMinimized)}
                className="h-8 w-8 text-white hover:bg-purple-700"
              >
                {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
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
            <CardContent className="flex-1 flex flex-col p-0">
              {/* Conversation Controls */}
              <div className="p-3 border-b bg-gray-50">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">
                    {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
                  </Badge>
                  <Button
                    onClick={startNewConversation}
                    size="sm"
                    variant="outline"
                    className="text-xs"
                  >
                    New Chat
                  </Button>
                </div>
              </div>

              {/* Messages */}
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
                    </div>
                  ) : (
                    messages.map((message: Message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 ${
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
                            <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="p-3 border-t">
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
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {sendMessageMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </>
  );
}