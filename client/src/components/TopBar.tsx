import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  Bell,
  ChevronDown,
  Settings,
  LogOut,
  User,
  Menu,
} from "lucide-react";
import kingpowerLogo from "@assets/kingpower_1750867302870.webp";
import { useState } from "react";
import NotificationSystem from "./NotificationSystem";
import { useIsMobile } from "@/hooks/use-mobile";

interface TopBarProps {
  isSidebarCollapsed?: boolean;
  onMobileMenuToggle?: () => void;
}

export default function TopBar({ isSidebarCollapsed = false, onMobileMenuToggle }: TopBarProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const isMobile = useIsMobile();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/documents?search=${encodeURIComponent(searchQuery)}`;
    }
  };

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {isMobile && (
            <Button variant="ghost" size="icon" onClick={onMobileMenuToggle}>
              <Menu className="h-5 w-5" />
            </Button>
          )}
          {/* <img 
            src={kingpowerLogo} 
            alt="Kingpower" 
            className="h-12 w-auto object-contain"
          /> */}
          <div className="flex items-center space-x-3">
            <img 
              src="/tdk-logo.png" 
              alt="TDK Logo" 
              className="w-16 h-16 rounded-lg object-contain bg-white/10 p-2"
            />
            <div>
              <h2 className="text-2xl font-bold text-slate-800">TDK</h2>
              <p className="text-sm text-slate-500 hidden xl:block">
                Mind of Knowledge, Voice of AI
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Search Bar */}
          <form
            onSubmit={handleSearch}
            className="hidden md:flex items-center space-x-2 bg-slate-100 rounded-lg px-3 py-2 w-80"
          >
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search documents, tags, or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent flex-1 text-sm text-slate-700 placeholder-slate-400 focus:outline-none transition-all duration-200"
              autoComplete="off"
              spellCheck={false}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                ×
              </button>
            )}
            <kbd className="px-1.5 py-0.5 text-xs text-slate-400 bg-slate-200 rounded">
              ⌘K
            </kbd>
          </form>

          {/* Quick Actions */}
          <Button
            className="bg-primary text-white hover:bg-blue-700 flex items-center space-x-2"
            onClick={() => (window.location.href = "/upload")}
          >
            <Plus className="w-4 h-4" />
            <span>Upload Documents</span>
          </Button>

          {/* Notifications */}
          <NotificationSystem />

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center space-x-3 px-3 py-2"
              >
                <Avatar className="w-8 h-8">
                  <AvatarImage
                    src={(user as any)?.profileImageUrl}
                    alt={(user as any)?.name || `${(user as any)?.firstName || ''} ${(user as any)?.lastName || ''}`.trim() || (user as any)?.email || 'User'}
                    className="object-cover"
                  />
                  <AvatarFallback className="text-sm">
                    {((user as any)?.firstName || (user as any)?.name || (user as any)?.email || 'U')?.[0]}
                    {((user as any)?.lastName || (user as any)?.name?.split(' ')[1] || '')?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left hidden sm:block">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {(user as any)?.name || `${(user as any)?.firstName || ''} ${(user as any)?.lastName || ''}`.trim() || (user as any)?.email || 'User'}
                  </p>
                  <div className="flex items-center space-x-2">
                    <p className="text-xs text-slate-500 capitalize">
                      {(user as any)?.role || "User"}
                    </p>
                    {(user as any)?.departmentName && (
                      <Badge variant="outline" className="text-xs">
                        {(user as any).departmentName}
                      </Badge>
                    )}
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {(user as any)?.name || `${(user as any)?.firstName || ''} ${(user as any)?.lastName || ''}`.trim() || (user as any)?.email || 'User'}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {(user as any)?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => (window.location.href = "/settings")}
              >
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => (window.location.href = "/settings")}
              >
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}