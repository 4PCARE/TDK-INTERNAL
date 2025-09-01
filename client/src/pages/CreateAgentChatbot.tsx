import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DashboardLayout from "@/components/Layout/DashboardLayout";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Bot,
  Settings,
  MessageSquare,
  MessageCircle,
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
  Loader2,
  TestTube,
  Send,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Sparkles,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Wand2,
  Database
} from "lucide-react";
import { Link } from "wouter";
import DocumentSelector from "@/components/DocumentSelector";
import DatabaseConnectionSelector from "@/components/DatabaseConnectionSelector";

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
  // Search Configuration
  searchConfiguration: z.object({
    enableCustomSearch: z.boolean().default(false),
    additionalSearchDetail: z.string().default(""),
    chunkMaxType: z.enum(["number", "percentage"]).default("number"),
    chunkMaxValue: z.number().min(1).default(8),
    documentMass: z.number().min(0.1).max(1).default(0.3),
    tokenLimitEnabled: z.boolean().default(false),
    tokenLimitType: z.enum(["document", "final"]).default("document"),
    documentTokenLimit: z.number().min(1000).default(12000),
    finalTokenLimit: z.number().min(500).default(4000),
  }).optional(),
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
      blockAggressiveLanguage: z.boolean().default(true),
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

interface Folder {
  id: number;
  name: string;
  parentId?: number;
  children?: Folder[];
  documentCount?: number;
}

interface FolderDocument {
  id: number;
  name: string;
  description?: string;
  categoryName?: string;
  folderId?: number;
}

interface TestMessage {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  createdAt: string; // Use string for ISO format
}

export default function CreateAgentChatbot() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();

  const [selectedDocuments, setSelectedDocuments] = useState<number[]>([]);
  const [selectedDatabases, setSelectedDatabases] = useState<number[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<Set<number>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [folderDocuments, setFolderDocuments] = useState<Record<number, FolderDocument[]>>({});
  const [folderDocumentCounts, setFolderDocumentCounts] = useState<Record<number, number>>({});
  const [folderDocumentOffsets, setFolderDocumentOffsets] = useState<Record<number, number>>({});
  const [loadingMoreDocuments, setLoadingMoreDocuments] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [testMessage, setTestMessage] = useState("");
  const [isTestingAgent, setIsTestingAgent] = useState(false); // This state might be redundant with sendTestMessageMutation.isPending
  const [agentStatus, setAgentStatus] = useState<"testing" | "published">("testing");
  const [testChatHistory, setTestChatHistory] = useState<TestMessage[]>([]);
  const [isTestChatMode, setIsTestChatMode] = useState(false);
  const [tempSessionId, setTempSessionId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      searchConfiguration: {
        enableCustomSearch: false,
        additionalSearchDetail: "",
        chunkMaxType: "number",
        chunkMaxValue: 8,
        documentMass: 0.3,
        tokenLimitEnabled: false,
        tokenLimitType: "document",
        documentTokenLimit: 12000,
        finalTokenLimit: 4000,
      },
      memoryEnabled: false,
      memoryLimit: 10,
      guardrailsEnabled: false,
      guardrailsConfig: {
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

  // Fetch documents and folders - get ALL documents for agent creation
  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ["/api/documents/all"],
    queryFn: async () => {
      const response = await fetch("/api/documents?limit=10000"); // Fetch all documents with high limit
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
  }) as { data: Document[] };

  // Fetch folders
  const { data: folders = [] } = useQuery({
    queryKey: ["/api/folders"],
    enabled: isAuthenticated,
    retry: false,
  }) as { data: Folder[] };

  // Fetch documents for expanded folders with pagination
  const fetchFolderDocuments = async (folderId: number, offset: number = 0, append: boolean = false) => {
    try {
      const limit = 20; // Load 20 documents at a time
      const response = await fetch(`/api/folders/${folderId}/documents?limit=${limit}&offset=${offset}`);
      if (response.ok) {
        const result = await response.json();
        const docs = result.documents || result; // Handle both formats
        const totalCount = result.totalCount || docs.length;

        setFolderDocuments(prev => ({
          ...prev,
          [folderId]: append ? [...(prev[folderId] || []), ...docs] : docs
        }));

        setFolderDocumentCounts(prev => ({
          ...prev,
          [folderId]: totalCount
        }));

        setFolderDocumentOffsets(prev => ({
          ...prev,
          [folderId]: offset + docs.length
        }));
      }
    } catch (error) {
      console.error(`Error fetching documents for folder ${folderId}:`, error);
    }
  };

  // Fetch documents for expanded folders
  useEffect(() => {
    const expandedFolderIds = Array.from(expandedFolders);
    if (expandedFolderIds.length > 0) {
      expandedFolderIds.forEach((folderId) => {
        if (!folderDocuments[folderId]) {
          fetchFolderDocuments(folderId, 0, false);
        }
      });
    }
  }, [expandedFolders]);

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

  // Fetch agent database connections for editing
  const { data: agentDatabases = [] } = useQuery({
    queryKey: [`/api/agent-chatbots/${editAgentId}/databases`],
    enabled: isAuthenticated && isEditing,
    retry: false,
  });

  // Store fetched agent data to access ID for testing
  const [savedAgent, setSavedAgent] = useState<CreateAgentForm | null>(null);

  // Load existing agent data into form when editing
  useEffect(() => {
    if (isEditing && existingAgent) {
      const agent = existingAgent as any;
      console.log("Loading existing agent data:", JSON.stringify(agent, null, 2));
      console.log("Agent guardrails config from DB:", agent.guardrailsConfig);

      // Ensure default values are applied before resetting if some fields are missing from API response
      const defaultFormValues = form.getValues();
      const mergedAgentData = {
        ...defaultFormValues, // Start with defaults
        ...agent, // Override with fetched data
        // Explicitly preserve main form fields that might get overridden
        name: agent.name || defaultFormValues.name,
        description: agent.description || defaultFormValues.description,
        systemPrompt: agent.systemPrompt || defaultFormValues.systemPrompt,
        personality: agent.personality || defaultFormValues.personality,
        profession: agent.profession || defaultFormValues.profession,
        responseStyle: agent.responseStyle || defaultFormValues.responseStyle,
        specialSkills: agent.specialSkills || defaultFormValues.specialSkills,
        // Explicitly handle nested objects to avoid undefined errors
        searchConfiguration: {
          ...defaultFormValues.searchConfiguration,
          ...(agent.searchConfiguration || {}),
        },
        guardrailsConfig: agent.guardrailsConfig ? {
          contentFiltering: {
            ...defaultFormValues.guardrailsConfig.contentFiltering,
            ...(agent.guardrailsConfig.contentFiltering || {}),
          },
          topicControl: {
            ...defaultFormValues.guardrailsConfig.topicControl,
            ...(agent.guardrailsConfig.topicControl || {}),
          },
          privacyProtection: {
            ...defaultFormValues.guardrailsConfig.privacyProtection,
            ...(agent.guardrailsConfig.privacyProtection || {}),
          },
          responseQuality: {
            ...defaultFormValues.guardrailsConfig.responseQuality,
            ...(agent.guardrailsConfig.responseQuality || {}),
          },
          toxicityPrevention: {
            ...defaultFormValues.guardrailsConfig.toxicityPrevention,
            ...(agent.guardrailsConfig.toxicityPrevention || {}),
          },
          businessContext: {
            ...defaultFormValues.guardrailsConfig.businessContext,
            ...(agent.guardrailsConfig.businessContext || {}),
          },
        } : defaultFormValues.guardrailsConfig,
        guardrailsEnabled: !!agent.guardrailsConfig, // Set based on presence of config
      };

      form.reset(mergedAgentData);
      setSavedAgent(mergedAgentData); // Store for testing purposes

      // Load selected documents
      const docs = agentDocuments as any[];
      if (docs && docs.length > 0) {
        setSelectedDocuments(docs.map((doc: any) => doc.documentId));
      }

      // Load selected databases
      const dbs = agentDatabases as any[];
      if (dbs && dbs.length > 0) {
        setSelectedDatabases(dbs.map((db: any) => db.connectionId));
      }
    }
  }, [existingAgent, agentDocuments, isEditing, form]);

  // Create temporary session mutation
  const createTempSessionMutation = useMutation({
    mutationFn: async (agentId: number) => {
      const response = await fetch("/api/internal-agent-chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          title: `Test Chat - ${new Date().toLocaleDateString()}`,
        }),
      });
      if (!response.ok) throw new Error("Failed to create test session");
      return response.json();
    },
    onSuccess: (session) => {
      setTempSessionId(session.id);
      setTestChatHistory([]); // Clear history for new session
      toast({
        title: "Test Session Created",
        description: "You can now test your agent!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error creating test session",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Prompt refinement mutation
  const refinePromptMutation = useMutation({
    mutationFn: async (data: {
      originalPrompt: string;
      personality: string;
      profession: string;
      responseStyle: string;
      specialSkills: string[];
      documentIds: number[];
    }) => {
      const response = await fetch('/api/prompt-refinement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to refine prompt');
      return response.json();
    },
    onSuccess: (result) => {
      form.setValue('systemPrompt', result.refinedPrompt);
      toast({
        title: "Prompt Refined Successfully",
        description: "Your system prompt has been enhanced by AI",
      });
    },
    onError: (error) => {
      toast({
        title: "Refinement Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Send test message mutation
  const sendTestMessageMutation = useMutation({
    mutationFn: async ({ message, sessionId, agentId }: { message: string; sessionId: number; agentId: number }) => {
      const response = await fetch('/api/internal-agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          sessionId: sessionId.toString(),
          agentId: agentId.toString()
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send message: ${response.status} ${errorText}`);
      }

      return await response.json();
    },
    onMutate: async ({ message }) => {
      // Optimistically add user message
      const optimisticMessage: TestMessage = {
        id: Date.now(), // Temporary ID
        role: "user",
        content: message,
        createdAt: new Date().toISOString()
      };

      setTestChatHistory(prev => [...prev, optimisticMessage]);
      setTestMessage(""); // Clear input
    },
    onSuccess: () => {
      // Refetch messages after successful send
      if (tempSessionId) {
        refetchTestMessages();
      }
    },
    onError: (error: any) => {
      console.error('❌ Send test message error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send test message",
        variant: "destructive",
      });
    },
  });

  // Fetch test messages
  const { data: testMessages = [], refetch: refetchTestMessages } = useQuery({
    queryKey: ["/api/internal-agent-chat/messages", tempSessionId],
    queryFn: async () => {
      if (!tempSessionId) return [];
      const response = await fetch(`/api/internal-agent-chat/messages?sessionId=${tempSessionId}`);
      if (!response.ok) throw new Error("Failed to fetch test messages");
      // Ensure messages are in the correct format
      const data = await response.json();
      return data.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt // Assuming API returns ISO string
      }));
    },
    enabled: !!tempSessionId,
    refetchInterval: 2000, // Poll for new messages
  });

  // Update test chat history when messages change
  useEffect(() => {
    if (testMessages && testMessages.length > 0) {
      setTestChatHistory(testMessages);
    }
  }, [testMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current && testChatHistory?.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [testChatHistory]);

  // Save or update agent mutation
  const saveAgentMutation = useMutation({
    mutationFn: async (
      agentData: CreateAgentForm & { documentIds: number[], databaseIds: number[] },
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
      setSelectedDatabases([]);
      setFolderDocuments({});
      setExpandedFolders(new Set());

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
    console.log("🚀 Form onSubmit triggered");
    console.log("Form data received:", data);
    console.log("Is editing mode:", isEditing);
    console.log("Agent ID:", editAgentId);

    // Validate required fields
    if (!data.name || data.name.trim().length === 0) {
      toast({
        title: "Validation Error",
        description: "Agent name is required",
        variant: "destructive",
      });
      return;
    }

    if (!data.systemPrompt || data.systemPrompt.trim().length === 0) {
      toast({
        title: "Validation Error",
        description: "System prompt is required",
        variant: "destructive",
      });
      return;
    }

    if (!data.personality || data.personality.trim().length === 0) {
      toast({
        title: "Validation Error",
        description: "Personality selection is required",
        variant: "destructive",
      });
      return;
    }

    if (!data.profession || data.profession.trim().length === 0) {
      toast({
        title: "Validation Error",
        description: "Profession selection is required",
        variant: "destructive",
      });
      return;
    }

    if (!data.responseStyle || data.responseStyle.trim().length === 0) {
      toast({
        title: "Validation Error",
        description: "Response style selection is required",
        variant: "destructive",
      });
      return;
    }

    try {
      // Build the guardrails configuration object
      const guardrailsConfig = data.guardrailsEnabled ? data.guardrailsConfig : null;

      // Use only the selected documents (folders are converted to individual documents)
      const allDocumentIds = [...new Set(selectedDocuments)];
      const allDatabaseIds = [...new Set(selectedDatabases)];

      const finalData = {
        ...data,
        documentIds: allDocumentIds,
        databaseIds: allDatabaseIds,
        guardrailsConfig,
        // Ensure arrays are properly formatted
        specialSkills: Array.isArray(data.specialSkills) ? data.specialSkills : [],
        allowedTopics: Array.isArray(data.allowedTopics) ? data.allowedTopics : [],
        blockedTopics: Array.isArray(data.blockedTopics) ? data.blockedTopics : [],
      };

      console.log("Form submission data:", JSON.stringify(finalData, null, 2));
      console.log("Guardrails enabled:", data.guardrailsEnabled);
      console.log("Guardrails config:", data.guardrailsConfig);
      console.log("Selected documents:", selectedDocuments);
      console.log("Selected databases:", selectedDatabases);
      console.log("All document IDs:", allDocumentIds);

      saveAgentMutation.mutate(finalData);
    } catch (error) {
      console.error("Error preparing form data:", error);
      toast({
        title: "Error",
        description: "Failed to prepare form data for submission",
        variant: "destructive",
      });
    }
  };

  const handleTestAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testMessage.trim() || !tempSessionId || sendTestMessageMutation.isPending) return;

    const messageToSend = testMessage.trim();
    const currentAgentId = savedAgent?.id || (isEditing ? parseInt(editAgentId!) : null);

    if (!currentAgentId) {
      toast({
        title: "No Agent",
        description: "Please save the agent first before testing.",
        variant: "destructive",
      });
      return;
    }

    try {
      await sendTestMessageMutation.mutateAsync({
        message: messageToSend,
        sessionId: tempSessionId,
        agentId: currentAgentId
      });
    } catch (error) {
      console.error('❌ Failed to send test message:', error);
    }
  };

  const handleStartTestChat = () => {
    const currentAgentId = savedAgent?.id || (isEditing ? parseInt(editAgentId!) : null);

    if (!currentAgentId) {
      toast({
        title: "Save Agent First",
        description: "Please save the agent before starting a test chat.",
        variant: "destructive",
      });
      return;
    }

    setIsTestChatMode(true);
    createTempSessionMutation.mutate(currentAgentId);
  };

  const handleClearTestChat = () => {
    setTestChatHistory([]);
    setTempSessionId(null);
    setIsTestChatMode(false);
    setTestMessage("");
  };

  const handleRefinePrompt = () => {
    const formData = form.getValues();

    if (!formData.systemPrompt?.trim()) {
      toast({
        title: "Missing System Prompt",
        description: "Please enter a system prompt first",
        variant: "destructive",
      });
      return;
    }

    refinePromptMutation.mutate({
      originalPrompt: formData.systemPrompt,
      personality: formData.personality || '',
      profession: formData.profession || '',
      responseStyle: formData.responseStyle || '',
      specialSkills: formData.specialSkills || [],
      documentIds: selectedDocuments,
    });
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
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

  const toggleFolder = async (folderId: number) => {
    // First ensure we have all documents for this folder loaded
    const totalCount = folderDocumentCounts[folderId];
    const loadedDocs = folderDocuments[folderId] || [];

    // If we don't have all documents loaded, we need to load them all first
    if (totalCount && loadedDocs.length < totalCount) {
      toast({
        title: "Loading all documents",
        description: `Loading all ${totalCount} documents from this folder...`,
      });

      try {
        // Load all remaining documents
        const response = await fetch(`/api/folders/${folderId}/documents?limit=${totalCount}`);
        if (response.ok) {
          const result = await response.json();
          const allDocs = result.documents || result;
          setFolderDocuments(prev => ({ ...prev, [folderId]: allDocs }));
        }
      } catch (error) {
        console.error(`Error fetching all documents for folder ${folderId}:`, error);
        toast({
          title: "Error",
          description: "Failed to load all folder documents",
          variant: "destructive",
        });
        return;
      }
    }

    const folderDocs = folderDocuments[folderId] || [];

    // Check if all documents in folder are selected
    const allDocsSelected = folderDocs.length > 0 && folderDocs.every(doc => selectedDocuments.includes(doc.id));

    if (allDocsSelected) {
      // Deselect all documents in folder
      const docIds = folderDocs.map(doc => doc.id);
      setSelectedDocuments(prev => prev.filter(id => !docIds.includes(id)));
      setSelectedFolders(prev => {
        const next = new Set(prev);
        next.delete(folderId);
        return next;
      });

      // If in editing mode, remove each document individually
      if (isEditing && editAgentId) {
        for (const docId of docIds) {
          try {
            await removeDocumentMutation.mutateAsync(docId);
          } catch (error) {
            console.error(`Failed to remove document ${docId}:`, error);
          }
        }
      }
    } else {
      // Force expand folder when selecting
      setExpandedFolders(prev => new Set([...prev, folderId]));
      setSelectedFolders(prev => new Set([...prev, folderId]));

      // Add all documents from this folder to selected documents
      const docIds = folderDocs.map((doc: FolderDocument) => doc.id);
      setSelectedDocuments(prev => [...new Set([...prev, ...docIds])]);

      // If in editing mode, add each document individually
      if (isEditing && editAgentId) {
        for (const docId of docIds) {
          try {
            await addDocumentMutation.mutateAsync(docId);
          } catch (error) {
            console.error(`Failed to add document ${docId}:`, error);
          }
        }
      }
    }
  };

  const toggleFolderDocument = (documentId: number) => {
    const isSelected = selectedDocuments.includes(documentId);

    if (isSelected) {
      // Remove from selected documents
      setSelectedDocuments(prev => prev.filter(id => id !== documentId));

      // Check if this document belongs to any folder and update folder selection
      for (const [folderId, docs] of Object.entries(folderDocuments)) {
        if (docs.some(doc => doc.id === documentId)) {
          // If this was the last selected document in the folder, deselect the folder
          const folderDocIds = docs.map(doc => doc.id);
          const remainingSelectedInFolder = selectedDocuments.filter(id =>
            id !== documentId && folderDocIds.includes(id)
          );

          if (remainingSelectedInFolder.length === 0) {
            setSelectedFolders(prev => {
              const next = new Set(prev);
              next.delete(parseInt(folderId));
              return next;
            });
          }
          break;
        }
      }

      // If in editing mode, remove the document from the agent
      if (isEditing && editAgentId) {
        removeDocumentMutation.mutate(documentId);
      }
    } else {
      // Add to selected documents
      setSelectedDocuments(prev => [...new Set([...prev, documentId])]);

      // Check if this completes selection of all documents in any folder
      for (const [folderId, docs] of Object.entries(folderDocuments)) {
        if (docs.some(doc => doc.id === documentId)) {
          const folderDocIds = docs.map(doc => doc.id);
          const allFolderDocsSelected = folderDocIds.every(id =>
            selectedDocuments.includes(id) || id === documentId
          );

          if (allFolderDocsSelected) {
            setSelectedFolders(prev => new Set([...prev, parseInt(folderId)]));
          }
          break;
        }
      }

      // If in editing mode, add the document to the agent
      if (isEditing && editAgentId) {
        addDocumentMutation.mutate(documentId);
      }
    }
  };

  // Helper function to check if all documents in folder are selected
  const isFolderFullySelected = (folderId: number): boolean => {
    const folderDocs = folderDocuments[folderId] || [];
    return folderDocs.length > 0 && folderDocs.every(doc => selectedDocuments.includes(doc.id));
  };

  const buildFolderTree = (folders: Folder[]): Folder[] => {
    const folderMap = new Map<number, Folder>();
    const rootFolders: Folder[] = [];

    // First pass: create folder map
    folders.forEach((folder) => {
      folderMap.set(folder.id, { ...folder, children: [] });
    });

    // Second pass: build tree structure
    folders.forEach((folder) => {
      const folderNode = folderMap.get(folder.id)!;
      if (folder.parentId) {
        const parent = folderMap.get(folder.parentId);
        if (parent) {
          parent.children!.push(folderNode);
        } else {
          rootFolders.push(folderNode);
        }
      } else {
        rootFolders.push(folderNode);
      }
    });

    return rootFolders;
  };

  const loadMoreFolderDocuments = async (folderId: number) => {
    setLoadingMoreDocuments(prev => new Set([...prev, folderId]));

    const currentOffset = folderDocumentOffsets[folderId] || 0;
    await fetchFolderDocuments(folderId, currentOffset, true);

    setLoadingMoreDocuments(prev => {
      const next = new Set(prev);
      next.delete(folderId);
      return next;
    });
  };

  const toggleFolderExpansion = async (folderId: number) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });

    // Fetch folder documents if not already fetched and expanding
    if (!expandedFolders.has(folderId) && !folderDocuments[folderId]) {
      await fetchFolderDocuments(folderId, 0, false);
    }
  };

  const filteredDocuments = documents.filter(
    (doc) =>
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredFolders = folders.filter(
    (folder) =>
      folder.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Debug logging
  console.log(`📊 Document counts - Total: ${documents.length}, Filtered: ${filteredDocuments.length}, Folders: ${filteredFolders.length}`);

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

  if (isLoading || isLoadingAgent) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="max-w-7xl mx-auto">
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
                  variant={activeTab === "searchConfig" ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setActiveTab("searchConfig")}
                >
                  <Search className="w-4 h-4 mr-2" />
                  Search Configuration
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
                    onSubmit={(e) => {
                      console.log("🚫 Form onSubmit prevented - manual submission only");
                      e.preventDefault();
                      e.stopPropagation();
                      return false;
                    }}
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
                          <CardContent className="space-y-4">
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

                            {/* Refine Prompt Button */}
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log("🪄 Refine prompt button clicked - NOT submitting form");
                                  handleRefinePrompt();
                                }}
                                disabled={refinePromptMutation.isPending}
                                className="flex items-center gap-2"
                              >
                                {refinePromptMutation.isPending ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Refining...
                                  </>
                                ) : (
                                  <>
                                    <Wand2 className="w-4 h-4" />
                                    Refine System Prompt
                                  </>
                                )}
                              </Button>
                            </div>

                            {/* Show refinement info */}
                            <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                              <h4 className="font-medium text-blue-900 flex items-center gap-2">
                                <Sparkles className="w-4 h-4" />
                                AI Prompt Refinement
                              </h4>
                              <p className="text-sm text-blue-700">
                                Click "Refine System Prompt" to use AI to enhance your prompt with:
                              </p>
                              <ul className="text-sm text-blue-700 space-y-1 ml-4">
                                <li>• More specific role definitions based on personality and profession</li>
                                <li>• Clear guidelines and limitations</li>
                                <li>• Integration with selected documents and their context</li>
                                <li>• Optimized instructions for better performance</li>
                              </ul>
                            </div>
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

                        {/* Knowledge Base (RAG Documents & Folders) */}
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <BookOpen className="h-5 w-5" />
                              Knowledge Base (Documents & Folders)
                            </CardTitle>
                            <CardDescription>
                              Select individual documents or entire folders for this agent's knowledge base.
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              {/* Search */}
                              <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                <Input
                                  placeholder="Search documents and folders..."
                                  value={searchQuery}
                                  onChange={(e) =>
                                    setSearchQuery(e.target.value)
                                  }
                                  className="pl-10"
                                />
                              </div>

                              {/* Selection Summary */}
                              {selectedDocuments.length > 0 && (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge
                                      variant="secondary"
                                      className="bg-blue-100 text-blue-800"
                                    >
                                      <span className="font-medium">
                                        {selectedDocuments.length} document{selectedDocuments.length !== 1 ? 's' : ''} selected
                                      </span>
                                    </Badge>
                                  </div>
                                </div>
                              )}

                              {/* Folders and Documents List */}
                              <div className="max-h-96 overflow-y-auto space-y-2 border rounded-lg p-3">
                                {/* Folders Section */}
                                {filteredFolders.length > 0 && (
                                  <div className="space-y-1">
                                    {buildFolderTree(filteredFolders).map((folder) => (
                                      <div key={folder.id} className="space-y-1">
                                        {/* Folder Item */}
                                        <div className="flex items-center justify-between py-2 px-3 hover:bg-slate-50 transition-colors">
                                          <div className="flex items-center gap-2 flex-1">
                                            <button
                                              onClick={() => toggleFolderExpansion(folder.id)}
                                              className="p-1 hover:bg-slate-200 rounded"
                                            >
                                              {expandedFolders.has(folder.id) ? (
                                                <ChevronDown className="w-3 h-3 text-slate-600" />
                                              ) : (
                                                <ChevronRight className="w-3 h-3 text-slate-600" />
                                              )}
                                            </button>
                                            <Folder className="w-4 h-4 text-blue-600" />
                                            <span className="font-medium text-slate-800">{folder.name}</span>
                                            {folderDocuments[folder.id] && (
                                              <Badge variant="outline" className="text-xs">
                                                {folderDocuments[folder.id].length} docs
                                              </Badge>
                                            )}
                                          </div>

                                          <div
                                            className="cursor-pointer"
                                            onClick={() => toggleFolder(folder.id)}
                                          >
                                            {isFolderFullySelected(folder.id) ? (
                                              <div className="w-4 h-4 bg-blue-600 rounded-sm flex items-center justify-center">
                                                <Check className="w-3 h-3 text-white" />
                                              </div>
                                            ) : (
                                              <div className="w-4 h-4 border-2 border-slate-300 rounded-sm" />
                                            )}
                                          </div>
                                        </div>

                                        {/* Folder Documents (when expanded) */}
                                        {expandedFolders.has(folder.id) &&
                                         folderDocuments[folder.id] && (
                                          <div className="ml-6 space-y-1">
                                            {folderDocuments[folder.id].map((doc) => (
                                              <div
                                                key={doc.id}
                                                className="flex items-center justify-between py-2 px-3 hover:bg-slate-50 transition-colors cursor-pointer"
                                                onClick={() => toggleFolderDocument(doc.id)}
                                              >
                                                <div className="flex items-center gap-2 flex-1">
                                                  <div className="w-4" /> {/* Spacer for alignment */}
                                                  <FileText className="w-4 h-4 text-slate-600" />
                                                  <span className="text-sm text-slate-700">{doc.name}</span>
                                                  {doc.categoryName && (
                                                    <Badge variant="outline" className="text-xs">
                                                      {doc.categoryName}
                                                    </Badge>
                                                  )}
                                                </div>
                                                <div>
                                                  {selectedDocuments.includes(doc.id) ? (
                                                    <div className="w-4 h-4 bg-blue-600 rounded-sm flex items-center justify-center">
                                                      <Check className="w-3 h-3 text-white" />
                                                    </div>
                                                  ) : (
                                                    <div className="w-4 h-4 border-2 border-slate-300 rounded-sm" />
                                                  )}
                                                </div>
                                              </div>
                                            ))}

                                            {/* Load More Button */}
                                            {folderDocumentCounts[folder.id] &&
                                             folderDocuments[folder.id].length < folderDocumentCounts[folder.id] && (
                                              <div className="ml-6 py-2 px-3">
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    loadMoreFolderDocuments(folder.id);
                                                  }}
                                                  disabled={loadingMoreDocuments.has(folder.id)}
                                                  className="w-full text-xs"
                                                >
                                                  {loadingMoreDocuments.has(folder.id) ? (
                                                    <>
                                                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                                      Loading...
                                                    </>
                                                  ) : (
                                                    <>
                                                      <Plus className="w-3 h-3 mr-1" />
                                                      Load More ({folderDocumentCounts[folder.id] - folderDocuments[folder.id].length} remaining)
                                                    </>
                                                  )}
                                                </Button>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}



                                {/* Individual Documents Section */}
                                {filteredDocuments.length > 0 && (
                                  <div className="space-y-1">
                                    {filteredDocuments.map((doc) => (
                                      <div
                                        key={doc.id}
                                        className="flex items-center justify-between py-2 px-3 hover:bg-slate-50 transition-colors cursor-pointer"
                                        onClick={() => toggleDocument(doc.id)}
                                      >
                                        <div className="flex items-center gap-2 flex-1">
                                          <FileText className="w-4 h-4 text-slate-600" />
                                          <span className="text-sm text-slate-700">{doc.name}</span>
                                          {doc.categoryName && (
                                            <Badge variant="outline" className="text-xs">
                                              {doc.categoryName}
                                            </Badge>
                                          )}
                                        </div>
                                        <div>
                                          {selectedDocuments.includes(doc.id) ? (
                                            <div className="w-4 h-4 bg-blue-600 rounded-sm flex items-center justify-center">
                                              <Check className="w-3 h-3 text-white" />
                                            </div>
                                          ) : (
                                            <div className="w-4 h-4 border-2 border-slate-300 rounded-sm" />
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {filteredFolders.length === 0 && filteredDocuments.length === 0 && (
                                  <div className="text-center py-4 text-slate-500">
                                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p>No documents or folders found</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Database Connections */}
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Database className="h-5 w-5" />
                              Database Connections
                            </CardTitle>
                            <CardDescription>
                              Connect databases to enable your agent to query data and answer questions from your databases.
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              {/* Database Selection Component */}
                              <DatabaseConnectionSelector 
                                agentId={isEditing ? parseInt(editAgentId!) : 0}
                                selectedConnections={selectedDatabases}
                                onConnectionsChange={setSelectedDatabases}
                              />

                              {/* Database Info */}
                              <div className="bg-amber-50 rounded-lg p-4 space-y-2">
                                <h4 className="font-medium text-amber-900 flex items-center gap-2">
                                  <Info className="w-4 h-4" />
                                  Database Integration
                                </h4>
                                <div className="text-sm text-amber-700 space-y-1">
                                  <p>• Your agent will be able to generate and execute SQL queries</p>
                                  <p>• Only read-only operations are allowed for security</p>
                                  <p>• Database schema will be automatically analyzed</p>
                                  <p>• Queries are validated before execution</p>
                                </div>
                                {selectedDatabases.length === 0 && (
                                  <div className="mt-3 p-3 bg-white rounded border">
                                    <p className="text-sm text-slate-600 mb-2">
                                      No databases connected yet. To get started:
                                    </p>
                                    <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
                                      <li>Go to <Link href="/data-connections" className="text-blue-600 hover:underline">Data Connections</Link> to create a database connection</li>
                                      <li>Configure your database credentials</li>
                                      <li>Test the connection</li>
                                      <li>Return here to select the database for this agent</li>
                                    </ol>
                                  </div>
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

                    {activeTab === "searchConfig" && (
                      <div className="space-y-6">
                        {/* Search Configuration */}
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Search className="h-5 w-5" />
                              Search Configuration
                            </CardTitle>
                            <CardDescription>
                              Customize how your agent processes and enhances search queries
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-6">
                            {/* Enable Custom Search */}
                            <FormField
                              control={form.control}
                              name="searchConfiguration.enableCustomSearch"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-base">
                                      Enable Custom Search Configuration
                                    </FormLabel>
                                    <FormDescription>
                                      Allow customization of query preprocessing and search enhancement
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

                            {/* Additional Search Details - Only show if enabled */}
                            {form.watch("searchConfiguration.enableCustomSearch") && (
                              <div className="space-y-6">
                                <FormField
                                  control={form.control}
                                  name="searchConfiguration.additionalSearchDetail"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Additional Search Context</FormLabel>
                                      <FormControl>
                                        <Textarea
                                          placeholder="Enter additional context that will be injected into search queries. For example: 'Focus on company policies and HR procedures' or 'Prioritize technical documentation and troubleshooting guides'"
                                          className="min-h-[120px]"
                                          {...field}
                                        />
                                      </FormControl>
                                      <FormDescription>
                                        This text will be appended to the query preprocessor's prompt as: "Help modify search ... {form.watch("searchConfiguration.additionalSearchDetail") || "${additionalSearchDetail}"}"
                                        <br />
                                        <strong>Note:</strong> This will also be included as an additional system prompt for the agent bot.
                                      </FormDescription>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                {/* Chunk Maximum Configuration */}
                                <div className="space-y-4 border-l-4 border-blue-500 pl-4">
                                  <h4 className="font-medium text-slate-800">Chunk Maximum Settings</h4>
                                  <FormField
                                    control={form.control}
                                    name="searchConfiguration.chunkMaxType"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Chunk Maximum Type</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                          <FormControl>
                                            <SelectTrigger>
                                              <SelectValue placeholder="Choose how to limit chunks" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            <SelectItem value="number">Fixed Number</SelectItem>
                                            <SelectItem value="percentage">Percentage of Retrieved Chunks</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        <FormDescription>
                                          Choose whether to limit by a fixed number of chunks or a percentage of retrieved chunks
                                        </FormDescription>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />

                                  <FormField
                                    control={form.control}
                                    name="searchConfiguration.chunkMaxValue"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>
                                          {form.watch("searchConfiguration.chunkMaxType") === "percentage"
                                            ? "Maximum Percentage (%)"
                                            : "Maximum Number of Chunks"}
                                        </FormLabel>
                                        <FormControl>
                                          <div className="space-y-2">
                                            <div className="flex items-center space-x-2">
                                              <span className="text-sm text-slate-500">
                                                {form.watch("searchConfiguration.chunkMaxType") === "percentage" ? "1%" : "1"}
                                              </span>
                                              <Slider
                                                value={[field.value || (form.watch("searchConfiguration.chunkMaxType") === "percentage" ? 5 : 8)]}
                                                onValueChange={(value) => field.onChange(value[0])}
                                                max={form.watch("searchConfiguration.chunkMaxType") === "percentage" ? 100 : 32}
                                                min={form.watch("searchConfiguration.chunkMaxType") === "percentage" ? 1 : 1}
                                                step={form.watch("searchConfiguration.chunkMaxType") === "percentage" ? 1 : 1}
                                                className="flex-1"
                                              />
                                              <span className="text-sm text-slate-500">
                                                {form.watch("searchConfiguration.chunkMaxType") === "percentage" ? "100%" : "32"}
                                              </span>
                                            </div>
                                            <div className="text-center">
                                              <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                                                {field.value || (form.watch("searchConfiguration.chunkMaxType") === "percentage" ? 5 : 8)}{form.watch("searchConfiguration.chunkMaxType") === "percentage" ? "%" : " chunks"}
                                              </Badge>
                                            </div>
                                          </div>
                                        </FormControl>
                                        <FormDescription>
                                          {form.watch("searchConfiguration.chunkMaxType") === "percentage"
                                            ? "Percentage of total available chunks in agent's documents to send to AI (e.g., 5% of 1000 total chunks = 50 chunks max)"
                                            : "Maximum number of chunks to send to AI regardless of how many are retrieved"}
                                        </FormDescription>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>

                                {/* Document Mass Configuration */}
                                <div className="space-y-4 border-l-4 border-green-500 pl-4">
                                  <h4 className="font-medium text-slate-800">Document Mass Selection</h4>
                                  <FormField
                                    control={form.control}
                                    name="searchConfiguration.documentMass"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Document Mass Percentage</FormLabel>
                                        <FormControl>
                                          <div className="space-y-2">
                                            <div className="flex items-center space-x-2">
                                              <span className="text-sm text-slate-500">10%</span>
                                              <Slider
                                                value={[field.value ? field.value * 100 : 30]}
                                                onValueChange={(value) => field.onChange(value[0] / 100)}
                                                max={100}
                                                min={10}
                                                step={5}
                                                className="flex-1"
                                              />
                                              <span className="text-sm text-slate-500">100%</span>
                                            </div>
                                            <div className="text-center">
                                              <Badge variant="secondary" className="bg-green-100 text-green-700">
                                                {Math.round((field.value || 0.3) * 100)}% mass
                                              </Badge>
                                            </div>
                                          </div>
                                        </FormControl>
                                        <FormDescription className="space-y-1">
                                          <div><strong>What is Document Mass?</strong></div>
                                          <div>• Document mass determines how much of the total relevance score to capture</div>
                                          <div>• Lower values (10-30%): Select only the most relevant chunks, more precise but may miss context</div>
                                          <div>• Higher values (60-100%): Include more chunks for broader context, but may include less relevant information</div>
                                          <div>• Recommended: 30% for general use, 60% for document-focused bots</div>
                                        </FormDescription>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>

                                {/* Token Limit Configuration */}
                                <div className="space-y-4 border-l-4 border-purple-500 pl-4">
                                  <div className="flex items-center space-x-2">
                                    <h4 className="font-medium text-slate-800">Token Limit Settings</h4>
                                    <FormField
                                      control={form.control}
                                      name="searchConfiguration.tokenLimitEnabled"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormControl>
                                            <Switch
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  </div>

                                  {form.watch("searchConfiguration.tokenLimitEnabled") && (
                                    <div className="space-y-4">
                                      <FormField
                                        control={form.control}
                                        name="searchConfiguration.tokenLimitType"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Token Limit Type</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                              <FormControl>
                                                <SelectTrigger>
                                                  <SelectValue placeholder="Choose token limit type" />
                                                </SelectTrigger>
                                              </FormControl>
                                              <SelectContent>
                                                <SelectItem value="document">Document Token Limit</SelectItem>
                                                <SelectItem value="final">Final Context Token Limit</SelectItem>
                                              </SelectContent>
                                            </Select>
                                            <FormDescription>
                                              Document: Limit tokens from selected chunks before AI processing<br />
                                              Final: Limit total tokens in final context sent to AI
                                            </FormDescription>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />

                                      {form.watch("searchConfiguration.tokenLimitType") === "document" ? (
                                        <FormField
                                          control={form.control}
                                          name="searchConfiguration.documentTokenLimit"
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Document Token Limit</FormLabel>
                                              <FormControl>
                                                <div className="space-y-2">
                                                  <div className="flex items-center space-x-2">
                                                    <span className="text-sm text-slate-500">1K</span>
                                                    <Slider
                                                      value={[field.value || 12000]}
                                                      onValueChange={(value) => field.onChange(value[0])}
                                                      max={50000}
                                                      min={1000}
                                                      step={1000}
                                                      className="flex-1"
                                                    />
                                                    <span className="text-sm text-slate-500">50K</span>
                                                  </div>
                                                  <div className="text-center">
                                                    <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                                                      {Math.round((field.value || 12000) / 1000)}K tokens
                                                    </Badge>
                                                  </div>
                                                </div>
                                              </FormControl>
                                              <FormDescription>
                                                Maximum tokens from document chunks before processing (1 token ≈ 4 characters)
                                              </FormDescription>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                      ) : (
                                        <FormField
                                          control={form.control}
                                          name="searchConfiguration.finalTokenLimit"
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Final Context Token Limit</FormLabel>
                                              <FormControl>
                                                <div className="space-y-2">
                                                  <div className="flex items-center space-x-2">
                                                    <span className="text-sm text-slate-500">500</span>
                                                    <Slider
                                                      value={[field.value || 4000]}
                                                      onValueChange={(value) => field.onChange(value[0])}
                                                      max={20000}
                                                      min={500}
                                                      step={500}
                                                      className="flex-1"
                                                    />
                                                    <span className="text-sm text-slate-500">20K</span>
                                                  </div>
                                                  <div className="text-center">
                                                    <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                                                      {Math.round((field.value || 4000) / 1000 * 10) / 10}K tokens
                                                    </Badge>
                                                  </div>
                                                </div>
                                              </FormControl>
                                              <FormDescription>
                                                Maximum tokens in final context sent to AI (1 token ≈ 4 characters, includes system prompt + documents + user message)
                                              </FormDescription>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* Preview Section */}
                        {form.watch("searchConfiguration.enableCustomSearch") && (
                          <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                            <h4 className="font-medium text-blue-900 flex items-center gap-2">
                              <Info className="w-4 h-4" />
                              Search Configuration Summary
                            </h4>
                            <div className="space-y-2 text-sm">
                              {form.watch("searchConfiguration.additionalSearchDetail") && (
                                <>
                                  <div>
                                    <span className="font-medium text-blue-800">Query Preprocessor Enhancement:</span>
                                    <div className="bg-white rounded p-2 mt-1 border border-blue-200">
                                      <code className="text-xs text-slate-700">
                                        "Help modify search ... {form.watch("searchConfiguration.additionalSearchDetail")}"
                                      </code>
                                    </div>
                                  </div>
                                  <div>
                                    <span className="font-medium text-blue-800">System Prompt Addition:</span>
                                    <div className="bg-white rounded p-2 mt-1 border border-blue-200">
                                      <code className="text-xs text-slate-700">
                                        Additional context: {form.watch("searchConfiguration.additionalSearchDetail")}
                                      </code>
                                    </div>
                                  </div>
                                </>
                              )}
                              <div>
                                <span className="font-medium text-blue-800">Chunk Limit:</span>
                                <div className="bg-white rounded p-2 mt-1 border border-blue-200">
                                  <code className="text-xs text-slate-700">
                                    {form.watch("searchConfiguration.chunkMaxType") === "percentage"
                                      ? `Maximum ${form.watch("searchConfiguration.chunkMaxValue") || 5}% of retrieved chunks`
                                      : `Maximum ${form.watch("searchConfiguration.chunkMaxValue") || 8} chunks`}
                                  </code>
                                </div>
                              </div>
                              <div>
                                <span className="font-medium text-blue-800">Document Mass:</span>
                                <div className="bg-white rounded p-2 mt-1 border border-blue-200">
                                  <code className="text-xs text-slate-700">
                                    {Math.round((form.watch("searchConfiguration.documentMass") || 0.3) * 100)}% of total relevance score
                                  </code>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Search Configuration Information */}
                        <Card className="border-amber-200 bg-amber-50">
                          <CardContent className="pt-6">
                            <div className="flex items-start space-x-3">
                              <Lightbulb className="w-5 h-5 text-amber-600 mt-0.5" />
                              <div>
                                <h4 className="font-medium text-amber-900">
                                  How Search Configuration Works
                                </h4>
                                <div className="text-sm text-amber-700 mt-2 space-y-2">
                                  <p>
                                    <strong>Query Preprocessing:</strong> Your additional search detail will be injected into the query preprocessor's system prompt, helping it better understand the context and intent of user queries.
                                  </p>
                                  <p>
                                    <strong>Agent System Prompt:</strong> The same detail will be added to your agent's system prompt, ensuring consistent context awareness across both search and response generation.
                                  </p>
                                  <p>
                                    <strong>Example Use Cases:</strong> "Focus on customer service policies", "Prioritize technical troubleshooting steps", "Emphasize safety procedures and compliance"
                                  </p>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    {activeTab === "test" && (
                      <div className="space-y-6">
                        {!isTestChatMode ? (
                          <div className="text-center py-12">
                            <TestTube className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                            <h3 className="text-xl font-medium text-gray-900 mb-2">
                              Test Your Agent
                            </h3>
                            <p className="text-gray-500 mb-6">
                              Start a test conversation to see how your agent responds
                            </p>
                            <Button
                              onClick={handleStartTestChat}
                              disabled={createTempSessionMutation.isPending}
                              className="bg-green-500 hover:bg-green-600"
                            >
                              {createTempSessionMutation.isPending ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Setting up...
                                </>
                              ) : (
                                <>
                                  <Plus className="w-4 h-4 mr-2" />
                                  Start Test Chat
                                </>
                              )}
                            </Button>
                          </div>
                        ) : (
                          <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-[600px]">
                            {/* Chat Header */}
                            <div className="p-4 border-b border-gray-200">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <Avatar className="w-8 h-8">
                                    <AvatarFallback>
                                      <Bot className="w-4 h-4" />
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <h3 className="font-medium text-gray-900">
                                      Testing: {form.watch('name') || "Unnamed Agent"}
                                    </h3>
                                    <p className="text-sm text-gray-500">Test Session</p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleClearTestChat}
                                  >
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Clear Chat
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsTestChatMode(false)}
                                  >
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Back
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* Messages */}
                            <ScrollArea className="flex-1 p-4">
                              <div className="space-y-4">
                                {testChatHistory && testChatHistory.length > 0 ? (
                                  testChatHistory.map((message) => (
                                    <div
                                      key={message.id}
                                      className={`flex space-x-3 ${
                                        message.role === 'user' ? 'justify-end' : 'justify-start'
                                      }`}
                                    >
                                      {message.role === 'assistant' && (
                                        <Avatar className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 flex-shrink-0">
                                          <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-600">
                                            <Bot className="w-4 h-4 text-white" />
                                          </AvatarFallback>
                                        </Avatar>
                                      )}

                                      <div className={`flex-1 max-w-xs lg:max-w-md ${message.role === 'user' ? 'flex justify-end' : ''}`}>
                                        <div className="flex flex-col">
                                          <div className={`rounded-lg px-4 py-3 ${
                                            message.role === 'user'
                                              ? 'bg-blue-500 text-white rounded-tr-none'
                                              : 'bg-gray-100 text-gray-900 rounded-tl-none'
                                          }`}>
                                            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                                          </div>
                                          <p className={`text-xs text-gray-500 mt-1 px-1 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                                            {formatTime(message.createdAt)}
                                          </p>
                                        </div>
                                      </div>

                                      {message.role === 'user' && (
                                        <Avatar className="w-8 h-8 bg-gray-500 flex-shrink-0">
                                          <AvatarFallback className="bg-gray-500">
                                            <User className="w-4 h-4 text-white" />
                                          </AvatarFallback>
                                        </Avatar>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-center py-8 text-gray-500">
                                    <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                                    <p className="text-sm">Start testing your agent by sending a message!</p>
                                  </div>
                                )}

                                <div ref={messagesEndRef} />

                                {sendTestMessageMutation.isPending && (
                                  <div className="flex items-start space-x-3 mt-4">
                                    <Avatar className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600">
                                      <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-600">
                                        <Bot className="w-4 h-4 text-white" />
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="bg-gray-100 rounded-lg rounded-tl-none px-3 py-2 inline-block">
                                      <div className="flex items-center space-x-1">
                                        <div className="animate-bounce w-1 h-1 bg-gray-500 rounded-full"></div>
                                        <div className="animate-bounce w-1 h-1 bg-gray-500 rounded-full" style={{ animationDelay: "0.1s" }}></div>
                                        <div className="animate-bounce w-1 h-1 bg-gray-500 rounded-full" style={{ animationDelay: "0.2s" }}></div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </ScrollArea>

                            {/* Message Input */}
                            <div className="p-4 border-t border-gray-200">
                              <form onSubmit={handleTestAgent} className="flex items-center space-x-2">
                                <Input
                                  type="text"
                                  placeholder="Test your agent..."
                                  value={testMessage}
                                  onChange={(e) => setTestMessage(e.target.value)}
                                  className="flex-1"
                                  disabled={sendTestMessageMutation.isPending}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      handleTestAgent(e as any); // Cast to any to satisfy the expected type
                                    }
                                  }}
                                />
                                <Button
                                  type="submit"
                                  disabled={!testMessage.trim() || sendTestMessageMutation.isPending}
                                  className="bg-blue-500 hover:bg-blue-600 text-white min-w-[44px]"
                                >
                                  {sendTestMessageMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Send className="w-4 h-4" />
                                  )}
                                </Button>
                              </form>

                              {sendTestMessageMutation.isPending && (
                                <div className="text-center text-xs text-gray-500 mt-2">
                                  <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                                  Processing your message...
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Save/Update Button - At Bottom of Form */}
                    <div className="bg-white border-t border-gray-200 px-6 py-4 mt-8">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                          {isEditing ? "Changes are saved automatically" : "Click Save to create your agent"}
                        </div>
                        <Button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log("🔘 Manual save button clicked");
                            form.handleSubmit((data) => {
                              console.log("✅ Manual form submission triggered");
                              onSubmit(data);
                            }, (errors) => {
                              console.log("❌ Manual form validation failed:", errors);
                            })();
                          }}
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
                              {isEditing ? "Update Agent" : "Create Agent"}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </form>
                </Form>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }