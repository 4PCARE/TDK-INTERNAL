import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/Layout/Sidebar";
import TopBar from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Shield,
  Activity,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Download,
  Calendar as CalendarIcon,
  User,
  Database,
  FileText,
  Settings,
  ArrowLeft,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { format } from "date-fns";

export default function AuditMonitoring() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterResourceType, setFilterResourceType] = useState<string>("all");
  const [filterUserId, setFilterUserId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  // Fetch audit statistics
  const { data: auditStats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/audit/stats'],
    enabled: isAuthenticated,
    retry: false,
  });

  // Fetch filter options
  const { data: filterOptions } = useQuery({
    queryKey: ['/api/audit/filters'],
    enabled: isAuthenticated,
    retry: false,
  });

  // Fetch audit logs
  const { data: auditLogs = [], isLoading: logsLoading, refetch } = useQuery({
    queryKey: ['/api/audit/logs', { 
      limit, 
      offset, 
      action: filterAction !== 'all' ? filterAction : undefined, 
      resourceType: filterResourceType !== 'all' ? filterResourceType : undefined,
      filterUserId: filterUserId !== 'all' ? filterUserId : undefined,
      dateFrom, 
      dateTo 
    }],
    enabled: isAuthenticated,
    retry: false,
  });

  const handleSearch = () => {
    setOffset(0);
    refetch();
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (filterAction !== 'all') params.append('action', filterAction);
      if (filterResourceType !== 'all') params.append('resourceType', filterResourceType);
      if (filterUserId !== 'all') params.append('filterUserId', filterUserId);
      if (dateFrom) params.append('dateFrom', dateFrom.toISOString());
      if (dateTo) params.append('dateTo', dateTo.toISOString());

      const response = await fetch(`/api/audit/export?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast({
          title: "Export Complete",
          description: "Audit logs have been downloaded successfully",
        });
      } else {
        throw new Error('Export failed');
      }
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export audit logs. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const toggleRowExpansion = (logId: number) => {
    const newExpandedRows = new Set(expandedRows);
    if (newExpandedRows.has(logId)) {
      newExpandedRows.delete(logId);
    } else {
      newExpandedRows.add(logId);
    }
    setExpandedRows(newExpandedRows);
  };

  const formatDetailsForDisplay = (log: any) => {
    const details = {
      ...(log.details || {}),
      ...(log.errorMessage && { errorMessage: log.errorMessage }),
      ...(log.userAgent && { userAgent: log.userAgent }),
      ...(log.sessionId && { sessionId: log.sessionId }),
    };
    
    return Object.keys(details).length > 0 ? JSON.stringify(details, null, 2) : 'N/A';
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'login':
      case 'logout':
        return <User className="w-4 h-4" />;
      case 'upload':
      case 'download':
      case 'delete':
        return <FileText className="w-4 h-4" />;
      case 'search':
      case 'translate':
        return <Search className="w-4 h-4" />;
      case 'api_call':
        return <Database className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (success: boolean) => {
    return (
      <Badge variant={success ? "default" : "destructive"}>
        {success ? "Success" : "Failed"}
      </Badge>
    );
  };

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar 
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <main className="flex-1 overflow-auto p-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-800 mb-2 flex items-center">
              <Shield className="w-6 h-6 mr-3" />
              Audit & Monitoring
            </h1>
            <p className="text-sm text-slate-500">
              Track all user actions and API interactions for compliance and security monitoring
            </p>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <Card className="border border-slate-200">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Activity className="w-8 h-8 text-blue-500" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-slate-500">Total Actions</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {statsLoading ? "..." : auditStats?.totalActions || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Clock className="w-8 h-8 text-green-500" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-slate-500">Today's Actions</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {statsLoading ? "..." : auditStats?.todayActions || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-slate-500">Failed Actions</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {statsLoading ? "..." : auditStats?.failedActions || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Settings className="w-8 h-8 text-purple-500" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-slate-500">Success Rate</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {statsLoading ? "..." : 
                        auditStats?.totalActions 
                          ? `${Math.round(((auditStats.totalActions - auditStats.failedActions) / auditStats.totalActions) * 100)}%`
                          : "100%"
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Actions */}
          {auditStats?.topActions && auditStats.topActions.length > 0 && (
            <Card className="border border-slate-200 mb-6">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-800">
                  Top Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {auditStats.topActions.map((action, index) => (
                    <div key={action.action} className="text-center">
                      <div className="flex items-center justify-center mb-2">
                        {getActionIcon(action.action)}
                      </div>
                      <p className="text-sm font-medium text-slate-800 capitalize">
                        {action.action.replace('_', ' ')}
                      </p>
                      <p className="text-lg font-bold text-slate-900">{action.count}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <Card className="border border-slate-200 mb-6">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-slate-800 flex items-center">
                <Filter className="w-5 h-5 mr-2" />
                Filters & Search
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div className="md:col-span-2">
                  <Input
                    placeholder="Search logs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full"
                  />
                </div>

                <Select value={filterAction} onValueChange={setFilterAction}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    {filterOptions?.actions?.map((action: string) => (
                      <SelectItem key={action} value={action}>
                        {action.replace('_', ' ').split(' ').map((word: string) => 
                          word.charAt(0).toUpperCase() + word.slice(1)
                        ).join(' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterResourceType} onValueChange={setFilterResourceType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Resources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Resources</SelectItem>
                    {filterOptions?.resourceTypes?.map((resourceType: string) => (
                      <SelectItem key={resourceType} value={resourceType}>
                        {resourceType.replace('_', ' ').split(' ').map((word: string) => 
                          word.charAt(0).toUpperCase() + word.slice(1)
                        ).join(' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterUserId} onValueChange={setFilterUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {filterOptions?.users?.map((user: any) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "PPP") : "From date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                <div className="flex gap-2">
                  <Button onClick={handleSearch}>
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </Button>
                  <Button variant="outline" onClick={handleExport} disabled={isExporting}>
                    <Download className="w-4 h-4 mr-2" />
                    {isExporting ? "Exporting..." : "Export"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audit Logs Table */}
          <Card className="border border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-slate-800">
                Audit Logs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-slate-500">Loading audit logs...</div>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-slate-500">No audit logs found</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Timestamp</th>
                        <th className="text-left p-2">User</th>
                        <th className="text-left p-2">Action</th>
                        <th className="text-left p-2">Resource</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Duration</th>
                        <th className="text-left p-2">IP Address</th>
                        <th className="text-left p-2">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log: any) => (
                        <>
                          <tr key={log.id} className="border-b hover:bg-slate-50">
                            <td className="p-2">
                              {log.timestamp ? format(new Date(log.timestamp), "PPp") : 'N/A'}
                            </td>
                            <td className="p-2">
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-slate-900">
                                  {log.userFirstName && log.userLastName 
                                    ? `${log.userFirstName} ${log.userLastName}`
                                    : log.userEmail || 'Unknown User'
                                  }
                                </span>
                                {log.userEmail && (log.userFirstName || log.userLastName) && (
                                  <span className="text-xs text-slate-500">{log.userEmail}</span>
                                )}
                              </div>
                            </td>
                            <td className="p-2">
                              <div className="flex items-center">
                                {getActionIcon(log.action)}
                                <span className="ml-2 capitalize">
                                  {log.action?.replace('_', ' ') || 'Unknown'}
                                </span>
                              </div>
                            </td>
                            <td className="p-2">
                              <Badge variant="outline">
                                {log.resourceType || 'N/A'}
                              </Badge>
                            </td>
                            <td className="p-2">
                              {getStatusBadge(log.success)}
                            </td>
                            <td className="p-2">
                              {log.duration ? `${log.duration}ms` : 'N/A'}
                            </td>
                            <td className="p-2 text-xs text-slate-500">
                              {log.ipAddress || 'N/A'}
                            </td>
                            <td className="p-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 max-w-xs truncate">
                                  {log.errorMessage || 
                                   (log.details && typeof log.details === 'object' 
                                     ? JSON.stringify(log.details).substring(0, 50) + '...'
                                     : 'N/A'
                                   )}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleRowExpansion(log.id)}
                                  className="ml-2 p-1 h-6 w-6"
                                >
                                  {expandedRows.has(log.id) ? 
                                    <ChevronDown className="w-4 h-4" /> : 
                                    <ChevronRight className="w-4 h-4" />
                                  }
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expandedRows.has(log.id) && (
                            <tr key={`${log.id}-details`} className="bg-slate-50">
                              <td colSpan={8} className="p-4">
                                <div className="bg-white rounded border p-3">
                                  <h4 className="text-sm font-medium text-slate-800 mb-2">Full Details</h4>
                                  <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono bg-slate-100 p-2 rounded overflow-x-auto">
                                    {formatDetailsForDisplay(log)}
                                  </pre>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-slate-500">
                  Showing {offset + 1} to {Math.min(offset + limit, (auditLogs?.length || 0) + offset)} results
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={offset === 0}
                    onClick={() => {
                      setOffset(Math.max(0, offset - limit));
                      refetch();
                    }}
                  >
                    Previous
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled={auditLogs?.length < limit}
                    onClick={() => {
                      setOffset(offset + limit);
                      refetch();
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}