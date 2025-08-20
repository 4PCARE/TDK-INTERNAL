import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, UserCheck, AlertTriangle, Eye, FileText } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Cell, LineChart, Line, Legend, Pie } from "recharts";
import DashboardLayout from "@/components/Layout/DashboardLayout";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export default function SecurityGovernance() {
  const { data: documents = [] } = useQuery({
    queryKey: ["/api/documents"],
  });

  // Access level distribution
  const accessLevelData = [
    { level: 'Public', count: 28, color: '#00C49F' },
    { level: 'Internal', count: 15, color: '#0088FE' },
    { level: 'Restricted', count: 5, color: '#FFBB28' },
    { level: 'Confidential', count: 2, color: '#FF8042' }
  ];

  // Security events trend (last 7 days)
  const securityTrendData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      accessAttempts: Math.floor(Math.random() * 20) + 50,
      violations: Math.floor(Math.random() * 3),
      permissionChanges: Math.floor(Math.random() * 8) + 2
    };
  });

  // Recent audit logs
  const auditLogs = [
    { timestamp: '2 min ago', user: 'admin@4plus.co.th', action: 'Document Access', resource: 'HR Policy Manual', status: 'Success' },
    { timestamp: '5 min ago', user: 'john.smith@4plus.co.th', action: 'Permission Change', resource: 'Financial Report Q4', status: 'Success' },
    { timestamp: '12 min ago', user: 'sarah.jones@4plus.co.th', action: 'Document Upload', resource: 'Training Materials', status: 'Success' },
    { timestamp: '18 min ago', user: 'mike.chen@4plus.co.th', action: 'Access Denied', resource: 'Confidential Data', status: 'Violation' },
    { timestamp: '25 min ago', user: 'emily.davis@4plus.co.th', action: 'Role Change', resource: 'User Management', status: 'Success' }
  ];

  // Permission change requests
  const permissionRequests = [
    { user: 'John Smith', requestType: 'Access Upgrade', resource: 'Financial Reports', status: 'Pending', requestDate: '2 hours ago' },
    { user: 'Sarah Johnson', requestType: 'Department Transfer', resource: 'HR Documents', status: 'Approved', requestDate: '1 day ago' },
    { user: 'Mike Chen', requestType: 'Role Change', resource: 'Admin Panel', status: 'Rejected', requestDate: '2 days ago' },
    { user: 'Emily Davis', requestType: 'Temporary Access', resource: 'Project Files', status: 'Approved', requestDate: '3 days ago' }
  ];

  // Document security metrics
  const securityMetrics = {
    totalViolations: 12,
    roleChanges: 8,
    permissionUpdates: 23,
    auditRecords: 1547
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Success':
        return 'bg-green-100 text-green-800';
      case 'Violation':
        return 'bg-red-100 text-red-800';
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'Approved':
        return 'bg-green-100 text-green-800';
      case 'Rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Security & Governance Summary</h1>
            <p className="text-gray-600 mt-1">Monitor access controls, compliance, and security events</p>
          </div>
          <Badge variant="outline" className="px-3 py-1">
            <Shield className="w-4 h-4 mr-2" />
            Security Monitoring
          </Badge>
        </div>

        {/* Key Security Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Access Violations</p>
                  <p className="text-2xl font-bold text-gray-900">{securityMetrics.totalViolations}</p>
                  <p className="text-xs text-red-600 mt-1">Last 30 days</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Role Changes</p>
                  <p className="text-2xl font-bold text-gray-900">{securityMetrics.roleChanges}</p>
                  <p className="text-xs text-blue-600 mt-1">This month</p>
                </div>
                <UserCheck className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Permission Updates</p>
                  <p className="text-2xl font-bold text-gray-900">{securityMetrics.permissionUpdates}</p>
                  <p className="text-xs text-green-600 mt-1">This week</p>
                </div>
                <Lock className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Audit Records</p>
                  <p className="text-2xl font-bold text-gray-900">{securityMetrics.auditRecords}</p>
                  <p className="text-xs text-purple-600 mt-1">Total logged</p>
                </div>
                <FileText className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Security Trend and Access Levels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Security Events Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="w-5 h-5" />
                <span>Security Events Trend</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={securityTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="accessAttempts" stroke="#8884d8" strokeWidth={2} name="Access Attempts" />
                  <Line type="monotone" dataKey="violations" stroke="#ff7300" strokeWidth={2} name="Violations" />
                  <Line type="monotone" dataKey="permissionChanges" stroke="#00C49F" strokeWidth={2} name="Permission Changes" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Access Level Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Lock className="w-5 h-5" />
                <span>Document Access Levels</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Tooltip />
                  <Legend />
                  <Pie
                    data={accessLevelData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ level, percent }: { level: string; percent: number }) => `${level} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {accessLevelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Recent Audit Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Eye className="w-5 h-5" />
              <span>Recent Audit Logs</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {auditLogs.map((log, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <div>
                      <p className="font-medium text-gray-900">{log.action}</p>
                      <p className="text-sm text-gray-500">{log.user} • {log.resource}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge className={getStatusColor(log.status)}>
                      {log.status}
                    </Badge>
                    <p className="text-xs text-gray-500 mt-1">{log.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Permission Change Requests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <UserCheck className="w-5 h-5" />
              <span>Permission Change Requests</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium text-gray-900">User</th>
                    <th className="text-left p-3 font-medium text-gray-900">Request Type</th>
                    <th className="text-left p-3 font-medium text-gray-900">Resource</th>
                    <th className="text-center p-3 font-medium text-gray-900">Status</th>
                    <th className="text-center p-3 font-medium text-gray-900">Request Date</th>
                  </tr>
                </thead>
                <tbody>
                  {permissionRequests.map((request, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{request.user}</td>
                      <td className="p-3">{request.requestType}</td>
                      <td className="p-3">{request.resource}</td>
                      <td className="p-3 text-center">
                        <Badge className={getStatusColor(request.status)}>
                          {request.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-center text-gray-500">{request.requestDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Access Level Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Lock className="w-5 h-5" />
              <span>Document Security Classification</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {accessLevelData.map((level, index) => (
                <div key={index} className="p-4 border rounded-lg text-center">
                  <div 
                    className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
                    style={{ backgroundColor: level.color + '20' }}
                  >
                    <Lock 
                      className="w-6 h-6"
                      style={{ color: level.color }}
                    />
                  </div>
                  <h3 className="font-medium text-gray-900">{level.level}</h3>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{level.count}</p>
                  <p className="text-sm text-gray-500">documents</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Compliance Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="w-5 h-5" />
              <span>Compliance Summary</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <h3 className="font-medium text-green-900">Data Protection</h3>
                <p className="text-2xl font-bold text-green-700 mt-2">98.5%</p>
                <p className="text-sm text-green-600">Compliance Score</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <h3 className="font-medium text-blue-900">Access Controls</h3>
                <p className="text-2xl font-bold text-blue-700 mt-2">99.2%</p>
                <p className="text-sm text-blue-600">Implementation Rate</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <h3 className="font-medium text-purple-900">Audit Trail</h3>
                <p className="text-2xl font-bold text-purple-700 mt-2">100%</p>
                <p className="text-sm text-purple-600">Coverage</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}