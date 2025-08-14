
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { 
  Settings, 
  Users, 
  FileText, 
  Shield, 
  Activity, 
  Database,
  Server,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  HardDrive,
  Cpu
} from "lucide-react";

interface SystemStats {
  totalUsers: number;
  totalDocuments: number;
  totalStorage: string;
  systemHealth: 'healthy' | 'warning' | 'critical';
  uptime: string;
  lastBackup: string;
  activeUsers: number;
  processingQueue: number;
}

type Role = "admin" | "editor" | "viewer";

interface User {
  id: string;
  email: string;
  role: Role;
}

interface QuickAction {
  id: string;
  title: string;
  description?: string;
  href?: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
}

export default function Admin() {
  const { user } = useAuth() as { user: User | null };

  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const response = await fetch("/api/admin/stats");
      if (!response.ok) throw new Error("Failed to fetch admin stats");
      return response.json();
    },
    enabled: user?.role === 'admin',
  }) as { data: SystemStats | undefined; isLoading: boolean };

  const quickActions: QuickAction[] = [
    {
      id: 'users',
      title: 'User Management',
      description: 'Manage user accounts and permissions',
      icon: Users,
      href: '/user-management',
    },
    {
      id: 'roles',
      title: 'Role Management',
      description: 'Configure roles and access controls',
      icon: Shield,
      href: '/role-management',
    },
    {
      id: 'audit',
      title: 'Audit Logs',
      description: 'View system activity and security logs',
      icon: Activity,
      href: '/audit-monitoring',
    },
    {
      id: 'settings',
      title: 'System Settings',
      description: 'Configure system-wide settings',
      icon: Settings,
      href: '/settings',
    },
    {
      id: 'backup',
      title: 'Backup & Recovery',
      description: 'Manage data backups and recovery',
      icon: Database,
      href: '#',
      badge: 'Coming Soon',
    },
    {
      id: 'monitoring',
      title: 'System Monitoring',
      description: 'Monitor system performance and health',
      icon: Server,
      href: '/system-health',
    },
  ];

  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'critical':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'healthy':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'critical':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  if (user?.role !== 'admin') {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You need administrator privileges to access this page.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600">System overview and administration tools</p>
          </div>
        </div>

        {/* System Health Overview */}
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </CardContent>
          </Card>
        ) : stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Users className="w-8 h-8 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
                    <p className="text-sm text-gray-600">Total Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <FileText className="w-8 h-8 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalDocuments}</p>
                    <p className="text-sm text-gray-600">Documents</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <HardDrive className="w-8 h-8 text-purple-500" />
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalStorage}</p>
                    <p className="text-sm text-gray-600">Storage Used</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {getHealthIcon(stats.systemHealth)}
                    <div>
                      <p className="text-sm font-medium text-gray-900">System Health</p>
                      <Badge className={getHealthColor(stats.systemHealth)}>
                        {stats.systemHealth.charAt(0).toUpperCase() + stats.systemHealth.slice(1)}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* System Metrics */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeUsers}</div>
                <p className="text-xs text-muted-foreground">Currently online</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Processing Queue</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.processingQueue}</div>
                <p className="text-xs text-muted-foreground">Documents in queue</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">System Uptime</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.uptime}</div>
                <p className="text-xs text-muted-foreground">Last restart</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5" />
              <span>Quick Actions</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.id}
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-start space-y-2"
                    asChild={!action.badge}
                    disabled={!!action.badge}
                  >
                    {action.badge ? (
                      <div className="w-full">
                        <div className="flex items-center space-x-2 mb-2">
                          <Icon className="w-5 h-5 text-gray-500" />
                          <Badge variant="secondary" className="text-xs">
                            {action.badge}
                          </Badge>
                        </div>
                        <div className="text-left">
                          <div className="font-medium text-gray-700">{action.title}</div>
                          <div className="text-sm text-gray-500">{action.description}</div>
                        </div>
                      </div>
                    ) : (
                      <a href={action.href} className="w-full">
                        <div className="flex items-center space-x-2 mb-2">
                          <Icon className="w-5 h-5 text-blue-500" />
                        </div>
                        <div className="text-left">
                          <div className="font-medium">{action.title}</div>
                          <div className="text-sm text-gray-500">{action.description}</div>
                        </div>
                      </a>
                    )}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* System Information */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Database className="w-5 h-5" />
                <span>System Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Last Backup</h4>
                  <p className="text-sm text-gray-600">{stats.lastBackup}</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">System Version</h4>
                  <p className="text-sm text-gray-600">v2.1.0</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
