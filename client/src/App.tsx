import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Suspense, lazy } from "react";

// Lazy load components to reduce initial bundle size
const NotFound = lazy(() => import("@/pages/not-found"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Documents = lazy(() => import("@/pages/Documents"));
const Categories = lazy(() => import("@/pages/Categories"));
const Upload = lazy(() => import("@/pages/Upload"));
const Search = lazy(() => import("@/pages/Search"));
const Landing = lazy(() => import("@/pages/Landing"));
const Admin = lazy(() => import("@/pages/Admin"));
const CreateAgentChatbot = lazy(() => import("@/pages/CreateAgentChatbot"));
const AgentChatbots = lazy(() => import("@/pages/AgentChatbots"));
const AgentConsole = lazy(() => import("@/pages/AgentConsole"));
const Integrations = lazy(() => import("@/pages/Integrations"));
const DataConnections = lazy(() => import("./pages/DataConnections"));
const LineConfiguration = lazy(() => import("@/pages/LineConfiguration"));
const Settings = lazy(() => import("@/pages/Settings"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const RoleManagement = lazy(() => import("@/pages/RoleManagement"));
const AuditMonitoring = lazy(() => import("@/pages/AuditMonitoring"));
const MeetingNotes = lazy(() => import("@/pages/MeetingNotes"));
const LiveChatWidget = lazy(() => import("@/pages/LiveChatWidget"));
const Survey = lazy(() => import("@/pages/Survey"));
const DocumentUsage = lazy(() => import("@/pages/dashboards/DocumentUsage"));
const AIInteraction = lazy(() => import("@/pages/dashboards/AIInteraction"));
const UserActivity = lazy(() => import("@/pages/dashboards/UserActivity"));
const SystemHealth = lazy(() => import("@/pages/dashboards/SystemHealth"));
const SecurityGovernance = lazy(() => import("@/pages/dashboards/SecurityGovernance"));
const CustomerSurvey = lazy(() => import("@/pages/dashboards/CustomerSurvey"));
const UserFeedback = lazy(() => import("@/pages/dashboards/UserFeedback"));
const AiResponseAnalysis = lazy(() => import("@/pages/dashboards/AiResponseAnalysis"));
const OmnichannelSummarization = lazy(() => import("@/pages/dashboards/OmnichannelSummarization"));
const AIAssistant = lazy(() => import("@/pages/AIAssistant"));

// Loading component
const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p className="text-gray-600">Loading...</p>
    </div>
  </div>
);

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingFallback />;
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
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
          <Route path="/omnichannel-summarization" component={OmnichannelSummarization} />
          <Route path="/customer-survey" component={CustomerSurvey} />
          <Route path="/document-demand-insights" component={DocumentUsage} />
          <Route path="/document-usage" component={DocumentUsage} />
          <Route path="/security-governance" component={SecurityGovernance} />
          <Route path="/system-health" component={SystemHealth} />
          <Route path="/user-activity" component={UserActivity} />
          <Route path="/survey" component={Survey} />
          <Route path="/audit-monitoring" component={AuditMonitoring} />
          <Route path="/not-found" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      )}
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;