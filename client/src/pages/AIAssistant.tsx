import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  ThumbsUp,
  ThumbsDown,
  Zap,
  MessageSquare,
  Sparkles
} from "lucide-react";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  feedback?: 'positive' | 'negative';
}

interface QuickPrompt {
  id: string;
  title: string;
  prompt: string;
  category: string;
}

export default function AIAssistant() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { data: quickPrompts = [] } = useQuery({
    queryKey: ["/api/ai-assistant/prompts"],
    queryFn: async () => {
      const response = await fetch("/api/ai-assistant/prompts");
      if (!response.ok) throw new Error("Failed to fetch quick prompts");
      return response.json();
    },
  }) as { data: QuickPrompt[] };

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message,
          conversationId: null,
          documentId: null
        }),
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
      const assistantMessage: ChatMessage = {
        id: Date.now().toString() + "-assistant",
        role: 'assistant',
        content: data.response || data.message || "No response received",
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMessage]);
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

    const userMessage: ChatMessage = {
      id: Date.now().toString() + "-user",
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);
    sendMessageMutation.mutate(content.trim());
  };

  const handleQuickPrompt = (prompt: string) => {
    setInputMessage(prompt);
  };

  const handleFeedback = (messageId: string, feedback: 'positive' | 'negative') => {
    setMessages(prev => 
      prev.map(msg => 
        msg.id === messageId ? { ...msg, feedback } : msg
      )
    );

    // Send feedback to backend
    fetch("/api/ai-assistant/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, feedback }),
    });

    toast({
      title: "Feedback Recorded",
      description: "Thank you for your feedback!",
    });
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

  const promptCategories = Array.from(
    new Set(quickPrompts.map(p => p.category))
  );

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
              <h1 className="text-2xl font-bold text-gray-900">AI Assistant</h1>
              <p className="text-gray-600">Get intelligent help with your documents and tasks</p>
            </div>
          </div>

          <Button variant="outline" onClick={clearChat}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Clear Chat
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
          {/* Quick Prompts Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-lg">
                  <Sparkles className="w-5 h-5" />
                  <span>Quick Prompts</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {promptCategories.map(category => (
                  <div key={category}>
                    <h4 className="font-medium text-sm text-gray-700 mb-2 uppercase tracking-wider">
                      {category}
                    </h4>
                    <div className="space-y-2">
                      {quickPrompts
                        .filter(p => p.category === category)
                        .map(prompt => (
                          <Button
                            key={prompt.id}
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-left h-auto py-2 px-3"
                            onClick={() => handleQuickPrompt(prompt.prompt)}
                          >
                            <div>
                              <div className="font-medium text-sm">{prompt.title}</div>
                              <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                                {prompt.prompt}
                              </div>
                            </div>
                          </Button>
                        ))}
                    </div>
                  </div>
                ))}

                {quickPrompts.length === 0 && (
                  <div className="text-center py-4">
                    <Zap className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No quick prompts available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Chat Interface */}
          <div className="lg:col-span-3 flex flex-col min-h-0">
            <Card className="flex-1 flex flex-col min-h-0">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <MessageSquare className="w-5 h-5" />
                  <span>Chat with AI Assistant</span>
                </CardTitle>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col space-y-4 min-h-0">
                {/* Messages Container */}
                <div className="flex-1 overflow-y-auto space-y-4 min-h-0 max-h-96">
                  {messages.length === 0 ? (
                    <div className="text-center py-8">
                      <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        Welcome to AI Assistant
                      </h3>
                      <p className="text-gray-500 mb-4">
                        Start a conversation or use one of the quick prompts to get help with your documents and tasks.
                      </p>
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
                          <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <Bot className="w-4 h-4 text-purple-600" />
                          </div>
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
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleFeedback(message.id, 'positive')}
                                className={`h-6 px-2 ${
                                  message.feedback === 'positive' ? 'text-green-600' : ''
                                }`}
                              >
                                <ThumbsUp className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleFeedback(message.id, 'negative')}
                                className={`h-6 px-2 ${
                                  message.feedback === 'negative' ? 'text-red-600' : ''
                                }`}
                              >
                                <ThumbsDown className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {message.role === 'user' && (
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-blue-600" />
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {isLoading && (
                    <div className="flex space-x-3 justify-start">
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                        <Bot className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="bg-gray-100 px-4 py-2 rounded-lg">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input Area */}
                <div className="flex space-x-2">
                  <Textarea
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Ask me anything about your documents..."
                    className="flex-1 min-h-[80px] resize-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <Button
                    onClick={() => handleSendMessage()}
                    disabled={!inputMessage.trim() || isLoading}
                    className="px-4"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}