import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { 
  MessageSquare, 
  Users, 
  Send, 
  Bot, 
  User, 
  Clock,
  Search,
  Filter,
  Dot,
  TrendingUp,
  MessageCircle,
  UserCheck,
  Settings,
  ChevronDown
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";


interface AgentUser {
  userId: string;
  channelType: string;
  channelId: string;
  agentId: number;
  agentName: string;
  lastMessage: string;
  lastMessageAt: string;
  messageCount: number;
  isOnline: boolean;
  userProfile: {
    name: string;
  };
}

interface Message {
  id: number;
  userId: string;
  channelType: string;
  channelId: string;
  agentId: number;
  messageType: 'user' | 'agent';
  content: string;
  metadata?: any;
  createdAt: string;
}

interface ConversationSummary {
  totalMessages: number;
  firstContactAt: string;
  lastActiveAt: string;
  sentiment?: string;
  mainTopics?: string[];
  csatScore?: number;
}

export default function AgentConsole() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<AgentUser | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [showMessageInput, setShowMessageInput] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Define all available channel types
  const allChannelTypes = [
    { id: "lineoa", name: "Line OA", icon: "📱" },
    { id: "facebook", name: "Facebook", icon: "f" },
    { id: "tiktok", name: "TikTok", icon: "🎵" },
    { id: "web", name: "Web Widget", icon: "🌐" },
  ];

  // Fetch active users
  const { data: users = [], refetch: refetchUsers } = useQuery({
    queryKey: ["/api/agent-console/users", searchQuery, channelFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (channelFilter !== "all") params.append("channelFilter", channelFilter);

      console.log("🔍 Agent Console: Fetching users with params:", Object.fromEntries(params));
      const response = await fetch(`/api/agent-console/users?${params}`);
      if (!response.ok) throw new Error("Failed to fetch users");
      const data = await response.json();
      console.log("📋 Agent Console: Filtered users response:", data.length, "users");
      return data;
    },
    refetchInterval: 10000, // Refetch every 10 seconds
  }) as { data: AgentUser[]; refetch: () => void };

  // Fetch conversation messages
  const { data: messages = [], refetch: refetchMessages } = useQuery({
    queryKey: ["/api/agent-console/conversation", selectedUser?.userId, selectedUser?.channelId, selectedUser?.agentId],
    queryFn: async () => {
      if (!selectedUser) return [];

      const params = new URLSearchParams({
        userId: selectedUser.userId,
        channelType: selectedUser.channelType,
        channelId: selectedUser.channelId,
        agentId: selectedUser.agentId.toString(),
      });

      console.log("🔍 Fetching conversation with params:", Object.fromEntries(params));
      const response = await fetch(`/api/agent-console/conversation?${params}`);
      if (!response.ok) throw new Error("Failed to fetch conversation");
      const data = await response.json();
      console.log("📨 Conversation response:", data);
      return data;
    },
    enabled: !!selectedUser?.userId && !!selectedUser?.channelId,
  }) as { data: Message[]; refetch: () => void };

  // Fetch conversation summary
  const { data: summary } = useQuery({
    queryKey: ["/api/agent-console/summary", selectedUser?.userId, selectedUser?.channelId],
    queryFn: async () => {
      if (!selectedUser) return null;

      const params = new URLSearchParams({
        userId: selectedUser.userId,
        channelType: selectedUser.channelType,
        channelId: selectedUser.channelId,
      });

      console.log("📊 Fetching summary with params:", Object.fromEntries(params));
      const response = await fetch(`/api/agent-console/summary?${params}`);
      if (!response.ok) throw new Error("Failed to fetch summary");
      const data = await response.json();
      console.log("📊 Summary response:", data);
      return data;
    },
    enabled: !!selectedUser?.userId && !!selectedUser?.channelId,
  }) as { data: ConversationSummary | null };

  // WebSocket connection for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = window.location.port || (protocol === 'https:' ? '443' : '80');
    const wsUrl = `${protocol}//${host}:${port}/ws`;

    console.log('🔌 Connecting to WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('🔌 WebSocket connected');
      // Subscribe to agent console updates
      ws.send(JSON.stringify({ type: 'subscribe', target: 'agent-console' }));
    };

    ws.onmessage = (event) => {
      console.log('📨 WebSocket message received:', JSON.parse(event.data));
      const data = JSON.parse(event.data);
      if (data.type === 'agent-console-update') {
        // Refetch users and messages when updates occur
        queryClient.invalidateQueries({ queryKey: ['/api/agent-console/users'] });
        queryClient.invalidateQueries({ queryKey: ['/api/agent-console/conversation'] });
        queryClient.invalidateQueries({ queryKey: ['/api/agent-console/summary'] });
      }
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket disconnected');
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [queryClient]);

  // Group users by unique conversation (userId + channelId + agentId) to show all conversations
  const groupedUsers = users.reduce((acc, user) => {
    const conversationKey = `${user.userId}-${user.channelId}-${user.agentId}`;
    const existingUser = acc.find(u => `${u.userId}-${u.channelId}-${u.agentId}` === conversationKey);
    if (existingUser) {
      // Keep the most recent conversation
      if (new Date(user.lastMessageAt) > new Date(existingUser.lastMessageAt)) {
        const index = acc.findIndex(u => `${u.userId}-${u.channelId}-${u.agentId}` === conversationKey);
        acc[index] = user;
      }
    } else {
      acc.push(user);
    }
    return acc;
  }, [] as AgentUser[]);

  // Auto-select first user if none selected
  useEffect(() => {
    if (groupedUsers.length > 0 && !selectedUser) {
      console.log('🎯 Agent Console: Auto-selecting first user:', groupedUsers[0]);
      setSelectedUser(groupedUsers[0]);
    }
  }, [groupedUsers, selectedUser]);

  // Reset message input when user changes
  useEffect(() => {
    setShowMessageInput(false);
    setNewMessage("");
  }, [selectedUser]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedUser) return;

    try {
      const response = await fetch("/api/agent-console/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.userId, // Use 'userId' to match backend
          channelType: selectedUser.channelType,
          channelId: selectedUser.channelId,
          agentId: selectedUser.agentId,
          message: newMessage.trim(),
        }),
      });

      if (!response.ok) throw new Error("Failed to send message");

      setNewMessage("");
      setShowMessageInput(false);
      refetchMessages(); // Refresh messages after sending
      toast({
        title: "Message Sent",
        description: "Your message has been sent successfully.",
      });
    } catch (error) {
      toast({
        title: "Send Failed",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const uniqueChannelTypes = allChannelTypes.filter(channelType => 
    users.some(u => u.channelType === channelType.id)
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col lg:flex-row bg-gray-50 p-2 lg:p-4 gap-2 lg:gap-4 h-[calc(100vh-120px)]">
        {/* Left Sidebar - Channel Selection & User List */}
        <div className="w-full lg:w-80 lg:min-w-80 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col max-h-96 lg:max-h-none">
          {/* Header */}
          <div className="flex-shrink-0 p-2 lg:p-4 border-b border-gray-200">
            <div className="flex items-center space-x-2 lg:space-x-3 mb-2 lg:mb-4">
              <div className="w-5 h-5 lg:w-6 lg:h-6 bg-gradient-to-br from-green-500 to-green-600 rounded flex items-center justify-center">
                <MessageSquare className="w-2 h-2 lg:w-3 lg:h-3 text-white" />
              </div>
              <h1 className="text-base lg:text-lg font-bold text-gray-900">Agent Console</h1>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between text-xs lg:text-sm text-gray-600 mb-2 lg:mb-4 space-y-1 lg:space-y-0">
              <div className="flex items-center space-x-2">
                <Dot className="w-3 h-3 text-green-500 animate-pulse" />
                <span>Real-time WebSocket</span>
              </div>
              <span>{users.filter(u => u.isOnline).length} Active Conversations</span>
            </div>
          </div>

          {/* Select Channel */}
          <div className="flex-shrink-0 p-2 lg:p-4 border-b border-gray-200">
            <div className="mb-2 lg:mb-3">
              <label className="block text-xs lg:text-sm font-medium text-gray-700 mb-1 lg:mb-2">
                Select Channel
              </label>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-full text-xs lg:text-sm">
                  <SelectValue placeholder="Select Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center space-x-2">
                      <span>🌐</span>
                      <span>All Channels</span>
                    </div>
                  </SelectItem>
                  {allChannelTypes.map(channel => (
                    <SelectItem key={channel.id} value={channel.id}>
                      <div className="flex items-center space-x-2">
                        <span>{channel.icon}</span>
                        <span>{channel.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3 lg:w-4 lg:h-4" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 lg:pl-10 text-xs lg:text-sm"
              />
            </div>
          </div>

          {/* Users List */}
          <div className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="p-2">
                {groupedUsers.length === 0 ? (
                  <div className="text-center py-8">
                    <UserCheck className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No active users</p>
                  </div>
                ) : (
                  groupedUsers.map((user) => {
                    const isSelected = selectedUser?.userId === user.userId && 
                                     selectedUser?.channelId === user.channelId && 
                                     selectedUser?.agentId === user.agentId;
                    const userConversations = users.filter(u => u.userId === user.userId);

                    return (
                      <div key={user.userId}>
                        <div
                          className={`p-2 lg:p-3 rounded-lg cursor-pointer transition-all mb-1 lg:mb-2 ${
                            isSelected
                              ? 'bg-blue-50 border border-blue-200'
                              : 'hover:bg-gray-50 border border-transparent'
                          }`}
                          onClick={() => setSelectedUser(user)}
                        >
                          <div className="flex items-start space-x-2 lg:space-x-3">
                            <div className="relative">
                              <Avatar className="w-6 h-6 lg:w-8 lg:h-8">
                                <AvatarFallback className="text-xs">
                                  {getInitials(user.userProfile.name)}
                                </AvatarFallback>
                              </Avatar>
                              {user.isOnline && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 lg:w-3 lg:h-3 bg-green-500 border-1 lg:border-2 border-white rounded-full"></div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <p className={`text-xs lg:text-sm text-gray-900 truncate ${
                                  isSelected ? 'font-bold' : 'font-medium'
                                }`}>
                                  {user.userProfile.name}
                                </p>
                                <div className="flex items-center space-x-1">
                                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 hidden lg:flex">
                                    <span className="mr-1">
                                      {allChannelTypes.find(c => c.id === user.channelType)?.icon || '📱'}
                                    </span>
                                    <span className="hidden lg:inline">{allChannelTypes.find(c => c.id === user.channelType)?.name || user.channelType.toUpperCase()}</span>
                                  </Badge>
                                  <span className="lg:hidden text-lg">
                                    {allChannelTypes.find(c => c.id === user.channelType)?.icon || '📱'}
                                  </span>
                                  <Badge variant="secondary" className="text-xs">
                                    {userConversations.reduce((total, conv) => total + conv.messageCount, 0)}
                                  </Badge>
                                </div>
                              </div>

                              <p className="text-xs text-gray-500 mb-1 truncate">
                                {user.agentName}
                              </p>

                              <div className="text-xs text-gray-600 mb-1 h-6 lg:h-8 overflow-hidden">
                                <p className="leading-3 lg:leading-4">
                                  {user.lastMessage.length > (window.innerWidth < 768 ? 40 : 80) ? `${user.lastMessage.substring(0, window.innerWidth < 768 ? 40 : 80)}...` : user.lastMessage}
                                </p>
                              </div>

                              <div className="flex items-center justify-between">
                                <p className="text-xs text-gray-400">
                                  {formatTime(user.lastMessageAt)}
                                </p>
                                {userConversations.length > 1 && (
                                  <span className="text-xs text-blue-600 font-medium">
                                    {userConversations.length} chats
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col lg:flex-row min-w-0">
          {/* Conversation Area */}
          <div className="flex-1 flex flex-col min-w-0 min-h-[400px] lg:min-h-[600px]">
            {selectedUser ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full">
                {/* Conversation Header */}
                <div className="flex-shrink-0 p-2 lg:p-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 lg:space-x-3">
                      <Avatar className="w-6 h-6 lg:w-8 lg:h-8">
                        <AvatarFallback>
                          {getInitials(selectedUser.userProfile.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="text-sm lg:font-medium text-gray-900">
                          {selectedUser.userProfile.name}
                        </h3>
                        <p className="text-xs lg:text-sm text-gray-500">
                          {selectedUser.channelType.toUpperCase()} • Agent: {selectedUser.agentName}
                        </p>
                      </div>
                    </div>

                    <Button className="bg-blue-500 hover:bg-blue-600 text-white px-2 lg:px-4 py-1 lg:py-2 rounded-md text-xs lg:text-sm">
                      <span className="hidden lg:inline">Open Message</span>
                      <MessageSquare className="w-4 h-4 lg:hidden" />
                    </Button>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 flex flex-col min-h-0">
                  <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
                    <div className="space-y-4">
                      {messages.length === 0 ? (
                        <div className="text-center py-8">
                          <MessageCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">No messages yet</p>
                        </div>
                      ) : (
                        messages.map((message) => (
                          <div
                            key={`message-${message.id}-${message.userId}-${message.createdAt}`}
                            className={`flex space-x-3 ${
                              message.messageType === 'user' ? 'justify-start' : 'justify-end'
                            }`}
                          >
                            {message.messageType === 'user' && (
                              <Avatar className="w-8 h-8">
                                <AvatarFallback className="text-xs">
                                  <User className="w-4 h-4" />
                                </AvatarFallback>
                              </Avatar>
                            )}

                            <div
                              className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg shadow-sm ${
                                message.messageType === 'user'
                                  ? 'bg-white border border-gray-200 text-gray-900'
                                  : 'bg-blue-500 text-white'
                              }`}
                            >
                              <div className="text-sm whitespace-pre-wrap">
                                {message.content}
                              </div>
                              <div className="text-xs mt-1 opacity-70">
                                {formatTime(message.createdAt)}
                              </div>
                            </div>

                            {message.messageType === 'agent' && (
                              <Avatar className="w-8 h-8">
                                <AvatarFallback className="text-xs">
                                  <Bot className="w-4 h-4" />
                                </AvatarFallback>
                              </Avatar>
                            )}
                          </div>
                        ))
                      )}
                      {/* Invisible div for scroll target */}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  {/* Message Input or Open Message Button */}
                  <div className="flex-shrink-0 border-t border-gray-200 p-2 lg:p-3">
                    {showMessageInput ? (
                      <div className="flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-2">
                        <Input
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder="Type a message..."
                          className="flex-1 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage();
                            }
                          }}
                          autoFocus
                        />
                        <div className="flex space-x-2">
                          <Button
                            onClick={handleSendMessage}
                            disabled={!newMessage.trim()}
                            size="sm"
                            className="px-3 lg:px-4 flex-1 lg:flex-none"
                          >
                            <Send className="w-4 h-4" />
                            <span className="ml-2 lg:hidden">Send</span>
                          </Button>
                          <Button
                            onClick={() => {
                              setShowMessageInput(false);
                              setNewMessage("");
                            }}
                            variant="outline"
                            size="sm"
                            className="px-3 lg:px-4 flex-1 lg:flex-none"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        onClick={() => setShowMessageInput(true)}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 text-sm"
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Open Message
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Select a Conversation
                  </h3>
                  <p className="text-gray-500">
                    Choose a user from the list to view their conversation
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar - Customer Profile */}
          <div className="w-full lg:w-80 lg:min-w-80 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col lg:ml-4 mt-2 lg:mt-0 h-full max-h-96 lg:max-h-none">
            {selectedUser ? (
              <ScrollArea className="h-full">
                <div className="p-4 space-y-6">
                  {/* Customer Profile Header */}
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Profile</h2>

                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Contact Information</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center space-x-2">
                            <User className="w-4 h-4 text-gray-400" />
                            <span>{selectedUser.userProfile.name}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-gray-500">ID:</span>
                            <span className="font-mono text-xs">{selectedUser.userId.slice(-8)}</span>
                          </div>
                        </div>
                      </div>

                      {summary && (
                        <div>
                          <h4 className="font-medium text-gray-900 mb-2">Conversation Summary</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Total Messages:</span>
                              <span className="font-medium">{summary.totalMessages}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">First Contact:</span>
                              <span className="font-medium">{formatDate(summary.firstContactAt)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Last Active:</span>
                              <span className="font-medium">{formatDate(summary.lastActiveAt)}</span>
                            </div>
                            {summary.csatScore && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500">CSAT Score:</span>
                                <Badge 
                                  variant={summary.csatScore >= 80 ? "default" : summary.csatScore >= 60 ? "secondary" : "destructive"}
                                  className={
                                    summary.csatScore >= 80 
                                      ? "bg-green-100 text-green-800" 
                                      : summary.csatScore >= 60 
                                      ? "bg-yellow-100 text-yellow-800" 
                                      : "bg-red-100 text-red-800"
                                  }
                                >
                                  {summary.csatScore}/100 {summary.csatScore >= 80 ? "Excellent" : summary.csatScore >= 60 ? "Good" : "Needs Improvement"}
                                </Badge>
                              </div>
                            )}
                            {summary.sentiment && (
                              <div className="flex justify-between">
                                <span className="text-gray-500">Sentiment:</span>
                                <Badge variant="outline" className="capitalize">
                                  {summary.sentiment}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {summary?.mainTopics && summary.mainTopics.length > 0 && (
                        <div>
                          <h4 className="font-medium text-gray-900 mb-2">Main Topics</h4>
                          <div className="flex flex-wrap gap-1">
                            {summary.mainTopics.map((topic, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {topic}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Agent Details</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center space-x-2">
                            <Bot className="w-4 h-4 text-gray-400" />
                            <span>{selectedUser.agentName}</span>
                          </div>
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                                <span className="mr-1">
                                  {allChannelTypes.find(c => c.id === selectedUser.channelType)?.icon || '📱'}
                                </span>
                                {allChannelTypes.find(c => c.id === selectedUser.channelType)?.name || selectedUser.channelType.toUpperCase()}
                              </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <User className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    Select a user to view profile
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}