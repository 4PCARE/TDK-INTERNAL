import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import {
  Home,
  FileText,
  Clock,
  Star,
  Share2,
  Bot,
  X,
  Upload,
  Search,
  Settings,
  FolderOpen,
  BarChart3,
  ChevronDown,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Brain,
} from "lucide-react";

import kingpowerLogo from "@assets/kingpower_1750867302870.webp";

interface SidebarProps {
  isMobileOpen: boolean;
  onMobileClose: () => void;
  onOpenChat: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({
  isMobileOpen,
  onMobileClose,
  onOpenChat,
  isCollapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const [location] = useLocation();
  const [isDashboardExpanded, setIsDashboardExpanded] = useState(false);
  const { user } = useAuth();

  const { data: categories = [] } = useQuery({
    queryKey: ["/api/categories"],
  }) as { data: Array<{ id: number; name: string; documentCount?: number }> };

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
  }) as { data: { totalDocuments: number } | undefined };

  const categoryColors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-yellow-500",
    "bg-red-500",
    "bg-indigo-500",
  ];

  const isActiveRoute = (path: string) => location === path;
  const isDashboardActive = location.startsWith("/dashboards");

  // Auto-expand dashboard menu if user is on a dashboard route
  useEffect(() => {
    if (isDashboardActive) {
      setIsDashboardExpanded(true);
    }
  }, [isDashboardActive]);

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 bg-gradient-to-b from-navy-900 to-navy-800 shadow-xl border-r border-navy-700 transition-all duration-300 ease-in-out lg:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header with Toggle */}
          <div className="p-4 border-b border-navy-700/50">
            <div className="flex items-center justify-between">
              {!isCollapsed && (
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                    <Brain className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-white">
                      AI-KMS
                    </h1>
                    <p className="text-xs text-navy-300">Knowledge Management</p>
                  </div>
                </div>
              )}
              
              <div className="flex items-center space-x-2">
                {/* Collapse Toggle for Desktop */}
                {onToggleCollapse && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleCollapse}
                    className="hidden lg:flex text-navy-300 hover:text-white hover:bg-navy-700/50 transition-colors"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4" />
                    ) : (
                      <ChevronLeft className="w-4 h-4" />
                    )}
                  </Button>
                )}
                
                {/* Mobile Close Button */}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={onMobileClose}
                  className="lg:hidden text-navy-300 hover:text-white hover:bg-navy-700/50"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 p-3 space-y-6 overflow-y-auto">
            {/* Navigation Menu */}
            <nav className="space-y-1">
              <Link href="/" onClick={onMobileClose}>
                <div
                  className={cn(
                    "group flex items-center px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer relative",
                    isActiveRoute("/")
                      ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg"
                      : "text-navy-200 hover:text-white hover:bg-navy-700/50",
                    isCollapsed ? "justify-center" : "space-x-3"
                  )}
                >
                  <Home className={cn(
                    "flex-shrink-0 transition-transform duration-200",
                    isActiveRoute("/") ? "w-5 h-5" : "w-4 h-4",
                    "group-hover:scale-110"
                  )} />
                  
                  {!isCollapsed && (
                    <span className="truncate">Home</span>
                  )}
                  
                  {isActiveRoute("/") && (
                    <div className="absolute inset-y-0 left-0 w-1 bg-white rounded-r-full" />
                  )}
                  
                  {/* Tooltip for collapsed state */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                      Home
                    </div>
                  )}
                </div>
              </Link>

              <Link href="/documents" onClick={onMobileClose}>
                <div
                  className={cn(
                    "group flex items-center px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer relative",
                    isActiveRoute("/documents")
                      ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg"
                      : "text-navy-200 hover:text-white hover:bg-navy-700/50",
                    isCollapsed ? "justify-center" : "space-x-3"
                  )}
                >
                  <FileText className={cn(
                    "flex-shrink-0 transition-transform duration-200",
                    isActiveRoute("/documents") ? "w-5 h-5" : "w-4 h-4",
                    "group-hover:scale-110"
                  )} />
                  
                  {!isCollapsed && (
                    <>
                      <span className="truncate">All Documents</span>
                      <Badge variant="secondary" className="ml-auto bg-navy-600 text-navy-100">
                        {stats?.totalDocuments || 0}
                      </Badge>
                    </>
                  )}
                  
                  {isActiveRoute("/documents") && (
                    <div className="absolute inset-y-0 left-0 w-1 bg-white rounded-r-full" />
                  )}
                  
                  {/* Tooltip for collapsed state */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                      All Documents ({stats?.totalDocuments || 0})
                    </div>
                  )}
                </div>
              </Link>

              <Link href="/categories" onClick={onMobileClose}>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start",
                    isActiveRoute("/categories")
                      ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
                  )}
                >
                  <FolderOpen className="w-5 h-5 mr-3" />
                  <span>Categories</span>
                </Button>
              </Link>

              {/* Dashboard Menu with Expandable Sub-items */}
              <div className="space-y-1">
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start",
                    isDashboardActive
                      ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
                  )}
                  onClick={() => setIsDashboardExpanded(!isDashboardExpanded)}
                >
                  <BarChart3 className="w-5 h-5 mr-3" />
                  <span>Dashboards</span>
                  {isDashboardExpanded ? (
                    <ChevronDown className="w-4 h-4 ml-auto" />
                  ) : (
                    <ChevronRight className="w-4 h-4 ml-auto" />
                  )}
                </Button>

                {isDashboardExpanded && (
                  <div className="ml-6 space-y-1">
                    <Link
                      href="/dashboards/document-usage"
                      onClick={onMobileClose}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "w-full justify-start text-sm",
                          isActiveRoute("/dashboards/document-usage")
                            ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
                        )}
                      >
                        Document Usage Overview
                      </Button>
                    </Link>

                    <Link
                      href="/dashboards/ai-interaction"
                      onClick={onMobileClose}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "w-full justify-start text-sm",
                          isActiveRoute("/dashboards/ai-interaction")
                            ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
                        )}
                      >
                        AI Agent Interaction
                      </Button>
                    </Link>

                    <Link
                      href="/dashboards/user-activity"
                      onClick={onMobileClose}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "w-full justify-start text-sm",
                          isActiveRoute("/dashboards/user-activity")
                            ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
                        )}
                      >
                        User Activity Monitoring
                      </Button>
                    </Link>

                    <Link
                      href="/dashboards/system-health"
                      onClick={onMobileClose}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "w-full justify-start text-sm",
                          isActiveRoute("/dashboards/system-health")
                            ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
                        )}
                      >
                        System Health & AI Performance
                      </Button>
                    </Link>

                    <Link
                      href="/dashboards/security-governance"
                      onClick={onMobileClose}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "w-full justify-start text-sm",
                          isActiveRoute("/dashboards/security-governance")
                            ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
                        )}
                      >
                        Security & Governance
                      </Button>
                    </Link>

                    <Link
                      href="/dashboards/customer-survey"
                      onClick={onMobileClose}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "w-full justify-start text-sm",
                          isActiveRoute("/dashboards/customer-survey")
                            ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
                        )}
                      >
                        Customer Survey
                      </Button>
                    </Link>

                    <Link
                      href="/dashboards/user-feedback"
                      onClick={onMobileClose}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "w-full justify-start text-sm",
                          isActiveRoute("/dashboards/user-feedback")
                            ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
                        )}
                      >
                        User Feedback
                      </Button>
                    </Link>

                    <Link
                      href="/dashboards/ai-response-analysis"
                      onClick={onMobileClose}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "w-full justify-start text-sm",
                          isActiveRoute("/dashboards/ai-response-analysis")
                            ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
                        )}
                      >
                        AI Response Analysis
                      </Button>
                    </Link>
                  </div>
                )}
              </div>

              {/* Only show Settings for admin users */}
              {(user as any)?.role === "admin" && (
                <Link href="/settings" onClick={onMobileClose}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start",
                      isActiveRoute("/settings")
                        ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
                    )}
                  >
                    <Settings className="w-5 h-5 mr-3" />
                    <span>Settings</span>
                  </Button>
                </Link>
              )}

              <Link href="/survey" onClick={onMobileClose}>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start",
                    isActiveRoute("/survey")
                      ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
                  )}
                >
                  <Bot className="w-5 h-5 mr-3" />
                  <span>Survey</span>
                </Button>
              </Link>
            </nav>

            {/* AI Assistant */}
            {/* <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <h4 className="font-medium text-gray-900">AI Assistant</h4>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Ask questions about your documents
              </p>
              <Button
                className="w-full bg-blue-500 text-white hover:bg-blue-600"
                onClick={onOpenChat}
              >
                Start Chat
              </Button>
            </div> */}
          </div>
        </div>
      </aside>
    </>
  );
}
