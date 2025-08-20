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
import Admin from "@/pages/Admin";
import Settings from "@/pages/Settings";
import Survey from "@/pages/Survey";
import Landing from "@/pages/Landing";
import AIAssistant from "@/pages/AIAssistant";
import Integrations from "@/pages/Integrations";
import LiveChatWidget from "@/pages/LiveChatWidget";
import UserManagement from "@/pages/UserManagement";
import Upload from "@/pages/Upload";
import Search from "@/pages/Search";
import DocumentUsage from "@/pages/dashboards/DocumentUsage";
import AIInteraction from "@/pages/dashboards/AIInteraction";
import UserActivity from "@/pages/dashboards/UserActivity";
import SystemHealth from "@/pages/dashboards/SystemHealth";
import SecurityGovernance from "@/pages/dashboards/SecurityGovernance";
import CustomerSurvey from "@/pages/dashboards/CustomerSurvey";
import UserFeedback from "@/pages/dashboards/UserFeedback";
import AiResponseAnalysis from "@/pages/dashboards/AiResponseAnalysis";
import AuditMonitoring from "@/pages/AuditMonitoring";
import MeetingNotes from "@/pages/MeetingNotes";
import CreateAgentChatbot from "@/pages/CreateAgentChatbot";
import AgentChatbots from "@/pages/AgentChatbots";
import RoleManagement from "@/pages/RoleManagement";
import AgentConsole from "@/pages/AgentConsole";

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

          <Route path="/survey" component={Survey} />
          
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
