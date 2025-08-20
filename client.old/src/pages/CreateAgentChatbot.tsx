import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Bot,
  Settings,
  MessageSquare,
  FileText,
  Check,
  X,
  Search,
  Plus,
  ArrowLeft,
  Brain,
  Shield,
  User,
  Briefcase,
  Heart,
  Zap,
  Target,
  AlertTriangle,
  Info,
  BookOpen,
  Lightbulb,
} from "lucide-react";
import { Link } from "wouter";

// Schema for form validation
const createAgentSchema = z.object({
  name: z.string().min(1, "Agent name is required"),
  description: z.string().optional(),
  systemPrompt: z.string().min(1, "System prompt is required"),
  personality: z.string().min(1, "Personality is required"),
  profession: z.string().min(1, "Profession is required"),
  responseStyle: z.string().min(1, "Response style is required"),
  specialSkills: z.array(z.string()).default([]),
  // Basic Guardrails (legacy support)
  contentFiltering: z.boolean().default(true),
  toxicityPrevention: z.boolean().default(true),
  privacyProtection: z.boolean().default(true),
  factualAccuracy: z.boolean().default(true),
  responseLength: z.enum(["short", "medium", "long"]).default("medium"),
  allowedTopics: z.array(z.string()).default([]),
  blockedTopics: z.array(z.string()).default([]),
  // Advanced Guardrails Configuration
  guardrailsEnabled: z.boolean().default(false),
  guardrailsConfig: z.object({
    contentFiltering: z.object({
      enabled: z.boolean().default(true),
      blockProfanity: z.boolean().default(true),
      blockHateSpeech: z.boolean().default(true),
      blockSexualContent: z.boolean().default(true),
      blockViolence: z.boolean().default(true),
      customBlockedWords: z.array(z.string()).default([]),
    }).optional(),
    topicControl: z.object({
      enabled: z.boolean().default(false),
      allowedTopics: z.array(z.string()).default([]),
      blockedTopics: z.array(z.string()).default([]),
      strictMode: z.boolean().default(false),
    }).optional(),
    privacyProtection: z.object({
      enabled: z.boolean().default(true),
      blockPersonalInfo: z.boolean().default(true),
      blockFinancialInfo: z.boolean().default(true),
      blockHealthInfo: z.boolean().default(true),
      maskPhoneNumbers: z.boolean().default(true),
      maskEmails: z.boolean().default(true),
    }).optional(),
    responseQuality: z.object({
      enabled: z.boolean().default(true),
      maxResponseLength: z.number().default(1000),
      minResponseLength: z.number().default(10),
      requireSourceCitation: z.boolean().default(false),
      preventHallucination: z.boolean().default(true),
    }).optional(),
    toxicityPrevention: z.object({
      enabled: z.boolean().default(true),
      toxicityThreshold: z.number().min(0).max(1).default(0.3),
      blockSarcasm: z.boolean().default(false),
      blockInsults: z.boolean().default(true),
    }).optional(),
    businessContext: z.object({
      enabled: z.boolean().default(false),
      stayOnBrand: z.boolean().default(true),
      requireProfessionalTone: z.boolean().default(true),
      blockCompetitorMentions: z.boolean().default(false),
      companyName: z.string().optional(),
      brandGuidelines: z.string().optional(),
    }).optional(),
  }).optional(),
  // Memory Configuration
  memoryEnabled: z.boolean().default(false),
  memoryLimit: z.number().min(1).max(50).default(10),
});

type CreateAgentForm = z.infer<typeof createAgentSchema>;

interface Document {
  id: number;
  name: string;
  description?: string;
  summary?: string;
  categoryName?: string;
}

export default function CreateAgentChatbot() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();

  const [selectedDocuments, setSelectedDocuments] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [isTestingAgent, setIsTestingAgent] = useState(false);
  const [agentStatus, setAgentStatus] = useState<"testing" | "published">("testing");
  const [testChatHistory, setTestChatHistory] = useState<Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
  }>>([]);
  const [isTestChatMode, setIsTestChatMode] = useState(false);
  const chatHistoryRef = useRef<HTMLDivElement>(null);

  // Check if we're editing an existing agent
  const urlParams = new URLSearchParams(window.location.search);
  const editAgentId = urlParams.get("edit");
  const isEditing = !!editAgentId;

  // Form setup
  const form = useForm<CreateAgentForm>({
    resolver: zodResolver(createAgentSchema),
    defaultValues: {
      name: "",
      description: "",
      systemPrompt:
        "You are a helpful AI assistant. Answer questions based on the provided documents and be polite and professional.",
      personality: "",
      profession: "",
      responseStyle: "",
      specialSkills: [],
      contentFiltering: true,
      toxicityPrevention: true,
      privacyProtection: true,
      factualAccuracy: true,
      responseLength: "medium",
      allowedTopics: [],
      blockedTopics: [],
    },
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  // Fetch documents for RAG selection
  const { data: documents = [] } = useQuery({
    queryKey: ["/api/documents"],
    enabled: isAuthenticated,
    retry: false,
  }) as { data: Document[] };

  // Fetch agent data for editing
  const { data: existingAgent, isLoading: isLoadingAgent } = useQuery({
    queryKey: [`/api/agent-chatbots/${editAgentId}`],
    enabled: isAuthenticated && isEditing,
    retry: false,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    staleTime: 0, // Always fetch fresh data
  });

  // Fetch agent documents for editing
  const { data: agentDocuments = [] } = useQuery({
    queryKey: [`/api/agent-chatbots/${editAgentId}/documents`],
    enabled: isAuthenticated && isEditing,
    retry: false,
  });

  // Load existing agent data into form when editing
  useEffect(() => {
    if (isEditing && existingAgent) {
      const agent = existingAgent as any;
      console.log("Loading existing agent data:", JSON.stringify(agent, null, 2));
      console.log("Agent guardrails config from DB:", agent.guardrailsConfig);
      
      form.reset({
        name: agent.name || "",
        description: agent.description || "",
        systemPrompt:
          agent.systemPrompt ||
          "You are a helpful AI assistant. Answer questions based on the provided documents and be polite and professional.",
        personality: agent.personality || "",
        profession: agent.profession || "",
        responseStyle: agent.responseStyle || "",
        specialSkills: agent.specialSkills || [],
        contentFiltering: agent.contentFiltering !== false,
        toxicityPrevention: agent.toxicityPrevention !== false,
        privacyProtection: agent.privacyProtection !== false,
        factualAccuracy: agent.factualAccuracy !== false,
        responseLength: agent.responseLength || "medium",
        allowedTopics: agent.allowedTopics || [],
        blockedTopics: agent.blockedTopics || [],
        memoryEnabled: agent.memoryEnabled || false,
        memoryLimit: agent.memoryLimit || 10,
        // Advanced Guardrails Configuration
        guardrailsEnabled: (agent.guardrailsConfig !== null && agent.guardrailsConfig !== undefined),
        guardrailsConfig: agent.guardrailsConfig ? {
          contentFiltering: {
            enabled: agent.guardrailsConfig.contentFiltering?.enabled ?? true,
            blockProfanity: agent.guardrailsConfig.contentFiltering?.blockProfanity ?? true,
            blockHateSpeech: agent.guardrailsConfig.contentFiltering?.blockHateSpeech ?? true,
            blockSexualContent: agent.guardrailsConfig.contentFiltering?.blockSexualContent ?? true,
            blockViolence: agent.guardrailsConfig.contentFiltering?.blockViolence ?? true,
            customBlockedWords: agent.guardrailsConfig.contentFiltering?.customBlockedWords ?? [],
          },
          topicControl: {
            enabled: agent.guardrailsConfig.topicControl?.enabled ?? false,
            allowedTopics: agent.guardrailsConfig.topicControl?.allowedTopics ?? [],
            blockedTopics: agent.guardrailsConfig.topicControl?.blockedTopics ?? [],
            strictMode: agent.guardrailsConfig.topicControl?.strictMode ?? false,
          },
          privacyProtection: {
            enabled: agent.guardrailsConfig.privacyProtection?.enabled ?? true,
            blockPersonalInfo: agent.guardrailsConfig.privacyProtection?.blockPersonalInfo ?? true,
            blockFinancialInfo: agent.guardrailsConfig.privacyProtection?.blockFinancialInfo ?? true,
            blockHealthInfo: agent.guardrailsConfig.privacyProtection?.blockHealthInfo ?? true,
            maskPhoneNumbers: agent.guardrailsConfig.privacyProtection?.maskPhoneNumbers ?? true,
            maskEmails: agent.guardrailsConfig.privacyProtection?.maskEmails ?? true,
          },
          responseQuality: {
            enabled: agent.guardrailsConfig.responseQuality?.enabled ?? true,
            maxResponseLength: agent.guardrailsConfig.responseQuality?.maxResponseLength ?? 1000,
            minResponseLength: agent.guardrailsConfig.responseQuality?.minResponseLength ?? 10,
            requireSourceCitation: agent.guardrailsConfig.responseQuality?.requireSourceCitation ?? false,
            preventHallucination: agent.guardrailsConfig.responseQuality?.preventHallucination ?? true,
          },
          toxicityPrevention: {
            enabled: agent.guardrailsConfig.toxicityPrevention?.enabled ?? true,
            toxicityThreshold: agent.guardrailsConfig.toxicityPrevention?.toxicityThreshold ?? 0.3,
            blockSarcasm: agent.guardrailsConfig.toxicityPrevention?.blockSarcasm ?? false,
            blockInsults: agent.guardrailsConfig.toxicityPrevention?.blockInsults ?? true,
            blockAggressiveLanguage: agent.guardrailsConfig.toxicityPrevention?.blockAggressiveLanguage ?? true,
          },
          businessContext: {
            enabled: agent.guardrailsConfig.businessContext?.enabled ?? false,
            companyName: agent.guardrailsConfig.businessContext?.companyName ?? "",
            brandVoice: agent.guardrailsConfig.businessContext?.brandVoice ?? "professional",
            industryContext: agent.guardrailsConfig.businessContext?.industryContext ?? "",
            complianceRequirements: agent.guardrailsConfig.businessContext?.complianceRequirements ?? [],
          },
        } : {
          contentFiltering: {
            enabled: true,
            blockProfanity: true,
            blockHateSpeech: true,
            blockSexualContent: true,
            blockViolence: true,
            customBlockedWords: [],
          },
          topicControl: {
            enabled: false,
            allowedTopics: [],
            blockedTopics: [],
            strictMode: false,
          },
          privacyProtection: {
            enabled: true,
            blockPersonalInfo: true,
            blockFinancialInfo: true,
            blockHealthInfo: true,
            maskPhoneNumbers: true,
            maskEmails: true,
          },
          responseQuality: {
            enabled: true,
            maxResponseLength: 1000,
            minResponseLength: 10,
            requireSourceCitation: false,
            preventHallucination: true,
          },
          toxicityPrevention: {
            enabled: true,
            toxicityThreshold: 0.3,
            blockSarcasm: false,
            blockInsults: true,
            blockAggressiveLanguage: true,
          },
          businessContext: {
            enabled: false,
            companyName: "",
            brandVoice: "professional",
            industryContext: "",
            complianceRequirements: [],
          },
        },
      });

      // Load selected documents
      const docs = agentDocuments as any[];
      if (docs && docs.length > 0) {
        setSelectedDocuments(docs.map((doc: any) => doc.documentId));
      }
    }
  }, [existingAgent, agentDocuments, isEditing, form]);

  // Test agent mutation (for chat conversation)
  const testAgentMutation = useMutation({
    mutationFn: async (testData: { 
      message: string; 
      agentConfig: CreateAgentForm;
      chatHistory?: Array<{ role: "user" | "assistant"; content: string; }>;
    }) => {
      const response = await apiRequest("POST", "/api/agent-chatbots/test-chat", {
        message: testData.message,
        agentConfig: testData.agentConfig,
        documentIds: selectedDocuments,
        chatHistory: testData.chatHistory || [],
      });
      return await response.json();
    },
    onSuccess: (data) => {
      console.log("Test agent response received:", data);
      
      if (isTestChatMode) {
        // Add user message and AI response to chat history
        const userMessage = { role: "user" as const, content: testMessage, timestamp: new Date() };
        const assistantMessage = { role: "assistant" as const, content: data.response, timestamp: new Date() };
        setTestChatHistory(prev => [...prev, userMessage, assistantMessage]);
        setTestMessage(""); // Clear input for next message
        
        // Auto-scroll to bottom after response
        setTimeout(() => {
          if (chatHistoryRef.current) {
            chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
          }
        }, 100);
      } else {
        setTestResponse(data.response || "No response received");
      }
      
      setIsTestingAgent(false);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to test agent",
        variant: "destructive",
      });
      setTestResponse("Error testing agent. Please try again.");
      setIsTestingAgent(false);
    },
  });

  // Create/Update agent mutation
  const saveAgentMutation = useMutation({
    mutationFn: async (
      agentData: CreateAgentForm & { documentIds: number[] },
    ) => {
      if (isEditing) {
        return await apiRequest(
          "PUT",
          `/api/agent-chatbots/${editAgentId}`,
          agentData,
        );
      } else {
        return await apiRequest("POST", "/api/agent-chatbots", agentData);
      }
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: isEditing
          ? "Agent chatbot updated successfully!"
          : "Agent chatbot created successfully!",
      });
      // Clear form and navigate back
      form.reset();
      setSelectedDocuments([]);
      
      // Invalidate comprehensive cache keys to ensure frontend updates
      queryClient.invalidateQueries({ queryKey: ["/api/agent-chatbots"] });
      
      // If editing, also invalidate the specific agent's cache
      if (isEditing && editAgentId) {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/agent-chatbots/${editAgentId}`] 
        });
        queryClient.invalidateQueries({ 
          queryKey: [`/api/agent-chatbots/${editAgentId}/documents`] 
        });
      }
      
      // Invalidate all agent-related cache to ensure complete refresh
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          return typeof queryKey === "string" && queryKey.includes("/api/agent-chatbots");
        }
      });
      
      window.history.back();
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: isEditing
          ? "Failed to update agent chatbot"
          : "Failed to create agent chatbot",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateAgentForm) => {
    // Build the guardrails configuration object
    const guardrailsConfig = data.guardrailsEnabled ? data.guardrailsConfig : null;
    
    const finalData = {
      ...data,
      documentIds: selectedDocuments,
      guardrailsConfig,
    };
    
    console.log("Form submission data:", JSON.stringify(finalData, null, 2));
    console.log("Guardrails enabled:", data.guardrailsEnabled);
    console.log("Guardrails config:", data.guardrailsConfig);
    
    saveAgentMutation.mutate(finalData);
  };

  const handleTestAgent = () => {
    if (!testMessage.trim()) {
      toast({
        title: "Error",
        description: "Please enter a test message",
        variant: "destructive",
      });
      return;
    }

    const currentFormData = form.getValues();
    
    // Basic validation for required fields
    if (!currentFormData.name || !currentFormData.personality || !currentFormData.profession || !currentFormData.responseStyle) {
      toast({
        title: "Error", 
        description: "Please fill in all required fields in Overview tab before testing",
        variant: "destructive",
      });
      return;
    }

    // Build guardrails configuration for testing (same as deployment)
    const guardrailsConfig = currentFormData.guardrailsEnabled ? currentFormData.guardrailsConfig : null;
    
    const testConfigData = {
      ...currentFormData,
      guardrailsConfig: guardrailsConfig, // Include guardrails config for testing
    };

    console.log("Starting test agent with:", { message: testMessage, config: testConfigData, documents: selectedDocuments });
    console.log("Guardrails enabled for test:", currentFormData.guardrailsEnabled);
    console.log("Guardrails config for test:", guardrailsConfig);
    
    setIsTestingAgent(true);
    
    if (!isTestChatMode) {
      setTestResponse("");
    }
    
    // Prepare chat history for API call (respecting memory limit)
    const memoryLimit = currentFormData.memoryLimit || 10;
    const recentHistory = testChatHistory.slice(-memoryLimit).map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    testAgentMutation.mutate({
      message: testMessage,
      agentConfig: testConfigData,
      chatHistory: isTestChatMode ? recentHistory : undefined,
    });
  };

  const startChatTest = () => {
    setIsTestChatMode(true);
    setTestChatHistory([]);
    setTestMessage("");
    setTestResponse("");
  };

  const stopChatTest = () => {
    setIsTestChatMode(false);
    setTestChatHistory([]);
    setTestMessage("");
    setTestResponse("");
  };

  // Document toggle mutations for real-time updates
  const addDocumentMutation = useMutation({
    mutationFn: async (documentId: number) => {
      if (isEditing && editAgentId) {
        return await apiRequest("POST", `/api/agent-chatbots/${editAgentId}/documents/${documentId}`);
      }
    },
    onSuccess: () => {
      if (isEditing && editAgentId) {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/agent-chatbots/${editAgentId}/documents`] 
        });
        queryClient.invalidateQueries({ queryKey: ["/api/agent-chatbots"] });
      }
    },
  });

  const removeDocumentMutation = useMutation({
    mutationFn: async (documentId: number) => {
      if (isEditing && editAgentId) {
        return await apiRequest("DELETE", `/api/agent-chatbots/${editAgentId}/documents/${documentId}`);
      }
    },
    onSuccess: () => {
      if (isEditing && editAgentId) {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/agent-chatbots/${editAgentId}/documents`] 
        });
        queryClient.invalidateQueries({ queryKey: ["/api/agent-chatbots"] });
      }
    },
  });

  const toggleDocument = (documentId: number) => {
    const isSelected = selectedDocuments.includes(documentId);
    
    if (isEditing && editAgentId) {
      // For editing mode, use API calls for real-time updates
      if (isSelected) {
        removeDocumentMutation.mutate(documentId);
      } else {
        addDocumentMutation.mutate(documentId);
      }
    }
    
    // Update local state immediately for UI responsiveness
    setSelectedDocuments((prev) =>
      prev.includes(documentId)
        ? prev.filter((id) => id !== documentId)
        : [...prev, documentId],
    );
  };

  const filteredDocuments = documents.filter(
    (doc) =>
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Mock LineOA channels
  const lineOaChannels = [
    { id: "U1234567890", name: "4urney HR", description: "HR Support Channel" },
    {
      id: "U0987654321",
      name: "Customer Support",
      description: "General Support",
    },
    {
      id: "U1122334455",
      name: "Sales Inquiry",
      description: "Sales Team Channel",
    },
  ];

  // Personality options
  const personalityOptions = [
    {
      id: "friendly",
      label: "Friendly",
      description: "Warm, approachable, and conversational",
      icon: Heart,
    },
    {
      id: "professional",
      label: "Professional",
      description: "Formal, business-like, and authoritative",
      icon: Briefcase,
    },
    {
      id: "energetic",
      label: "Energetic",
      description: "Enthusiastic, dynamic, and motivating",
      icon: Zap,
    },
    {
      id: "empathetic",
      label: "Empathetic",
      description: "Understanding, supportive, and compassionate",
      icon: User,
    },
    {
      id: "analytical",
      label: "Analytical",
      description: "Data-driven, logical, and systematic",
      icon: Target,
    },
    {
      id: "creative",
      label: "Creative",
      description: "Innovative, imaginative, and inspiring",
      icon: Lightbulb,
    },
  ];

  // Profession options
  const professionOptions = [
    {
      id: "sales",
      label: "Sales Representative",
      description: "Focused on customer acquisition and relationship building",
    },
    {
      id: "analyst",
      label: "Business Analyst",
      description: "Data analysis and insights generation",
    },
    {
      id: "marketing",
      label: "Marketing Specialist",
      description: "Brand promotion and content marketing",
    },
    {
      id: "engineer",
      label: "Software Engineer",
      description: "Technical problem solving and development",
    },
    {
      id: "it",
      label: "IT Support",
      description: "Technical assistance and troubleshooting",
    },
    {
      id: "hr",
      label: "HR Representative",
      description: "Employee relations and policy guidance",
    },
    {
      id: "finance",
      label: "Financial Advisor",
      description: "Financial planning and advisory services",
    },
    {
      id: "customer_service",
      label: "Customer Service",
      description: "Customer support and issue resolution",
    },
  ];

  // Response style options
  const responseStyleOptions = [
    {
      id: "concise",
      label: "Concise",
      description: "Brief and to-the-point responses",
    },
    {
      id: "detailed",
      label: "Detailed",
      description: "Comprehensive and thorough explanations",
    },
    {
      id: "conversational",
      label: "Conversational",
      description: "Natural, dialogue-style responses",
    },
    {
      id: "educational",
      label: "Educational",
      description: "Teaching-focused with examples",
    },
  ];

  // Special skills options
  const specialSkillsOptions = [
    "Document Analysis",
    "Data Interpretation",
    "Problem Solving",
    "Research",
    "Technical Writing",
    "Customer Relations",
    "Project Management",
    "Financial Analysis",
    "Risk Assessment",
    "Quality Assurance",
    "Training & Development",
    "Process Optimization",
  ];

  // Guardrails topic suggestions
  const commonTopics = [
    "Company Policies",
    "HR Guidelines",
    "Technical Documentation",
    "Product Information",
    "Customer Support",
    "Financial Data",
    "Legal Compliance",
    "Safety Procedures",
  ];

  const blockedTopicSuggestions = [
    "Personal Financial Information",
    "Medical Records",
    "Legal Advice",
    "Investment Recommendations",
    "Political Opinions",
    "Religious Views",
    "Confidential Data",
    "Competitor Information",
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />

      <div className="flex-1 flex flex-col">
        <TopBar />

        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl ml-4">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <Link href="/agent-chatbots">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Agents
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-semibold text-slate-800 mb-2">
                  {isEditing ? "Edit Agent Chatbot" : "Create Agent Chatbot"}
                </h1>
                <p className="text-sm text-slate-500">
                  {isEditing
                    ? "Update your AI-powered chatbot agent configuration"
                    : "Set up your AI-powered chatbot agent with custom prompts and document knowledge"}
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              {/* Left Sidebar - Navigation */}
              <div className="w-64 space-y-2">
                <Button
                  variant={activeTab === "overview" ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setActiveTab("overview")}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Overview
                </Button>
                <Button
                  variant={activeTab === "skills" ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setActiveTab("skills")}
                >
                  <Brain className="w-4 h-4 mr-2" />
                  Skills
                </Button>
                <Button
                  variant={activeTab === "guardrails" ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setActiveTab("guardrails")}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Guardrails
                </Button>
                <Button
                  variant={activeTab === "test" ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setActiveTab("test")}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Test your Agent
                </Button>
              </div>

              {/* Main Content */}
              <div className="flex-1">
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-6"
                  >
                    {activeTab === "overview" && (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Basic Information */}
                          <Card>
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <Settings className="h-5 w-5" />
                                Basic Information
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Agent Name</FormLabel>
                                    <FormControl>
                                      <Input
                                        placeholder="HR Assistant Bot"
                                        {...field}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                      <Textarea
                                        placeholder="Brief description of what this agent does"
                                        className="min-h-[80px]"
                                        {...field}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </CardContent>
                          </Card>
                        </div>

                        {/* Personality & Profession */}
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <User className="h-5 w-5" />
                              Agent Personality & Profession
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-6">
                            {/* Personality Selection */}
                            <FormField
                              control={form.control}
                              name="personality"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Bot Personality</FormLabel>
                                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                                    {personalityOptions.map((personality) => {
                                      const IconComponent = personality.icon;
                                      return (
                                        <div
                                          key={personality.id}
                                          className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                                            field.value === personality.id
                                              ? "border-blue-500 bg-blue-50"
                                              : "border-gray-200 hover:border-gray-300"
                                          }`}
                                          onClick={() =>
                                            field.onChange(personality.id)
                                          }
                                        >
                                          <div className="flex items-center space-x-2 mb-2">
                                            <IconComponent className="w-5 h-5 text-blue-600" />
                                            <span className="font-medium">
                                              {personality.label}
                                            </span>
                                          </div>
                                          <p className="text-xs text-gray-600">
                                            {personality.description}
                                          </p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Profession Selection */}
                            <FormField
                              control={form.control}
                              name="profession"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Bot Profession</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Choose the bot's professional role" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {professionOptions.map((profession) => (
                                        <SelectItem
                                          key={profession.id}
                                          value={profession.id}
                                        >
                                          <div className="flex flex-col">
                                            <span className="font-medium">
                                              {profession.label}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                              {profession.description}
                                            </span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Response Style */}
                            <FormField
                              control={form.control}
                              name="responseStyle"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Response Style</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="How should the bot respond?" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {responseStyleOptions.map((style) => (
                                        <SelectItem
                                          key={style.id}
                                          value={style.id}
                                        >
                                          <div className="flex flex-col">
                                            <span className="font-medium">
                                              {style.label}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                              {style.description}
                                            </span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </CardContent>
                        </Card>

                        {/* System Prompt */}
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Bot className="h-5 w-5" />
                              AI System Prompt
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <FormField
                              control={form.control}
                              name="systemPrompt"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>System Prompt</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="You are a helpful AI assistant. Answer questions based on the provided documents and be polite and professional."
                                      className="min-h-[120px]"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    This prompt defines your agent's
                                    personality, behavior, and how it should
                                    respond to users.
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    {activeTab === "skills" && (
                      <div className="space-y-6">
                        {/* Special Skills */}
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Lightbulb className="h-5 w-5" />
                              Special Skills & Capabilities
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <FormField
                              control={form.control}
                              name="specialSkills"
                              render={() => (
                                <FormItem>
                                  <FormLabel>Select Skills</FormLabel>
                                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                                    {specialSkillsOptions.map((skill) => (
                                      <FormField
                                        key={skill}
                                        control={form.control}
                                        name="specialSkills"
                                        render={({ field }) => {
                                          return (
                                            <FormItem
                                              key={skill}
                                              className="flex flex-row items-start space-x-3 space-y-0"
                                            >
                                              <FormControl>
                                                <Checkbox
                                                  checked={field.value?.includes(
                                                    skill,
                                                  )}
                                                  onCheckedChange={(
                                                    checked,
                                                  ) => {
                                                    return checked
                                                      ? field.onChange([
                                                          ...field.value,
                                                          skill,
                                                        ])
                                                      : field.onChange(
                                                          field.value?.filter(
                                                            (value) =>
                                                              value !== skill,
                                                          ),
                                                        );
                                                  }}
                                                />
                                              </FormControl>
                                              <FormLabel className="text-sm font-normal">
                                                {skill}
                                              </FormLabel>
                                            </FormItem>
                                          );
                                        }}
                                      />
                                    ))}
                                  </div>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </CardContent>
                        </Card>

                        {/* Knowledge Base (RAG Documents) */}
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <BookOpen className="h-5 w-5" />
                              Knowledge Base (RAG Documents)
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              {/* Search */}
                              <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                <Input
                                  placeholder="Search documents..."
                                  value={searchQuery}
                                  onChange={(e) =>
                                    setSearchQuery(e.target.value)
                                  }
                                  className="pl-10"
                                />
                              </div>

                              {/* Selected Documents */}
                              {selectedDocuments.length > 0 && (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="secondary"
                                      className="bg-blue-100 text-blue-800"
                                    >
                                      {selectedDocuments.length} documents
                                      selected
                                    </Badge>
                                  </div>
                                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                                    <p className="text-sm font-medium text-blue-800 mb-2">
                                      Selected Documents:
                                    </p>
                                    <div className="space-y-1">
                                      {selectedDocuments.map((docId) => {
                                        const doc = documents.find(
                                          (d) => d.id === docId,
                                        );
                                        return doc ? (
                                          <div
                                            key={docId}
                                            className="flex items-center justify-between text-sm text-blue-700"
                                          >
                                            <span className="flex items-center gap-2">
                                              <FileText className="w-3 h-3" />
                                              {doc.name}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                toggleDocument(docId)
                                              }
                                              className="text-blue-500 hover:text-blue-700"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </div>
                                        ) : null;
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Documents List */}
                              <div className="max-h-64 overflow-y-auto space-y-2 border rounded-lg p-3">
                                {filteredDocuments.length === 0 ? (
                                  <div className="text-center py-4 text-slate-500">
                                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p>No documents found</p>
                                  </div>
                                ) : (
                                  filteredDocuments.map((doc) => (
                                    <div
                                      key={doc.id}
                                      className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                                        selectedDocuments.includes(doc.id)
                                          ? "bg-blue-50 border-blue-200"
                                          : "bg-white hover:bg-slate-50"
                                      }`}
                                      onClick={() => toggleDocument(doc.id)}
                                    >
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <h4 className="font-medium text-slate-800">
                                            {doc.name}
                                          </h4>
                                          {doc.categoryName && (
                                            <Badge
                                              variant="outline"
                                              className="text-xs"
                                            >
                                              {doc.categoryName}
                                            </Badge>
                                          )}
                                        </div>
                                        {doc.description && (
                                          <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                                            {doc.description}
                                          </p>
                                        )}
                                      </div>
                                      <div className="ml-3">
                                        {selectedDocuments.includes(doc.id) ? (
                                          <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                                            <Check className="w-3 h-3 text-white" />
                                          </div>
                                        ) : (
                                          <div className="w-5 h-5 border-2 border-slate-300 rounded-full" />
                                        )}
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    {activeTab === "guardrails" && (
                      <div className="space-y-6">
                        {/* Safety & Content Filtering */}
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Shield className="h-5 w-5" />
                              Safety & Content Filtering
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <FormField
                                control={form.control}
                                name="contentFiltering"
                                render={({ field }) => (
                                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                      />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                      <FormLabel>Content Filtering</FormLabel>
                                      <FormDescription>
                                        Filter inappropriate or harmful content
                                        automatically
                                      </FormDescription>
                                    </div>
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name="toxicityPrevention"
                                render={({ field }) => (
                                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                      />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                      <FormLabel>Toxicity Prevention</FormLabel>
                                      <FormDescription>
                                        Prevent toxic or offensive language in
                                        responses
                                      </FormDescription>
                                    </div>
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name="privacyProtection"
                                render={({ field }) => (
                                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                      />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                      <FormLabel>Privacy Protection</FormLabel>
                                      <FormDescription>
                                        Protect sensitive personal information
                                        in conversations
                                      </FormDescription>
                                    </div>
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name="factualAccuracy"
                                render={({ field }) => (
                                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                      />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                      <FormLabel>Factual Accuracy</FormLabel>
                                      <FormDescription>
                                        Verify information accuracy before
                                        responding
                                      </FormDescription>
                                    </div>
                                  </FormItem>
                                )}
                              />
                            </div>

                            {/* Response Length Control */}
                            <FormField
                              control={form.control}
                              name="responseLength"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Response Length Control</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Choose response length" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="short">
                                        Short (1-2 sentences)
                                      </SelectItem>
                                      <SelectItem value="medium">
                                        Medium (3-5 sentences)
                                      </SelectItem>
                                      <SelectItem value="long">
                                        Long (Detailed explanations)
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </CardContent>
                        </Card>

                        {/* Topic Control */}
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5" />
                              Topic Control
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Allowed Topics */}
                              <div>
                                <FormField
                                  control={form.control}
                                  name="allowedTopics"
                                  render={() => (
                                    <FormItem>
                                      <FormLabel className="text-green-700">
                                        Allowed Topics
                                      </FormLabel>
                                      <FormDescription>
                                        Topics the bot can discuss
                                      </FormDescription>
                                      <div className="space-y-2 mt-2">
                                        {commonTopics.map((topic) => (
                                          <FormField
                                            key={topic}
                                            control={form.control}
                                            name="allowedTopics"
                                            render={({ field }) => {
                                              return (
                                                <FormItem
                                                  key={topic}
                                                  className="flex flex-row items-start space-x-3 space-y-0"
                                                >
                                                  <FormControl>
                                                    <Checkbox
                                                      checked={field.value?.includes(
                                                        topic,
                                                      )}
                                                      onCheckedChange={(
                                                        checked,
                                                      ) => {
                                                        return checked
                                                          ? field.onChange([
                                                              ...field.value,
                                                              topic,
                                                            ])
                                                          : field.onChange(
                                                              field.value?.filter(
                                                                (value) =>
                                                                  value !==
                                                                  topic,
                                                              ),
                                                            );
                                                      }}
                                                    />
                                                  </FormControl>
                                                  <FormLabel className="text-sm font-normal text-green-700">
                                                    {topic}
                                                  </FormLabel>
                                                </FormItem>
                                              );
                                            }}
                                          />
                                        ))}
                                      </div>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>

                              {/* Blocked Topics */}
                              <div>
                                <FormField
                                  control={form.control}
                                  name="blockedTopics"
                                  render={() => (
                                    <FormItem>
                                      <FormLabel className="text-red-700">
                                        Blocked Topics
                                      </FormLabel>
                                      <FormDescription>
                                        Topics the bot should avoid
                                      </FormDescription>
                                      <div className="space-y-2 mt-2">
                                        {blockedTopicSuggestions.map(
                                          (topic) => (
                                            <FormField
                                              key={topic}
                                              control={form.control}
                                              name="blockedTopics"
                                              render={({ field }) => {
                                                return (
                                                  <FormItem
                                                    key={topic}
                                                    className="flex flex-row items-start space-x-3 space-y-0"
                                                  >
                                                    <FormControl>
                                                      <Checkbox
                                                        checked={field.value?.includes(
                                                          topic,
                                                        )}
                                                        onCheckedChange={(
                                                          checked,
                                                        ) => {
                                                          return checked
                                                            ? field.onChange([
                                                                ...field.value,
                                                                topic,
                                                              ])
                                                            : field.onChange(
                                                                field.value?.filter(
                                                                  (value) =>
                                                                    value !==
                                                                    topic,
                                                                ),
                                                              );
                                                        }}
                                                      />
                                                    </FormControl>
                                                    <FormLabel className="text-sm font-normal text-red-700">
                                                      {topic}
                                                    </FormLabel>
                                                  </FormItem>
                                                );
                                              }}
                                            />
                                          ),
                                        )}
                                      </div>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Memory Configuration */}
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Brain className="h-5 w-5" />
                              Memory Configuration
                            </CardTitle>
                            <CardDescription>
                              Configure how the chatbot remembers previous
                              conversations
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <FormField
                              control={form.control}
                              name="memoryEnabled"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-base">
                                      Enable Memory
                                    </FormLabel>
                                    <FormDescription>
                                      Allow the chatbot to remember conversation
                                      history and provide context-aware
                                      responses
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />

                            {form.watch("memoryEnabled") && (
                              <FormField
                                control={form.control}
                                name="memoryLimit"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Memory Limit</FormLabel>
                                    <FormDescription>
                                      Number of previous messages to remember
                                      (1-50). Higher values improve context but
                                      use more resources.
                                    </FormDescription>
                                    <FormControl>
                                      <div className="space-y-2">
                                        <div className="flex items-center space-x-2">
                                          <span className="text-sm text-slate-500">
                                            1
                                          </span>
                                          <Slider
                                            value={[field.value || 10]}
                                            onValueChange={(value) =>
                                              field.onChange(value[0])
                                            }
                                            max={50}
                                            min={1}
                                            step={1}
                                            className="flex-1"
                                          />
                                          <span className="text-sm text-slate-500">
                                            50
                                          </span>
                                        </div>
                                        <div className="text-center">
                                          <Badge
                                            variant="secondary"
                                            className="bg-slate-100 text-slate-700"
                                          >
                                            {field.value || 10} messages
                                          </Badge>
                                        </div>
                                      </div>
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}
                          </CardContent>
                        </Card>

                        {/* Advanced Guardrails Configuration */}
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Settings className="h-5 w-5" />
                              Advanced Guardrails Configuration
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-6">
                            {/* Enable Guardrails */}
                            <FormField
                              control={form.control}
                              name="guardrailsEnabled"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                    />
                                  </FormControl>
                                  <div className="space-y-1 leading-none">
                                    <FormLabel>Enable Advanced Guardrails</FormLabel>
                                    <FormDescription>
                                      Activate OpenAI-powered guardrails for enhanced safety and content filtering
                                    </FormDescription>
                                  </div>
                                </FormItem>
                              )}
                            />

                            {/* Guardrails Configuration - Only show if enabled */}
                            {form.watch("guardrailsEnabled") && (
                              <div className="space-y-4 border-l-4 border-blue-500 pl-4">
                                {/* Content Filtering */}
                                <div className="space-y-3">
                                  <h4 className="font-medium text-slate-800">Content Filtering</h4>
                                  <div className="grid grid-cols-2 gap-3">
                                    <FormField
                                      control={form.control}
                                      name="guardrailsConfig.contentFiltering.blockProfanity"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                          <FormControl>
                                            <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                          <FormLabel className="text-sm">Block Profanity</FormLabel>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="guardrailsConfig.contentFiltering.blockHateSpeech"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                          <FormControl>
                                            <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                          <FormLabel className="text-sm">Block Hate Speech</FormLabel>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="guardrailsConfig.contentFiltering.blockSexualContent"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                          <FormControl>
                                            <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                          <FormLabel className="text-sm">Block Sexual Content</FormLabel>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="guardrailsConfig.contentFiltering.blockViolence"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                          <FormControl>
                                            <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                          <FormLabel className="text-sm">Block Violence</FormLabel>
                                        </FormItem>
                                      )}
                                    />
                                  </div>
                                </div>

                                {/* Privacy Protection */}
                                <div className="space-y-3">
                                  <h4 className="font-medium text-slate-800">Privacy Protection</h4>
                                  <div className="grid grid-cols-2 gap-3">
                                    <FormField
                                      control={form.control}
                                      name="guardrailsConfig.privacyProtection.blockPersonalInfo"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                          <FormControl>
                                            <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                          <FormLabel className="text-sm">Block Personal Info</FormLabel>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="guardrailsConfig.privacyProtection.blockFinancialInfo"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                          <FormControl>
                                            <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                          <FormLabel className="text-sm">Block Financial Info</FormLabel>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="guardrailsConfig.privacyProtection.maskPhoneNumbers"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                          <FormControl>
                                            <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                          <FormLabel className="text-sm">Mask Phone Numbers</FormLabel>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="guardrailsConfig.privacyProtection.maskEmails"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                          <FormControl>
                                            <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                          <FormLabel className="text-sm">Mask Emails</FormLabel>
                                        </FormItem>
                                      )}
                                    />
                                  </div>
                                </div>

                                {/* Toxicity Prevention */}
                                <div className="space-y-3">
                                  <h4 className="font-medium text-slate-800">Toxicity Prevention</h4>
                                  <div className="grid grid-cols-2 gap-3">
                                    <FormField
                                      control={form.control}
                                      name="guardrailsConfig.toxicityPrevention.blockSarcasm"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                          <FormControl>
                                            <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                          <FormLabel className="text-sm">Block Sarcasm</FormLabel>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="guardrailsConfig.toxicityPrevention.blockInsults"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                          <FormControl>
                                            <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                          <FormLabel className="text-sm">Block Insults</FormLabel>
                                        </FormItem>
                                      )}
                                    />
                                  </div>
                                  <FormField
                                    control={form.control}
                                    name="guardrailsConfig.toxicityPrevention.toxicityThreshold"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Toxicity Threshold</FormLabel>
                                        <FormDescription>
                                          Sensitivity level for toxicity detection (0.1 = very sensitive, 1.0 = less sensitive)
                                        </FormDescription>
                                        <FormControl>
                                          <div className="space-y-2">
                                            <div className="flex items-center space-x-2">
                                              <span className="text-sm text-slate-500">0.1</span>
                                              <Slider
                                                value={[field.value || 0.5]}
                                                onValueChange={(value) => field.onChange(value[0])}
                                                max={1}
                                                min={0.1}
                                                step={0.1}
                                                className="flex-1"
                                              />
                                              <span className="text-sm text-slate-500">1.0</span>
                                            </div>
                                            <div className="text-center">
                                              <Badge variant="secondary">
                                                {field.value || 0.5}
                                              </Badge>
                                            </div>
                                          </div>
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>

                                {/* Response Quality */}
                                <div className="space-y-3">
                                  <h4 className="font-medium text-slate-800">Response Quality</h4>
                                  <div className="grid grid-cols-2 gap-3">
                                    <FormField
                                      control={form.control}
                                      name="guardrailsConfig.responseQuality.requireSourceCitation"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                          <FormControl>
                                            <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                          <FormLabel className="text-sm">Require Source Citations</FormLabel>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="guardrailsConfig.responseQuality.preventHallucination"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                          <FormControl>
                                            <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                          <FormLabel className="text-sm">Prevent Hallucination</FormLabel>
                                        </FormItem>
                                      )}
                                    />
                                  </div>
                                </div>

                                {/* Business Context */}
                                <div className="space-y-3">
                                  <h4 className="font-medium text-slate-800">Business Context</h4>
                                  <div className="grid grid-cols-2 gap-3">
                                    <FormField
                                      control={form.control}
                                      name="guardrailsConfig.businessContext.stayOnBrand"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                          <FormControl>
                                            <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                          <FormLabel className="text-sm">Stay On Brand</FormLabel>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="guardrailsConfig.businessContext.requireProfessionalTone"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                          <FormControl>
                                            <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                          <FormLabel className="text-sm">Require Professional Tone</FormLabel>
                                        </FormItem>
                                      )}
                                    />
                                  </div>
                                  <FormField
                                    control={form.control}
                                    name="guardrailsConfig.businessContext.companyName"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Company Name</FormLabel>
                                        <FormControl>
                                          <Input
                                            placeholder="Enter your company name"
                                            {...field}
                                          />
                                        </FormControl>
                                        <FormDescription>
                                          Company name for brand consistency
                                        </FormDescription>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* Guardrails Information */}
                        <Card className="border-blue-200 bg-blue-50">
                          <CardContent className="pt-6">
                            <div className="flex items-start space-x-3">
                              <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                              <div>
                                <h4 className="font-medium text-blue-900">
                                  About Guardrails
                                </h4>
                                <p className="text-sm text-blue-700 mt-1">
                                  Guardrails help ensure your AI agent behaves
                                  safely and appropriately. These settings are
                                  inspired by{" "}
                                  <a
                                    href="https://www.guardrailsai.com/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                  >
                                    Guardrails AI
                                  </a>{" "}
                                  best practices for responsible AI deployment.
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    {activeTab === "test" && (
                      <div className="space-y-6">
                        {/* Test Agent Interface */}
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <MessageSquare className="h-5 w-5" />
                              Test your Agent
                            </CardTitle>
                            <CardDescription>
                              Send test messages to see how your agent will respond based on current configuration
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {/* Agent Status Toggle */}
                            <div className="flex items-center justify-between bg-slate-50 rounded-lg p-4">
                              <div>
                                <h4 className="font-medium text-slate-800">Agent Status</h4>
                                <p className="text-sm text-slate-600">
                                  {agentStatus === "testing" 
                                    ? "Agent is in testing mode - responses are for preview only"
                                    : "Agent is published and live - ready to receive real user messages"}
                                </p>
                              </div>
                              <div className="flex items-center space-x-3">
                                <Badge 
                                  variant={agentStatus === "testing" ? "outline" : "default"}
                                  className={agentStatus === "testing" ? "border-orange-300 text-orange-700" : "bg-green-600 text-white"}
                                >
                                  {agentStatus === "testing" ? "Testing" : "Published"}
                                </Badge>
                                <Button
                                  type="button"
                                  onClick={() => setAgentStatus(agentStatus === "testing" ? "published" : "testing")}
                                  variant={agentStatus === "testing" ? "default" : "outline"}
                                  size="sm"
                                >
                                  {agentStatus === "testing" ? "Publish Agent" : "Switch to Testing"}
                                </Button>
                              </div>
                            </div>

                            {/* Current Configuration Summary */}
                            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                              <h4 className="font-medium text-slate-800">Current Configuration:</h4>
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                                <div>
                                  <span className="text-slate-600">Name:</span>
                                  <Badge variant="outline" className="ml-1">
                                    {form.watch("name") || "Not set"}
                                  </Badge>
                                </div>
                                <div>
                                  <span className="text-slate-600">Personality:</span>
                                  <Badge variant="outline" className="ml-1">
                                    {personalityOptions.find(p => p.id === form.watch("personality"))?.label || "Not set"}
                                  </Badge>
                                </div>
                                <div>
                                  <span className="text-slate-600">Profession:</span>
                                  <Badge variant="outline" className="ml-1">
                                    {professionOptions.find(p => p.id === form.watch("profession"))?.label || "Not set"}
                                  </Badge>
                                </div>
                                <div>
                                  <span className="text-slate-600">Documents:</span>
                                  <Badge variant="outline" className="ml-1">
                                    {selectedDocuments.length} selected
                                  </Badge>
                                </div>
                              </div>
                            </div>

                            {/* Test Mode Selection */}
                            <div className="flex gap-2 mb-4">
                              <Button
                                type="button"
                                onClick={() => !isTestChatMode && setIsTestChatMode(false)}
                                variant={!isTestChatMode ? "default" : "outline"}
                                size="sm"
                              >
                                Single Message Test
                              </Button>
                              <Button
                                type="button"
                                onClick={startChatTest}
                                variant={isTestChatMode ? "default" : "outline"}
                                size="sm"
                              >
                                <MessageSquare className="w-4 h-4 mr-2" />
                                Chat Conversation Test
                              </Button>
                              {isTestChatMode && (
                                <Button
                                  type="button"
                                  onClick={stopChatTest}
                                  variant="outline"
                                  size="sm"
                                >
                                  Stop Chat Test
                                </Button>
                              )}
                            </div>

                            {isTestChatMode ? (
                              /* Chat Mode Interface */
                              <div className="space-y-4">
                                {/* Chat History Display */}
                                <div ref={chatHistoryRef} className="border rounded-lg bg-gray-50 h-80 overflow-y-auto p-4 space-y-3">
                                  {testChatHistory.length === 0 ? (
                                    <div className="text-center text-gray-500 italic py-8">
                                      Start a conversation to test your agent with realistic back-and-forth chat
                                    </div>
                                  ) : (
                                    testChatHistory.map((msg, index) => (
                                      <div
                                        key={index}
                                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                                      >
                                        <div
                                          className={`max-w-[70%] rounded-lg px-4 py-2 ${
                                            msg.role === "user"
                                              ? "bg-blue-600 text-white"
                                              : "bg-white border text-gray-900"
                                          }`}
                                        >
                                          <div className="flex items-start gap-2">
                                            {msg.role === "assistant" && (
                                              <Bot className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                            )}
                                            <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                                          </div>
                                          <div className={`text-xs mt-1 opacity-70`}>
                                            {msg.timestamp.toLocaleTimeString()}
                                          </div>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                  {(isTestingAgent || testAgentMutation.isPending) && (
                                    <div className="flex justify-start">
                                      <div className="max-w-[70%] rounded-lg px-4 py-2 bg-white border">
                                        <div className="flex items-center gap-2">
                                          <Bot className="w-4 h-4 text-blue-600" />
                                          <div className="animate-pulse text-gray-500">กำลังพิมพ์...</div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Chat Input */}
                                <div className="flex gap-2">
                                  <Textarea
                                    placeholder="พิมพ์ข้อความเพื่อทดสอบการสนทนากับ Agent..."
                                    value={testMessage}
                                    onChange={(e) => setTestMessage(e.target.value)}
                                    className="flex-1 min-h-[60px] resize-none"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleTestAgent();
                                      }
                                    }}
                                  />
                                  <Button
                                    onClick={handleTestAgent}
                                    disabled={isTestingAgent || testAgentMutation.isPending || !testMessage.trim()}
                                    className="bg-blue-600 hover:bg-blue-700 self-end"
                                  >
                                    {(isTestingAgent || testAgentMutation.isPending) ? (
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    ) : (
                                      "ส่ง"
                                    )}
                                  </Button>
                                </div>

                                {/* Memory Info */}
                                <div className="text-xs text-gray-600 bg-yellow-50 border border-yellow-200 rounded p-2">
                                  Memory Limit: {form.watch("memoryLimit") || 10} messages | 
                                  Current History: {testChatHistory.length} messages |
                                  Documents: {selectedDocuments.length} attached
                                </div>
                              </div>
                            ) : (
                              /* Single Message Mode Interface */
                              <div className="space-y-4">
                                {/* Test Message Input */}
                                <div className="space-y-2">
                                  <Label htmlFor="testMessage">Test Message</Label>
                                  <Textarea
                                    id="testMessage"
                                    placeholder="Enter a message to test how your agent will respond..."
                                    value={testMessage}
                                    onChange={(e) => setTestMessage(e.target.value)}
                                    className="min-h-[100px]"
                                  />
                                </div>

                                {/* Test Button */}
                                <Button
                                  onClick={handleTestAgent}
                                  disabled={isTestingAgent || testAgentMutation.isPending || !testMessage.trim()}
                                  className="w-full bg-green-600 hover:bg-green-700"
                                >
                                  {(isTestingAgent || testAgentMutation.isPending) ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                      Testing Agent...
                                    </>
                                  ) : (
                                    <>
                                      <MessageSquare className="w-4 h-4 mr-2" />
                                      Test Agent Response
                                    </>
                                  )}
                                </Button>

                                {/* Test Response */}
                                <div className="space-y-2">
                                  <Label>Agent Response</Label>
                                  {testResponse ? (
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                      <div className="flex items-start space-x-3">
                                        <Bot className="w-5 h-5 text-blue-600 mt-0.5" />
                                        <div className="flex-1">
                                          <p className="text-blue-900 whitespace-pre-wrap">{testResponse}</p>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                      <div className="flex items-start space-x-3">
                                        <Bot className="w-5 h-5 text-gray-400 mt-0.5" />
                                        <div className="flex-1">
                                          <p className="text-gray-500 italic">No response yet. Click "Test Agent Response" to see how your agent will respond.</p>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Test Tips */}
                            <Card className="border-amber-200 bg-amber-50">
                              <CardContent className="pt-6">
                                <div className="flex items-start space-x-3">
                                  <Lightbulb className="w-5 h-5 text-amber-600 mt-0.5" />
                                  <div>
                                    <h4 className="font-medium text-amber-900">Testing Tips</h4>
                                    <ul className="text-sm text-amber-700 mt-1 list-disc list-inside space-y-1">
                                      <li>Test different types of questions to see how your agent responds</li>
                                      <li>Try questions related to your selected documents</li>
                                      <li>Test edge cases and inappropriate content to verify guardrails</li>
                                      <li>Make sure all required fields are filled before testing</li>
                                    </ul>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    {/* Submit Button - Always visible */}
                    <div className="flex justify-end space-x-4 pt-6 border-t">
                      <Link href="/agent-chatbots">
                        <Button type="button" variant="outline">
                          Cancel
                        </Button>
                      </Link>
                      <Button
                        type="submit"
                        disabled={saveAgentMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {saveAgentMutation.isPending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            {isEditing ? "Updating..." : "Creating..."}
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4 mr-2" />
                            {isEditing ? "Update Agent" : "Create Agent"}
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
