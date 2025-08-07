import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  MessageSquare, 
  Users, 
  Clock, 
  TrendingUp, 
  BarChart3, 
  PieChart,
  Target,
  Zap,
  Star,
  Activity,
  Download,
  RefreshCw,
  ChevronDown,
  ArrowUpDown
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, Legend, PieChart as RechartsPieChart, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Pie } from "recharts";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import type { SocialIntegration } from "@shared/schema";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];
const PLATFORM_COLORS = {
  lineoa: '#00C851',
  facebook: '#1877F2', 
  tiktok: '#FF0050',
  web: '#6C757D'
};

const PLATFORM_ICONS = {
  lineoa: '💬',
  facebook: '📘',
  tiktok: '🎵',
  web: '🌐'
};

export default function OmnichannelSummarization() {
  const queryClient = useQueryClient();
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('7d');
  const [viewMode, setViewMode] = useState<'overview' | 'compare' | 'individual'>('overview');

  // Force refresh data when component mounts
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/social-integrations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/chat/history"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/omnichannel"] });
  }, [queryClient]);

  const { data: analyticsData = null, isLoading, error } = useQuery({
    queryKey: ["/api/analytics/omnichannel", dateRange],
  });

  // Process real analytics data
  const processAnalyticsData = () => {
    if (!analyticsData) return { platformAnalytics: [], activePlatforms: [] };

    const { integrations = [], chatStats = [], recentMessages = [] } = analyticsData;
    const platforms = ['lineoa', 'facebook', 'tiktok', 'web'];
    
    // Create platform analytics from real data
    const platformAnalytics = platforms.map(platform => {
      const integration = integrations.find((int: any) => int.platform === platform);
      const stats = chatStats.filter((stat: any) => stat.channelType === platform);
      
      const totalMessages = stats.reduce((sum: number, stat: any) => sum + (stat.messageCount || 0), 0);
      const totalUsers = stats.reduce((sum: number, stat: any) => sum + (stat.uniqueUsers || 0), 0);
      
      // Use the corrected response rate from backend
      const avgResponseRate = stats.length > 0 ? 
        stats.reduce((sum: number, stat: any) => sum + (stat.responseRate || 0), 0) / stats.length : 0;
      
      // Use actual response time from backend (already in minutes)
      const avgResponseTime = stats.length > 0 ? 
        stats.reduce((sum: number, stat: any) => sum + (stat.avgResponseTimeMinutes || 0), 0) / stats.length : 0;
      
      // Use actual CSAT scores from backend, calculate weighted average
      const csatScores = stats.filter((stat: any) => stat.csatScore !== null).map((stat: any) => stat.csatScore);
      const avgCsatScore = csatScores.length > 0 ? 
        csatScores.reduce((sum: number, score: number) => sum + score, 0) / csatScores.length : null;
      
      // Analyze topics from recent messages for this platform
      const platformMessages = recentMessages.filter((msg: any) => 
        msg.channelType === platform && msg.messageType === 'user'
      );
      
      const topTopics = extractTopTopics(platformMessages);
      
      return {
        platform,
        name: platform.charAt(0).toUpperCase() + platform.slice(1),
        totalMessages: Math.max(0, totalMessages),
        totalUsers: Math.max(0, totalUsers),
        avgResponseTime: Number(avgResponseTime.toFixed(1)),
        csatScore: avgCsatScore ? Math.round(avgCsatScore) : null,
        successRate: Math.round(avgResponseRate),
        isActive: integration?.isActive || stats.length > 0, // Active if has integration or has chat data
        integrationName: integration?.name || '',
        agentName: integration?.agentName || '',
        topTopics,
        hasRealData: stats.length > 0
      };
    });

    const activePlatforms = platformAnalytics.filter(p => p.isActive);
    return { platformAnalytics, activePlatforms };
  };

  // Extract topics from messages using simple keyword analysis
  const extractTopTopics = (messages: any[]) => {
    const topicKeywords = {
      'Product Info': ['product', 'information', 'details', 'specs', 'features'],
      'Support': ['help', 'support', 'issue', 'problem', 'error'],
      'Pricing': ['price', 'cost', 'fee', 'payment', 'subscription'],
      'FAQ': ['how', 'what', 'when', 'where', 'why'],
      'Technical': ['technical', 'api', 'integration', 'setup', 'configuration']
    };

    const topicCounts: { [key: string]: number } = {};
    
    messages.forEach((msg: any) => {
      const content = msg.content?.toLowerCase() || '';
      Object.entries(topicKeywords).forEach(([topic, keywords]) => {
        if (keywords.some(keyword => content.includes(keyword))) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
      });
    });

    return Object.entries(topicCounts)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };

  const { platformAnalytics, activePlatforms } = processAnalyticsData();

  // Generate trend data from real messages
  const generateTrendData = () => {
    if (!analyticsData?.recentMessages) return [];
    
    const days = analyticsData.dateRange?.days || 7;
    const { recentMessages } = analyticsData;
    
    return Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));
      
      const dayData: any = {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      };

      activePlatforms.forEach(platform => {
        const dayMessages = recentMessages.filter((msg: any) => {
          const msgDate = new Date(msg.createdAt);
          return msg.channelType === platform.platform && 
                 msgDate >= dayStart && msgDate <= dayEnd;
        });
        dayData[platform.platform] = dayMessages.length;
      });

      return dayData;
    });
  };

  const trendData = generateTrendData();

  // Performance comparison data
  const performanceData = platformAnalytics.map(platform => ({
    platform: platform.name,
    responseTime: platform.avgResponseTime,
    csat: platform.csatScore,
    successRate: platform.successRate,
    volume: platform.totalMessages
  }));

  // Topic distribution across platforms
  const topicDistribution = () => {
    const allTopics = new Map();
    
    platformAnalytics.forEach(platform => {
      if (platform.isActive) {
        platform.topTopics.forEach(topic => {
          const key = topic.topic;
          if (!allTopics.has(key)) {
            allTopics.set(key, { topic: key, platforms: {} });
          }
          allTopics.get(key).platforms[platform.platform] = topic.count;
        });
      }
    });

    return Array.from(allTopics.values()).slice(0, 5);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/omnichannel"] });
  };

  const handleExport = () => {
    const csvData = platformAnalytics.map(platform => ({
      Platform: platform.name,
      'Integration Name': platform.integrationName || 'N/A',
      'Agent Name': platform.agentName || 'N/A',
      'Total Messages': platform.totalMessages,
      'Total Users': platform.totalUsers,
      'Avg Response Time': `${platform.avgResponseTime}min`,
      'CSAT Score': `${platform.csatScore}%`,
      'Success Rate': `${platform.successRate}%`,
      'Status': platform.isActive ? 'Active' : 'Inactive',
      'Top Topics': platform.topTopics.map(t => `${t.topic}(${t.count})`).join('; ')
    }));

    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).map(v => `"${v}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omnichannel-analytics-${dateRange}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredPlatforms = selectedPlatform === 'all' 
    ? activePlatforms 
    : activePlatforms.filter(p => p.platform === selectedPlatform);

  // Loading state
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Omnichannel Chat Summarization</h1>
              <p className="text-gray-600">Loading analytics data...</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-16 bg-gray-200 rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Omnichannel Chat Summarization</h1>
              <p className="text-red-600">Error loading analytics data</p>
            </div>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Omnichannel Chat Summarization</h1>
            <p className="text-gray-600">Analyze and compare chat performance across all messaging platforms</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 3 months</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* View Mode Toggle */}
        <Tabs value={viewMode} onValueChange={(value: any) => setViewMode(value)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="compare">Compare Platforms</TabsTrigger>
            <TabsTrigger value="individual">Individual Focus</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Messages</p>
                      <p className="text-2xl font-bold">
                        {activePlatforms.reduce((sum, p) => sum + p.totalMessages, 0).toLocaleString()}
                      </p>
                    </div>
                    <MessageSquare className="w-8 h-8 text-blue-600" />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Across {activePlatforms.length} active platforms
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Unique Users</p>
                      <p className="text-2xl font-bold">
                        {activePlatforms.reduce((sum, p) => sum + p.totalUsers, 0).toLocaleString()}
                      </p>
                    </div>
                    <Users className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Active conversations
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Avg Response Time</p>
                      <p className="text-2xl font-bold">
                        {activePlatforms.length > 0 ? 
                          (activePlatforms.reduce((sum, p) => sum + p.avgResponseTime, 0) / activePlatforms.length).toFixed(1)
                          : '0.0'}min
                      </p>
                    </div>
                    <Clock className="w-8 h-8 text-orange-600" />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Average across platforms
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Avg CSAT Score</p>
                      <p className="text-2xl font-bold">
                        {(() => {
                          const platformsWithCSAT = activePlatforms.filter(p => p.csatScore !== null);
                          if (platformsWithCSAT.length === 0) return 'N/A';
                          return Math.round(platformsWithCSAT.reduce((sum, p) => sum + p.csatScore, 0) / platformsWithCSAT.length) + '%';
                        })()}
                      </p>
                    </div>
                    <Star className="w-8 h-8 text-yellow-600" />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Customer satisfaction
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Platform Status Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {platformAnalytics.map((platform) => (
                <Card key={platform.platform} className={`border-l-4 ${platform.isActive ? 'border-l-green-500' : 'border-l-gray-300'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{PLATFORM_ICONS[platform.platform as keyof typeof PLATFORM_ICONS]}</span>
                        <span className="font-semibold">{platform.name}</span>
                      </div>
                      <Badge variant={platform.isActive ? "default" : "secondary"}>
                        {platform.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    {platform.isActive && (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Messages:</span>
                          <span className="font-medium">{platform.totalMessages}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">CSAT:</span>
                          <span className="font-medium">
                            {platform.csatScore !== null ? `${platform.csatScore}%` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Response:</span>
                          <span className="font-medium">{platform.avgResponseTime}min</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Message Volume Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Message Volume Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {activePlatforms.map((platform, index) => (
                      <Line
                        key={platform.platform}
                        type="monotone"
                        dataKey={platform.platform}
                        stroke={PLATFORM_COLORS[platform.platform as keyof typeof PLATFORM_COLORS]}
                        strokeWidth={2}
                        name={platform.name}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Top Topics Across Platforms */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2" />
                  Most Asked Topics by Platform
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={topicDistribution()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="topic" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {activePlatforms.map((platform) => (
                      <Bar
                        key={platform.platform}
                        dataKey={`platforms.${platform.platform}`}
                        stackId="topics"
                        fill={PLATFORM_COLORS[platform.platform as keyof typeof PLATFORM_COLORS]}
                        name={platform.name}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Compare Tab */}
          <TabsContent value="compare" className="space-y-6">
            {/* Performance Radar Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="w-5 h-5 mr-2" />
                  Platform Performance Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <RadarChart data={performanceData.filter(p => activePlatforms.some(ap => ap.name === p.platform))}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="platform" />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} />
                    <Radar name="CSAT Score" dataKey="csat" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                    <Radar name="Success Rate" dataKey="successRate" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.6} />
                    <Tooltip />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Side-by-side Platform Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Response Time Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={performanceData.filter(p => activePlatforms.some(ap => ap.name === p.platform))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="platform" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="responseTime" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Message Volume Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPieChart>
                      <Tooltip />
                      <Pie
                        data={activePlatforms}
                        dataKey="totalMessages"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(entry) => `${entry.name}: ${entry.value}`}
                      >
                        {activePlatforms.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PLATFORM_COLORS[entry.platform as keyof typeof PLATFORM_COLORS]} />
                        ))}
                      </Pie>
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Individual Focus Tab */}
          <TabsContent value="individual" className="space-y-6">
            {/* Platform Selector */}
            <div className="flex items-center gap-4">
              <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  {activePlatforms.map((platform) => (
                    <SelectItem key={platform.platform} value={platform.platform}>
                      {PLATFORM_ICONS[platform.platform as keyof typeof PLATFORM_ICONS]} {platform.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Individual Platform Details */}
            {filteredPlatforms.map((platform) => (
              <Card key={platform.platform}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-2xl">{PLATFORM_ICONS[platform.platform as keyof typeof PLATFORM_ICONS]}</span>
                    {platform.name} Detailed Analytics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Platform Metrics */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-lg">Key Metrics</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Messages:</span>
                          <span className="font-semibold">{platform.totalMessages.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Unique Users:</span>
                          <span className="font-semibold">{platform.totalUsers.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Avg Response Time:</span>
                          <span className="font-semibold">{platform.avgResponseTime}s</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">CSAT Score:</span>
                          <span className="font-semibold">{platform.csatScore}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Success Rate:</span>
                          <span className="font-semibold">{platform.successRate}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Top Topics */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-lg">Top Topics</h4>
                      <div className="space-y-2">
                        {platform.topTopics.map((topic, index) => (
                          <div key={topic.topic} className="flex items-center justify-between">
                            <span className="text-gray-700">{index + 1}. {topic.topic}</span>
                            <Badge variant="outline">{topic.count}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Platform Health */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-lg">Platform Health</h4>
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>Performance Score</span>
                            <span>{Math.round((platform.csatScore + platform.successRate) / 2)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full" 
                              style={{ width: `${Math.round((platform.csatScore + platform.successRate) / 2)}%` }}
                            ></div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>Response Quality</span>
                            <span>{platform.successRate}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-green-600 h-2 rounded-full" 
                              style={{ width: `${platform.successRate}%` }}
                            ></div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>User Satisfaction</span>
                            <span>{platform.csatScore}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-yellow-500 h-2 rounded-full" 
                              style={{ width: `${platform.csatScore}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}