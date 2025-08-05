
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  MessageSquare, 
  Send, 
  Bot, 
  User, 
  Minimize2,
  Maximize2,
  X,
  Loader2
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export default function FloatingAIWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [message, setMessage] = useState("");
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading } = useAuth();

  // Don't render widget if user is not authenticated or still loading
  if (isLoading || !isAuthenticated) {
    return null;
  }

  // Create initial conversation when widget opens
  const createConversationMutation = useMutation({
    mutationFn: async () => {
      try {
        const response = await apiRequest("POST", "/api/chat/conversations", {
          title: `Widget Chat ${new Date().toLocaleDateString()}`,
        });
        return response.json();
      } catch (error) {
        console.error("Error creating conversation:", error);
        throw error;
      }
    },
    onSuccess: (conversation) => {
      setCurrentConversationId(conversation.id);
    },
    onError: (error) => {
      toast({
        title: "Error creating conversation",
        description: "Failed to start chat session",
        variant: "destructive",
      });
    },
  });

  // Get messages for current conversation
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery({
    queryKey: ["/api/chat/conversations", currentConversationId, "messages"],
    queryFn: async () => {
      if (!currentConversationId) return [];
      try {
        const response = await apiRequest(
          "GET",
          `/api/chat/conversations/${currentConversationId}/messages`,
        );
        return await response.json();
      } catch (error) {
        console.error("Error fetching messages:", error);
        return [];
      }
    },
    enabled: !!currentConversationId && isOpen,
    refetchInterval: isOpen ? 3000 : false, // Auto-refresh when open
    retry: 1,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!currentConversationId) throw new Error("No conversation");

      try {
        const response = await apiRequest("POST", "/api/chat/messages", {
          conversationId: currentConversationId,
          content,
        });
        return response.json();
      } catch (error) {
        console.error("Error sending message:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/chat/conversations", currentConversationId, "messages"],
      });
      setMessage("");
    },
    onError: (error) => {
      console.error("Send message error:", error);
      toast({
        title: "Error sending message",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Create conversation when widget opens for the first time
  useEffect(() => {
    if (isOpen && !isMinimized && !currentConversationId && !createConversationMutation.isPending) {
      try {
        createConversationMutation.mutate();
      } catch (error) {
        console.error("Error creating conversation in useEffect:", error);
      }
    }
  }, [isOpen, isMinimized, currentConversationId, createConversationMutation.isPending]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(message.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-200"
        >
          <MessageSquare className="w-6 h-6 text-white" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Card className={`transition-all duration-300 ease-in-out shadow-2xl border-0 ${
        isMinimized ? "w-80 h-16" : "w-96 h-[500px]"
      }`}>
        {/* Header */}
        <CardHeader className="pb-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">AI Assistant</CardTitle>
                {!isMinimized && (
                  <p className="text-xs opacity-90">Ask me anything about your documents</p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMinimized(!isMinimized)}
                className="text-white hover:bg-white/20 h-8 w-8 p-0"
              >
                {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-white/20 h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        {!isMinimized && (
          <CardContent className="flex flex-col h-[420px] p-0">
            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {isLoadingMessages ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-start space-x-3">
                    <Avatar className="w-8 h-8 bg-purple-100">
                      <AvatarFallback>
                        <Bot className="w-4 h-4 text-purple-600" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="bg-gray-100 rounded-lg rounded-tl-none p-3">
                        <p className="text-sm text-gray-900">
                          Hello! I'm your AI assistant. I can help you search through your documents, answer questions, and provide insights. What would you like to know?
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Just now</p>
                    </div>
                  </div>
                ) : (
                  messages.map((msg: ChatMessage) => (
                    <div key={msg.id} className={`flex items-start space-x-3 ${
                      msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                    }`}>
                      <Avatar className={`w-8 h-8 ${
                        msg.role === 'assistant' ? 'bg-purple-100' : 'bg-blue-100'
                      }`}>
                        <AvatarFallback>
                          {msg.role === 'assistant' ? (
                            <Bot className="w-4 h-4 text-purple-600" />
                          ) : (
                            <User className="w-4 h-4 text-blue-600" />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 max-w-[280px]">
                        <div className={`rounded-lg p-3 ${
                          msg.role === 'user'
                            ? 'bg-blue-500 text-white rounded-tr-none'
                            : 'bg-gray-100 text-gray-900 rounded-tl-none'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                        <p className={`text-xs text-gray-500 mt-1 ${
                          msg.role === 'user' ? 'text-right' : 'text-left'
                        }`}>
                          {formatTime(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                {sendMessageMutation.isPending && (
                  <div className="flex items-start space-x-3">
                    <Avatar className="w-8 h-8 bg-purple-100">
                      <AvatarFallback>
                        <Bot className="w-4 h-4 text-purple-600" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="bg-gray-100 rounded-lg rounded-tl-none p-3">
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
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="border-t border-gray-200 p-4">
              <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                <Input
                  type="text"
                  placeholder="Ask me anything..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={sendMessageMutation.isPending || !currentConversationId}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  disabled={
                    !message.trim() ||
                    sendMessageMutation.isPending ||
                    !currentConversationId
                  }
                  className="bg-purple-500 hover:bg-purple-600"
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </form>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
