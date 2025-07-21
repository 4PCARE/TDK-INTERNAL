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
} from "lucide-react";

const allNavigation = [
  { name: "Home", href: "/", icon: Home, roles: ["admin", "user"] },
  // { name: "Upload Documents", href: "/upload", icon: Upload, roles: ["admin", "user"] },
  // { name: "My Documents", href: "/documents", icon: FolderOpen, roles: ["admin", "user"] },
  // { name: "Search & Discovery", href: "/search", icon: Search, roles: ["admin", "user"] },
  // { name: "AI Assistant", href: "/ai-assistant", icon: MessageSquare, roles: ["admin", "user"] },
  {
    name: "Meeting Notes",
    href: "/meeting-notes",
    icon: Video,
    roles: ["admin", "user"],
  },
  {
    name: "Agent Chatbots",
    href: "/agent-chatbots",
    icon: Bot,
    roles: ["admin", "user"],
  },
  {
    name: "Agent Console",
    href: "/agent-console",
    icon: UserCheck,
    roles: ["admin", "user"],
  },
  {
    name: "Integrations",
    href: "/integrations",
    icon: Building,
    roles: ["admin", "user"],
  },
  {
    name: "Categories & Tags",
    href: "/categories",
    icon: Tags,
    roles: ["admin", "user"],
  },
  {
    name: "User Management",
    href: "/user-management",
    icon: Users,
    roles: ["admin"],
  },
  {
    name: "Role Management",
    href: "/role-management",
    icon: Users,
    roles: ["admin"],
  },
  {
    name: "Live Chat Widget",
    href: "/live-chat-widget",
    icon: MessageSquare,
    roles: ["admin"],
  },
  // {
  //   name: "User Feedback",
  //   href: "/user-feedback",
  //   icon: BarChart3,
  //   roles: ["admin"],
  // },
  { name: "Settings", href: "/settings", icon: Settings, roles: ["admin"] },
];

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();

  // Filter navigation based on user role - default to "user" role
  const userRole = (user as any)?.role || "user";
  const navigation = allNavigation.filter((item) => {
    return item.roles.includes(userRole);
  });

  return (
    <div className={cn(
      "bg-gradient-to-b from-navy-900 to-navy-800 border-r border-navy-700 flex flex-col transition-all duration-300 ease-in-out shadow-xl",
      isCollapsed ? "w-16" : "w-64"
    )}>
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
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={cn(
                  "group flex items-center px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer relative",
                  isActive
                    ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg"
                    : "text-navy-200 hover:text-white hover:bg-navy-700/50",
                  isCollapsed ? "justify-center" : "space-x-3"
                )}
              >
                <item.icon className={cn(
                  "flex-shrink-0 transition-transform duration-200",
                  isActive ? "w-5 h-5" : "w-4 h-4",
                  "group-hover:scale-110"
                )} />
                
                {!isCollapsed && (
                  <span className="truncate">{item.name}</span>
                )}
                
                {isActive && (
                  <div className="absolute inset-y-0 left-0 w-1 bg-white rounded-r-full" />
                )}
                
                {/* Tooltip for collapsed state */}
                {isCollapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                    {item.name}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
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
                {(user as any)?.firstName || (user as any)?.email || "User"}
              </p>
              <p className="text-xs text-navy-400 capitalize">
                {(user as any)?.role || "user"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
