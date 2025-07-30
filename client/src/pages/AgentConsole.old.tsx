
<change_summary>Fix Agent Console API parameter issues and React key conflicts</change_summary>
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
  UserCheck
} from "lucide-react";

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
  const { data: messages = [] } = useQuery({
    queryKey: ["/api/agent-console/conversation", selectedUser?.userId, selectedUser?.channelId],
    queryFn: async () => {
      if (!selectedUser) return [];

      console.log('🔍 Fetching conversation with params:', {
        targetUserId: selectedUser.userId,
        channelType: selectedUser.channelType,
        channelId: selectedUser.channelId,
        agentId: selectedUser.agentId.toString(),
      });

      const params = new URLSearchParams({
        targetUserId: selectedUser.userId,
        channelType: selectedUser.channelType,
        channelId: selectedUser.channelId,
        agentId: selectedUser.agentId.toString(),
      });

      const response = await fetch(`/api/agent-console/conversation?${params}`);
      if (!response.ok) {
        console.error('❌ Conversation API failed:', response.status, response.statusText);
        throw new Error("Failed to fetch conversation");
      }
      const data = await response.json();
      console.log('📨 Conversation response:', data);
      return data;
    },
    enabled: !!selectedUser,
  }) as { data: Message[] };

  // Fetch conversation summary
  const { data: summary } = useQuery({
    queryKey: ["/api/agent-console/summary", selectedUser?.userId, selectedUser?.channelId],
    queryFn: async () => {
      if (!selectedUser) return null;

      console.log('📊 Fetching summary with params:', {
        targetUserId: selectedUser.userId,
        channelType: selectedUser.channelType,
        channelId: selectedUser.channelId,
      });

      const params = new URLSearchParams({
        targetUserId: selectedUser.userId,
        channelType: selectedUser.channelType,
        channelId: selectedUser.channelId,
      });

      const response = await fetch(`/api/agent-console/summary?${params}`);
      if (!response.ok) {
        console.error('❌ Summary API failed:', response.status, response.statusText);
        throw new Error("Failed to fetch summary");
      }
      const data = await response.json();
      console.log('📊 Summary response:', data);
      return data;
    },
    enabled: !!selectedUser,
  }) as { data: ConversationSummary | null };

  // WebSocket connection for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use window.location.host which includes port, or fallback to hostname:port
    const hostWithPort = window.location.host || `${window.location.hostname}:${window.location.port || '5000'}`;
    const wsUrl = `${protocol}//${hostWithPort}/ws`;

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
        refetchUsers();
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
  }, [refetchUsers]);

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
      const response = await fetch("/api/agent-console/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: selectedUser.userId,
          channelType: selectedUser.channelType,
          channelId: selectedUser.channelId,
          agentId: selectedUser.agentId,
          message: newMessage.trim(),
        }),
      });

      if (!response.ok) throw new Error("Failed to send message");

      setNewMessage("");
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
      <div className="h-full flex flex-col space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Agent Console</h1>
              <p className="text-gray-600">Monitor and manage live conversations</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="flex items-center space-x-1">
              <Dot className="w-3 h-3 text-green-500 animate-pulse" />
              <span>{users.filter(u => u.isOnline).length} Online</span>
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
          {/* Users List */}
          <div className="lg:col-span-1 space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center space-x-2">
                  <Users className="w-5 h-5" />
                  <span>Active Users</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Filter by Agent
                  </label>
                  <select
                    value={filterAgent}
                    onChange={(e) => setFilterAgent(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="all">All Agents</option>
                    {uniqueAgents.map(agent => (
                      <option key={agent.id} value={agent.id.toString()}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Users List */}
            <Card className="flex-1">
              <CardContent className="p-0">
                <ScrollArea className="h-64 lg:h-96">
                  <div className="space-y-2 p-4">
                    {users.length === 0 ? (
                      <div className="text-center py-8">
                        <UserCheck className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No active users</p>
                      </div>
                    ) : (
                      users.map((user) => (
                        <div
                          key={`${user.userId}-${user.channelId}-${user.agentId}`} // Fixed: make unique key
                          className={`p-3 rounded-lg cursor-pointer transition-all ${
                            selectedUser?.userId === user.userId && selectedUser?.channelId === user.channelId
                              ? 'bg-blue-100 border border-blue-200'
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
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {user.userProfile.name}
                                </p>
                                <div className="flex items-center space-x-1">
                                  <Badge variant="secondary" className="text-xs">
                                    {user.messageCount}
                                  </Badge>
                                </div>
                              </div>

                              <p className="text-xs text-gray-500 mb-1">
                                {user.agentName}
                              </p>

                              <p className="text-xs text-gray-600 truncate">
                                {user.lastMessage}
                              </p>

                              <p className="text-xs text-gray-400 mt-1">
                                {formatTime(user.lastMessageAt)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Conversation Area */}
          <div className="lg:col-span-3 flex flex-col min-h-0">
            {selectedUser ? (
              <div className="flex flex-col h-full space-y-4">
                {/* Conversation Header */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Avatar className="w-10 h-10">
                          <AvatarFallback>
                            {getInitials(selectedUser.userProfile.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-medium text-gray-900">
                            {selectedUser.userProfile.name}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {selectedUser.agentName} • {selectedUser.channelType}
                          </p>
                        </div>
                      </div>

                      {summary && (
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <div className="flex items-center space-x-1">
                            <MessageCircle className="w-4 h-4" />
                            <span>{summary.totalMessages} messages</span>
                          </div>
                          {summary.sentiment && (
                            <Badge variant="outline">
                              {summary.sentiment}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                </Card>

                {/* Messages */}
                <Card className="flex-1 flex flex-col min-h-0">
                  <CardContent className="flex-1 flex flex-col p-0 min-h-0">
                    <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
                      {console.log('🧾 Messages to render:', messages)}
                      <div className="space-y-4">
                        {messages.map((message) => (
                          <div
                            key={`${message.id}-${message.createdAt}`} // Fixed: make unique key
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
                              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                                message.messageType === 'user'
                                  ? 'bg-gray-100 text-gray-900'
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
                        ))}
                      </div>
                    </ScrollArea>

                    {/* Message Input */}
                    <div className="border-t p-4">
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
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="flex-1 flex items-center justify-center">
                <CardContent className="text-center">
                  <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Select a Conversation
                  </h3>
                  <p className="text-gray-500">
                    Choose a user from the list to view their conversation
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
