import { useState, useEffect } from "react";
import Sidebar from "../components/Layout/Sidebar";
import TopBar from "../components/TopBar";
import { useIsMobile } from "../../hooks/use-mobile";

// Global type declaration for widget loading state
declare global {
  interface Window {
    askHRWidgetLoaded?: boolean;
  }
}

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isMobile = useIsMobile();

  // Load the Ask HR V5 widget
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.askHRWidgetLoaded) {
      window.askHRWidgetLoaded = true;
      
      const script = document.createElement('script');
      script.src = '/widget/YmnYTsTPY0A1HG-Z/embed.js?v=' + Date.now();
      script.async = true;
      script.onload = () => {
        console.log('✅ Ask HR V5 widget loaded in dashboard');
      };
      script.onerror = () => {
        console.error('❌ Failed to load Ask HR V5 widget in dashboard');
      };
      document.head.appendChild(script);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar 
        isMobileOpen={isMobileMenuOpen} 
        onMobileClose={() => setIsMobileMenuOpen(false)}
        onOpenChat={() => setIsChatModalOpen(true)}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
      />

      <div 
        className={`transition-all duration-300 ${
          !isMobile && !isCollapsed ? 'lg:ml-64' : !isMobile && isCollapsed ? 'lg:ml-16' : ''
        }`}
      >
        <TopBar 
          onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}

          isSidebarCollapsed={isCollapsed}
        />

        <main className="p-6 bg-gray-50">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

    
  </div>
  );
}