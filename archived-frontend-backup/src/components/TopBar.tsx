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
} from "lucide-react";
import kingpowerLogo from "@assets/kingpower_1750867302870.webp";
import { useState } from "react";
import NotificationSystem from "./NotificationSystem";

export default function TopBar() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

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
          {/* <img 
            src={kingpowerLogo} 
            alt="Kingpower" 
            className="h-12 w-auto object-contain"
          /> */}
          <div>
            <h2 className="text-xl font-semibold text-slate-800">ถามได้คับ</h2>
            <p className="text-sm text-slate-500">
              Unleash the power of intelligent knowledge discovery and seamless
              collaboration.
            </p>
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
              className="bg-transparent flex-1 text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
            />
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
                    src={user?.profileImageUrl}
                    alt={`${user?.firstName} ${user?.lastName}`}
                    className="object-cover"
                  />
                  <AvatarFallback className="text-sm">
                    {user?.firstName?.[0]}
                    {user?.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left hidden sm:block">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <div className="flex items-center space-x-2">
                    <p className="text-xs text-slate-500 capitalize">
                      {user?.role || "User"}
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
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
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
