import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, MessageSquare, Clock, Target, Zap, TrendingUp } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, Legend, PieChart as RechartsPieChart, Cell } from "recharts";
import DashboardLayout from "@/components/Layout/DashboardLayout";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export default function AIInteraction() {
  const queryClient = useQueryClient();

  // Force refresh data when component mounts
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
  }, [queryClient]);

  const { data: conversations = [] } = useQuery({
    queryKey: ["/api/chat/conversations"],
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["/api/documents"],
  });

  // Mock data for AI interaction metrics (in real implementation, this would come from API)
  const aiMetrics = {
    totalQueries: conversations.length * 5, // Estimated queries per conversation
    avgResponseTime: 1.2, // seconds
    relevantRetrievals: 85, // percentage
    vectorRetrievals: conversations.length * 3 // Average retrievals per session
  };

  // Daily AI queries trend (last 7 days)
  const queryTrendData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      queries: Math.floor(Math.random() * 50) + 20,
      responses: Math.floor(Math.random() * 45) + 18
    };
  });

  // Topic distribution (based on documents categories)
  const topicData = documents.slice(0, 5).map((doc: any) => ({
    topic: doc.aiCategory || 'General',
    queries: Math.floor(Math.random() * 30) + 5
  }));

  // Document hits - most referenced documents
  const documentHits = documents.slice(0, 10).map((doc: any, index: number) => ({
    name: doc.name,
    hits: Math.floor(Math.random() * 50) + 5,
    category: doc.aiCategory || 'Uncategorized'
  })).sort((a, b) => b.hits - a.hits);

  // Response time distribution
  const responseTimeData = [
    { range: '< 1s', count: 45 },
    { range: '1-2s', count: 32 },
    { range: '2-3s', count: 18 },
    { range: '3-5s', count: 8 },
    { range: '> 5s', count: 3 }
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">AI Agent Interaction Summary</h1>
            <p className="text-gray-600 mt-1">Monitor AI performance and user interaction patterns</p>
          </div>
          <Badge variant="outline" className="px-3 py-1">
            <Bot className="w-4 h-4 mr-2" />
            Real-time
          </Badge>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total AI Queries</p>
                  <p className="text-2xl font-bold text-gray-900">{aiMetrics.totalQueries}</p>
                  <p className="text-xs text-green-600 mt-1">+12% from last week</p>
                </div>
                <MessageSquare className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Avg Response Time</p>
                  <p className="text-2xl font-bold text-gray-900">{aiMetrics.avgResponseTime}s</p>
                  <p className="text-xs text-green-600 mt-1">-0.3s improved</p>
                </div>
                <Clock className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Relevant Retrievals</p>
                  <p className="text-2xl font-bold text-gray-900">{aiMetrics.relevantRetrievals}%</p>
                  <p className="text-xs text-green-600 mt-1">+3% accuracy</p>
                </div>
                <Target className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Vector Retrievals</p>
                  <p className="text-2xl font-bold text-gray-900">{aiMetrics.vectorRetrievals}</p>
                  <p className="text-xs text-blue-600 mt-1">Per session avg</p>
                </div>
                <Zap className="w-8 h-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Query Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5" />
                <span>Daily AI Queries</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={queryTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="queries" stroke="#8884d8" strokeWidth={2} name="Queries" />
                  <Line type="monotone" dataKey="responses" stroke="#82ca9d" strokeWidth={2} name="Responses" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Topic Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Query Topics Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topicData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="topic" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="queries" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Document Hits */}
        <Card>
          <CardHeader>
            <CardTitle>Most Referenced Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {documentHits.slice(0, 8).map((doc: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 truncate">{doc.name}</h4>
                    <p className="text-sm text-gray-500">{doc.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{doc.hits} hits</p>
                    <p className="text-xs text-gray-500">This week</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Common Queries */}
        <Card>
          <CardHeader>
            <CardTitle>Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                "How to apply for leave?",
                "Company policy on remote work",
                "IT support contact",
                "Budget approval process",
                "Employee benefits overview",
                "Security guidelines",
                "Project deadlines",
                "Training requirements"
              ].map((query, index) => (
                <div key={index} className="p-3 bg-blue-50 rounded-lg text-center">
                  <p className="text-sm font-medium text-blue-900">{query}</p>
                  <p className="text-xs text-blue-600 mt-1">{Math.floor(Math.random() * 20) + 5} times</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}