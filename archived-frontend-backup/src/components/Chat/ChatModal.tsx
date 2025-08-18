import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Bot, User, Send } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ResizableDialog } from "@/components/ui/resizable-dialog";
import { FeedbackButtons } from "@/components/FeedbackButtons";

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export default function ChatModal({ isOpen, onClose }: ChatModalProps) {
  const [message, setMessage] = useState("");
  const [currentConversationId, setCurrentConversationId] = useState<
    number | null
  >(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Create initial conversation when modal opens
  const createConversationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/chat/conversations", {
        title: `Chat ${new Date().toLocaleDateString()}`,
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
      return await response.json();
    },
    enabled: !!currentConversationId,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!currentConversationId) throw new Error("No conversation");

      const response = await apiRequest("POST", "/api/chat/messages", {
        conversationId: currentConversationId,
        content,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          "/api/chat/conversations",
          currentConversationId,
          "messages",
        ],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setMessage("");
    },
    onError: (error) => {
      toast({
        title: "Error sending message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Auto-scroll to bottom when new messages arrive
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
      title="AI Assistant"
      defaultWidth="60%"
      defaultHeight="70%"
      minWidth={600}
      minHeight={500}
      className="flex flex-col"
    >
      <div className="flex items-center space-x-2 mb-4">
        <Bot className="w-5 h-5 text-blue-600" />
        <span className="text-sm text-gray-600">พูดคุยกับ AI Assistant</span>
      </div>

        {/* Chat Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Bot className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-900">
                    Hello! I can help you search and analyze your documents.
                    What would you like to know?
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Just now</p>
                </div>
              </div>
            ) : (
              messages.map((msg: ChatMessage) => (
                <div key={msg.id} className="flex items-start space-x-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      msg.role === "assistant" ? "bg-blue-100" : "bg-gray-100"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <Bot className="w-5 h-5 text-blue-600" />
                    ) : (
                      <User className="w-5 h-5 text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-gray-900 whitespace-pre-wrap">
                      {msg.content}
                      {msg.role === "assistant" && (
                        <div className="mt-3">
                          <p className="text-xs text-gray-500 italic">
                            Is there anything else you'd like me to help with?
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(msg.createdAt).toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'long', 
                        day: 'numeric'
                      })} เวลา {new Date(msg.createdAt).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                      })} น.
                    </p>
                    {msg.role === 'assistant' && (
                      <FeedbackButtons
                        messageId={msg.id}
                        userQuery={messages[messages.findIndex(m => m.id === msg.id) - 1]?.content || ''}
                        assistantResponse={msg.content}
                        conversationId={currentConversationId!}
                        documentContext={{ mode: 'documents' }}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
            {sendMessageMutation.isPending && (
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Bot className="w-5 h-5 text-blue-600" />
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
        </ScrollArea>

        {/* Chat Input */}
        <div className="flex-shrink-0 p-4 border-t border-gray-200">
          <form
            onSubmit={handleSendMessage}
            className="flex items-center space-x-3"
          >
            <Input
              type="text"
              placeholder="ถามคำถามเกี่ยวกับเอกสารของคุณ..."
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
              className="bg-blue-500 hover:bg-blue-600"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
    </ResizableDialog>
  );
}
