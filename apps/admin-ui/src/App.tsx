import { Router, Route, Switch, Redirect } from 'wouter';
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
        {!isAuthenticated ? (
          <Switch>
            <Route path="/" component={Landing} />
            <Route>{() => <Redirect to="/" />}</Route>
          </Switch>
        ) : (
          <Switch>
            <Route path="/">{() => <Redirect to="/dashboard" />}</Route>
            <Route path="/dashboard">
              <DashboardLayout><Dashboard /></DashboardLayout>
            </Route>
            <Route path="/documents">
              <DashboardLayout><Documents /></DashboardLayout>
            </Route>
            <Route path="/upload">
              <DashboardLayout><Upload /></DashboardLayout>
            </Route>
            <Route path="/search">
              <DashboardLayout><Search /></DashboardLayout>
            </Route>
            <Route path="/agent-chatbots">
              <DashboardLayout><AgentChatbots /></DashboardLayout>
            </Route>
            <Route path="/agent-chatbots/create">
              <DashboardLayout><CreateAgentChatbot /></DashboardLayout>
            </Route>
            <Route path="/categories">
              <DashboardLayout><Categories /></DashboardLayout>
            </Route>
            <Route path="/settings">
              <DashboardLayout><Settings /></DashboardLayout>
            </Route>
            <Route path="/admin">
              <DashboardLayout><Admin /></DashboardLayout>
            </Route>
            <Route path="/admin/users">
              <DashboardLayout><UserManagement /></DashboardLayout>
            </Route>
            <Route path="/admin/roles">
              <DashboardLayout><RoleManagement /></DashboardLayout>
            </Route>
            <Route path="/admin/audit">
              <DashboardLayout><AuditMonitoring /></DashboardLayout>
            </Route>
            <Route path="/integrations">
              <DashboardLayout><Integrations /></DashboardLayout>
            </Route>
            <Route path="/integrations/line">
              <DashboardLayout><LineConfiguration /></DashboardLayout>
            </Route>
            <Route path="/live-chat">
              <DashboardLayout><LiveChatWidget /></DashboardLayout>
            </Route>
            <Route path="/agent-console">
              <DashboardLayout><AgentConsole /></DashboardLayout>
            </Route>
            <Route path="/ai-assistant">
              <DashboardLayout><AIAssistant /></DashboardLayout>
            </Route>
            <Route path="/survey">
              <DashboardLayout><Survey /></DashboardLayout>
            </Route>
            <Route path="/meeting-notes">
              <DashboardLayout><MeetingNotes /></DashboardLayout>
            </Route>
            <Route path="/data-connections">
              <DashboardLayout><DataConnections /></DashboardLayout>
            </Route>
            <Route path="/dashboards/ai-interaction">
              <DashboardLayout><AIInteraction /></DashboardLayout>
            </Route>
            <Route path="/dashboards/ai-response-analysis">
              <DashboardLayout><AiResponseAnalysis /></DashboardLayout>
            </Route>
            <Route path="/dashboards/customer-survey">
              <DashboardLayout><CustomerSurvey /></DashboardLayout>
            </Route>
            <Route path="/dashboards/document-demand-insights">
              <DashboardLayout><DocumentDemandInsights /></DashboardLayout>
            </Route>
            <Route path="/dashboards/document-usage">
              <DashboardLayout><DocumentUsage /></DashboardLayout>
            </Route>
            <Route path="/dashboards/omnichannel-summarization">
              <DashboardLayout><OmnichannelSummarization /></DashboardLayout>
            </Route>
            <Route path="/dashboards/security-governance">
              <DashboardLayout><SecurityGovernance /></DashboardLayout>
            </Route>
            <Route path="/dashboards/system-health">
              <DashboardLayout><SystemHealth /></DashboardLayout>
            </Route>
            <Route path="/dashboards/user-activity">
              <DashboardLayout><UserActivity /></DashboardLayout>
            </Route>
            <Route path="/dashboards/user-feedback">
              <DashboardLayout><UserFeedback /></DashboardLayout>
            </Route>
            <Route>
              <DashboardLayout><NotFound /></DashboardLayout>
            </Route>
          </Switch>
        )}
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;