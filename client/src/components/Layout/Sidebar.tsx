import { useState, useEffect, useRef } from "react";
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
  ChevronDown,  // <-- Make sure this is imported!
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
  const sidebarRef = useRef<HTMLElement>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["/api/categories"],
  }) as { data: Array<{ id: number; name: string; documentCount?: number }> };

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
  }) as { data: { totalDocuments: number } | undefined };

  // Define all navigation groups with role requirements
  const allNavigationGroups = [
    {
      label: "Main",
      items: [
        { name: "Home", href: "/", icon: Home },
        { name: "Settings", href: "/settings", icon: Settings },
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
        { name: "Document Usage", href: "/document-usage", icon: FileBarChart },
        { name: "Security & Governance", href: "/security-governance", icon: Shield },
        { name: "System Health", href: "/system-health", icon: Activity },
        { name: "User Activity", href: "/user-activity", icon: Users },
        { name: "User Feedback", href: "/user-feedback", icon: MessageSquare },
      ]
    },
    {
      label: "Administration",
      adminOnly: true,
      items: [
        { name: "Users", href: "/user-management", icon: Users },
        { name: "Roles", href: "/role-management", icon: Shield },
        { name: "Admin Dashboard", href: "/admin", icon: Settings },
        { name: "Audit Monitoring", href: "/audit-monitoring", icon: Eye },
      ]
    },
    {
      label: "Feedback",
      items: [
        { name: "Survey", href: "/survey", icon: MessageSquare },
      ]
    }
  ];

  // Filter navigation groups based on user role
  const navigationGroups = allNavigationGroups.filter(group => {
    // If group requires admin access and user is not admin, exclude it
    if (group.adminOnly && user?.role !== 'admin') {
      return false;
    }
    return true;
  });

  // ---- Collapsible groups state logic ----
  const initialExpanded = navigationGroups.reduce(
    (acc, group) => ({ ...acc, [group.label]: false }),
    {} as Record<string, boolean>
  );
  const [expandedGroups, setExpandedGroups] = useState(initialExpanded);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  // Auto-expand group if current route matches any of its items
  useEffect(() => {
    navigationGroups.forEach(group => {
      const isGroupActive = group.items.some(item =>
        location === item.href ||
        (item.href !== "/" && location.startsWith(item.href))
      );
      if (isGroupActive && !expandedGroups[group.label]) {
        setExpandedGroups(prev => ({
          ...prev,
          [group.label]: true
        }));
      }
    });
    // eslint-disable-next-line
  }, [location]);

  // Handle click outside to collapse sidebar
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node) &&
        !isCollapsed &&
        onToggleCollapse &&
        window.innerWidth >= 1024 // Only on desktop
      ) {
        onToggleCollapse();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCollapsed, onToggleCollapse]);

  return (
    <>
      {/* Mobile Overlay */}
      {isMobile && isMobileOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={cn(
          "fixed inset-y-0 left-0 z-50 bg-gradient-to-b from-navy-900 to-navy-800 shadow-xl border-r border-navy-700 transition-all duration-300 ease-in-out",
          // Mobile behavior (screens < 1024px)
          isMobile && (isMobileOpen ? "translate-x-0" : "-translate-x-full"),
          // Desktop behavior (screens >= 1024px)
          !isMobile && "static translate-x-0",
          // Width handling
          isMobile ? "w-80" : isCollapsed ? "w-16" : "w-64",
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-navy-700/50">
            <div className="flex items-center justify-between">
              {!isCollapsed && (
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                    <Brain className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-white">TDK</h1>
                    <p className="text-xs text-navy-300">
                      Knowledge Management
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-2">
                {/* Mobile Close Button */}
                {isMobile && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onMobileClose}
                    className="text-navy-300 hover:text-white hover:bg-navy-700/50"
                    aria-label="Close sidebar"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                )}
                
                {/* Desktop Collapse Toggle */}
                {!isMobile && onToggleCollapse && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleCollapse}
                    className="text-navy-300 hover:text-white hover:bg-navy-700/50"
                    aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronLeft className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 p-3 space-y-6 overflow-y-auto relative scrollbar-hide">
            {/* Middle Toggle Button for Desktop */}
            {!isMobile && onToggleCollapse && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleCollapse}
                data-sidebar-toggle
                className="fixed right-[-16px] top-1/2 transform -translate-y-1/2 z-50 w-8 h-12 bg-navy-800 border border-navy-600 hover:bg-navy-700 text-navy-300 hover:text-white transition-all duration-200 rounded-r-md shadow-lg"
                style={{ 
                  right: isCollapsed ? '0px' : '248px',
                  top: '50vh',
                  transform: 'translateY(-50%)'
                }}
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
              </Button>
            )}

            {/* Clickable overlay when collapsed (desktop only) */}
            {!isMobile && isCollapsed && onToggleCollapse && (
              <div
                className="absolute inset-0 z-5 cursor-pointer"
                onClick={onToggleCollapse}
                title="Click to expand sidebar"
              />
            )}

            {/* Right edge clickable area when collapsed (desktop only) */}
            {!isMobile && isCollapsed && onToggleCollapse && (
              <div
                className="absolute right-0 top-0 bottom-0 w-4 z-6 cursor-pointer hover:bg-navy-700/20 transition-colors"
                onClick={onToggleCollapse}
                title="Click to expand sidebar"
              />
            )}

            {/* Navigation Menu */}
            <nav className="flex-1 px-4 py-4 space-y-6">
              {navigationGroups.map((group, groupIndex) => (
                <div key={group.label} className="space-y-2">
                  {/* Group header (button) - show on mobile even when collapsed */}
                  {(!isCollapsed || window.innerWidth < 1024) && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    className="flex items-center w-full px-3 py-2 text-xs font-semibold text-slate-100 uppercase tracking-wider hover:text-white transition"
                  >
                    <span className="flex-1 text-left">{group.label}</span>
                    <span className="ml-2 flex-shrink-0">
                      {expandedGroups[group.label] ? (
                        <ChevronDown className="w-4 h-4 inline" />
                      ) : (
                        <ChevronRight className="w-4 h-4 inline" />
                      )}
                    </span>
                  </button>
                  )}
                  {/* Group items (collapsible) - show on mobile even when collapsed */}
                  <div className={cn(
                    "space-y-1 pl-1 transition-all duration-200 overflow-hidden",
                    (expandedGroups[group.label] && (!isCollapsed || window.innerWidth < 1024)) ? "max-h-96" : "max-h-0"
                  )}>
                    {(expandedGroups[group.label] && (!isCollapsed || window.innerWidth < 1024)) && group.items.map((item) => {
                      const isActive = location === item.href ||
                        (item.href !== "/" && location.startsWith(item.href));
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          onClick={onMobileClose}
                          className={cn(
                            "flex items-start space-x-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                            isActive
                              ? "bg-blue-100 text-blue-700 shadow-sm"
                              : "text-white hover:bg-navy-700/50 hover:text-white"
                          )}
                        >
                          <item.icon className={cn("w-4 h-4 mt-0.5", isCollapsed && "lg:w-6 lg:h-6")} />
                          {(!isCollapsed || window.innerWidth < 1024) && (
                            <span className="break-words whitespace-normal text-left drop-shadow-sm">
                              {item.name}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                  {groupIndex < navigationGroups.length - 1 && (!isCollapsed || window.innerWidth < 1024) && (
                    <div className="border-t border-slate-200 mt-4"></div>
                  )}
                </div>
              ))}
            </nav>
            {/* ...other sidebar content */}
          </div>
        </div>
      </aside>
    </>
  );
}