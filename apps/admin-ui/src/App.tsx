import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from './components/ui/toaster';
import { useAuth } from './hooks/useAuth';

// Import pages
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import Upload from './pages/Upload';
import Search from './pages/Search';
import AgentChatbots from './pages/AgentChatbots';
import CreateAgentChatbot from './pages/CreateAgentChatbot';
import Categories from './pages/Categories';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import UserManagement from './pages/UserManagement';
import RoleManagement from './pages/RoleManagement';
import AuditMonitoring from './pages/AuditMonitoring';
import Integrations from './pages/Integrations';
import LineConfiguration from './pages/LineConfiguration';
import LiveChatWidget from './pages/LiveChatWidget';
import AgentConsole from './pages/AgentConsole';
import AIAssistant from './pages/AIAssistant';
import Survey from './pages/Survey';
import MeetingNotes from './pages/MeetingNotes';
import DataConnections from './pages/DataConnections';
import NotFound from './pages/not-found';

// Import dashboard pages
import AIInteraction from './pages/dashboards/AIInteraction';
import AiResponseAnalysis from './pages/dashboards/AiResponseAnalysis';
import CustomerSurvey from './pages/dashboards/CustomerSurvey';
import DocumentDemandInsights from './pages/dashboards/DocumentDemandInsights';
import DocumentUsage from './pages/dashboards/DocumentUsage';
import OmnichannelSummarization from './pages/dashboards/OmnichannelSummarization';
import SecurityGovernance from './pages/dashboards/SecurityGovernance';
import SystemHealth from './pages/dashboards/SystemHealth';
import UserActivity from './pages/dashboards/UserActivity';
import UserFeedback from './pages/dashboards/UserFeedback';

import DashboardLayout from './components/Layout/DashboardLayout';
import { queryClient } from './lib/queryClient';

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          {!isAuthenticated ? (
            <>
              <Route path="/" element={<Landing />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            <>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardLayout><Dashboard /></DashboardLayout>} />
              <Route path="/documents" element={<DashboardLayout><Documents /></DashboardLayout>} />
              <Route path="/upload" element={<DashboardLayout><Upload /></DashboardLayout>} />
              <Route path="/search" element={<DashboardLayout><Search /></DashboardLayout>} />
              <Route path="/agent-chatbots" element={<DashboardLayout><AgentChatbots /></DashboardLayout>} />
              <Route path="/agent-chatbots/create" element={<DashboardLayout><CreateAgentChatbot /></DashboardLayout>} />
              <Route path="/categories" element={<DashboardLayout><Categories /></DashboardLayout>} />
              <Route path="/settings" element={<DashboardLayout><Settings /></DashboardLayout>} />
              <Route path="/admin" element={<DashboardLayout><Admin /></DashboardLayout>} />
              <Route path="/admin/users" element={<DashboardLayout><UserManagement /></DashboardLayout>} />
              <Route path="/admin/roles" element={<DashboardLayout><RoleManagement /></DashboardLayout>} />
              <Route path="/admin/audit" element={<DashboardLayout><AuditMonitoring /></DashboardLayout>} />
              <Route path="/integrations" element={<DashboardLayout><Integrations /></DashboardLayout>} />
              <Route path="/integrations/line" element={<DashboardLayout><LineConfiguration /></DashboardLayout>} />
              <Route path="/live-chat" element={<DashboardLayout><LiveChatWidget /></DashboardLayout>} />
              <Route path="/agent-console" element={<DashboardLayout><AgentConsole /></DashboardLayout>} />
              <Route path="/ai-assistant" element={<DashboardLayout><AIAssistant /></DashboardLayout>} />
              <Route path="/survey" element={<DashboardLayout><Survey /></DashboardLayout>} />
              <Route path="/meeting-notes" element={<DashboardLayout><MeetingNotes /></DashboardLayout>} />
              <Route path="/data-connections" element={<DashboardLayout><DataConnections /></DashboardLayout>} />

              {/* Dashboard routes */}
              <Route path="/dashboards/ai-interaction" element={<DashboardLayout><AIInteraction /></DashboardLayout>} />
              <Route path="/dashboards/ai-response-analysis" element={<DashboardLayout><AiResponseAnalysis /></DashboardLayout>} />
              <Route path="/dashboards/customer-survey" element={<DashboardLayout><CustomerSurvey /></DashboardLayout>} />
              <Route path="/dashboards/document-demand-insights" element={<DashboardLayout><DocumentDemandInsights /></DashboardLayout>} />
              <Route path="/dashboards/document-usage" element={<DashboardLayout><DocumentUsage /></DashboardLayout>} />
              <Route path="/dashboards/omnichannel-summarization" element={<DashboardLayout><OmnichannelSummarization /></DashboardLayout>} />
              <Route path="/dashboards/security-governance" element={<DashboardLayout><SecurityGovernance /></DashboardLayout>} />
              <Route path="/dashboards/system-health" element={<DashboardLayout><SystemHealth /></DashboardLayout>} />
              <Route path="/dashboards/user-activity" element={<DashboardLayout><UserActivity /></DashboardLayout>} />
              <Route path="/dashboards/user-feedback" element={<DashboardLayout><UserFeedback /></DashboardLayout>} />

              <Route path="*" element={<DashboardLayout><NotFound /></DashboardLayout>} />
            </>
          )}
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;