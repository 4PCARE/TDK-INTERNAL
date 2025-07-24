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
  Upload, 
  Search, 
  Tag, 
  Calendar,
  Bot,
  MessageSquare,
  MessageCircle,
  Share2,
  Brain,
  Users,
  Shield,
  Settings,
  Eye,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  BarChart3,
  TrendingUp,
  Star,
  FileBarChart,
  Activity
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

  const navigationGroups = [
    {
      label: "Home",
      items: [
        { name: "Dashboard", href: "/", icon: Home },
      ]
    },
    {
      label: "Manage Documents",
      items: [
        { name: "All Documents", href: "/documents", icon: FileText },
        { name: "Upload", href: "/upload", icon: Upload },
        { name: "Categories", href: "/categories", icon: Tag },
        { name: "Meeting Notes", href: "/meeting-notes", icon: Calendar },
      ]
    },
    {
      label: "AI & Chatbot Features",
      items: [
        { name: "Manage Chat Agents", href: "/agent-chatbots", icon: Bot },
        { name: "Agent Console", href: "/agent-console", icon: MessageSquare },
        { name: "App Widget", href: "/live-chat-widget", icon: MessageCircle },
        { name: "Platform Integrations", href: "/integrations", icon: Share2 },
        { name: "AI Assistant", href: "/ai-assistant", icon: Brain },
      ]
    },
    {
      label: "Dashboards & Analytics",
      items: [
        { name: "AI Interaction", href: "/ai-interaction", icon: BarChart3 },
        { name: "AI Response Analysis", href: "/ai-response-analysis", icon: TrendingUp },
        { name: "Customer Survey", href: "/customer-survey", icon: Star },
        { name: "Document Demand", href: "/document-demand-insights", icon: TrendingUp },
        { name: "Document Usage", href: "/document-usage", icon: FileBarChart },
        { name: "Security & Governance", href: "/security-governance", icon: Shield },
        { name: "System Health", href: "/system-health", icon: Activity },
        { name: "User Activity", href: "/user-activity", icon: Users },
        { name: "User Feedback", href: "/user-feedback", icon: MessageSquare },
      ]
    },
    {
      label: "Administration",
      items: [
        { name: "Users", href: "/user-management", icon: Users },
        { name: "Roles", href: "/role-management", icon: Shield },
        { name: "Admin Dashboard", href: "/admin", icon: Settings },
        { name: "Audit Monitoring", href: "/audit-monitoring", icon: Eye },
        { name: "Settings", href: "/settings", icon: Settings },
      ]
    },
    {
      label: "Feedback",
      items: [
        { name: "Survey", href: "/survey", icon: MessageSquare },
      ]
    }
  ];

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
          isCollapsed ? "w-16" : "w-64",
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
                    <h1 className="text-lg font-bold text-white">AI-KMS</h1>
                    <p className="text-xs text-navy-300">
                      Knowledge Management
                    </p>
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
            <nav className="flex-1 px-4 py-4 space-y-6">
          {navigationGroups.map((group, groupIndex) => (
            <div key={group.label} className="space-y-2">
              {!isCollapsed && (
                <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {group.label}
                </h3>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = location === item.href || 
                                 (item.href !== "/" && location.startsWith(item.href));

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-blue-100 text-blue-700 shadow-sm"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      )}
                    >
                      <item.icon className={cn("w-5 h-5", isCollapsed && "w-6 h-6")} />
                      {!isCollapsed && <span>{item.name}</span>}
                    </Link>
                  );
                })}
              </div>
              {groupIndex < navigationGroups.length - 1 && !isCollapsed && (
                <div className="border-t border-slate-200 mt-4"></div>
              )}
            </div>
          ))}
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