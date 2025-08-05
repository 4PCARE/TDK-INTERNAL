import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Documents from "@/pages/Documents";
import Categories from "@/pages/Categories";
import Upload from "./pages/Upload";
import Settings from "./pages/Settings";
import PythonBackendTest from "./components/PythonBackendTest";
import Search from "@/pages/Search";
import Landing from "@/pages/Landing";
import Admin from "@/pages/Admin";
import CreateAgentChatbot from "@/pages/CreateAgentChatbot";
import AgentChatbots from "@/pages/AgentChatbots";
import AgentConsole from "@/pages/AgentConsole";
import Integrations from "@/pages/Integrations";
import DataConnections from "./pages/DataConnections";
import LineConfiguration from "@/pages/LineConfiguration";
import UserManagement from "@/pages/UserManagement";
import RoleManagement from "@/pages/RoleManagement";
import AuditMonitoring from "@/pages/AuditMonitoring";
import MeetingNotes from "@/pages/MeetingNotes";
import LiveChatWidget from "@/pages/LiveChatWidget";
import Survey from "@/pages/Survey";
import DocumentUsage from "@/pages/dashboards/DocumentUsage";
import AIInteraction from "@/pages/dashboards/AIInteraction";
import UserActivity from "@/pages/dashboards/UserActivity";
import SystemHealth from "@/pages/dashboards/SystemHealth";
import SecurityGovernance from "@/pages/dashboards/SecurityGovernance";
import CustomerSurvey from "@/pages/dashboards/CustomerSurvey";
import UserFeedback from "@/pages/dashboards/UserFeedback";
import AiResponseAnalysis from "@/pages/dashboards/AiResponseAnalysis";
import AIAssistant from "@/pages/AIAssistant";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
      {!isAuthenticated ? (
        <Switch>
          <Route path="/" component={Landing} />
          <Route component={Landing} />
        </Switch>
      ) : (
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/documents" component={Documents} />
          <Route path="/upload" component={Upload} />
          <Route path="/search" component={Search} />
          <Route path="/categories" component={Categories} />
          <Route path="/ai-assistant" component={AIAssistant} />
          <Route path="/meeting-notes" component={MeetingNotes} />
          <Route path="/integrations" component={Integrations} />
          <Route path="/data-connections" component={DataConnections} />
          <Route path="/line-configuration" component={LineConfiguration} />
          <Route path="/admin" component={Admin} />
          <Route path="/user-management" component={UserManagement} />
          <Route path="/settings" component={Settings} />
          <Route path="/agent-chatbots" component={AgentChatbots} />
          <Route path="/create-agent-chatbot" component={CreateAgentChatbot} />
          <Route path="/agent-console" component={AgentConsole} />
          <Route path="/audit-monitoring" component={AuditMonitoring} />
          <Route path="/role-management" component={RoleManagement} />
          <Route path="/live-chat-widget" component={LiveChatWidget} />

          {/* Dashboard Routes */}
          <Route path="/dashboards/document-usage" component={DocumentUsage} />
          <Route path="/dashboards/ai-interaction" component={AIInteraction} />
          <Route path="/dashboards/user-activity" component={UserActivity} />
          <Route path="/dashboards/system-health" component={SystemHealth} />
          <Route path="/dashboards/security-governance" component={SecurityGovernance} />
          <Route path="/dashboards/customer-survey" component={CustomerSurvey} />
          <Route path="/dashboards/user-feedback" component={UserFeedback} />
          <Route path="/dashboards/ai-response-analysis" component={AiResponseAnalysis} />

          <Route path="/user-feedback" component={UserFeedback} />
          <Route path="/ai-interaction" component={AIInteraction} />
          <Route path="/ai-response-analysis" component={AiResponseAnalysis} />
          <Route path="/customer-survey" component={CustomerSurvey} />
          <Route path="/document-demand-insights" component={DocumentUsage} />
          <Route path="/document-usage" component={DocumentUsage} />
          <Route path="/security-governance" component={SecurityGovernance} />
          <Route path="/system-health" component={SystemHealth} />
          <Route path="/user-activity" component={UserActivity} />
          <Route path="/survey" component={Survey} />
          <Route path="/audit-monitoring" component={AuditMonitoring} />
          <Route path="/python-test" element={<PythonBackendTest />} />
          <Route path="/not-found" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      )}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;