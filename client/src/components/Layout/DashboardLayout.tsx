import { useState } from "react";
import Sidebar from "@/components/Layout/Sidebar";
import TopBar from "@/components/TopBar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const isMobile = useIsMobile();
  const [isCollapsed, setIsCollapsed] = useState(isMobile); // Start collapsed on mobile

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar 
        isMobileOpen={isMobileMenuOpen} 
        onMobileClose={() => setIsMobileMenuOpen(false)}
        onOpenChat={() => setIsChatModalOpen(true)}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header with Hamburger */}
        {isMobile && (
          <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMobileMenuOpen(true)}
              className="text-gray-600 hover:text-gray-900"
            >
              <Menu className="h-6 w-6" />
            </Button>
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-blue-600 rounded flex items-center justify-center">
                <span className="text-xs font-bold text-white">T</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">TDK</span>
            </div>
          </div>
        )}
        
        {/* Desktop TopBar */}
        {!isMobile && <TopBar />}
        
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}