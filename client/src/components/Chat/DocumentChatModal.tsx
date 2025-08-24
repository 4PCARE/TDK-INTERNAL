
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User, Send, FileText, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { ResizableDialog } from "@/components/ui/resizable-dialog";
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

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <ResizableDialog
      open={isOpen}
      onOpenChange={onClose}
      title={`แชทกับเอกสาร: ${documentName}`}
      defaultWidth="60%"
      defaultHeight="70%"
      minWidth={500}
      minHeight={400}
      className="flex flex-col"
    >
      {/* Header Info */}
      <div className="flex items-center space-x-2 mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <FileText className="w-5 h-5 text-blue-600" />
        <div>
          <span className="text-sm font-medium text-blue-900">
            คุณกำลังแชทเฉพาะกับเอกสารนี้
          </span>
          <p className="text-xs text-blue-600 mt-1">
            ผมจะตอบโดยอิงจากเนื้อหาในเอกสาร "{documentName}" เท่านั้น
          </p>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 bg-gray-50 rounded-lg border border-gray-200">
        <ScrollArea className="h-full p-4">
          <div className="space-y-4">
            {isLoadingMessages ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">กำลังโหลดข้อความ...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-start space-x-3">
                <Avatar className="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-600">
                  <AvatarFallback className="bg-gradient-to-r from-green-500 to-blue-600">
                    <Bot className="w-4 h-4 text-white" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="bg-green-50 rounded-lg rounded-tl-none px-4 py-3 border border-green-200">
                    <p className="text-sm text-gray-900 leading-relaxed">
                      สวัสดีครับ! ผมสามารถช่วยวิเคราะห์และตอบคำถามเกี่ยวกับเอกสาร
                      "{documentName}" โดยเฉพาะได้
                      คุณต้องการทราบอะไรเกี่ยวกับเอกสารนี้บ้างครับ?
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 px-1">เมื่อสักครู่</p>
                </div>
              </div>
            ) : (
              messages.map((message: ChatMessage, index: number) => (
                <div
                  key={`msg-${message.id}-${index}`}
                  className={`flex space-x-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <Avatar className="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-600 flex-shrink-0">
                      <AvatarFallback className="bg-gradient-to-r from-green-500 to-blue-600">
                        <Bot className="w-4 h-4 text-white" />
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div className={`flex-1 max-w-xs lg:max-w-md ${message.role === 'user' ? 'flex justify-end' : ''}`}>
                    <div className="flex flex-col">
                      <div className={`rounded-lg px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-blue-500 text-white rounded-tr-none'
                          : 'bg-green-50 border border-green-200 text-gray-900 rounded-tl-none'
                      }`}>
                        <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                          {message.role === 'assistant' ? (
                            <ReactMarkdown>
                              {message.content && message.content.trim()
                                ? message.content
                                : "ข้อความว่างเปล่า"}
                            </ReactMarkdown>
                          ) : (
                            message.content
                          )}
                        </div>
                      </div>
                      <p className={`text-xs text-gray-500 mt-1 px-1 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                        {formatTime(message.createdAt)}
                      </p>
                    </div>
                  </div>

                  {message.role === 'user' && (
                    <Avatar className="w-8 h-8 bg-blue-500 flex-shrink-0">
                      <AvatarFallback className="bg-blue-500">
                        <User className="w-4 h-4 text-white" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))
            )}

            <div ref={messagesEndRef} />

            {sendMessageMutation.isPending && (
              <div className="flex items-start space-x-3">
                <Avatar className="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-600">
                  <AvatarFallback className="bg-gradient-to-r from-green-500 to-blue-600">
                    <Bot className="w-4 h-4 text-white" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-green-50 rounded-lg rounded-tl-none px-3 py-2 border border-green-200">
                  <div className="flex items-center space-x-1">
                    <div className="animate-bounce w-1 h-1 bg-gray-500 rounded-full"></div>
                    <div className="animate-bounce w-1 h-1 bg-gray-500 rounded-full" style={{ animationDelay: "0.1s" }}></div>
                    <div className="animate-bounce w-1 h-1 bg-gray-500 rounded-full" style={{ animationDelay: "0.2s" }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Message Input */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-white">
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
          <Input
            type="text"
            placeholder={`ถามเกี่ยวกับ "${documentName}"...`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1"
            disabled={sendMessageMutation.isPending || !currentConversationId}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e);
              }
            }}
          />
          <Button
            type="submit"
            disabled={
              !input.trim() ||
              sendMessageMutation.isPending ||
              !currentConversationId
            }
            className="bg-green-500 hover:bg-green-600 text-white min-w-[44px]"
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>

        {sendMessageMutation.isPending && (
          <div className="text-center text-xs text-gray-500 mt-2">
            <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
            กำลังประมวลผลข้อความของคุณ...
          </div>
        )}
      </div>
    </ResizableDialog>
  );
}
