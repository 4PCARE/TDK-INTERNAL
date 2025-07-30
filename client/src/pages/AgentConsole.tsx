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
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api";

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
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch active users
  const { data: users = [], refetch: refetchUsers } = useQuery({
    queryKey: ["/api/agent-console/users", searchQuery, filterAgent],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (filterAgent !== "all") params.append("agentId", filterAgent);

      const response = await fetch(`/api/agent-console/users?${params}`);
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json();
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
    const wsUrl = `${protocol}//${window.location.host}/ws`;

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

  // Auto-select first user if none selected
  useEffect(() => {
    if (users.length > 0 && !selectedUser) {
      console.log('🎯 Agent Console: Auto-selecting first user:', users[0]);
      setSelectedUser(users[0]);
    }
  }, [users, selectedUser]);

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

  const uniqueAgents = Array.from(
    new Set(users.map(u => u.agentId))
  ).map(agentId => {
    const user = users.find(u => u.agentId === agentId);
    return {
      id: agentId,
      name: user?.agentName || `Agent ${agentId}`,
    };
  });

  return (
    <DashboardLayout>
      <div className="h-screen flex overflow-hidden bg-gray-50 p-4 gap-4">
        {/* Left Sidebar - Channel Selection & User List */}
        <div className="w-80 min-w-80 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
          {/* Header */}
          <div className="flex-shrink-0 p-4 border-b border-gray-200">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-6 h-6 bg-gradient-to-br from-green-500 to-green-600 rounded flex items-center justify-center">
                <MessageSquare className="w-3 h-3 text-white" />
              </div>
              <h1 className="text-lg font-bold text-gray-900">Agent Console</h1>
            </div>

            <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
              <div className="flex items-center space-x-2">
                <Dot className="w-3 h-3 text-green-500 animate-pulse" />
                <span>Real-time WebSocket</span>
              </div>
              <span>{users.filter(u => u.isOnline).length} Active Conversations</span>
            </div>
          </div>

          {/* Select Channel */}
          <div className="flex-shrink-0 p-4 border-b border-gray-200">
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Channel
              </label>
              <div className="relative">
                <select
                  value={filterAgent}
                  onChange={(e) => setFilterAgent(e.target.value)}
                  className="w-full p-2 pr-8 border border-gray-300 rounded-md text-sm bg-white appearance-none"
                >
                  <option value="all">All Channels</option>
                  {uniqueAgents.map(agent => (
                    <option key={agent.id} value={agent.id.toString()}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 text-sm"
              />
            </div>
          </div>

          {/* Users List */}
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-2">
                {users.length === 0 ? (
                  <div className="text-center py-8">
                    <UserCheck className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No active users</p>
                  </div>
                ) : (
                  users.map((user) => (
                    <div
                      key={`${user.userId}-${user.channelType}-${user.channelId}-${user.agentId}`}
                      className={`p-3 rounded-lg cursor-pointer transition-all mb-2 ${
                        selectedUser?.userId === user.userId && selectedUser?.channelId === user.channelId
                          ? 'bg-blue-50 border border-blue-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      }`}
                      onClick={() => setSelectedUser(user)}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="relative">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="text-xs">
                              {getInitials(user.userProfile.name)}
                            </AvatarFallback>
                          </Avatar>
                          {user.isOnline && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {user.userProfile.name}
                            </p>
                            <Badge variant="secondary" className="text-xs">
                              {user.messageCount}
                            </Badge>
                          </div>

                          <p className="text-xs text-gray-500 mb-1 truncate">
                            {user.agentName}
                          </p>

                          <div className="text-xs text-gray-600 mb-1 h-8 overflow-hidden">
                            <p className="leading-4">
                              {user.lastMessage.length > 80 ? `${user.lastMessage.substring(0, 80)}...` : user.lastMessage}
                            </p>
                          </div>

                          <p className="text-xs text-gray-400">
                            {formatTime(user.lastMessageAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex min-w-0">
          {/* Conversation Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedUser ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full">
                {/* Conversation Header */}
                <div className="flex-shrink-0 p-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback>
                          {getInitials(selectedUser.userProfile.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-medium text-gray-900">
                          {selectedUser.userProfile.name}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {selectedUser.channelType.toUpperCase()} • Agent: {selectedUser.agentName}
                        </p>
                      </div>
                    </div>

                    <Button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm">
                      Open Message
                    </Button>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 flex flex-col min-h-0">
                  <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
                    <div className="space-y-4">
                      {console.log("🧾 Messages to render:", messages)}
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
                    </div>
                  </ScrollArea>

                  {/* Message Input */}
                  <div className="flex-shrink-0 border-t border-gray-200 p-4">
                    <div className="flex space-x-2">
                      <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim()}
                        size="sm"
                        className="px-4"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
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
          <div className="w-80 min-w-80 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col ml-4">
            {selectedUser ? (
              <ScrollArea className="flex-1">
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
                            {selectedUser.channelType.toUpperCase()}
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