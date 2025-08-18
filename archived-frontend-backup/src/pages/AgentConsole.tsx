import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare,
  Send,
  User,
  Phone,
  Mail,
  Filter,
  Clock,
  MessageCircle,
  Bot,
  UserCheck,
  Circle,
  Hash,
  ExternalLink,
  Image as ImageIcon,
  File as FileIcon,
  Upload,
  X,
} from "lucide-react";
import { format, isValid, parseISO } from "date-fns";

interface ChatUser {
  userId: string;
  channelType: string;
  channelId: string;
  agentId: number;
  agentName: string;
  lastMessage: string;
  lastMessageAt: Date;
  messageCount: number;
  isOnline: boolean;
  userProfile?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}

interface ConversationMessage {
  id: number;
  messageType: "user" | "assistant" | "human_agent";
  content: string;
  createdAt: Date;
  metadata?: any;
}

interface ConversationSummary {
  totalMessages: number;
  firstContactAt: Date;
  lastActiveAt: Date;
  sentiment: "excellent" | "good" | "neutral" | "bad";
  mainTopics: string[];
  csatScore?: number;
}

// Helper function to safely format dates
const safeFormatDate = (
  dateStr: string | null | undefined,
  formatStr: string = "MMM dd, HH:mm",
): string => {
  if (!dateStr) return "N/A";

  try {
    const date =
      typeof dateStr === "string" ? parseISO(dateStr) : new Date(dateStr);
    if (isValid(date)) {
      return format(date, formatStr);
    }
  } catch (error) {
    console.warn("Date formatting error:", error, dateStr);
  }

  return "Invalid Date";
};

export default function AgentConsole() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State management
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [subChannelFilter, setSubChannelFilter] = useState<string>("all");
  const [messageInput, setMessageInput] = useState("");
  const [isHumanTakeover, setIsHumanTakeover] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // WebSocket connection setup
  useEffect(() => {
    if (!isAuthenticated) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log("🔌 Connecting to WebSocket:", wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("🔌 WebSocket connected");
      setWsConnected(true);

      // Subscribe to Agent Console updates
      ws.send(
        JSON.stringify({
          type: "subscribe",
          target: "agent-console",
        }),
      );
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("📨 WebSocket message received:", message);

        if (message.type === "new_message") {
          // Invalidate queries to refresh data
          queryClient.invalidateQueries({
            queryKey: ["/api/agent-console/users"],
          });
          queryClient.invalidateQueries({
            queryKey: ["/api/agent-console/conversation"],
          });
          
          // Also refetch users to ensure immediate sorting update
          refetchUsers();

          toast({
            title: "New Message",
            description: `New message from ${message.data.userId}`,
            duration: 3000,
          });
        }
      } catch (error) {
        console.error("❌ WebSocket message parse error:", error);
      }
    };

    ws.onclose = () => {
      console.log("🔌 WebSocket disconnected");
      setWsConnected(false);
    };

    ws.onerror = (error) => {
      console.error("❌ WebSocket error:", error);
      setWsConnected(false);
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [isAuthenticated, queryClient, toast]);

  // Authentication check
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

  // Query for channel integrations (for hierarchical filtering)
  const { data: channelIntegrations = {}, isLoading: isLoadingChannels } = useQuery({
    queryKey: ["/api/agent-console/channels"],
    enabled: isAuthenticated,
    refetchInterval: 60000, // Refresh every minute
    retry: false,
  });

  // Query for active chat users (reduced refresh frequency with WebSocket)
  const { data: chatUsers = [], isLoading: isLoadingUsers, refetch: refetchUsers } = useQuery({
    queryKey: ["/api/agent-console/users", channelFilter, subChannelFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (channelFilter !== "all") params.append("channelFilter", channelFilter);
      if (subChannelFilter !== "all") params.append("subChannelFilter", subChannelFilter);
      
      const response = await apiRequest("GET", `/api/agent-console/users?${params}`);
      const users = await response.json();
      
      // Sort users by latest message time (newest first)
      return users.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
    },
    enabled: isAuthenticated,
    refetchInterval: wsConnected ? 30000 : 5000, // 30s if WebSocket connected, 5s if not
    retry: false,
  });

  // Query for conversation messages (reduced refresh with WebSocket)
  const { data: conversationMessages = [], isLoading: isLoadingMessages } =
    useQuery({
      queryKey: [
        "/api/agent-console/conversation",
        selectedUser?.userId,
        selectedUser?.channelType,
        selectedUser?.channelId,
        selectedUser?.agentId,
      ],
      queryFn: async () => {
        if (!selectedUser) return [];
        const params = new URLSearchParams({
          userId: selectedUser.userId,
          channelType: selectedUser.channelType,
          channelId: selectedUser.channelId,
          agentId: selectedUser.agentId.toString(),
        });
        try {
          const response = await apiRequest(
            "GET",
            `/api/agent-console/conversation?${params}`,
          );
          const result = await response.json();
          return Array.isArray(result) ? result : [];
        } catch (error) {
          console.error("❌ Agent Console: API error:", error);
          return [];
        }
      },
      enabled: isAuthenticated && !!selectedUser,
      refetchInterval: wsConnected ? false : 10000, // Only refresh every 10s if WebSocket not connected
      retry: false,
    });

  // Auto-select first user if none selected
  useEffect(() => {
    if (chatUsers.length > 0 && !selectedUser) {
      console.log("🎯 Agent Console: Auto-selecting first user:", chatUsers[0]);
      setSelectedUser(chatUsers[0]);
    }
  }, [chatUsers, selectedUser]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversationMessages]);

  // Query for conversation summary with refresh when conversation changes
  const { data: conversationSummary, isLoading: conversationSummaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: [
      "/api/agent-console/summary",
      selectedUser?.userId,
      selectedUser?.channelType,
      selectedUser?.channelId,
      conversationMessages?.length, // Add message count to trigger refresh when new messages arrive
    ],
    queryFn: async () => {
      if (!selectedUser) return null;
      const params = new URLSearchParams({
        userId: selectedUser.userId,
        channelType: selectedUser.channelType,
        channelId: selectedUser.channelId,
      });
      console.log("📊 Agent Console: Fetching summary with params:", {
        userId: selectedUser.userId,
        channelType: selectedUser.channelType,
        channelId: selectedUser.channelId,
        messageCount: conversationMessages?.length,
      });
      const response = await apiRequest(
        "GET",
        `/api/agent-console/summary?${params}`,
      );
      const result = await response.json();
      console.log("📊 Agent Console: Summary API response:", result);
      return result;
    },
    enabled: isAuthenticated && !!selectedUser,
    retry: false,
    refetchInterval: wsConnected ? false : 30000, // Refresh every 30 seconds if WebSocket not connected
    staleTime: 10000, // Consider data stale after 10 seconds to ensure fresh CSAT calculation
  });

  // Mutation for sending human agent message
  const sendMessageMutation = useMutation({
    mutationFn: async ({ message }: { message: string }) => {
      if (!selectedUser) throw new Error("No user selected");

      return await apiRequest("POST", "/api/agent-console/send-message", {
        userId: selectedUser.userId,
        channelType: selectedUser.channelType,
        channelId: selectedUser.channelId,
        agentId: selectedUser.agentId,
        message,
        messageType: "agent", // Human agent message type
      });
    },
    onSuccess: () => {
      setMessageInput("");
      
      // Invalidate conversation messages
      queryClient.invalidateQueries({
        queryKey: [
          "/api/agent-console/conversation",
          selectedUser?.userId,
          selectedUser?.channelType,
          selectedUser?.channelId,
          selectedUser?.agentId,
        ],
      });
      
      // Also invalidate summary to refresh CSAT and sentiment after new message
      queryClient.invalidateQueries({
        queryKey: [
          "/api/agent-console/summary",
          selectedUser?.userId,
          selectedUser?.channelType,
          selectedUser?.channelId,
        ],
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
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Mutation for taking over conversation
  const takeoverMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error("No user selected");

      return await apiRequest("POST", "/api/agent-console/takeover", {
        userId: selectedUser.userId,
        channelType: selectedUser.channelType,
        channelId: selectedUser.channelId,
        agentId: selectedUser.agentId,
      });
    },
    onSuccess: () => {
      setIsHumanTakeover(true);
      toast({
        title: "Takeover Activated",
        description: "You are now handling this conversation manually.",
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
        description: "Failed to take over conversation. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Mutation for uploading and sending image
  const sendImageMutation = useMutation({
    mutationFn: async ({ image, message }: { image: File; message?: string }) => {
      if (!selectedUser) throw new Error("No user selected");

      const formData = new FormData();
      formData.append('image', image);
      formData.append('userId', selectedUser.userId);
      formData.append('channelType', selectedUser.channelType);
      formData.append('channelId', selectedUser.channelId);
      formData.append('agentId', selectedUser.agentId.toString());
      if (message?.trim()) {
        formData.append('message', message);
      }
      formData.append('messageType', 'agent');

      return await apiRequest("POST", "/api/agent-console/send-image", formData);
    },
    onSuccess: () => {
      setMessageInput("");
      setSelectedImage(null);
      setImagePreview(null);
      
      // Invalidate conversation messages
      queryClient.invalidateQueries({
        queryKey: [
          "/api/agent-console/conversation",
          selectedUser?.userId,
          selectedUser?.channelType,
          selectedUser?.channelId,
          selectedUser?.agentId,
        ],
      });
      
      // Also invalidate summary
      queryClient.invalidateQueries({
        queryKey: [
          "/api/agent-console/summary",
          selectedUser?.userId,
          selectedUser?.channelType,
          selectedUser?.channelId,
        ],
      });

      toast({
        title: "Image Sent",
        description: "Your image has been sent to the user successfully.",
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
        description: "Failed to send image. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationMessages]);

  const handleSendMessage = () => {
    if (selectedImage) {
      // Send image with optional text
      sendImageMutation.mutate({ image: selectedImage, message: messageInput });
    } else if (messageInput.trim()) {
      // Send text message
      sendMessageMutation.mutate({ message: messageInput });
    }
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid File Type",
          description: "Please select a valid image file (JPEG, PNG, GIF, WebP).",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        toast({
          title: "File Too Large",
          description: "Please select an image smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }

      setSelectedImage(file);
      
      // Create preview URL
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getChannelIcon = (channelType: string) => {
    switch (channelType) {
      case "lineoa":
        return <MessageCircle className="w-4 h-4 text-green-600" />;
      case "facebook":
        return <MessageSquare className="w-4 h-4 text-blue-600" />;
      case "tiktok":
        return <Hash className="w-4 h-4 text-pink-600" />;
      case "web":
        return <ExternalLink className="w-4 h-4 text-gray-600" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getChannelBadge = (channelType: string) => {
    const variants = {
      lineoa: "bg-green-100 text-green-800",
      facebook: "bg-blue-100 text-blue-800",
      tiktok: "bg-pink-100 text-pink-800",
      web: "bg-gray-100 text-gray-800",
    };

    return (
      variants[channelType as keyof typeof variants] ||
      "bg-gray-100 text-gray-800"
    );
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="flex">
          <Sidebar />
          <div className="flex-1">
            <TopBar />
            <main className="p-6">
              <div className="text-center py-8">Loading...</div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex">
        <Sidebar />
        <div className="flex-1">
          <TopBar />
          <main className="p-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <UserCheck className="w-6 h-6" />
                  <h1 className="text-2xl font-bold">Agent Console</h1>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <Circle
                      className={`w-2 h-2 ${wsConnected ? "fill-green-500 text-green-500" : "fill-red-500 text-red-500"}`}
                    />
                    <span className="text-xs text-gray-600">
                      {wsConnected ? "Real-time WebSocket" : "Polling Mode"}
                    </span>
                  </div>
                  <Badge variant="outline" className="px-3 py-1">
                    {chatUsers.length} Active Conversations
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-6 h-[calc(100vh-200px)]">
                {/* Left Panel - User List */}
                <Card className="col-span-3">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Select Channel</CardTitle>
                      <Filter className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="pt-2 space-y-2">
                      <Select
                        value={channelFilter}
                        onValueChange={(value) => {
                          setChannelFilter(value);
                          setSubChannelFilter("all"); // Reset sub-channel when main channel changes
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Filter by channel" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Channels</SelectItem>
                          <SelectItem value="lineoa">📱 Line OA</SelectItem>
                          <SelectItem value="facebook">📘 Facebook</SelectItem>
                          <SelectItem value="tiktok">🎵 TikTok</SelectItem>
                          <SelectItem value="web">🌐 Web Widget</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {/* Sub-channel filter */}
                      {channelFilter !== "all" && (
                        <Select
                          value={subChannelFilter}
                          onValueChange={setSubChannelFilter}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select specific channel" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All {channelFilter.toUpperCase()} Channels</SelectItem>
                            {channelIntegrations[channelFilter]?.map((integration) => (
                              <SelectItem key={integration.id} value={integration.channelId}>
                                {integration.name} ({integration.agentName})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-1 p-3">
                        {isLoadingUsers ? (
                          <div className="text-center py-4 text-gray-500">
                            Loading users...
                          </div>
                        ) : chatUsers.length === 0 ? (
                          <div className="text-center py-4 text-gray-500">
                            No active conversations
                          </div>
                        ) : (
                          chatUsers.map((chatUser: ChatUser) => (
                            <div
                              key={`${chatUser.userId}-${chatUser.channelType}-${chatUser.channelId}`}
                              className={`p-3 rounded-lg cursor-pointer transition-colors hover:bg-gray-50 ${
                                selectedUser?.userId === chatUser.userId &&
                                selectedUser?.channelType ===
                                  chatUser.channelType &&
                                selectedUser?.channelId === chatUser.channelId
                                  ? "bg-blue-50 border border-blue-200"
                                  : "border border-transparent"
                              }`}
                              onClick={() => {
                                console.log(
                                  "👤 Agent Console: User selected:",
                                  chatUser,
                                );
                                setSelectedUser(chatUser);
                              }}
                            >
                              <div className="flex items-start space-x-3">
                                <div className="relative">
                                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                                    <User className="w-5 h-5 text-gray-600" />
                                  </div>
                                  {chatUser.isOnline && (
                                    <Circle className="absolute -bottom-1 -right-1 w-3 h-3 fill-green-500 text-green-500" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                      {chatUser.userProfile?.name ||
                                        `User ${chatUser.userId.slice(-4)}`}
                                    </p>
                                    <div className="flex items-center space-x-1">
                                      {getChannelIcon(chatUser.channelType)}
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between mt-1">
                                    <p className="text-xs text-gray-500 truncate max-w-[100px]">
                                      {chatUser.lastMessage}
                                    </p>
                                    <span className="text-xs text-gray-400">
                                      {safeFormatDate(
                                        chatUser.lastMessageAt,
                                        "HH:mm",
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between mt-2">
                                    <span
                                      className={`inline-flex px-2 py-1 text-xs rounded-full ${getChannelBadge(chatUser.channelType)}`}
                                    >
                                      {chatUser.channelType.toUpperCase()}
                                    </span>
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {chatUser.messageCount} msgs
                                    </Badge>
                                  </div>
                                  <div className="mt-1">
                                    <p className="text-xs text-gray-400">
                                      Agent: {chatUser.agentName}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Center Panel - Conversation */}
                <Card className="col-span-6">
                  <CardHeader className="pb-3">
                    {selectedUser ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-gray-600" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">
                              {selectedUser.userProfile?.name ||
                                `User ${selectedUser.userId.slice(-4)}`}
                            </CardTitle>
                            <CardDescription>
                              {selectedUser.channelType.toUpperCase()} • Agent:{" "}
                              {selectedUser.agentName}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {!isHumanTakeover && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setIsHumanTakeover(true);
                                toast({
                                  title: "Human Agent Mode",
                                  description: `${user?.firstName || user?.email || 'You'} is now responding to this conversation.`,
                                });
                              }}
                            >
                              <UserCheck className="w-4 h-4 mr-2" />
                              Open Message
                            </Button>
                          )}
                          {isHumanTakeover && (
                            <div className="flex items-center space-x-2">
                              <Badge variant="default" className="bg-green-500">
                                Agent Human - {user?.firstName || user?.email || 'Active'}
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setIsHumanTakeover(false);
                                  toast({
                                    title: "AI Agent Restored",
                                    description: "AI chatbot will now handle responses automatically.",
                                  });
                                }}
                              >
                                Back to AI
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <CardTitle className="text-lg">
                        Select a conversation
                      </CardTitle>
                    )}
                  </CardHeader>
                  <CardContent className="p-0">
                    {selectedUser ? (
                      <div className="flex flex-col h-[500px]">
                        {/* Messages Area */}
                        <ScrollArea className="flex-1 p-4">
                          <div className="space-y-4">
                            {isLoadingMessages ? (
                              <div className="text-center py-4 text-gray-500">
                                Loading messages...
                              </div>
                            ) : !Array.isArray(conversationMessages) ||
                              conversationMessages.length === 0 ? (
                              <div className="text-center py-4 text-gray-500">
                                {!Array.isArray(conversationMessages)
                                  ? "Error loading messages"
                                  : "No messages yet"}
                              </div>
                            ) : (
                              conversationMessages.map(
                                (message: ConversationMessage) => (
                                  <div
                                    key={message.id}
                                    className={`flex ${
                                      message.messageType === "user"
                                        ? "justify-start"
                                        : "justify-end"
                                    }`}
                                  >
                                    <div
                                      className={`max-w-[70%] rounded-lg px-4 py-2 ${
                                        message.messageType === "user"
                                          ? "bg-gray-100 text-gray-900"
                                          : message.messageType === "agent" && message.metadata?.humanAgent
                                            ? "bg-green-500 text-white"
                                            : "bg-blue-500 text-white"
                                      }`}
                                    >
                                      <div className="flex items-center space-x-2 mb-1">
                                        {message.messageType === "user" && (
                                          <User className="w-3 h-3" />
                                        )}
                                        {message.messageType ===
                                          "assistant" && (
                                          <Bot className="w-3 h-3" />
                                        )}
                                        {message.messageType ===
                                          "agent" && message.metadata?.humanAgent && (
                                          <UserCheck className="w-3 h-3" />
                                        )}
                                        <span className="text-xs opacity-75">
                                          {message.messageType === "user"
                                            ? "User"
                                            : message.messageType ===
                                                "agent"
                                              ? `Agent Human - ${message.metadata?.humanAgentName || user?.firstName || user?.email || 'Human Agent'}`
                                              : "AI Agent"}
                                        </span>
                                      </div>
                                      {/* Render message content based on type */}
                                      {message.metadata?.messageType ===
                                      "image_analysis" ? (
                                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                                          <div className="flex items-center space-x-2 mb-2">
                                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                                              การวิเคราะห์รูปภาพด้วย AI
                                            </span>
                                          </div>
                                          <p className="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-wrap">
                                            {message.content.replace(
                                              "[การวิเคราะห์รูปภาพ] ",
                                              "",
                                            )}
                                          </p>
                                        </div>
                                      ) : message.metadata?.messageType ===
                                        "image" ? (
                                        <div className="space-y-2">
                                          <div className="flex items-center space-x-2">
                                            <ImageIcon className="w-4 h-4" />
                                            <span className="text-sm font-semibold">
                                              รูปภาพ
                                            </span>
                                          </div>
                                          {message.metadata
                                            .originalContentUrl ? (
                                            <a
                                              href={
                                                message.metadata
                                                  .originalContentUrl
                                              }
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="block mt-2"
                                            >
                                              <img
                                                src={
                                                  message.metadata
                                                    .previewImageUrl ||
                                                  message.metadata
                                                    .originalContentUrl
                                                }
                                                alt="User sent image"
                                                className="max-w-48 max-h-48 rounded-lg shadow-md object-cover cursor-pointer"
                                                onError={(e) => {
                                                  console.log(
                                                    "Image load error:",
                                                    e.currentTarget.src,
                                                  );
                                                  e.currentTarget.style.display =
                                                    "none";
                                                  e.currentTarget.nextElementSibling?.classList.remove(
                                                    "hidden",
                                                  );
                                                }}
                                              />
                                              <div className="hidden bg-yellow-100 border border-yellow-400 text-yellow-700 px-3 py-2 rounded text-sm">
                                                ไม่สามารถโหลดรูปภาพได้ -
                                                กรุณาตรวจสอบ URL
                                                หรือสิทธิ์การเข้าถึง
                                              </div>
                                            </a>
                                          ) : (
                                            <div className="bg-gray-200 dark:bg-gray-700 p-2 rounded text-xs space-y-1">
                                              <div className="flex items-center space-x-2">
                                                <ImageIcon className="w-3 h-3" />
                                                <span>รูปภาพจาก Line OA</span>
                                              </div>
                                              {message.metadata.messageId && (
                                                <div className="text-gray-500">
                                                  Message ID:{" "}
                                                  {message.metadata.messageId}
                                                </div>
                                              )}
                                              <div className="text-xs text-gray-400">
                                                (ไม่สามารถแสดงรูปภาพ - ต้องการ
                                                Line Content API)
                                              </div>
                                            </div>
                                          )}
                                          {message.metadata.imageAnalysis && (
                                            <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                                              <div className="flex items-center space-x-2 mb-2">
                                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                                                  การวิเคราะห์รูปภาพด้วย AI
                                                </span>
                                              </div>
                                              <p className="text-xs text-blue-800 dark:text-blue-200 whitespace-pre-wrap">
                                                {message.metadata.imageAnalysis}
                                              </p>
                                            </div>
                                          )}
                                          {message.content && (
                                            <p className="text-sm whitespace-pre-wrap mt-2">
                                              {message.content}
                                            </p>
                                          )}
                                        </div>
                                      ) : message.metadata?.messageType ===
                                        "sticker" ? (
                                        <div className="space-y-2">
                                          {/* <div className="flex items-center space-x-2">
                                          <span className="text-lg">😀</span>
                                          <span className="text-sm font-semibold">สติ๊กเกอร์</span>
                                        </div> */}
                                          {message.metadata.packageId &&
                                          message.metadata.stickerId ? (
                                            <img
                                              src={`https://stickershop.line-scdn.net/stickershop/v1/sticker/${message.metadata.stickerId}/android/sticker.png`}
                                              alt="Line Sticker"
                                              className="w-24 h-24 object-contain"
                                              onError={(e) => {
                                                e.currentTarget.src =
                                                  "https://via.placeholder.com/100?text=Sticker+Error";
                                              }}
                                            />
                                          ) : (
                                            <div className="bg-gray-200 dark:bg-gray-700 p-2 rounded text-xs">
                                              Package:{" "}
                                              {message.metadata.packageId}
                                              <br />
                                              Sticker:{" "}
                                              {message.metadata.stickerId}
                                            </div>
                                          )}
                                          {message.content && (
                                            <p className="text-sm whitespace-pre-wrap mt-2">
                                              {message.content}
                                            </p>
                                          )}
                                        </div>
                                      ) : message.metadata?.messageType &&
                                        message.metadata.messageType !==
                                          "text" ? (
                                        <div className="space-y-2">
                                          <div className="flex items-center space-x-2">
                                            <FileIcon className="w-4 h-4" />
                                            <span className="text-sm font-semibold">
                                              {message.metadata.messageType
                                                .charAt(0)
                                                .toUpperCase() +
                                                message.metadata.messageType.slice(
                                                  1,
                                                )}
                                            </span>
                                          </div>
                                          {message.metadata
                                            .originalContentUrl && (
                                            <a
                                              href={
                                                message.metadata
                                                  .originalContentUrl
                                              }
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-sm text-blue-600 hover:underline"
                                            >
                                              เปิดไฟล์{" "}
                                              {message.metadata.messageType}
                                            </a>
                                          )}
                                          <p className="text-sm whitespace-pre-wrap mt-2">
                                            {message.content}
                                          </p>
                                        </div>
                                      ) : (
                                        <p className="text-sm whitespace-pre-wrap">
                                          {message.content}
                                        </p>
                                      )}
                                      <p className="text-xs opacity-75 mt-1">
                                        {safeFormatDate(
                                          message.createdAt,
                                          "HH:mm",
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                ),
                              )
                            )}
                            <div ref={messagesEndRef} />
                          </div>
                        </ScrollArea>

                        {/* Message Input */}
                        {isHumanTakeover && (
                          <div className="border-t p-4">
                            <div className="mb-2">
                              <div className="flex items-center space-x-2 text-xs text-green-600">
                                <UserCheck className="w-3 h-3" />
                                <span>Human Agent Mode - Your message will be sent to the user</span>
                              </div>
                            </div>
                            
                            {/* Image Preview */}
                            {imagePreview && (
                              <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                <div className="flex items-start space-x-3">
                                  <img 
                                    src={imagePreview} 
                                    alt="Selected image" 
                                    className="w-20 h-20 object-cover rounded-lg"
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <p className="text-sm font-medium text-gray-800">
                                          {selectedImage?.name}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          {selectedImage && (selectedImage.size / 1024 / 1024).toFixed(2)} MB
                                        </p>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleRemoveImage}
                                        className="ml-2"
                                      >
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            <div className="space-y-2">
                              <div className="flex space-x-2">
                                <Textarea
                                  placeholder={selectedImage ? "Add a message with your image (optional)..." : "Type your message..."}
                                  value={messageInput}
                                  onChange={(e) =>
                                    setMessageInput(e.target.value)
                                  }
                                  onKeyPress={handleKeyPress}
                                  className="flex-1 resize-none"
                                  rows={2}
                                />
                                <div className="flex flex-col space-y-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={sendMessageMutation.isPending || sendImageMutation.isPending}
                                    className="bg-blue-50 hover:bg-blue-100 border-blue-200"
                                  >
                                    <Upload className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    onClick={handleSendMessage}
                                    disabled={
                                      (!messageInput.trim() && !selectedImage) ||
                                      sendMessageMutation.isPending ||
                                      sendImageMutation.isPending
                                    }
                                    className="bg-green-500 hover:bg-green-600"
                                  >
                                    {(sendMessageMutation.isPending || sendImageMutation.isPending) ? (
                                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <Send className="w-4 h-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                              
                              {/* Hidden File Input */}
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/gif,image/webp"
                                onChange={handleImageSelect}
                                className="hidden"
                              />
                              
                              <div className="text-xs text-gray-500">
                                {selectedImage ? (
                                  <span className="text-blue-600">
                                    📸 Image ready to send{messageInput.trim() ? " with message" : ""}
                                  </span>
                                ) : (
                                  <span>
                                    💡 Tip: Click the upload button to send images to users
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-[500px] flex items-center justify-center text-gray-500">
                        Select a user to view conversation
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Right Panel - Customer Profile & Summary */}
                <Card className="col-span-3">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Customer Profile</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedUser ? (
                      <div className="space-y-6">
                        {/* User Profile */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">
                            Contact Information
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <User className="w-4 h-4 text-gray-500" />
                              <span className="text-sm">
                                {selectedUser.userProfile?.name ||
                                  `User ${selectedUser.userId.slice(-4)}`}
                              </span>
                            </div>
                            {selectedUser.userProfile?.email && (
                              <div className="flex items-center space-x-2">
                                <Mail className="w-4 h-4 text-gray-500" />
                                <span className="text-sm">
                                  {selectedUser.userProfile.email}
                                </span>
                              </div>
                            )}
                            {selectedUser.userProfile?.phone && (
                              <div className="flex items-center space-x-2">
                                <Phone className="w-4 h-4 text-gray-500" />
                                <span className="text-sm">
                                  {selectedUser.userProfile.phone}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center space-x-2">
                              <MessageSquare className="w-4 h-4 text-gray-500" />
                              <span className="text-sm">
                                ID: {selectedUser.userId}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Conversation Summary */}
                        {conversationSummaryLoading ? (
                          <div className="space-y-3">
                            <h4 className="font-semibold text-sm">
                              Conversation Summary
                            </h4>
                            <div className="text-sm text-gray-500">Loading...</div>
                          </div>
                        ) : conversationSummary ? (
                          <div className="space-y-3">
                            <h4 className="font-semibold text-sm">
                              Conversation Summary
                            </h4>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">
                                  Total Messages:
                                </span>
                                <span className="text-sm font-medium">
                                  {conversationSummary.totalMessages || 0}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">
                                  First Contact:
                                </span>
                                <span className="text-sm font-medium">
                                  {conversationSummary?.firstContactAt
                                    ? safeFormatDate(
                                        conversationSummary.firstContactAt,
                                        "MMM dd, yyyy",
                                      )
                                    : "N/A"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">
                                  Last Active:
                                </span>
                                <span className="text-sm font-medium">
                                  {conversationSummary?.lastActiveAt
                                    ? safeFormatDate(
                                        conversationSummary.lastActiveAt,
                                        "MMM dd, HH:mm",
                                      )
                                    : "N/A"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">
                                  CSAT Score:
                                </span>
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm font-medium">
                                    {conversationSummary.csatScore !== undefined 
                                      ? `${conversationSummary.csatScore}/100` 
                                      : 'Analyzing...'}
                                  </span>
                                  {conversationSummary.csatScore !== undefined && (
                                    <Badge
                                      variant={
                                        conversationSummary.csatScore >= 80
                                          ? "default"
                                          : conversationSummary.csatScore >= 60
                                            ? "secondary"
                                            : "destructive"
                                      }
                                    >
                                      {conversationSummary.csatScore >= 80
                                        ? "Excellent"
                                        : conversationSummary.csatScore >= 60
                                          ? "Good"
                                          : "Needs Improvement"}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              {conversationSummary.sentiment && (
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-600">
                                    Sentiment:
                                  </span>
                                  <Badge
                                    variant={
                                      conversationSummary.sentiment === "excellent"
                                        ? "default"
                                        : conversationSummary.sentiment === "good"
                                          ? "default"
                                          : conversationSummary.sentiment === "neutral"
                                            ? "secondary"
                                            : "destructive"
                                    }
                                    className={
                                      conversationSummary.sentiment === "excellent"
                                        ? "bg-green-100 text-green-800 border-green-300"
                                        : conversationSummary.sentiment === "good"
                                          ? "bg-blue-100 text-blue-800 border-blue-300"
                                          : conversationSummary.sentiment === "neutral"
                                            ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                                            : "bg-red-100 text-red-800 border-red-300"
                                    }
                                  >
                                    {conversationSummary.sentiment === "excellent"
                                      ? "Excellent"
                                      : conversationSummary.sentiment === "good"
                                        ? "Good"
                                        : conversationSummary.sentiment === "neutral"
                                          ? "Neutral"
                                          : "Bad"}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}

                        {/* Main Topics */}
                        {conversationSummary?.mainTopics &&
                          conversationSummary.mainTopics.length > 0 && (
                            <div className="space-y-3">
                              <h4 className="font-semibold text-sm">
                                Main Topics
                              </h4>
                              <div className="flex flex-wrap gap-1">
                                {conversationSummary.mainTopics.map(
                                  (topic, index) => (
                                    <Badge
                                      key={index}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {topic}
                                    </Badge>
                                  ),
                                )}
                              </div>
                            </div>
                          )}

                        {/* Agent Information */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">
                            Agent Details
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Bot className="w-4 h-4 text-gray-500" />
                              <span className="text-sm">
                                {selectedUser.agentName}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span
                                className={`inline-flex px-2 py-1 text-xs rounded-full ${getChannelBadge(selectedUser.channelType)}`}
                              >
                                {selectedUser.channelType.toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        Select a conversation to view customer profile
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
