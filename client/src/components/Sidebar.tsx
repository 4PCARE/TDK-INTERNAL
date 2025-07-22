
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Home,
  Upload,
  FolderOpen,
  Search,
  MessageSquare,
  Tags,
  Users,
  Settings,
  Brain,
  BookType,
  Building,
  Video,
  Bot,
  BarChart3,
  UserCheck,
  Menu,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  Shield,
} from "lucide-react";

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({
  isCollapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const [documentsExpanded, setDocumentsExpanded] = useState(false);
  const [dashboardsExpanded, setDashboardsExpanded] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(false);

  // Filter navigation based on user role - default to "user" role
  const userRole = (user as any)?.role || "user";

  // Auto-expand sections based on current route
  useEffect(() => {
    if (location.startsWith("/documents") || location.startsWith("/categories") || location.startsWith("/meeting-notes")) {
      setDocumentsExpanded(true);
    }
    if (location.startsWith("/dashboards")) {
      setDashboardsExpanded(true);
    }
    if (location.startsWith("/agent") || location.startsWith("/settings") || location.startsWith("/user-management") || location.startsWith("/role-management") || location.startsWith("/live-chat") || location.startsWith("/integrations")) {
      setAdminExpanded(true);
    }
  }, [location]);

  const isActiveRoute = (path: string) => location === path;

  return (
    <div
      className={cn(
        "bg-gradient-to-b from-navy-900 to-navy-800 border-r border-navy-700 flex flex-col transition-all duration-300 ease-in-out shadow-xl",
        isCollapsed ? "w-16" : "w-64",
      )}
    >
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
                <p className="text-xs text-navy-300">Knowledge Management</p>
              </div>
            </div>
          )}

          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              className="text-navy-300 hover:text-white hover:bg-navy-700/50 transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-2 overflow-y-auto">
        {/* Home */}
        <Link href="/">
          <div
            className={cn(
              "group flex items-center rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer relative",
              isActiveRoute("/")
                ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg"
                : "text-white/90 hover:text-white hover:bg-navy-700/50",
              isCollapsed
                ? "justify-center px-4 py-3"
                : "space-x-3 px-3 py-3",
            )}
          >
            <Home
              className={cn(
                "flex-shrink-0 transition-transform duration-200",
                isActiveRoute("/") ? "w-5 h-5" : "w-4 h-4",
                "group-hover:scale-110",
              )}
            />
            {!isCollapsed && <span className="truncate">Home</span>}

            {isCollapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                Home
              </div>
            )}
          </div>
        </Link>

        {/* Documents Section */}
        <div className="space-y-1">
          <div
            onClick={() => !isCollapsed && setDocumentsExpanded(!documentsExpanded)}
            className={cn(
              "group flex items-center rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer relative",
              (location.startsWith("/documents") || location.startsWith("/categories") || location.startsWith("/meeting-notes"))
                ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg"
                : "text-white/90 hover:text-white hover:bg-navy-700/50",
              isCollapsed
                ? "justify-center px-4 py-3"
                : "space-x-3 px-3 py-3",
            )}
          >
            <FileText
              className={cn(
                "flex-shrink-0 transition-transform duration-200",
                "w-4 h-4",
                "group-hover:scale-110",
              )}
            />
            {!isCollapsed && (
              <>
                <span className="truncate flex-1">Documents</span>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 transition-transform duration-200",
                    documentsExpanded ? "rotate-180" : ""
                  )}
                />
              </>
            )}

            {isCollapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                Documents
              </div>
            )}
          </div>

          {/* Documents Sub-menu */}
          {!isCollapsed && documentsExpanded && (
            <div className="ml-6 space-y-1">
              <Link href="/documents">
                <div
                  className={cn(
                    "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                    isActiveRoute("/documents")
                      ? "bg-blue-500/20 text-blue-300"
                      : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                  )}
                >
                  <span className="truncate">All Documents</span>
                </div>
              </Link>

              <Link href="/categories">
                <div
                  className={cn(
                    "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                    isActiveRoute("/categories")
                      ? "bg-blue-500/20 text-blue-300"
                      : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                  )}
                >
                  <span className="truncate">Categories</span>
                </div>
              </Link>

              <Link href="/meeting-notes">
                <div
                  className={cn(
                    "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                    isActiveRoute("/meeting-notes")
                      ? "bg-blue-500/20 text-blue-300"
                      : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                  )}
                >
                  <span className="truncate">Meeting Notes</span>
                </div>
              </Link>
            </div>
          )}
        </div>

        {/* Dashboards Section */}
        <div className="space-y-1">
          <div
            onClick={() => !isCollapsed && setDashboardsExpanded(!dashboardsExpanded)}
            className={cn(
              "group flex items-center rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer relative",
              location.startsWith("/dashboards")
                ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg"
                : "text-white/90 hover:text-white hover:bg-navy-700/50",
              isCollapsed
                ? "justify-center px-4 py-3"
                : "space-x-3 px-3 py-3",
            )}
          >
            <BarChart3
              className={cn(
                "flex-shrink-0 transition-transform duration-200",
                "w-4 h-4",
                "group-hover:scale-110",
              )}
            />
            {!isCollapsed && (
              <>
                <span className="truncate flex-1">Dashboards</span>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 transition-transform duration-200",
                    dashboardsExpanded ? "rotate-180" : ""
                  )}
                />
              </>
            )}

            {isCollapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                Dashboards
              </div>
            )}
          </div>

          {/* Dashboard Sub-menu */}
          {!isCollapsed && dashboardsExpanded && (
            <div className="ml-6 space-y-1">
              <Link href="/dashboards/document-usage">
                <div
                  className={cn(
                    "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                    isActiveRoute("/dashboards/document-usage")
                      ? "bg-blue-500/20 text-blue-300"
                      : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                  )}
                >
                  <span className="truncate">Document Usage Overview</span>
                </div>
              </Link>

              <Link href="/dashboards/ai-interaction">
                <div
                  className={cn(
                    "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                    isActiveRoute("/dashboards/ai-interaction")
                      ? "bg-blue-500/20 text-blue-300"
                      : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                  )}
                >
                  <span className="truncate">AI Agent Interaction</span>
                </div>
              </Link>

              <Link href="/dashboards/user-activity">
                <div
                  className={cn(
                    "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                    isActiveRoute("/dashboards/user-activity")
                      ? "bg-blue-500/20 text-blue-300"
                      : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                  )}
                >
                  <span className="truncate">User Activity Monitoring</span>
                </div>
              </Link>

              <Link href="/dashboards/system-health">
                <div
                  className={cn(
                    "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                    isActiveRoute("/dashboards/system-health")
                      ? "bg-blue-500/20 text-blue-300"
                      : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                  )}
                >
                  <span className="truncate">System Health & AI Performance</span>
                </div>
              </Link>

              <Link href="/dashboards/security-governance">
                <div
                  className={cn(
                    "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                    isActiveRoute("/dashboards/security-governance")
                      ? "bg-blue-500/20 text-blue-300"
                      : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                  )}
                >
                  <span className="truncate">Security & Governance</span>
                </div>
              </Link>

              <Link href="/dashboards/customer-survey">
                <div
                  className={cn(
                    "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                    isActiveRoute("/dashboards/customer-survey")
                      ? "bg-blue-500/20 text-blue-300"
                      : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                  )}
                >
                  <span className="truncate">Customer Survey</span>
                </div>
              </Link>

              <Link href="/dashboards/user-feedback">
                <div
                  className={cn(
                    "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                    isActiveRoute("/dashboards/user-feedback")
                      ? "bg-blue-500/20 text-blue-300"
                      : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                  )}
                >
                  <span className="truncate">User Feedback</span>
                </div>
              </Link>

              <Link href="/dashboards/ai-response-analysis">
                <div
                  className={cn(
                    "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                    isActiveRoute("/dashboards/ai-response-analysis")
                      ? "bg-blue-500/20 text-blue-300"
                      : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                  )}
                >
                  <span className="truncate">AI Response Analysis</span>
                </div>
              </Link>
            </div>
          )}
        </div>

        {/* Administration & Settings Section (only for admin) */}
        {userRole === "admin" && (
          <div className="space-y-1">
            <div
              onClick={() => !isCollapsed && setAdminExpanded(!adminExpanded)}
              className={cn(
                "group flex items-center rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer relative",
                (location.startsWith("/agent") || location.startsWith("/settings") || location.startsWith("/user-management") || location.startsWith("/role-management") || location.startsWith("/live-chat") || location.startsWith("/integrations"))
                  ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg"
                  : "text-white/90 hover:text-white hover:bg-navy-700/50",
                isCollapsed
                  ? "justify-center px-4 py-3"
                  : "space-x-3 px-3 py-3",
              )}
            >
              <Settings
                className={cn(
                  "flex-shrink-0 transition-transform duration-200",
                  "w-4 h-4",
                  "group-hover:scale-110",
                )}
              />
              {!isCollapsed && (
                <>
                  <span className="truncate flex-1">Administration & Settings</span>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 transition-transform duration-200",
                      adminExpanded ? "rotate-180" : ""
                    )}
                  />
                </>
              )}

              {isCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                  Administration & Settings
                </div>
              )}
            </div>

            {/* Admin Sub-menu */}
            {!isCollapsed && adminExpanded && (
              <div className="ml-6 space-y-1">
                <Link href="/agent-chatbots">
                  <div
                    className={cn(
                      "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                      isActiveRoute("/agent-chatbots")
                        ? "bg-blue-500/20 text-blue-300"
                        : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                    )}
                  >
                    <span className="truncate">Agent Chatbots</span>
                  </div>
                </Link>

                <Link href="/agent-console">
                  <div
                    className={cn(
                      "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                      isActiveRoute("/agent-console")
                        ? "bg-blue-500/20 text-blue-300"
                        : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                    )}
                  >
                    <span className="truncate">Agent Console</span>
                  </div>
                </Link>

                <Link href="/integrations">
                  <div
                    className={cn(
                      "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                      isActiveRoute("/integrations")
                        ? "bg-blue-500/20 text-blue-300"
                        : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                    )}
                  >
                    <span className="truncate">Integrations</span>
                  </div>
                </Link>

                <Link href="/user-management">
                  <div
                    className={cn(
                      "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                      isActiveRoute("/user-management")
                        ? "bg-blue-500/20 text-blue-300"
                        : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                    )}
                  >
                    <span className="truncate">User Management</span>
                  </div>
                </Link>

                <Link href="/role-management">
                  <div
                    className={cn(
                      "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                      isActiveRoute("/role-management")
                        ? "bg-blue-500/20 text-blue-300"
                        : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                    )}
                  >
                    <span className="truncate">Role Management</span>
                  </div>
                </Link>

                <Link href="/live-chat-widget">
                  <div
                    className={cn(
                      "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                      isActiveRoute("/live-chat-widget")
                        ? "bg-blue-500/20 text-blue-300"
                        : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                    )}
                  >
                    <span className="truncate">Live Chat Widget</span>
                  </div>
                </Link>

                <Link href="/settings">
                  <div
                    className={cn(
                      "group flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                      isActiveRoute("/settings")
                        ? "bg-blue-500/20 text-blue-300"
                        : "text-navy-300 hover:text-white hover:bg-navy-700/30",
                    )}
                  >
                    <span className="truncate">Settings</span>
                  </div>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Survey */}
        <Link href="/survey">
          <div
            className={cn(
              "group flex items-center rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer relative",
              isActiveRoute("/survey")
                ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg"
                : "text-white/90 hover:text-white hover:bg-navy-700/50",
              isCollapsed
                ? "justify-center px-4 py-3"
                : "space-x-3 px-3 py-3",
            )}
          >
            <MessageSquare
              className={cn(
                "flex-shrink-0 transition-transform duration-200",
                isActiveRoute("/survey") ? "w-5 h-5" : "w-4 h-4",
                "group-hover:scale-110",
              )}
            />
            {!isCollapsed && <span className="truncate">Survey</span>}

            {isCollapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                Survey
              </div>
            )}
          </div>
        </Link>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-navy-700/50">
        {!isCollapsed && user && (
          <div className="flex items-center space-x-3 px-3 py-2 text-navy-300">
            <div className="w-8 h-8 bg-navy-700 rounded-full flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">
                {String(
                  (user as any)?.firstName || (user as any)?.email || "User",
                )}
              </p>
              <p className="text-xs text-navy-400 capitalize">
                {String((user as any)?.role || "user")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
