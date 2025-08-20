import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Brain, TrendingUp, MessageSquare, Clock, Filter, CheckCircle, XCircle } from "lucide-react";
import DashboardLayout from "@/components/Layout/DashboardLayout";

export default function AiResponseAnalysis() {
  const [filterResult, setFilterResult] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 10;
  const queryClient = useQueryClient();

  // Force refresh data when component mounts
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/ai-response-analysis"] });
    queryClient.invalidateQueries({ queryKey: ["/api/ai-response-analysis/stats"] });
  }, [queryClient]);

  // Fetch AI response analysis stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/ai-response-analysis/stats"],
  }) as { data: {
    totalResponses: number;
    positiveCount: number;
    fallbackCount: number;
    averageResponseTime: number;
    recentAnalysis: Array<{
      id: number;
      analysisResult: string;
      createdAt: string;
    }>;
  } | undefined, isLoading: boolean };

  // Fetch AI response analysis data with filters
  const { data: analysisData, isLoading: dataLoading } = useQuery({
    queryKey: ["/api/ai-response-analysis", { 
      limit: itemsPerPage, 
      offset: currentPage * itemsPerPage,
      ...(filterResult !== "all" && { analysisResult: filterResult })
    }],
  }) as { data: Array<{
    id: number;
    userQuery: string;
    assistantResponse: string;
    analysisResult: string;
    analysisConfidence: number;
    analysisReason: string;
    responseTime: number;
    createdAt: string;
  }> | undefined, isLoading: boolean };

  const isLoading = statsLoading || dataLoading;

  // Calculate success rate
  const successRate = stats && stats.totalResponses > 0 ? 
    Math.round((stats.positiveCount / stats.totalResponses) * 100) : 0;

  // Prepare chart data
  const chartData = [
    { name: "Positive", value: stats?.positiveCount || 0, color: "#22c55e" },
    { name: "Fallback", value: stats?.fallbackCount || 0, color: "#ef4444" }
  ];

  // Group analysis data by date and count positive/fallback per day
  const timelineData = (() => {
    if (!stats?.recentAnalysis?.length) return [];
    
    // Group data by date
    const dateGroups = stats.recentAnalysis.reduce((groups, analysis) => {
      const date = new Date(analysis.createdAt).toDateString();
      if (!groups[date]) {
        groups[date] = { positive: 0, fallback: 0, date };
      }
      if (analysis.analysisResult === 'positive') {
        groups[date].positive++;
      } else {
        groups[date].fallback++;
      }
      return groups;
    }, {} as Record<string, { positive: number; fallback: number; date: string }>);
    
    // Convert to array and sort by date (most recent first), then take last 7 days
    const sortedData = Object.values(dateGroups)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 7)
      .reverse(); // Show oldest to newest for timeline
    
    // Format for chart
    return sortedData.map((item, index) => ({
      name: new Date(item.date).toLocaleDateString('th-TH', { 
        month: 'short', 
        day: 'numeric' 
      }),
      positive: item.positive,
      fallback: item.fallback,
    }));
  })();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getAnalysisColor = (result: string) => {
    return result === 'positive' ? 'text-green-600' : 'text-red-600';
  };

  const getAnalysisIcon = (result: string) => {
    return result === 'positive' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />;
  };

  const resetFilters = () => {
    setFilterResult("all");
    setCurrentPage(0);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading AI response analysis...</p>
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
          <h1 className="text-3xl font-bold tracking-tight">AI Response Analysis</h1>
          <p className="text-muted-foreground">
            Monitor and analyze AI assistant response quality and effectiveness
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium">AI Quality Insights</span>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Responses</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalResponses || 0}</div>
            <p className="text-xs text-muted-foreground">
              Analyzed conversations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{successRate}%</div>
            <Progress value={successRate} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              Positive responses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.averageResponseTime || 0}ms</div>
            <p className="text-xs text-muted-foreground">
              Processing speed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quality Score</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats && stats.totalResponses > 0 ? 
                Math.round(((stats.positiveCount / stats.totalResponses) * 100)) : 0}/100
            </div>
            <p className="text-xs text-muted-foreground">
              Overall AI quality
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analysis">Detailed Analysis</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Response Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Response Distribution</CardTitle>
                <CardDescription>
                  Breakdown of positive vs fallback responses
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Recent Activity Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  Latest AI response analysis results
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="positive" stackId="a" fill="#22c55e" name="Positive" />
                    <Bar dataKey="fallback" stackId="a" fill="#ef4444" name="Fallback" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filter Analysis Results</CardTitle>
              <CardDescription>
                Filter and search through AI response analysis data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span className="text-sm font-medium">Filter by result:</span>
                </div>
                <Select value={filterResult} onValueChange={setFilterResult}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All results" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Results</SelectItem>
                    <SelectItem value="positive">Positive Only</SelectItem>
                    <SelectItem value="fallback">Fallback Only</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={resetFilters}>
                  Reset Filters
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Analysis Results Table */}
          <Card>
            <CardHeader>
              <CardTitle>Analysis Results</CardTitle>
              <CardDescription>
                Detailed breakdown of each AI response analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analysisData?.map((analysis: any) => (
                  <div key={analysis.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={getAnalysisColor(analysis.analysisResult)}>
                          {getAnalysisIcon(analysis.analysisResult)}
                        </span>
                        <Badge variant={analysis.analysisResult === 'positive' ? 'default' : 'destructive'}>
                          {analysis.analysisResult}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Confidence: {Math.round(analysis.analysisConfidence * 100)}%
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(analysis.createdAt)}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm font-medium">User Query:</span>
                        <p className="text-sm text-muted-foreground mt-1">{analysis.userQuery}</p>
                      </div>
                      
                      <div>
                        <span className="text-sm font-medium">AI Response:</span>
                        <p className="text-sm text-muted-foreground mt-1">
                          {analysis.assistantResponse.length > 200 
                            ? `${analysis.assistantResponse.substring(0, 200)}...` 
                            : analysis.assistantResponse}
                        </p>
                      </div>
                      
                      {analysis.analysisReason && (
                        <div>
                          <span className="text-sm font-medium">Analysis Reason:</span>
                          <p className="text-sm text-muted-foreground mt-1">{analysis.analysisReason}</p>
                        </div>
                      )}
                      
                      {analysis.responseTime && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Response time: {analysis.responseTime}ms
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {analysisData?.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No analysis results found.</p>
                  </div>
                )}
              </div>
              
              {/* Pagination */}
              {analysisData && analysisData.length === itemsPerPage && (
                <div className="flex justify-center mt-6">
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                      disabled={currentPage === 0}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage + 1}
                    </span>
                    <Button 
                      variant="outline" 
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={analysisData.length < itemsPerPage}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Performance Insights</CardTitle>
                <CardDescription>
                  Key metrics and improvement areas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Success Rate</span>
                    <span className="text-sm font-medium">{successRate}%</span>
                  </div>
                  <Progress value={successRate} />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Response Speed</span>
                    <span className="text-sm font-medium">
                      {(stats?.averageResponseTime || 0) < 5000 ? 'Excellent' : 
                       (stats?.averageResponseTime || 0) < 10000 ? 'Good' : 'Needs Improvement'}
                    </span>
                  </div>
                  <Progress value={Math.max(0, 100 - (stats?.averageResponseTime || 0) / 100)} />
                </div>
                
                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Recommendations</h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    {successRate < 70 && (
                      <li>• Consider improving document quality and coverage</li>
                    )}
                    {(stats?.averageResponseTime || 0) > 10000 && (
                      <li>• Optimize response processing for better performance</li>
                    )}
                    {(stats?.totalResponses || 0) < 10 && (
                      <li>• Gather more data for better analysis insights</li>
                    )}
                    <li>• Monitor trends to identify improvement patterns</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Feedback Trends</CardTitle>
                <CardDescription>
                  Latest analysis patterns and trends
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats?.recentAnalysis?.slice(0, 5).map((analysis: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <div className="flex items-center gap-2">
                        <span className={getAnalysisColor(analysis.analysisResult)}>
                          {getAnalysisIcon(analysis.analysisResult)}
                        </span>
                        <span className="text-sm">
                          {analysis.analysisResult === 'positive' ? 'Helpful response' : 'Generic response'}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(analysis.createdAt)}
                      </span>
                    </div>
                  ))}
                  
                  {!stats?.recentAnalysis?.length && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No recent analysis data available
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </DashboardLayout>
  );
}