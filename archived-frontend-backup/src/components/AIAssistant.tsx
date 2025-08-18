import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
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
  Loader2
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
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get conversations
  const { data: conversations } = useQuery({
    queryKey: ["/api/conversations"],
    retry: false,
  });

  // Get messages for current conversation
  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["/api/conversations", currentConversationId, "messages"],
    enabled: !!currentConversationId,
    retry: false,
  });

  // Create new conversation
  const createConversationMutation = useMutation({
    mutationFn: async (title: string) => {
      const response = await apiRequest('POST', '/api/conversations', { title });
      return await response.json();
    },
    onSuccess: (conversation) => {
      setCurrentConversationId(conversation.id);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
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
      const response = await apiRequest('POST', `/api/conversations/${currentConversationId}/messages`, {
        role: 'user',
        content,
      });
      return await response.json();
    },
    onSuccess: () => {
      setMessageInput("");
      queryClient.invalidateQueries({ 
        queryKey: ["/api/conversations", currentConversationId, "messages"] 
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

    // Create conversation if none exists
    if (!currentConversationId) {
      const title = messageInput.slice(0, 50) + (messageInput.length > 50 ? "..." : "");
      createConversationMutation.mutate(title);
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

  return (
    <Card className="border border-slate-200 flex flex-col h-96">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-slate-800">AI Assistant</CardTitle>
              <p className="text-xs text-slate-500">Knowledge Base Chat</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleNewConversation}
          >
            <Plus className="w-4 h-4 mr-1" />
            New
          </Button>
        </div>
      </CardHeader>
      
      {/* Chat Messages */}
      <CardContent className="flex-1 flex flex-col min-h-0 p-4 pt-0">
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {!currentConversationId ? (
              // Welcome message
              <div className="flex space-x-3">
                <Avatar className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600">
                  <AvatarFallback>
                    <Bot className="w-4 h-4 text-white" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="bg-slate-100 rounded-lg rounded-tl-none p-3">
                    <p className="text-sm text-slate-700">
                      Hello! I can help you search through your knowledge base, answer questions about your documents, or assist with document classification. What would you like to know?
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">AI Assistant</p>
                </div>
              </div>
            ) : messagesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : messages && messages.length > 0 ? (
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
                        ? 'bg-primary text-white rounded-tr-none' 
                        : 'bg-slate-100 text-slate-700 rounded-tl-none'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      
                      {/* Sources for AI messages */}
                      {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                        <div className="border-t border-slate-200 pt-2 mt-3">
                          <p className="text-xs font-medium text-slate-600 mb-2">Sources:</p>
                          <div className="space-y-1">
                            {message.sources.map((source, index) => (
                              <div key={index} className="flex items-center space-x-2 text-xs text-slate-500">
                                <FileText className="w-3 h-3 text-blue-500" />
                                <span className="truncate">{source.title}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <p className={`text-xs text-slate-500 mt-1 ${message.role === 'user' ? 'text-right' : ''}`}>
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
              <div className="text-center py-8 text-slate-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-slate-300" />
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
                  <div className="bg-slate-100 rounded-lg rounded-tl-none p-3">
                    <div className="flex items-center space-x-2">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      <p className="text-sm text-slate-500">Thinking...</p>
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
            className="bg-primary text-white hover:bg-blue-700"
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
  );
}
