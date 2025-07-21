import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Bot, User, Send, FileText } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { ResizableDialog } from "@/components/ui/resizable-dialog";
import { ReactMarkdown } from "react-markdown";

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
  const [message, setMessage] = useState("");
  const [currentConversationId, setCurrentConversationId] = useState<
    number | null
  >(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
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
  });

  // Get messages for current conversation
  const { data: messages = [], isLoading } = useQuery({
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
        documentId: documentId, // Pass the specific document ID
      });
      return response.json();
    },
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({
        queryKey: [
          "/api/chat/conversations",
          currentConversationId,
          "messages",
        ],
      });
      // Refetch messages immediately
      queryClient.refetchQueries({
        queryKey: [
          "/api/chat/conversations",
          currentConversationId,
          "messages",
        ],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message.",
        variant: "destructive",
      });
    },
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Create conversation when modal opens
  useEffect(() => {
    if (isOpen && !currentConversationId) {
      createConversationMutation.mutate();
    }
  }, [isOpen]);

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
      <div className="flex items-center space-x-2 mb-4">
        <FileText className="w-5 h-5 text-blue-600" />
        <span className="text-sm text-gray-600">
          คุณกำลังแชทเฉพาะกับเอกสารนี้
        </span>
      </div>

      {/* Chat Messages */}
      <div
        className="flex-1 overflow-y-auto max-h-96 p-4 border border-gray-200 rounded-lg bg-gray-50"
        ref={scrollAreaRef}
      >
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <Bot className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1">
                <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                  <p className="text-sm text-gray-900 leading-relaxed">
                    สวัสดีครับ! ผมสามารถช่วยวิเคราะห์และตอบคำถามเกี่ยวกับเอกสาร
                    "{documentName}" โดยเฉพาะได้
                    คุณต้องการทราบอะไรเกี่ยวกับเอกสารนี้บ้างครับ?
                    ผมจะตอบโดยอิงจากเนื้อหาในเอกสารนี้เท่านั้น
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-2">เมื่อสักครู่</p>
              </div>
            </div>
          ) : (
            messages.map((msg: ChatMessage) => (
              <div key={msg.id} className="flex items-start space-x-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    msg.role === "assistant" ? "bg-green-100" : "bg-blue-100"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <Bot className="w-5 h-5 text-green-600" />
                  ) : (
                    <User className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div
                    className={`p-3 rounded-lg ${
                      msg.role === "assistant"
                        ? "bg-green-50 border border-green-200"
                        : "bg-blue-50 border border-blue-200"
                    }`}
                  >
                    <ReactMarkdown className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
                      {msg.content && msg.content.trim()
                        ? msg.content
                        : "ข้อความว่างเปล่า"}
                    </ReactMarkdown>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(msg.createdAt).toLocaleDateString("th-TH", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}{" "}
                    เวลา{" "}
                    {new Date(msg.createdAt).toLocaleTimeString("th-TH", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}{" "}
                    น.
                  </p>
                  {msg.role === "assistant" && (
                    <FeedbackButtons
                      messageId={msg.id}
                      userQuery={
                        messages[
                          messages.findIndex(
                            (m: ChatMessage) => m.id === msg.id,
                          ) - 1
                        ]?.content || ""
                      }
                      assistantResponse={msg.content}
                      conversationId={currentConversationId!}
                      documentContext={{ documentId, documentName }}
                    />
                  )}
                </div>
              </div>
            ))
          )}
          {sendMessageMutation.isPending && (
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <Bot className="w-5 h-5 text-green-600" />
              </div>
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
      </div>

      {/* Chat Input */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200">
        <form
          onSubmit={handleSendMessage}
          className="flex items-center space-x-3"
        >
          <Input
            type="text"
            placeholder={`ถามเกี่ยวกับ "${documentName}"...`}
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
            className="bg-green-500 hover:bg-green-600"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </ResizableDialog>
  );
}
