import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
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
  Upload,
  FileSpreadsheet,
  Trash2,
  Play
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
  type: 'postgresql' | 'mysql' | 'mongodb' | 'redis';
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  isActive: boolean;
  isConnected: boolean;
  connectionString?: string;
  createdAt: string;
  updatedAt: string;
  dbType?: string; // Added for the new section
  description?: string; // Added for the new section
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

  // Form states for SQLite
  const [sqliteDialogOpen, setSqliteDialogOpen] = useState(false);
  const [sqliteForm, setSqliteForm] = useState({
    name: "",
    tableName: "",
    description: "",
    snippets: [] as Array<{question: string, sql: string}>
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [existingFileId, setExistingFileId] = useState<string>("");

  // Fetch database connections
  const { data: connections = [], isLoading: connectionsLoading } = useQuery({
    queryKey: ['/api/database-connections'],
    enabled: isAuthenticated,
    retry: false,
  }) as { data: DatabaseConnection[], isLoading: boolean };

  // Fetch existing files for SQLite
  const { data: existingFiles = [] } = useQuery({
    queryKey: ['/api/sqlite/existing-files'],
    enabled: isAuthenticated && sqliteDialogOpen,
  });

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

  // Create SQLite database mutation
  const createSqliteMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log('🔍 Mutation data received:', data);
      console.log('🔍 Selected file:', selectedFile);
      console.log('🔍 Existing file ID:', existingFileId);

      const formData = new FormData();
      if (selectedFile) {
        formData.append('file', selectedFile);
        console.log('🔍 Added file to FormData:', selectedFile.name);
      } else if (existingFileId) {
        formData.append('existingFileId', existingFileId);
        console.log('🔍 Added existingFileId to FormData:', existingFileId);
      }
      formData.append('dbName', data.name);
      formData.append('tableName', data.tableName);
      formData.append('description', data.description || '');
      formData.append('snippets', JSON.stringify(data.snippets || []));

      console.log('🔍 FormData contents:');
      for (let [key, value] of formData.entries()) {
        console.log(`  ${key}:`, value);
      }

      // Create a promise with timeout
      const requestPromise = apiRequest("POST", "/api/sqlite/create-database", formData);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000);
      });

      return await Promise.race([requestPromise, timeoutPromise]);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "SQLite database created successfully!",
      });
      setSqliteDialogOpen(false);
      setSqliteForm({ name: "", tableName: "", description: "", snippets: [] });
      setSelectedFile(null);
      setExistingFileId("");
      
      // Force refresh the database connections list
      queryClient.invalidateQueries({ queryKey: ['/api/database-connections'] });
      queryClient.refetchQueries({ queryKey: ['/api/database-connections'] });
      
      // Also refresh the existing files list
      queryClient.invalidateQueries({ queryKey: ['/api/sqlite/existing-files'] });
    },
    onError: (error: any) => {
      console.error('SQLite creation error:', error);
      
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

      let errorMessage = "Failed to create SQLite database";
      
      if (error.message === 'Request timeout after 30 seconds') {
        errorMessage = "Request timed out. Please try again with a smaller file.";
      } else if (error.message && error.message.includes('Selected file no longer exists')) {
        errorMessage = "The selected file no longer exists. Please upload a new file.";
        // Clear the existing file selection
        setExistingFileId("");
      } else if (error.message && error.message.includes('File with ID')) {
        errorMessage = "The selected file is no longer available. Please choose another file.";
        setExistingFileId("");
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Error",
        description: errorMessage,
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

  const handleCreateSqlite = () => {
    if (!sqliteForm.name || !sqliteForm.tableName || (!selectedFile && !existingFileId)) {
      toast({
        title: "Missing Information",
        description: "Please provide a name, table name, and select a file",
        variant: "destructive",
      });
      return;
    }

    console.log('🔍 Creating SQLite with:', {
      name: sqliteForm.name,
      tableName: sqliteForm.tableName,
      description: sqliteForm.description,
      selectedFile: selectedFile?.name,
      existingFileId: existingFileId
    });

    createSqliteMutation.mutate(sqliteForm);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setExistingFileId("");
      if (!sqliteForm.name) {
        setSqliteForm(prev => ({ ...prev, name: file.name.replace(/\.[^/.]+$/, "") }));
      }
      if (!sqliteForm.tableName) {
        setSqliteForm(prev => ({ ...prev, tableName: file.name.replace(/\.[^/.]+$/, "").toLowerCase() }));
      }
    }
  };

  const addSqliteSnippet = () => {
    setSqliteForm(prev => ({
      ...prev,
      snippets: [...prev.snippets, { question: "", sql: "" }]
    }));
  };

  const updateSqliteSnippet = (index: number, field: 'question' | 'sql', value: string) => {
    setSqliteForm(prev => ({
      ...prev,
      snippets: prev.snippets.map((snippet, i) =>
        i === index ? { ...snippet, [field]: value } : snippet
      )
    }));
  };

  const removeSqliteSnippet = (index: number) => {
    setSqliteForm(prev => ({
      ...prev,
      snippets: prev.snippets.filter((_, i) => i !== index)
    }));
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
      description: 'Create databases from CSV/Excel files - AI-enabled',
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
  const sqliteConnections = connections.filter(conn => conn.type === 'sqlite');

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Database className="w-8 h-8 text-blue-600" />
              Data Connections
            </h1>
            <p className="text-slate-600 mt-2">
              Manage your database connections and data sources
            </p>
          </div>
        </div>

        {/* Database Management Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Created Databases
            </CardTitle>
          </CardHeader>
          <CardContent>
            {connectionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : connections.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No databases created yet. Create your first database from files below.
              </div>
            ) : (
              <div className="grid gap-4">
                {connections.map((conn) => (
                  <div key={conn.id} className="border rounded-lg p-4 hover:bg-slate-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{conn.name}</h3>
                          <Badge variant={conn.isActive ? "default" : "secondary"}>
                            {conn.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Badge variant="outline">{conn.type?.toUpperCase()}</Badge>
                        </div>
                        {conn.description && (
                          <p className="text-sm text-slate-600 mt-1">{conn.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                          <span>Created: {new Date(conn.createdAt).toLocaleDateString()}</span>
                          {conn.database && (
                            <span>Path: {conn.database.split('/').pop()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // TODO: Implement query interface
                            toast({
                              title: "Info",
                              description: "Query interface coming soon!",
                            });
                          }}
                        >
                          <Play className="w-4 h-4 mr-1" />
                          Query
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            if (confirm('Are you sure you want to delete this database?')) {
                              try {
                                await apiRequest("DELETE", `/api/sqlite/delete-database/${conn.id}`);
                                toast({
                                  title: "Success",
                                  description: "Database deleted successfully",
                                });
                                queryClient.invalidateQueries({ queryKey: ['/api/database-connections'] });
                              } catch (error) {
                                toast({
                                  title: "Error",
                                  description: "Failed to delete database",
                                  variant: "destructive",
                                });
                              }
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>


        {/* Database Types Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {databaseTypes.map((dbType) => {
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

                      {/* SQLite Dialog */}
                      {dbType.id === 'sqlite' && (
                        <Dialog open={sqliteDialogOpen} onOpenChange={setSqliteDialogOpen}>
                          <DialogTrigger asChild>
                            <Button className="w-full" size="sm">
                              <Plus className="w-4 h-4 mr-2" />
                              Create from File
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Create SQLite Database from File</DialogTitle>
                              <DialogDescription>
                                Upload a CSV or Excel file to create an AI-enabled SQLite database
                              </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-6">
                              {/* File Selection */}
                              <div className="grid grid-cols-2 gap-4">
                                <Card>
                                  <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-sm">
                                      <Upload className="w-4 h-4" />
                                      Upload New File
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center">
                                      <Input
                                        type="file"
                                        accept=".csv,.xlsx,.xls"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                        id="sqlite-file-upload"
                                      />
                                      <Label htmlFor="sqlite-file-upload" className="cursor-pointer">
                                        <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                                        <p className="text-xs text-slate-600">
                                          CSV or Excel file
                                        </p>
                                      </Label>
                                    </div>
                                    {selectedFile && (
                                      <div className="mt-2 text-xs text-green-600">
                                        Selected: {selectedFile.name}
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>

                                <Card>
                                  <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-sm">
                                      <FileSpreadsheet className="w-4 h-4" />
                                      Use Existing File
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <Select value={existingFileId} onValueChange={setExistingFileId}>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select existing file" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {existingFiles.map((file: any) => (
                                          <SelectItem key={file.id} value={file.id.toString()}>
                                            {file.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </CardContent>
                                </Card>
                              </div>

                              {/* Database Configuration */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label htmlFor="sqlite-name">Database Name *</Label>
                                  <Input
                                    id="sqlite-name"
                                    value={sqliteForm.name}
                                    onChange={(e) => setSqliteForm(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="My Database"
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="sqlite-table">Table Name *</Label>
                                  <Input
                                    id="sqlite-table"
                                    value={sqliteForm.tableName}
                                    onChange={(e) => setSqliteForm(prev => ({ ...prev, tableName: e.target.value }))}
                                    placeholder="main_table"
                                  />
                                </div>
                              </div>

                              <div>
                                <Label htmlFor="sqlite-description">Description</Label>
                                <Textarea
                                  id="sqlite-description"
                                  value={sqliteForm.description}
                                  onChange={(e) => setSqliteForm(prev => ({ ...prev, description: e.target.value }))}
                                  placeholder="Describe what this database contains..."
                                  rows={2}
                                />
                              </div>

                              {/* SQL Snippets */}
                              <div>
                                <div className="flex items-center justify-between mb-3">
                                  <Label>AI Training Snippets (Optional)</Label>
                                  <Button onClick={addSqliteSnippet} size="sm" variant="outline">
                                    <Plus className="w-3 h-3 mr-1" />
                                    Add
                                  </Button>
                                </div>
                                <div className="space-y-3 max-h-48 overflow-y-auto">
                                  {sqliteForm.snippets.map((snippet, index) => (
                                    <div key={index} className="border rounded-lg p-3 space-y-2">
                                      <div className="flex justify-between items-start">
                                        <Label className="text-xs">Question</Label>
                                        <Button
                                          onClick={() => removeSqliteSnippet(index)}
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 w-6 p-0"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                      <Input
                                        value={snippet.question}
                                        onChange={(e) => updateSqliteSnippet(index, 'question', e.target.value)}
                                        placeholder="What are the top 10 sales?"
                                        className="text-xs"
                                      />
                                      <Label className="text-xs">SQL Query</Label>
                                      <Textarea
                                        value={snippet.sql}
                                        onChange={(e) => updateSqliteSnippet(index, 'sql', e.target.value)}
                                        placeholder="SELECT * FROM sales ORDER BY amount DESC LIMIT 10"
                                        rows={2}
                                        className="text-xs"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setSqliteDialogOpen(false);
                                    setSqliteForm({ name: "", tableName: "", description: "", snippets: [] });
                                    setSelectedFile(null);
                                    setExistingFileId("");
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  onClick={handleCreateSqlite}
                                  disabled={createSqliteMutation.isPending}
                                  className="bg-gray-600 hover:bg-gray-700"
                                >
                                  {createSqliteMutation.isPending ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                      Creating...
                                    </>
                                  ) : (
                                    <>
                                      <Database className="w-4 h-4 mr-2" />
                                      Create Database
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}

                      {!['postgresql', 'mysql', 'sqlite'].includes(dbType.id) && (
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
                              <div className={`w-2 h-2 rounded-full ${connection.isConnected ? 'bg-green-500' : 'bg-orange-500'}`} />
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
                {selectedDatabaseType === 'sqlite' && (
                  <Button
                    onClick={() => {
                      setManageConnectionsOpen(false);
                      setSqliteDialogOpen(true);
                    }}
                    className="bg-gray-600 hover:bg-gray-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create from File
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