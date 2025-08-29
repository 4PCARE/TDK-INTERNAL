import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import {
  Plus,
  Settings,
  Database,
  Check,
  X,
  ExternalLink,
  Zap,
  Server,
  ArrowLeft,
  Copy,
  Globe,
  LinkIcon,
  AlertCircle,
  Cloud,
  Upload // Import Upload icon
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import DashboardLayout from "@/components/Layout/DashboardLayout";

// ConnectionUrlDisplay component for showing connection URLs
function ConnectionUrlDisplay({ connectionId }: { connectionId: number }) {
  const { toast } = useToast();

  const { data: connectionData } = useQuery({
    queryKey: [`/api/database-connections/${connectionId}/details`],
    retry: false,
  });

  const copyToClipboard = (url: string, label: string) => {
    navigator.clipboard.writeText(url).then(() => {
      toast({
        title: "Copied to clipboard",
        description: `${label} copied successfully`,
        duration: 2000,
      });
    });
  };

  if (!connectionData) return null;

  return (
    <div className="space-y-2 px-2">
      {/* Connection String */}
      <div className="flex items-center justify-between text-xs bg-blue-50 dark:bg-blue-950 p-2 rounded">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Database className="w-3 h-3 text-blue-600 flex-shrink-0" />
          <span className="font-medium text-blue-700 dark:text-blue-300">Connection:</span>
          <code className="text-blue-800 dark:text-blue-200 bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded text-xs truncate">
            {connectionData.connectionString}
          </code>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
          onClick={() => copyToClipboard(connectionData.connectionString, "Connection String")}
        >
          <Copy className="w-3 h-3" />
        </Button>
      </div>

      {/* Host/Port Info */}
      {connectionData.host && (
        <div className="flex items-center justify-between text-xs bg-green-50 dark:bg-green-950 p-2 rounded">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Server className="w-3 h-3 text-green-600 flex-shrink-0" />
            <span className="font-medium text-green-700 dark:text-green-300">Endpoint:</span>
            <code className="text-green-800 dark:text-green-200 bg-green-100 dark:bg-green-900 px-1 py-0.5 rounded text-xs truncate">
              {connectionData.host}:{connectionData.port}
            </code>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-green-600 hover:text-green-800"
            onClick={() => copyToClipboard(`${connectionData.host}:${connectionData.port}`, "Endpoint")}
          >
            <Copy className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

interface DatabaseConnection {
  id: number;
  name: string;
  type: 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'sqlite'; // Added sqlite type
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  isActive: boolean;
  isConnected: boolean;
  connectionString?: string;
  createdAt: string;
  updatedAt: string;
}

export default function DataConnections() {
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [postgresDialogOpen, setPostgresDialogOpen] = useState(false);
  const [mysqlDialogOpen, setMysqlDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<DatabaseConnection | null>(null);
  const [manageConnectionsOpen, setManageConnectionsOpen] = useState(false);
  const [selectedDatabaseType, setSelectedDatabaseType] = useState<string>('');

  // Form states for PostgreSQL
  const [postgresForm, setPostgresForm] = useState({
    name: "",
    host: "",
    port: "5432",
    database: "",
    username: "",
    password: "",
    description: ""
  });

  // Form states for MySQL
  const [mysqlForm, setMysqlForm] = useState({
    name: "",
    host: "",
    port: "3306",
    database: "",
    username: "",
    password: "",
    description: ""
  });

  // SQLite creation state
  const [selectedExcelFile, setSelectedExcelFile] = useState<File | null>(null);
  const [excelValidation, setExcelValidation] = useState<any>(null);
  const [isCreatingSQLite, setIsCreatingSQLite] = useState(false);
  const [useExistingFile, setUseExistingFile] = useState(false);
  const [selectedExistingFile, setSelectedExistingFile] = useState<any>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  // State for showing/hiding Excel form
  const [showExcelForm, setShowExcelForm] = useState(false);
  const [existingExcelFiles, setExistingExcelFiles] = useState<any[]>([]);
  const [loadingExcelFiles, setLoadingExcelFiles] = useState(false);

  // Query for existing Excel files
  useEffect(() => {
    if (showExcelForm) {
      fetchExistingExcelFiles();
    }
  }, [showExcelForm]);

  const fetchExistingExcelFiles = async () => {
    try {
      setLoadingExcelFiles(true);
      console.log('🔍 Fetching existing Excel files...');

      const response = await fetch('/api/sqlite/existing-excel', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for authentication
      });

      console.log('📡 Response status:', response.status);
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Non-OK response:', errorText.substring(0, 500));
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
      }

      // Check if response is actually JSON
      const contentType = response.headers.get('content-type');
      console.log('📄 Content-Type:', contentType);

      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        console.error('❌ Expected JSON but got:', responseText.substring(0, 500));
        throw new Error(`Expected JSON response but got ${contentType}`);
      }

      const files = await response.json();
      console.log('✅ Successfully fetched Excel files:', files);
      setExistingExcelFiles(files);
    } catch (error) {
      console.error('💥 Failed to fetch existing Excel files:', error);
      toast({
        title: "Error",
        description: `Failed to load existing Excel files: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoadingExcelFiles(false);
    }
  };

  // Fetch database connections
  const { data: connections = [], isLoading: connectionsLoading } = useQuery({
    queryKey: ['/api/database-connections'],
    enabled: isAuthenticated,
    retry: false,
  }) as { data: DatabaseConnection[], isLoading: boolean };

  // Create PostgreSQL connection mutation
  const createPostgresMutation = useMutation({
    mutationFn: async (data: typeof postgresForm) => {
      return await apiRequest("POST", "/api/database-connections/postgresql", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "PostgreSQL connection created successfully!",
      });
      setPostgresDialogOpen(false);
      setPostgresForm({ name: "", host: "", port: "5432", database: "", username: "", password: "", description: "" });
      queryClient.invalidateQueries({ queryKey: ['/api/database-connections'] });
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
        description: "Failed to create PostgreSQL connection",
        variant: "destructive",
      });
    },
  });

  // Create MySQL connection mutation
  const createMysqlMutation = useMutation({
    mutationFn: async (data: typeof mysqlForm) => {
      return await apiRequest("POST", "/api/database-connections/mysql", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "MySQL connection created successfully!",
      });
      setMysqlDialogOpen(false);
      setMysqlForm({ name: "", host: "", port: "3306", database: "", username: "", password: "", description: "" });
      queryClient.invalidateQueries({ queryKey: ['/api/database-connections'] });
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
        description: "Failed to create MySQL connection",
        variant: "destructive",
      });
    },
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (connection: DatabaseConnection) => {
      return await apiRequest("POST", `/api/database-connections/${connection.id}/test`);
    },
    onSuccess: (response, connection) => {
      toast({
        title: "Connection Test Successful",
        description: `Successfully connected to ${connection.name}!`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/database-connections'] });
    },
    onError: (error, connection) => {
      toast({
        title: "Connection Test Failed",
        description: `Failed to connect to ${connection.name}. Please check your credentials.`,
        variant: "destructive",
      });
    },
  });

  // Delete connection mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/database-connections/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete connection');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database-connections'] });
    },
  });

  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast({
        title: "Invalid File Type",
        description: "Please select an Excel file (.xlsx or .xls)",
        variant: "destructive",
      });
      // Reset file input
      if (excelFileInputRef.current) {
        excelFileInputRef.current.value = '';
      }
      return;
    }

    // Reset states first
    setSelectedExcelFile(file);
    setUseExistingFile(false);
    setSelectedExistingFile(null);
    setExcelValidation(null);
    setShowExcelForm(true);

    try {
      // Add loading state
      setExcelValidation({ isValid: false, errors: [], warnings: [], sheets: [] });
      
      const formData = new FormData();
      formData.append('excel', file);

      const response = await fetch('/api/sqlite/validate-excel', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const validationResult = await response.json();
      setExcelValidation(validationResult);
      
      if (!validationResult.isValid) {
        toast({
          title: "Validation Failed",
          description: `Excel validation failed: ${validationResult.errors?.join(', ') || 'Unknown error'}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "File Validated",
          description: "Excel file validated successfully!",
        });
      }
    } catch (error) {
      console.error('Excel validation failed:', error);
      toast({
        title: "Validation Error",
        description: `Failed to validate Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
      setExcelValidation(null);
      setSelectedExcelFile(null);
      setShowExcelForm(false);
      // Reset file input
      if (excelFileInputRef.current) {
        excelFileInputRef.current.value = '';
      }
    }
  };

  const handleExistingFileSelect = async (file: any) => {
    setSelectedExistingFile(file);
    setUseExistingFile(true);
    setSelectedExcelFile(null);
    setExcelValidation(null);
  };

  const clearExistingFileSelection = () => {
    setSelectedExistingFile(null);
    setUseExistingFile(false);
  };

  const createSQLiteMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      if (useExistingFile) {
        if (!selectedExistingFile || !excelValidation?.isValid) {
          throw new Error('Please select and validate an existing Excel file first');
        }
        // Validate existing file before creation
        const validationResponse = await fetch(`/api/sqlite/validate-existing-excel/${selectedExistingFile.id}`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!validationResponse.ok) {
          throw new Error('Failed to validate existing Excel file');
        }
        const validationResult = await validationResponse.json();
        if (!validationResult.isValid) {
          throw new Error('Excel file validation failed');
        }
      } else {
        if (!selectedExcelFile || !excelValidation?.isValid) {
          throw new Error('Please select and validate an Excel file first');
        }
      }

      const formData = new FormData();

      if (useExistingFile) {
        formData.append('useExistingFile', 'true');
        formData.append('existingFileId', selectedExistingFile.id.toString());
      } else {
        formData.append('excel', selectedExcelFile!);
      }

      formData.append('name', data.name);
      if (data.description) {
        formData.append('description', data.description);
      }

      const response = await fetch('/api/sqlite/create-sqlite', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "SQLite database created successfully!",
      });
      // Reset form states
      setSelectedExcelFile(null);
      setSelectedExistingFile(null);
      setExcelValidation(null);
      setUseExistingFile(false);
      setSqliteName('');
      setSqliteDescription('');
      setShowExcelForm(false);
      setIsCreatingSQLite(false);
      // Reset file input
      if (excelFileInputRef.current) {
        excelFileInputRef.current.value = '';
      }

      // Refresh connections list
      queryClient.invalidateQueries({ queryKey: ['/api/database-connections'] });
    },
    onError: (error: any) => {
      console.error('SQLite creation error:', error);
      setIsCreatingSQLite(false);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create SQLite database",
        variant: "destructive",
      });
    },
  });


  const handleCreateSQLite = async () => {
    if (useExistingFile) {
      if (!selectedExistingFile || !sqliteName.trim() || !excelValidation?.isValid) return;
    } else {
      if (!selectedExcelFile || !sqliteName.trim() || !excelValidation?.isValid) return;
    }

    setIsCreatingSQLite(true);
    try {
      await createSQLiteMutation.mutateAsync({ name: sqliteName, description: sqliteDescription });
    } finally {
      setIsCreatingSQLite(false);
    }
  };

  const handleTestConnection = (connection: DatabaseConnection) => {
    testConnectionMutation.mutate(connection);
  };

  const handleManageConnections = (databaseType: string) => {
    setSelectedDatabaseType(databaseType);
    setManageConnectionsOpen(true);
  };

  const handleCreatePostgres = () => {
    if (!postgresForm.name || !postgresForm.host || !postgresForm.database || !postgresForm.username) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    createPostgresMutation.mutate(postgresForm);
  };

  const handleCreateMysql = () => {
    if (!mysqlForm.name || !mysqlForm.host || !mysqlForm.database || !mysqlForm.username) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    createMysqlMutation.mutate(mysqlForm);
  };

  const databaseTypes = [
    {
      id: 'postgresql',
      name: 'PostgreSQL',
      description: 'Production-ready PostgreSQL database with advanced features',
      icon: Database,
      color: 'bg-blue-500',
      available: true,
      comingSoon: false
    },
    {
      id: 'mysql',
      name: 'MySQL',
      description: 'Popular relational database management system',
      icon: Database,
      color: 'bg-orange-500',
      available: true,
      comingSoon: false
    },
    {
      id: 'mongodb',
      name: 'MongoDB',
      description: 'NoSQL document database for modern applications',
      icon: Database,
      color: 'bg-green-500',
      available: false,
      comingSoon: true
    },
    {
      id: 'redis',
      name: 'Redis',
      description: 'In-memory data structure store for caching and sessions',
      icon: Zap,
      color: 'bg-red-500',
      available: false,
      comingSoon: true
    },
    {
      id: 'sqlite',
      name: 'SQLite',
      description: 'Lightweight, serverless SQL database engine - Create from Excel files',
      icon: Database,
      color: 'bg-gray-500',
      available: true,
      comingSoon: false
    },
    {
      id: 'elasticsearch',
      name: 'Elasticsearch',
      description: 'Distributed search and analytics engine',
      icon: Database,
      color: 'bg-yellow-500',
      available: false,
      comingSoon: true
    }
  ];

  const postgresConnections = connections.filter(conn => conn.type === 'postgresql');
  const mysqlConnections = connections.filter(conn => conn.type === 'mysql');
  const sqliteConnections = connections.filter(conn => conn.type === 'sqlite'); // Filter for SQLite connections

  // State for SQLite creation form
  const [sqliteName, setSqliteName] = useState('');
  const [sqliteDescription, setSqliteDescription] = useState('');

  const handleExcelFileSelect = (file: File) => {
    setSelectedExcelFile(file);
    setExcelValidation(null);
  };

  const clearExcelSelection = () => {
    setSelectedExcelFile(null);
    setExcelValidation(null);
    if (excelFileInputRef.current) {
      excelFileInputRef.current.value = '';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Database Connections
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Connect to databases and manage your data connections for AI-powered insights
            </p>
          </div>
          <Link href="/integrations">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Integrations
            </Button>
          </Link>
        </div>

        {/* New Connection Section (Including SQLite from Excel) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Existing Database Types Grid */}
          {databaseTypes.filter(dbType => dbType.id !== 'sqlite').map((dbType) => { // Filter out SQLite to render it separately
            const Icon = dbType.icon;
            const existingConnections = connections.filter(conn => conn.type === dbType.id);

            return (
              <Card key={dbType.id} className="relative overflow-hidden">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className={`p-3 rounded-lg ${dbType.color} text-white`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    {dbType.comingSoon && (
                      <Badge variant="secondary">Coming Soon</Badge>
                    )}
                    {existingConnections.length > 0 && (
                      <Badge variant="default" className="bg-green-500">
                        {existingConnections.length} Connected
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg">{dbType.name}</CardTitle>
                  <CardDescription>
                    {dbType.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {dbType.available ? (
                    <div className="space-y-3">
                      {existingConnections.length > 0 && (
                        <div className="space-y-2">
                          {existingConnections.slice(0, 2).map((connection) => (
                            <div key={connection.id} className="space-y-2">
                              <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${connection.isConnected ? 'bg-green-500' : 'bg-orange-500'}`} />
                                  <span className="text-sm font-medium">{connection.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {!connection.isConnected && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-6"
                                      onClick={() => handleTestConnection(connection)}
                                    >
                                      <Check className="w-3 h-3 mr-1" />
                                      Test
                                    </Button>
                                  )}
                                  <Badge variant="outline" className="text-xs">
                                    {connection.database || 'No DB'}
                                  </Badge>
                                </div>
                              </div>
                              <ConnectionUrlDisplay connectionId={connection.id} />
                            </div>
                          ))}
                          {existingConnections.length > 2 && (
                            <button
                              className="text-xs text-blue-600 hover:text-blue-800 text-center w-full py-1 hover:underline"
                              onClick={() => handleManageConnections(dbType.id)}
                            >
                              +{existingConnections.length - 2} more
                            </button>
                          )}
                        </div>
                      )}

                      {/* PostgreSQL Dialog */}
                      {dbType.id === 'postgresql' && (
                        <Dialog open={postgresDialogOpen} onOpenChange={setPostgresDialogOpen}>
                          <DialogTrigger asChild>
                            <Button className="w-full" size="sm">
                              <Plus className="w-4 h-4 mr-2" />
                              Add PostgreSQL
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Create PostgreSQL Connection</DialogTitle>
                              <DialogDescription>
                                Connect to a PostgreSQL database for AI-powered data analysis
                              </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-6">
                              <div className="space-y-4">
                                <div>
                                  <Label htmlFor="pg-name">Connection Name *</Label>
                                  <Input
                                    id="pg-name"
                                    placeholder="e.g., Production Database"
                                    value={postgresForm.name}
                                    onChange={(e) => setPostgresForm(prev => ({ ...prev, name: e.target.value }))}
                                  />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <Label htmlFor="pg-host">Host *</Label>
                                    <Input
                                      id="pg-host"
                                      placeholder="localhost or IP address"
                                      value={postgresForm.host}
                                      onChange={(e) => setPostgresForm(prev => ({ ...prev, host: e.target.value }))}
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="pg-port">Port</Label>
                                    <Input
                                      id="pg-port"
                                      placeholder="5432"
                                      value={postgresForm.port}
                                      onChange={(e) => setPostgresForm(prev => ({ ...prev, port: e.target.value }))}
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <Label htmlFor="pg-database">Database Name *</Label>
                                    <Input
                                      id="pg-database"
                                      placeholder="your_database_name"
                                      value={postgresForm.database}
                                      onChange={(e) => setPostgresForm(prev => ({ ...prev, database: e.target.value }))}
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="pg-username">Username *</Label>
                                    <Input
                                      id="pg-username"
                                      placeholder="database_user"
                                      value={postgresForm.username}
                                      onChange={(e) => setPostgresForm(prev => ({ ...prev, username: e.target.value }))}
                                    />
                                  </div>
                                </div>

                                <div>
                                  <Label htmlFor="pg-password">Password</Label>
                                  <Input
                                    id="pg-password"
                                    type="password"
                                    placeholder="Enter password"
                                    value={postgresForm.password}
                                    onChange={(e) => setPostgresForm(prev => ({ ...prev, password: e.target.value }))}
                                  />
                                </div>

                                <div>
                                  <Label htmlFor="pg-description">Description</Label>
                                  <Textarea
                                    id="pg-description"
                                    placeholder="Optional description"
                                    value={postgresForm.description}
                                    onChange={(e) => setPostgresForm(prev => ({ ...prev, description: e.target.value }))}
                                  />
                                </div>
                              </div>

                              <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setPostgresDialogOpen(false);
                                    setPostgresForm({ name: "", host: "", port: "5432", database: "", username: "", password: "", description: "" });
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  onClick={handleCreatePostgres}
                                  disabled={createPostgresMutation.isPending}
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  {createPostgresMutation.isPending ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                      Creating...
                                    </>
                                  ) : (
                                    <>
                                      <Database className="w-4 h-4 mr-2" />
                                      Create Connection
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}

                      {/* MySQL Dialog */}
                      {dbType.id === 'mysql' && (
                        <Dialog open={mysqlDialogOpen} onOpenChange={setMysqlDialogOpen}>
                          <DialogTrigger asChild>
                            <Button className="w-full" size="sm">
                              <Plus className="w-4 h-4 mr-2" />
                              Add MySQL
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Create MySQL Connection</DialogTitle>
                              <DialogDescription>
                                Connect to a MySQL database for AI-powered data analysis
                              </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-6">
                              <div className="space-y-4">
                                <div>
                                  <Label htmlFor="mysql-name">Connection Name *</Label>
                                  <Input
                                    id="mysql-name"
                                    placeholder="e.g., MySQL Production"
                                    value={mysqlForm.name}
                                    onChange={(e) => setMysqlForm(prev => ({ ...prev, name: e.target.value }))}
                                  />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <Label htmlFor="mysql-host">Host *</Label>
                                    <Input
                                      id="mysql-host"
                                      placeholder="localhost or IP address"
                                      value={mysqlForm.host}
                                      onChange={(e) => setMysqlForm(prev => ({ ...prev, host: e.target.value }))}
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="mysql-port">Port</Label>
                                    <Input
                                      id="mysql-port"
                                      placeholder="3306"
                                      value={mysqlForm.port}
                                      onChange={(e) => setMysqlForm(prev => ({ ...prev, port: e.target.value }))}
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <Label htmlFor="mysql-database">Database Name *</Label>
                                    <Input
                                      id="mysql-database"
                                      placeholder="your_database_name"
                                      value={mysqlForm.database}
                                      onChange={(e) => setMysqlForm(prev => ({ ...prev, database: e.target.value }))}
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="mysql-username">Username *</Label>
                                    <Input
                                      id="mysql-username"
                                      placeholder="database_user"
                                      value={mysqlForm.username}
                                      onChange={(e) => setMysqlForm(prev => ({ ...prev, username: e.target.value }))}
                                    />
                                  </div>
                                </div>

                                <div>
                                  <Label htmlFor="mysql-password">Password</Label>
                                  <Input
                                    id="mysql-password"
                                    type="password"
                                    placeholder="Enter password"
                                    value={mysqlForm.password}
                                    onChange={(e) => setMysqlForm(prev => ({ ...prev, password: e.target.value }))}
                                  />
                                </div>

                                <div>
                                  <Label htmlFor="mysql-description">Description</Label>
                                  <Textarea
                                    id="mysql-description"
                                    placeholder="Optional description"
                                    value={mysqlForm.description}
                                    onChange={(e) => setMysqlForm(prev => ({ ...prev, description: e.target.value }))}
                                  />
                                </div>
                              </div>

                              <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setMysqlDialogOpen(false);
                                    setMysqlForm({ name: "", host: "", port: "3306", database: "", username: "", password: "", description: "" });
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  onClick={handleCreateMysql}
                                  disabled={createMysqlMutation.isPending}
                                  className="bg-orange-600 hover:bg-orange-700"
                                >
                                  {createMysqlMutation.isPending ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                      Creating...
                                    </>
                                  ) : (
                                    <>
                                      <Database className="w-4 h-4 mr-2" />
                                      Create Connection
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}

                      {!['postgresql', 'mysql'].includes(dbType.id) && (
                        <Button disabled className="w-full" size="sm" variant="outline">
                          Coming Soon
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button disabled className="w-full" size="sm" variant="outline">
                      Coming Soon
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* SQLite from Excel Card */}
          <Card className="relative overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-3 rounded-lg bg-gray-500 text-white">
                  <Database className="w-6 h-6" />
                </div>
                {databaseTypes.find(d => d.id === 'sqlite')?.comingSoon && (
                  <Badge variant="secondary">Coming Soon</Badge>
                )}
                {sqliteConnections.length > 0 && (
                  <Badge variant="default" className="bg-green-500">
                    {sqliteConnections.length} Connected
                  </Badge>
                )}
              </div>
              <CardTitle className="text-lg">SQLite</CardTitle>
              <CardDescription>
                Lightweight, serverless SQL database engine - Create from Excel files
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sqliteConnections.length > 0 && (
                  <div className="space-y-2">
                    {sqliteConnections.slice(0, 2).map((connection) => (
                      <div key={connection.id} className="space-y-2">
                        <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${connection.isConnected ? 'bg-green-500' : 'bg-orange-500'}`} />
                            <span className="text-sm font-medium">{connection.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {!connection.isConnected && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-6"
                                onClick={() => handleTestConnection(connection)}
                              >
                                <Check className="w-3 h-3 mr-1" />
                                Test
                              </Button>
                            )}
                            <Badge variant="outline" className="text-xs">
                              {connection.database || 'No DB'}
                            </Badge>
                          </div>
                        </div>
                        <ConnectionUrlDisplay connectionId={connection.id} />
                      </div>
                    ))}
                    {sqliteConnections.length > 2 && (
                      <button
                        className="text-xs text-blue-600 hover:text-blue-800 text-center w-full py-1 hover:underline"
                        onClick={() => handleManageConnections('sqlite')}
                      >
                        +{sqliteConnections.length - 2} more
                      </button>
                    )}
                  </div>
                )}

                {/* SQLite from Excel Section */}
                <CardContent className="border-b">
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Database className="h-5 w-5" />
                      <h3 className="text-lg font-semibold">Create SQLite from Excel</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Upload an Excel file to automatically create a SQLite database.
                    </p>
                    <div className="flex items-center space-x-4">
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleExcelUpload}
                        ref={excelFileInputRef}
                        className="hidden"
                        id="excel-upload"
                      />
                      <Button
                        onClick={() => excelFileInputRef.current?.click()}
                        variant="outline"
                        disabled={isCreatingSQLite || !!selectedExistingFile}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {isCreatingSQLite ? 'Processing...' : 'Upload New Excel File'}
                      </Button>
                      {selectedExcelFile && (
                        <span className="text-sm text-muted-foreground">
                          Selected: {selectedExcelFile.name}
                        </span>
                      )}
                    </div>

                    {selectedExcelFile && (
                      <div className="space-y-2">
                        {!excelValidation ? (
                          <div className="text-sm text-blue-600">
                            <strong>Validating Excel file...</strong>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 inline-block ml-2"></div>
                          </div>
                        ) : (
                          <>
                            <div className="text-sm">
                              <strong>Validation Results:</strong>
                              {excelValidation.isValid ? (
                                <span className="text-green-600 ml-2">✓ Valid Excel file</span>
                              ) : (
                                <span className="text-red-600 ml-2">✗ Issues found</span>
                              )}
                            </div>
                          </>
                        )}
                        {excelValidation && (
                          <>
                            {excelValidation.sheets.map(sheet => (
                              <div key={sheet.name} className="text-xs bg-gray-50 p-2 rounded">
                                <strong>{sheet.name}:</strong> {sheet.rowCount} rows, {sheet.columnCount} columns
                                <br />Headers: {sheet.hasHeaders ? 'Yes' : 'No'}
                                <br />Columns: {sheet.columns.join(', ')}
                              </div>
                            ))}
                            {excelValidation.warnings && excelValidation.warnings.length > 0 && (
                              <div className="text-xs text-yellow-600">
                                <strong>Warnings:</strong>
                                <ul className="list-disc list-inside">
                                  {excelValidation.warnings.map((warning, i) => (
                                    <li key={i}>{warning}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </>
                            {excelValidation.isValid && (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  placeholder="Database name (e.g., Sales Data)"
                                  value={sqliteName}
                                  onChange={(e) => setSqliteName(e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                  disabled={isCreatingSQLite}
                                />
                                <textarea
                                  placeholder="Description (optional)"
                                  value={sqliteDescription}
                                  onChange={(e) => setSqliteDescription(e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                  rows={2}
                                  disabled={isCreatingSQLite}
                                />
                                <Button
                                  onClick={handleCreateSQLite}
                                  disabled={!sqliteName.trim() || isCreatingSQLite || !excelValidation.isValid}
                                  className="w-full"
                                >
                                  {isCreatingSQLite ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                      Creating Database...
                                    </>
                                  ) : (
                                    'Create SQLite Database'
                                  )}
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </div>
            </CardContent>
          </Card>
        </div>


        {/* Manage Connections Modal */}
        <Dialog open={manageConnectionsOpen} onOpenChange={setManageConnectionsOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                Manage {databaseTypes.find(d => d.id === selectedDatabaseType)?.name} Connections
              </DialogTitle>
              <DialogDescription>
                View and manage all your {databaseTypes.find(d => d.id === selectedDatabaseType)?.name} database connections
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto">
              <div className="space-y-4 pr-2">
                {connections
                  .filter(connection => connection.type === selectedDatabaseType)
                  .map((connection) => (
                    <Card key={connection.id} className="border">
                      <CardContent className="p-4">
                        <div className="space-y-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-3 h-3 rounded-full ${connection.isConnected ? 'bg-green-500' : 'bg-orange-500'}`} />
                              <div>
                                <h4 className="font-semibold text-lg">{connection.name}</h4>
                                <div className="flex items-center gap-4 text-sm text-slate-500">
                                  <span>Host: {connection.host}:{connection.port}</span>
                                  <span>Database: {connection.database}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={connection.isConnected ? "default" : "secondary"}>
                                {connection.isConnected ? "Connected" : "Disconnected"}
                              </Badge>
                              <Badge variant={connection.isActive ? "default" : "outline"}>
                                {connection.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                            <div>
                              <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Username</Label>
                              <p className="text-sm font-mono">{connection.username}</p>
                            </div>
                            <div>
                              <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Connection ID</Label>
                              <p className="text-sm font-mono">#{connection.id}</p>
                            </div>
                          </div>

                          <div>
                            <Label className="text-sm font-medium mb-2 block">Connection Details</Label>
                            <ConnectionUrlDisplay connectionId={connection.id} />
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t">
                            <div className="flex items-center gap-2">
                              {!connection.isConnected && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleTestConnection(connection)}
                                  disabled={testConnectionMutation.isPending}
                                >
                                  <Check className="w-4 h-4 mr-2" />
                                  Test Connection
                                </Button>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingConnection(connection);
                                }}
                              >
                                <Settings className="w-4 h-4 mr-2" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => deleteMutation.mutate(connection.id)}
                                disabled={deleteMutation.isPending}
                              >
                                <X className="w-4 h-4 mr-2" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                {connections.filter(connection => connection.type === selectedDatabaseType).length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No connections found for this database type</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <div className="text-sm text-slate-500">
                {connections.filter(connection => connection.type === selectedDatabaseType).length} connection(s) total
              </div>
              <div className="flex gap-2">
                {selectedDatabaseType === 'postgresql' && (
                  <Button
                    onClick={() => {
                      setManageConnectionsOpen(false);
                      setPostgresDialogOpen(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add PostgreSQL
                  </Button>
                )}
                {selectedDatabaseType === 'mysql' && (
                  <Button
                    onClick={() => {
                      setManageConnectionsOpen(false);
                      setMysqlDialogOpen(true);
                    }}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add MySQL
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setManageConnectionsOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Quick Actions */}
        <div className="flex items-center gap-4">
          <Link href="/integrations">
            <Button variant="outline" className="flex items-center gap-2">
              <Cloud className="w-4 h-4" />
              Social Media Integrations
            </Button>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}