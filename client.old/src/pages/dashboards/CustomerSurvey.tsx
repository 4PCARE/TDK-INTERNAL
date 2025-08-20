import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Star, TrendingUp, Users, MessageSquare, BarChart3 } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import DashboardLayout from "@/components/Layout/DashboardLayout";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function CustomerSurvey() {
  const { data: surveyData = [] } = useQuery({
    queryKey: ["/api/survey/responses"],
  });

  const { data: surveyStats = {} } = useQuery({
    queryKey: ["/api/survey/stats"],
  });

  // Calculate metrics
  const totalResponses = surveyData.length;
  const averageSatisfaction = surveyData.length > 0 
    ? (surveyData.reduce((sum: number, response: any) => sum + parseInt(response.satisfaction), 0) / surveyData.length).toFixed(1)
    : 0;
  
  const averageEaseOfUse = surveyData.length > 0
    ? (surveyData.reduce((sum: number, response: any) => sum + parseInt(response.easeOfUse), 0) / surveyData.length).toFixed(1)
    : 0;

  // Satisfaction distribution
  const satisfactionDistribution = [1, 2, 3, 4, 5].map(rating => ({
    rating: `${rating} Star${rating > 1 ? 's' : ''}`,
    count: surveyData.filter((response: any) => parseInt(response.satisfaction) === rating).length,
    color: COLORS[rating - 1]
  }));

  // Ease of use distribution
  const easeOfUseDistribution = [1, 2, 3, 4, 5].map(rating => ({
    rating: `${rating} Star${rating > 1 ? 's' : ''}`,
    count: surveyData.filter((response: any) => parseInt(response.easeOfUse) === rating).length,
    color: COLORS[rating - 1]
  }));

  // Response trend over time (last 30 days)
  const responseTrend = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    const dayResponses = surveyData.filter((response: any) => {
      const responseDate = new Date(response.createdAt);
      return responseDate.toDateString() === date.toDateString();
    });
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      responses: dayResponses.length,
      avgSatisfaction: dayResponses.length > 0 
        ? dayResponses.reduce((sum: number, r: any) => sum + parseInt(r.satisfaction), 0) / dayResponses.length 
        : 0
    };
  });

  // Common feedback themes (mock analysis)
  const feedbackThemes = [
    { theme: "UI/UX Improvements", count: 12, percentage: 35 },
    { theme: "Search Functionality", count: 8, percentage: 24 },
    { theme: "Performance", count: 6, percentage: 18 },
    { theme: "AI Features", count: 5, percentage: 15 },
    { theme: "Document Management", count: 3, percentage: 8 }
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Customer Survey Dashboard</h1>
            <p className="text-gray-600 mt-1">Monitor user feedback and satisfaction metrics</p>
          </div>
          <Badge variant="outline" className="px-3 py-1">
            <Users className="w-4 h-4 mr-2" />
            {totalResponses} Total Responses
          </Badge>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Average Satisfaction</p>
                  <p className="text-2xl font-bold text-gray-900">{averageSatisfaction}/5</p>
                </div>
                <Star className="w-8 h-8 text-yellow-500" />
              </div>
              <Progress value={parseFloat(averageSatisfaction) * 20} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Ease of Use</p>
                  <p className="text-2xl font-bold text-gray-900">{averageEaseOfUse}/5</p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-500" />
              </div>
              <Progress value={parseFloat(averageEaseOfUse) * 20} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Response Rate</p>
                  <p className="text-2xl font-bold text-gray-900">68%</p>
                </div>
                <BarChart3 className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Feedback Items</p>
                  <p className="text-2xl font-bold text-gray-900">{feedbackThemes.reduce((sum, theme) => sum + theme.count, 0)}</p>
                </div>
                <MessageSquare className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Satisfaction Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Star className="w-5 h-5 mr-2" />
                Satisfaction Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={satisfactionDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ rating, count }) => count > 0 ? `${rating}: ${count}` : ''}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {satisfactionDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Ease of Use Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="w-5 h-5 mr-2" />
                Ease of Use Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={easeOfUseDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="rating" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#00C49F" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Response Trend and Feedback Themes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Response Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Response Trend (Last 30 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={responseTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="responses" stroke="#0088FE" name="Responses" />
                  <Line type="monotone" dataKey="avgSatisfaction" stroke="#00C49F" name="Avg Satisfaction" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Common Feedback Themes */}
          <Card>
            <CardHeader>
              <CardTitle>Common Feedback Themes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {feedbackThemes.map((theme, index) => (
                  <div key={theme.theme} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{theme.theme}</span>
                      <Badge variant="outline">{theme.count} mentions</Badge>
                    </div>
                    <Progress value={theme.percentage} className="h-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Feedback */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Feedback Highlights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {surveyData.slice(0, 5).map((response: any, index: number) => (
                <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="flex items-center">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-4 h-4 ${
                            star <= parseInt(response.satisfaction)
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(response.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {response.improvements && (
                    <p className="text-sm text-gray-700 mb-1">
                      <strong>Improvements:</strong> {response.improvements}
                    </p>
                  )}
                  {response.suggestions && (
                    <p className="text-sm text-gray-700">
                      <strong>Suggestions:</strong> {response.suggestions}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}