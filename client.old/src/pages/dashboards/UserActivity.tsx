import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Activity, Download, Eye, Edit, Clock } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, Legend } from "recharts";
import DashboardLayout from "@/components/Layout/DashboardLayout";

export default function UserActivity() {
  const { data: documents = [] } = useQuery({
    queryKey: ["/api/documents"],
  });

  // Mock user activity data (in real implementation, this would come from document access logs)
  const userActivityData = [
    { user: "John Smith", role: "Admin", uploads: 12, downloads: 45, edits: 8, lastActive: "2 hours ago" },
    { user: "Sarah Johnson", role: "Editor", uploads: 8, downloads: 32, edits: 15, lastActive: "1 hour ago" },
    { user: "Mike Chen", role: "Viewer", uploads: 2, downloads: 28, edits: 0, lastActive: "30 min ago" },
    { user: "Emily Davis", role: "Editor", uploads: 6, downloads: 19, edits: 7, lastActive: "4 hours ago" },
    { user: "Alex Brown", role: "Admin", uploads: 9, downloads: 41, edits: 12, lastActive: "1 hour ago" }
  ];

  // Daily activity trend (last 7 days)
  const activityTrendData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      uploads: Math.floor(Math.random() * 15) + 5,
      downloads: Math.floor(Math.random() * 50) + 20,
      searches: Math.floor(Math.random() * 80) + 30,
      views: Math.floor(Math.random() * 120) + 50
    };
  });

  // Hourly activity distribution (24 hours)
  const hourlyActivityData = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${hour.toString().padStart(2, '0')}:00`,
    activity: Math.floor(Math.random() * 20) + (hour >= 8 && hour <= 18 ? 10 : 2) // Higher during work hours
  }));

  // Role distribution
  const roleDistribution = [
    { role: "Admin", count: 5, color: "#8884d8" },
    { role: "Editor", count: 12, color: "#82ca9d" },
    { role: "Viewer", count: 28, color: "#ffc658" }
  ];

  const totalUsers = roleDistribution.reduce((sum, role) => sum + role.count, 0);
  const activeUsers = Math.floor(totalUsers * 0.7); // 70% active

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">User Activity Monitoring</h1>
            <p className="text-gray-600 mt-1">Track user engagement and system usage patterns</p>
          </div>
          <Badge variant="outline" className="px-3 py-1">
            <Activity className="w-4 h-4 mr-2" />
            Live
          </Badge>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Users</p>
                  <p className="text-2xl font-bold text-gray-900">{totalUsers}</p>
                  <p className="text-xs text-green-600 mt-1">+3 this week</p>
                </div>
                <Users className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Users</p>
                  <p className="text-2xl font-bold text-gray-900">{activeUsers}</p>
                  <p className="text-xs text-blue-600 mt-1">{Math.round((activeUsers/totalUsers)*100)}% active rate</p>
                </div>
                <Activity className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Downloads</p>
                  <p className="text-2xl font-bold text-gray-900">{userActivityData.reduce((sum, user) => sum + user.downloads, 0)}</p>
                  <p className="text-xs text-green-600 mt-1">+15% from last week</p>
                </div>
                <Download className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Document Views</p>
                  <p className="text-2xl font-bold text-gray-900">{Math.floor(Math.random() * 500) + 1200}</p>
                  <p className="text-xs text-green-600 mt-1">+22% increase</p>
                </div>
                <Eye className="w-8 h-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Activity Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Activity Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={activityTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="uploads" stroke="#8884d8" strokeWidth={2} name="Uploads" />
                  <Line type="monotone" dataKey="downloads" stroke="#82ca9d" strokeWidth={2} name="Downloads" />
                  <Line type="monotone" dataKey="views" stroke="#ffc658" strokeWidth={2} name="Views" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Hourly Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Hourly Activity Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hourlyActivityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="activity" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Role Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>User Role Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {roleDistribution.map((role, index) => (
                <div key={index} className="p-4 border border-gray-200 rounded-lg text-center">
                  <div className="flex items-center justify-center mb-2">
                    <div 
                      className="w-4 h-4 rounded-full mr-2" 
                      style={{ backgroundColor: role.color }}
                    ></div>
                    <h4 className="font-medium text-gray-900">{role.role}</h4>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{role.count}</p>
                  <p className="text-sm text-gray-500">users</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent User Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Most Active Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-900">User</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900">Role</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900">Uploads</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900">Downloads</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900">Edits</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900">Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {userActivityData.map((user, index) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center">
                          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium mr-3">
                            {user.user.split(' ').map(n => n[0]).join('')}
                          </div>
                          <span className="font-medium text-gray-900">{user.user}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={user.role === 'Admin' ? 'destructive' : user.role === 'Editor' ? 'default' : 'secondary'}>
                          {user.role}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{user.uploads}</td>
                      <td className="py-3 px-4 text-gray-600">{user.downloads}</td>
                      <td className="py-3 px-4 text-gray-600">{user.edits}</td>
                      <td className="py-3 px-4 text-gray-600">
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {user.lastActive}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}