import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { 
  Home,
  FileText,
  FolderOpen,
  Tags,
  Users,
  BarChart3,
  Settings,
  Shield,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  UserCog,
  Database,
  Activity,
  TrendingUp,
  PieChart,
  BarChart,
  LineChart
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  onOpenChat?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  isMobileOpen = false, 
  onMobileClose, 
  onOpenChat,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const [location] = useLocation();
  const { user, userRole } = useAuth();
  const [documentsExpanded, setDocumentsExpanded] = useState(true);
  const [dashboardsExpanded, setDashboardsExpanded] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(true);

  const isActiveRoute = (route: string) => {
    return location === route || location.startsWith(route + '/');
  };

  const dashboardPages = [
    { path: '/dashboards/ai-interaction', name: 'AI Interaction', icon: MessageSquare },
    { path: '/dashboards/user-activity', name: 'User Activity', icon: Activity },
    { path: '/dashboards/document-usage', name: 'Document Usage', icon: TrendingUp },
    { path: '/dashboards/system-health', name: 'System Health', icon: PieChart },
    { path: '/dashboards/security-governance', name: 'Security & Governance', icon: Shield },
    { path: '/dashboards/user-feedback', name: 'User Feedback', icon: BarChart },
    { path: '/dashboards/ai-response-analysis', name: 'AI Response Analysis', icon: LineChart },
    { path: '/dashboards/document-demand-insights', name: 'Document Demand Insights', icon: BarChart3 }
  ];

  const adminPages = [
    { path: '/user-management', name: 'User Management', icon: Users },
    { path: '/role-management', name: 'Role Management', icon: UserCog },
    { path: '/settings', name: 'Settings', icon: Settings },
    { path: '/integrations', name: 'Integrations', icon: Database },
    { path: '/audit-monitoring', name: 'Audit & Monitoring', icon: Shield }
  ];

  const NavItem = ({ 
    to, 
    icon: Icon, 
    children, 
    isActive = false,
    onClick,
    className = ""
  }: {
    to?: string;
    icon: React.ElementType;
    children: React.ReactNode;
    isActive?: boolean;
    onClick?: () => void;
    className?: string;
  }) => {
    const content = (
      <div
        className={cn(
          "flex items-center space-x-0.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
          isActive
            ? "bg-blue-100 text-blue-700 border-r-2 border-blue-700"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          isCollapsed && "justify-center px-2",
          className
        )}
        onClick={onClick}
      >
        <Icon className={cn("h-5 w-5 flex-shrink-0")} />
        {!isCollapsed && <span className="truncate">{children}</span>}
      </div>
    );

    if (to) {
      return (
        <Link href={to} onClick={onMobileClose}>
          {content}
        </Link>
      );
    }

    return content;
  };

  const SubNavItem = ({ to, children, isActive = false }: {
    to: string;
    children: React.ReactNode;
    isActive?: boolean;
  }) => (
    <Link href={to} onClick={onMobileClose}>
      <div
        className={cn(
          "flex items-center space-x-0.5 px-6 py-1 text-sm transition-colors cursor-pointer",
          isActive
            ? "text-blue-700 bg-blue-50 border-r-2 border-blue-700"
            : "text-slate-500 hover:text-slate-700 hover:bg-slate-50",
          isCollapsed && "hidden"
        )}
      >
        <span className="truncate">{children}</span>
      </div>
    </Link>
  );

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        {!isCollapsed && (
          <div className="flex items-center space-x-1">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">AI</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">AI-KMS</h1>
            </div>
          </div>
        )}

        {/* Mobile close button */}
        <div className="flex items-center space-x-2">
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              className="hidden md:flex"
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}
          {onMobileClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMobileClose}
              className="md:hidden"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {/* Home */}
        <NavItem
          to="/"
          icon={Home}
          isActive={isActiveRoute('/')}
        >
          Home
        </NavItem>

        {/* Documents */}
        <div>
          <NavItem
            icon={FileText}
            isActive={isActiveRoute('/documents') || isActiveRoute('/categories') || isActiveRoute('/meeting-notes')}
            onClick={() => !isCollapsed && setDocumentsExpanded(!documentsExpanded)}
            className="flex justify-between"
          >
            <span>Documents</span>
            {!isCollapsed && (
              documentsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            )}
          </NavItem>

          {documentsExpanded && !isCollapsed && (
            <div className="ml-2 space-y-0">
              <SubNavItem
                to="/documents"
                isActive={isActiveRoute('/documents')}
              >
                All Documents
              </SubNavItem>
              <SubNavItem
                to="/categories"
                isActive={isActiveRoute('/categories')}
              >
                Categories
              </SubNavItem>
              <SubNavItem
                to="/meeting-notes"
                isActive={isActiveRoute('/meeting-notes')}
              >
                Meeting Notes
              </SubNavItem>
            </div>
          )}
        </div>

        {/* Dashboards */}
        <div>
          <NavItem
            icon={BarChart3}
            isActive={isActiveRoute('/dashboards')}
            onClick={() => !isCollapsed && setDashboardsExpanded(!dashboardsExpanded)}
            className="flex justify-between"
          >
            <span>Dashboards</span>
            {!isCollapsed && (
              dashboardsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            )}
          </NavItem>

          {dashboardsExpanded && !isCollapsed && (
            <div className="ml-2 space-y-0">
              {dashboardPages.map((dashboard) => (
                <SubNavItem
                  key={dashboard.path}
                  to={dashboard.path}
                  isActive={isActiveRoute(dashboard.path)}
                >
                  {dashboard.name}
                </SubNavItem>
              ))}
            </div>
          )}
        </div>

        {/* Settings & Administration */}
        <div>
          <NavItem
            icon={Settings}
            isActive={adminPages.some(page => isActiveRoute(page.path))}
            onClick={() => !isCollapsed && setAdminExpanded(!adminExpanded)}
            className="flex justify-between"
          >
            <span>Settings & Administration</span>
            {!isCollapsed && (
              adminExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            )}
          </NavItem>

          {adminExpanded && !isCollapsed && (
            <div className="ml-2 space-y-0">
              <SubNavItem
                to="/settings"
                isActive={isActiveRoute('/settings')}
              >
                Settings
              </SubNavItem>
              <SubNavItem
                to="/user-management"
                isActive={isActiveRoute('/user-management')}
              >
                User Management
              </SubNavItem>
            </div>
          )}
        </div>

        {/* Survey */}
        <NavItem
          to="/survey"
          icon={MessageSquare}
          isActive={isActiveRoute('/survey')}
        >
          Survey
        </NavItem>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200">
        {!isCollapsed && user && (
          <div className="flex items-center space-x-1">
            <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center">
              <span className="text-xs font-medium text-slate-600">
                {user.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">
                {user.name || 'User'}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {userRole || 'user'}
              </p>
            </div>
          </div>
        )}

        {onOpenChat && (
          <Button
            onClick={onOpenChat}
            variant="outline"
            size="sm"
            className="w-full mt-3"
          >
            {isCollapsed ? <MessageSquare className="h-4 w-4" /> : 'Open Chat'}
          </Button>
        )}
      </div>
    </div>
  );

  // Mobile sidebar
  if (isMobileOpen) {
    return (
      <div className="fixed inset-0 z-50 md:hidden">
        <div className="fixed inset-0 bg-black/20" onClick={onMobileClose} />
        <div className="fixed left-0 top-0 bottom-0 w-72 bg-white shadow-xl">
          {sidebarContent}
        </div>
      </div>
    );
  }

  // Desktop sidebar
  return (
    <div className={cn(
      "hidden md:flex md:flex-col md:fixed md:inset-y-0 bg-white border-r border-slate-200 shadow-sm transition-all duration-300",
      isCollapsed ? "md:w-16" : "md:w-72"
    )}>
      {sidebarContent}
    </div>
  );
};

export default Sidebar;