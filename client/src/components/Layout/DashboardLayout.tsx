import { useState } from "react";
import Sidebar from "@/components/Layout/Sidebar";
import TopBar from "@/components/TopBar";
import { useIsMobile } from "@/hooks/use-mobile";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isMobile = useIsMobile();

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
          isMobile={isMobile}
          isSidebarCollapsed={isCollapsed}
        />

        <main className="p-6 bg-gray-50">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

    {/* Ask HR V5 Widget Integration */}
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            if (window.askHRWidgetLoaded) return;
            window.askHRWidgetLoaded = true;

            var script = document.createElement('script');
            script.src = '/widget/YmnYTsTPY0A1HG-Z/embed.js?v=' + Date.now();
            script.async = true;
            script.onload = function() {
              console.log('✅ Ask HR V5 widget loaded in dashboard');
            };
            script.onerror = function() {
              console.error('❌ Failed to load Ask HR V5 widget in dashboard');
            };
            document.head.appendChild(script);
          })();
        `
      }}
    />
  </div>
  );
}