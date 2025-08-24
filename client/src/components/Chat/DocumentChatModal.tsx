
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User, Send, FileText, Loader2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import ReactMarkdown from "react-markdown";

interface DocumentChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: number;
  documentName: string;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export default function DocumentChatModal({
  isOpen,
  onClose,
  documentId,
  documentName,
}: DocumentChatModalProps) {
  const [input, setInput] = useState("");
  const [currentConversationId, setCurrentConversationId] = useState<
    number | null
  >(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Create conversation for document when modal opens
  const createConversationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/chat/conversations", {
        title: `Chat with ${documentName}`,
        documentId: documentId,
      });
      return response.json();
    },
    onSuccess: (conversation) => {
      setCurrentConversationId(conversation.id);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create conversation.",
        variant: "destructive",
      });
    },
  });

  // Get messages for current conversation
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery({
    queryKey: ["/api/chat/conversations", currentConversationId, "messages"],
    queryFn: async () => {
      if (!currentConversationId) return [];
      const response = await apiRequest(
        "GET",
        `/api/chat/conversations/${currentConversationId}/messages`,
      );
      const data = await response.json();
      return data;
    },
    enabled: !!currentConversationId,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", "/api/chat/messages", {
        conversationId: currentConversationId,
        content,
        documentId: documentId,
      });
      return response.json();
    },
    onMutate: async (content: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ["/api/chat/conversations", currentConversationId, "messages"]
      });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData(["/api/chat/conversations", currentConversationId, "messages"]) as ChatMessage[] || [];

      // Optimistically update to the new value
      const optimisticMessage: ChatMessage = {
        id: Date.now(), // Temporary ID
        role: "user",
        content,
        createdAt: new Date().toISOString()
      };

      queryClient.setQueryData(
        ["/api/chat/conversations", currentConversationId, "messages"],
        [...previousMessages, optimisticMessage]
      );

      // Return a context object with the snapshotted value
      return { previousMessages };
    },
    onError: (err, content, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousMessages) {
        queryClient.setQueryData(
          ["/api/chat/conversations", currentConversationId, "messages"], 
          context.previousMessages
        );
      }
      toast({
        title: "Error",
        description: err.message || "Failed to send message.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      setInput("");
      // Force refetch to ensure UI updates with server response
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: ["/api/chat/conversations", currentConversationId, "messages"],
        });
      }, 100);
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && messages?.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [messages]);

  // Create conversation when modal opens
  useEffect(() => {
    if (isOpen && !currentConversationId) {
      createConversationMutation.mutate();
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setInput("");
      setCurrentConversationId(null);
    }
  }, [isOpen]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !currentConversationId || sendMessageMutation.isPending) return;

    const messageToSend = input.trim();
    try {
      await sendMessageMutation.mutateAsync(messageToSend);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Restore input on error for user to retry
      setInput(messageToSend);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      {/* Main Modal Container - 16:9 aspect ratio */}
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-green-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                แชทกับเอกสาร: {documentName}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                ผมจะตอบโดยอิงจากเนื้อหาในเอกสารนี้เท่านั้น
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex min-h-0">
          {/* Messages Area */}
          <div className="flex-1 flex flex-col bg-gray-50">
            {/* Messages Container */}
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-6 space-y-4">
                  {isLoadingMessages ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                      <span className="ml-3 text-gray-500">กำลังโหลดข้อความ...</span>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-start space-x-4">
                      <Avatar className="w-10 h-10 bg-gradient-to-r from-green-500 to-blue-600 flex-shrink-0">
                        <AvatarFallback className="bg-gradient-to-r from-green-500 to-blue-600">
                          <Bot className="w-5 h-5 text-white" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 max-w-3xl">
                        <div className="bg-white rounded-2xl rounded-tl-md px-6 py-4 border border-green-200 shadow-sm">
                          <p className="text-gray-900 leading-relaxed">
                            สวัสดีครับ! ผมสามารถช่วยวิเคราะห์และตอบคำถามเกี่ยวกับเอกสาร
                            "{documentName}" โดยเฉพาะได้
                            คุณต้องการทราบอะไรเกี่ยวกับเอกสารนี้บ้างครับ?
                          </p>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 px-2">เมื่อสักครู่</p>
                      </div>
                    </div>
                  ) : (
                    messages.map((message: ChatMessage, index: number) => (
                      <div
                        key={`msg-${message.id}-${index}`}
                        className={`flex space-x-4 ${
                          message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                        }`}
                      >
                        <Avatar className={`w-10 h-10 flex-shrink-0 ${
                          message.role === 'user' 
                            ? 'bg-blue-500' 
                            : 'bg-gradient-to-r from-green-500 to-blue-600'
                        }`}>
                          <AvatarFallback className={
                            message.role === 'user' 
                              ? 'bg-blue-500' 
                              : 'bg-gradient-to-r from-green-500 to-blue-600'
                          }>
                            {message.role === 'user' ? (
                              <User className="w-5 h-5 text-white" />
                            ) : (
                              <Bot className="w-5 h-5 text-white" />
                            )}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 max-w-3xl">
                          <div className={`rounded-2xl px-6 py-4 shadow-sm ${
                            message.role === 'user'
                              ? 'bg-blue-500 text-white rounded-tr-md'
                              : 'bg-white border border-green-200 rounded-tl-md'
                          }`}>
                            <div className="leading-relaxed">
                              {message.role === 'assistant' ? (
                                <ReactMarkdown className="prose prose-sm max-w-none text-gray-900">
                                  {message.content && message.content.trim()
                                    ? message.content
                                    : "ข้อความว่างเปล่า"}
                                </ReactMarkdown>
                              ) : (
                                <p className="whitespace-pre-wrap break-words">
                                  {message.content}
                                </p>
                              )}
                            </div>
                          </div>
                          <p className={`text-xs text-gray-500 mt-2 px-2 ${
                            message.role === 'user' ? 'text-right' : 'text-left'
                          }`}>
                            {formatTime(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}

                  <div ref={messagesEndRef} />

                  {sendMessageMutation.isPending && (
                    <div className="flex items-start space-x-4">
                      <Avatar className="w-10 h-10 bg-gradient-to-r from-green-500 to-blue-600 flex-shrink-0">
                        <AvatarFallback className="bg-gradient-to-r from-green-500 to-blue-600">
                          <Bot className="w-5 h-5 text-white" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="bg-white rounded-2xl rounded-tl-md px-6 py-4 border border-green-200 shadow-sm">
                        <div className="flex items-center space-x-2">
                          <div className="animate-bounce w-2 h-2 bg-gray-500 rounded-full"></div>
                          <div className="animate-bounce w-2 h-2 bg-gray-500 rounded-full" style={{ animationDelay: "0.1s" }}></div>
                          <div className="animate-bounce w-2 h-2 bg-gray-500 rounded-full" style={{ animationDelay: "0.2s" }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Input Area */}
            <div className="border-t border-gray-200 bg-white p-6">
              <form onSubmit={handleSendMessage} className="flex items-end space-x-4">
                <div className="flex-1">
                  <Input
                    type="text"
                    placeholder={`ถามเกี่ยวกับ "${documentName}"...`}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="min-h-[48px] text-base resize-none border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                    disabled={sendMessageMutation.isPending || !currentConversationId}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={
                    !input.trim() ||
                    sendMessageMutation.isPending ||
                    !currentConversationId
                  }
                  className="bg-blue-500 hover:bg-blue-600 text-white min-w-[48px] h-[48px] rounded-lg"
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </Button>
              </form>

              {sendMessageMutation.isPending && (
                <div className="text-center text-sm text-gray-500 mt-3">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  กำลังประมวลผลข้อความของคุณ...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
