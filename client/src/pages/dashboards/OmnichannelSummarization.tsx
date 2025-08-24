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

import { SeededRandom } from "@/utils/seededRandom";

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

  const { data: socialIntegrations = [] } = useQuery<SocialIntegration[]>({
    queryKey: ["/api/social-integrations"],
  });

  const { data: chatHistory = [] } = useQuery({
    queryKey: ["/api/chat/history"],
  });

  const { data: analyticsData = null } = useQuery({
    queryKey: ["/api/analytics/omnichannel", dateRange],
  });

  // Generate mock analytics data based on actual integrations
  const generatePlatformAnalytics = () => {
    // Reset RNG for consistent results every time
    const localRng = new SeededRandom(42);
    const platforms = ['lineoa', 'facebook', 'tiktok', 'web'];
    const activePlatforms = socialIntegrations.filter((integration: any) => integration.isActive);
    
    return platforms.map(platform => {
      const isActive = activePlatforms.some((integration: any) => integration.type === platform);
      const baseMessages = isActive ? localRng.randomInt(100, 600) : 0;
      
      return {
        platform,
        name: platform.charAt(0).toUpperCase() + platform.slice(1),
        totalMessages: baseMessages,
        totalUsers: Math.floor(baseMessages * 0.6),
        avgResponseTime: localRng.randomFloat(0.5, 2.5, 1),
        csatScore: isActive ? localRng.randomInt(70, 100) : 0,
        successRate: isActive ? localRng.randomInt(80, 100) : 0,
        isActive,
        topTopics: [
          { topic: 'Product Info', count: localRng.randomInt(20, 70) },
          { topic: 'Support', count: localRng.randomInt(15, 55) },
          { topic: 'Pricing', count: localRng.randomInt(10, 40) },
          { topic: 'FAQ', count: localRng.randomInt(8, 33) },
          { topic: 'Technical', count: localRng.randomInt(5, 25) }
        ]
      };
    });
  };

  const platformAnalytics = generatePlatformAnalytics();
  const activePlatforms = platformAnalytics.filter(p => p.isActive);

  // Generate trend data for the last 7 days
  const trendData = Array.from({ length: 7 }, (_, i) => {
    const trendRng = new SeededRandom(100 + i); // Different seed per day for variation
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    
    const dayData: any = {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };

    platformAnalytics.forEach(platform => {
      if (platform.isActive) {
        dayData[platform.platform] = trendRng.randomInt(20, 120);
      }
    });

    return dayData;
  });

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
    console.log('Exporting omnichannel analytics...');
    // Implementation for exporting data
  };

  const filteredPlatforms = selectedPlatform === 'all' 
    ? activePlatforms 
    : activePlatforms.filter(p => p.platform === selectedPlatform);

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
                        {(activePlatforms.reduce((sum, p) => sum + p.avgResponseTime, 0) / activePlatforms.length).toFixed(1)}s
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
                        {Math.round(activePlatforms.reduce((sum, p) => sum + p.csatScore, 0) / activePlatforms.length)}%
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
                          <span className="font-medium">{platform.csatScore}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Response:</span>
                          <span className="font-medium">{platform.avgResponseTime}s</span>
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
                              className={`h-2 rounded-full ${
                                platform.csatScore >= 86 ? "bg-green-500" :
                                platform.csatScore >= 71 ? "bg-blue-500" :
                                platform.csatScore >= 51 ? "bg-yellow-500" :
                                platform.csatScore >= 31 ? "bg-orange-500" : "bg-red-500"
                              }`}
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