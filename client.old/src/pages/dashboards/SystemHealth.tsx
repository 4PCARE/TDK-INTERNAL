import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Server, Zap, AlertTriangle, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, Legend } from "recharts";
import DashboardLayout from "@/components/Layout/DashboardLayout";

export default function SystemHealth() {
  // Mock system health data - in real implementation, this would come from monitoring APIs
  const systemMetrics = {
    avgInferenceTime: 1.2,
    accuracyScore: 87.5,
    failures: 3,
    uptime: 99.8
  };

  // Performance trend over last 24 hours
  const performanceTrendData = Array.from({ length: 24 }, (_, i) => {
    const hour = new Date();
    hour.setHours(hour.getHours() - (23 - i));
    
    return {
      time: hour.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      responseTime: 0.8 + Math.random() * 0.8, // 0.8-1.6 seconds
      accuracy: 85 + Math.random() * 10, // 85-95%
      throughput: 50 + Math.random() * 100 // 50-150 requests/hour
    };
  });

  // AI Model Performance by Type
  const modelPerformanceData = [
    { model: 'OpenAI GPT-4', avgTime: 1.2, accuracy: 92, status: 'Healthy' },
    { model: 'Classification Model', avgTime: 0.3, accuracy: 88, status: 'Healthy' },
    { model: 'Embedding Model', avgTime: 0.5, accuracy: 90, status: 'Warning' },
    { model: 'Search Index', avgTime: 0.1, accuracy: 85, status: 'Healthy' }
  ];

  // System resource usage
  const resourceUsageData = [
    { resource: 'CPU', usage: 65, limit: 80, status: 'Normal' },
    { resource: 'Memory', usage: 72, limit: 85, status: 'Warning' },
    { resource: 'Storage', usage: 45, limit: 90, status: 'Normal' },
    { resource: 'Network', usage: 23, limit: 70, status: 'Normal' }
  ];

  // Recent system events
  const systemEvents = [
    { time: '2 hours ago', event: 'Model accuracy improved by 3%', severity: 'Info', type: 'Performance' },
    { time: '4 hours ago', event: 'High memory usage detected', severity: 'Warning', type: 'Resource' },
    { time: '6 hours ago', event: 'Successful model deployment', severity: 'Success', type: 'Deployment' },
    { time: '8 hours ago', event: 'API response time spike', severity: 'Warning', type: 'Performance' },
    { time: '12 hours ago', event: 'System backup completed', severity: 'Info', type: 'Maintenance' }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Healthy':
      case 'Normal':
      case 'Success':
        return 'bg-green-100 text-green-800';
      case 'Warning':
        return 'bg-yellow-100 text-yellow-800';
      case 'Error':
      case 'Critical':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Success':
        return 'bg-green-100 text-green-800';
      case 'Warning':
        return 'bg-yellow-100 text-yellow-800';
      case 'Error':
        return 'bg-red-100 text-red-800';
      case 'Info':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">System Health & AI Performance</h1>
            <p className="text-gray-600 mt-1">Monitor system performance and AI model metrics</p>
          </div>
          <Badge variant="outline" className="px-3 py-1">
            <Server className="w-4 h-4 mr-2" />
            {systemMetrics.uptime}% Uptime
          </Badge>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Avg Inference Time</p>
                  <p className="text-2xl font-bold text-gray-900">{systemMetrics.avgInferenceTime}s</p>
                  <p className="text-xs text-green-600 mt-1">-0.2s improved</p>
                </div>
                <Clock className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Accuracy Score</p>
                  <p className="text-2xl font-bold text-gray-900">{systemMetrics.accuracyScore}%</p>
                  <p className="text-xs text-green-600 mt-1">+2.5% this week</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">System Uptime</p>
                  <p className="text-2xl font-bold text-gray-900">{systemMetrics.uptime}%</p>
                  <p className="text-xs text-blue-600 mt-1">30 days average</p>
                </div>
                <Server className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Failed Requests</p>
                  <p className="text-2xl font-bold text-gray-900">{systemMetrics.failures}</p>
                  <p className="text-xs text-red-600 mt-1">Last 24 hours</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Response Time Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5" />
                <span>Response Time Trend (24h)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={performanceTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="responseTime" stroke="#8884d8" strokeWidth={2} name="Response Time (s)" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* System Throughput */}
          <Card>
            <CardHeader>
              <CardTitle>System Throughput</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={performanceTrendData.slice(-12)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="throughput" fill="#82ca9d" name="Requests/hour" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* AI Model Performance Table */}
        <Card>
          <CardHeader>
            <CardTitle>AI Model Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-900">Model</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900">Avg Response Time</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900">Accuracy</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {modelPerformanceData.map((model, index) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium text-gray-900">{model.model}</td>
                      <td className="py-3 px-4 text-gray-600">{model.avgTime}s</td>
                      <td className="py-3 px-4 text-gray-600">{model.accuracy}%</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(model.status)}`}>
                          {model.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Resource Usage */}
        <Card>
          <CardHeader>
            <CardTitle>System Resource Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {resourceUsageData.map((resource, index) => (
                <div key={index} className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900">{resource.resource}</h4>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(resource.status)}`}>
                      {resource.status}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>{resource.usage}%</span>
                      <span>Limit: {resource.limit}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          resource.usage > resource.limit * 0.8 ? 'bg-red-500' : 
                          resource.usage > resource.limit * 0.6 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${(resource.usage / resource.limit) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent System Events */}
        <Card>
          <CardHeader>
            <CardTitle>Recent System Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {systemEvents.map((event, index) => (
                <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{event.event}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-sm text-gray-500">{event.time}</span>
                      <span className="text-sm text-gray-400">•</span>
                      <span className="text-sm text-gray-500">{event.type}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(event.severity)}`}>
                    {event.severity}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}