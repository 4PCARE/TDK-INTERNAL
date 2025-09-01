import { useState, useMemo } from "react";
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
  Play,
  Wrench,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


// DatabaseConnectionCard component with data preview
const DatabaseConnectionCard = ({ 
  connection, 
  onEdit 
}: { 
  connection: DatabaseConnection;
  onEdit: (connection: DatabaseConnection) => void;
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPreview, setShowPreview] = useState(false);

  const { data: schemaData, isLoading: schemaLoading } = useQuery({
    queryKey: [`/api/database-connections/${connection.id}/schema`],
    enabled: showPreview,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  return (
    <div className="border rounded-lg p-4 hover:bg-slate-50">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{connection.name}</h3>
            <Badge variant={connection.isActive ? "default" : "secondary"}>
              {connection.isActive ? "Active" : "Inactive"}
            </Badge>
            <Badge variant="outline">{connection.type?.toUpperCase()}</Badge>
          </div>
          {connection.description && (
            <p className="text-sm text-slate-600 mt-1">{connection.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
            <span>Created: {new Date(connection.createdAt).toLocaleDateString()}</span>
            {connection.database && (
              <span>Path: {connection.database.split('/').pop()}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Database className="w-4 h-4 mr-1" />
            {showPreview ? 'Hide Preview' : 'Preview Data'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
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
            onClick={() => onEdit(connection)}
          >
            <Settings className="w-4 h-4 mr-1" />
            Configure
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              if (confirm('Are you sure you want to delete this database?')) {
                try {
                  await apiRequest("DELETE", `/api/sqlite/delete-database/${connection.id}`);
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

      {/* Data Preview Section */}
      {showPreview && (
        <div className="mt-4 border-t pt-4">
          {schemaLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-sm">Loading data preview...</span>
            </div>
          ) : schemaData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 p-3 bg-slate-50 rounded-lg">
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-600">{schemaData.summary.totalTables}</div>
                  <div className="text-xs text-slate-600">Tables</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">{schemaData.summary.totalColumns}</div>
                  <div className="text-xs text-slate-600">Columns</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-purple-600">{schemaData.summary.estimatedRows}</div>
                  <div className="text-xs text-slate-600">Rows</div>
                </div>
              </div>

              <div className="space-y-4 max-h-96 overflow-y-auto">
                {schemaData.tables.map((table: any) => (
                  <Card key={table.name} className="border">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Database className="w-4 h-4" />
                        {table.name}
                        <Badge variant="outline" className="text-xs">{table.rowCount} rows</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {/* Schema Info */}
                      <div className="mb-3">
                        <div className="text-xs font-medium text-slate-600 mb-1">Columns:</div>
                        <div className="flex flex-wrap gap-1">
                          {table.columns.slice(0, 6).map((column: any) => (
                            <Badge key={column.name} variant="outline" className="text-xs">
                              {column.name} ({column.type})
                            </Badge>
                          ))}
                          {table.columns.length > 6 && (
                            <Badge variant="outline" className="text-xs">
                              +{table.columns.length - 6} more
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Sample Data */}
                      {table.sampleData && table.sampleData.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-slate-600 mb-2">Sample Data (First 3 rows):</div>
                          <div className="border rounded overflow-hidden">
                            <Table className="text-xs">
                              <TableHeader>
                                <TableRow className="bg-slate-50">
                                  {table.columns.slice(0, 4).map((column: any) => (
                                    <TableHead key={column.name} className="text-xs font-medium px-2 py-1">
                                      {column.name}
                                    </TableHead>
                                  ))}
                                  {table.columns.length > 4 && (
                                    <TableHead className="text-xs font-medium px-2 py-1">...</TableHead>
                                  )}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {table.sampleData.slice(0, 3).map((row: any, index: number) => (
                                  <TableRow key={index}>
                                    {table.columns.slice(0, 4).map((column: any) => (
                                      <TableCell key={column.name} className="px-2 py-1 max-w-32">
                                        <div className="truncate" title={row[column.name]?.toString()}>
                                          {row[column.name] === null || row[column.name] === undefined ? (
                                            <span className="text-slate-400 italic">NULL</span>
                                          ) : (
                                            row[column.name]?.toString()
                                          )}
                                        </div>
                                      </TableCell>
                                    ))}
                                    {table.columns.length > 4 && (
                                      <TableCell className="px-2 py-1 text-slate-400">...</TableCell>
                                    )}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm text-slate-500">Failed to load data preview</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// TableDataViewer component for DBeaver-style display
const TableDataViewer = ({ table }: { table: any }) => {
  const [filters, setFilters] = useState<{[key: string]: string}>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const rowsPerPage = 10;

  const filteredData = table.sampleData?.filter((row: any) => {
    return Object.entries(filters).every(([column, filterValue]) => {
      if (!filterValue) return true;
      const cellValue = row[column]?.toString().toLowerCase() || '';
      return cellValue.includes(filterValue.toLowerCase());
    });
  }) || [];

  const paginatedData = filteredData.slice(
    currentPage * rowsPerPage,
    (currentPage + 1) * rowsPerPage
  );

  const totalPages = Math.ceil(filteredData.length / rowsPerPage);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="w-4 h-4" />
            {table.name}
            <Badge variant="outline">{table.rowCount} rows</Badge>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Schema Section */}
        <div>
          <h4 className="font-medium mb-2">Schema</h4>
          <div className="space-y-2">
            {table.columns.map((column: any) => (
              <div key={column.name} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{column.name}</span>
                  {column.isPrimaryKey && <Badge variant="default" className="text-xs">PK</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{column.type}</Badge>
                  {!column.nullable && <Badge variant="secondary" className="text-xs">NOT NULL</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Data Section */}
        {table.sampleData && table.sampleData.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Sample Data</h4>

            {/* Filters */}
            {showFilters && (
              <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {table.columns.map((column: any) => (
                    <div key={column.name}>
                      <Label className="text-xs text-slate-600">{column.name}</Label>
                      <Input
                        placeholder={`Filter ${column.name}...`}
                        value={filters[column.name] || ''}
                        onChange={(e) => {
                          setFilters(prev => ({
                            ...prev,
                            [column.name]: e.target.value
                          }));
                          setCurrentPage(0);
                        }}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
                {Object.values(filters).some(f => f) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilters({});
                      setCurrentPage(0);
                    }}
                    className="mt-2"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Clear Filters
                  </Button>
                )}
              </div>
            )}

            {/* Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    {table.columns.map((column: any) => (
                      <TableHead key={column.name} className="font-medium">
                        <div className="flex items-center gap-1">
                          {column.name}
                          {column.isPrimaryKey && (
                            <Badge variant="default" className="text-xs">PK</Badge>
                          )}
                        </div>
                        <div className="text-xs font-normal text-slate-500 mt-1">
                          {column.type}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.length > 0 ? (
                    paginatedData.map((row: any, index: number) => (
                      <TableRow key={index}>
                        {table.columns.map((column: any) => (
                          <TableCell key={column.name} className="max-w-48">
                            <div className="truncate" title={row[column.name]?.toString()}>
                              {row[column.name] === null || row[column.name] === undefined ? (
                                <span className="text-slate-400 italic">NULL</span>
                              ) : (
                                row[column.name]?.toString()
                              )}
                            </div>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={table.columns.length}
                        className="text-center text-slate-500 py-8"
                      >
                        {Object.values(filters).some(f => f) ? 'No matching data' : 'No data available'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-slate-600">
                  Showing {currentPage * rowsPerPage + 1} to{' '}
                  {Math.min((currentPage + 1) * rowsPerPage, filteredData.length)} of{' '}
                  {filteredData.length} rows
                  {Object.values(filters).some(f => f) && ` (filtered from ${table.sampleData.length})`}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                    disabled={currentPage === 0}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm">
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                    disabled={currentPage === totalPages - 1}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'updatedAt' | 'name'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'settings' | 'schema' | 'snippets' | 'inference'>('settings');
  
  // SQL Snippets state
  const [sqlSnippets, setSqlSnippets] = useState<Array<{
    id?: number;
    name: string;
    sql: string;
    description: string;
  }>>([]);

  // SQLite file analysis states
  const [selectedFile, setSelectedFile] = useState<{ filePath: string; name: string } | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<{
    issues: string[];
    canCleanup: boolean;
    cleanupSuggestions: string[];
  } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [uploadMethod, setUploadMethod] = useState<'existing' | 'upload'>('existing');
  const [isLoading, setIsLoading] = useState(false); // Loading state for file analysis

  // Schema discovery queries
  const { data: schemaData, isLoading: schemaLoading } = useQuery({
    queryKey: [`/api/database-connections/${editingConnection?.id}/schema`],
    enabled: !!(editingConnection?.id && selectedTab === 'schema'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  const { data: inferenceData, isLoading: inferenceLoading } = useQuery({
    queryKey: [`/api/database-connections/${editingConnection?.id}/infer-types`],
    enabled: !!(editingConnection?.id && selectedTab === 'inference'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Fetch SQL snippets
  const { data: snippetsData, isLoading: snippetsLoading, refetch: refetchSnippets } = useQuery({
    queryKey: [`/api/database/${editingConnection?.id}/snippets`],
    enabled: !!(editingConnection?.id && selectedTab === 'snippets'),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

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

      // Create abort controller for cleanup
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 60000); // 60 seconds timeout

      try {
        const response = await fetch("/api/sqlite/create-database", {
          method: "POST",
          body: formData,
          credentials: "include",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Request timeout after 60 seconds');
        }
        throw error;
      }
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

  // Update database mutation
  const updateDatabaseMutation = useMutation({
    mutationFn: async (data: { id: number; updates: any }) => {
      return await apiRequest("PUT", `/api/database-connections/${data.id}`, data.updates);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Database updated successfully!",
      });
      setEditDialogOpen(false);
      setEditingConnection(null);
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
        description: "Failed to update database",
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

  // SQL Snippets mutations
  const createSnippetMutation = useMutation({
    mutationFn: async (snippet: { name: string; sql: string; description: string }) => {
      return await apiRequest("POST", `/api/database/${editingConnection?.id}/snippets`, snippet);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "SQL snippet created successfully!",
      });
      refetchSnippets();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create SQL snippet",
        variant: "destructive",
      });
    },
  });

  const updateSnippetMutation = useMutation({
    mutationFn: async ({ id, snippet }: { id: number; snippet: { name: string; sql: string; description: string } }) => {
      return await apiRequest("PUT", `/api/database/snippets/${id}`, snippet);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "SQL snippet updated successfully!",
      });
      refetchSnippets();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update SQL snippet",
        variant: "destructive",
      });
    },
  });

  const deleteSnippetMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/database/snippets/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "SQL snippet deleted successfully!",
      });
      refetchSnippets();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete SQL snippet",
        variant: "destructive",
      });
    },
  });

  const handleTestConnection = (connection: DatabaseConnection) => {
    testConnectionMutation.mutate(connection);
  };

  const handleEditConnection = (connection: DatabaseConnection) => {
    setEditingConnection(connection);
    setEditDialogOpen(true);
    setSelectedTab('schema'); // Default to schema tab for better data preview
    setSqlSnippets([]); // Reset snippets state
  };

  // SQL Snippets helper functions
  const addSqlSnippet = () => {
    setSqlSnippets(prev => [...prev, { name: "", sql: "", description: "" }]);
  };

  const updateSqlSnippet = (index: number, field: 'name' | 'sql' | 'description', value: string) => {
    setSqlSnippets(prev => prev.map((snippet, i) => 
      i === index ? { ...snippet, [field]: value } : snippet
    ));
  };

  const removeSqlSnippet = (index: number) => {
    setSqlSnippets(prev => prev.filter((_, i) => i !== index));
  };

  const saveSqlSnippet = async (index: number) => {
    const snippet = sqlSnippets[index];
    if (!snippet.name || !snippet.sql) {
      toast({
        title: "Missing Information",
        description: "Please provide both name and SQL query",
        variant: "destructive",
      });
      return;
    }

    if (snippet.id) {
      await updateSnippetMutation.mutateAsync({ id: snippet.id, snippet });
    } else {
      await createSnippetMutation.mutateAsync(snippet);
    }
  };

  const deleteSqlSnippet = async (id: number) => {
    if (confirm('Are you sure you want to delete this SQL snippet?')) {
      await deleteSnippetMutation.mutateAsync(id);
    }
  };

  const handleUpdateConnection = () => {
    if (!editingConnection) return;

    updateDatabaseMutation.mutate({
      id: editingConnection.id,
      updates: editingConnection
    });
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
      setSelectedFile({ filePath: URL.createObjectURL(file), name: file.name });
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

  const handleAnalyzeFile = async () => {
    if (!selectedFile?.filePath) return;

    setIsLoading(true);
    setAnalysisError(null);
    setAnalysis(null);
    setDiagnosis(null);

    try {
      const response = await apiRequest('POST', '/api/sqlite/analyze-file', {
        filePath: selectedFile.filePath
      });

      setAnalysis(response);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Failed to analyze file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiagnoseFile = async () => {
    if (!selectedFile?.filePath) return;

    setIsLoading(true);

    try {
      const response = await apiRequest('POST', '/api/sqlite/diagnose-file', {
        filePath: selectedFile.filePath
      });

      setDiagnosis(response);
    } catch (error) {
      console.error('Error diagnosing file:', error);
      setAnalysisError(error instanceof Error ? error.message : 'Failed to diagnose file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileCleanup = async () => {
    if (!selectedFile?.filePath) return;

    setIsCreating(true);
    setAnalysisError(null);

    try {
      const response = await apiRequest('POST', '/api/sqlite/clean-file', {
        filePath: selectedFile.filePath
      });

      // Update the analysis with the cleaned file result
      setAnalysis(response.analysis);
      setDiagnosis(null);

      // Update selected file to point to cleaned file
      setSelectedFile(prev => prev ? {
        ...prev,
        filePath: response.cleanedFilePath,
        name: prev.name + ' (cleaned)'
      } : null);

      alert(`File cleaned successfully!\n\nOriginal issues: ${response.originalIssues.join(', ')}\n\nFixes applied: ${response.fixesApplied.join(', ')}`);

    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Failed to clean file');
    } finally {
      setIsCreating(false);
    }
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

  // Filter and sort connections with memoization
  const filteredConnections = useMemo(() => {
    if (!connections || connections.length === 0) return [];

    const filtered = connections.filter(conn => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return conn.name.toLowerCase().includes(query) ||
             (conn.description && conn.description.toLowerCase().includes(query)) ||
             conn.type.toLowerCase().includes(query);
    });

    return filtered.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'updatedAt':
          aValue = new Date(a.updatedAt).getTime();
          bValue = new Date(b.updatedAt).getTime();
          break;
        default: // createdAt
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [connections, searchQuery, sortBy, sortOrder]);

  // Optimized connection type filtering
  const connectionsByType = useMemo(() => {
    return {
      postgresql: filteredConnections.filter(conn => conn.type === 'postgresql'),
      mysql: filteredConnections.filter(conn => conn.type === 'mysql'),
      sqlite: filteredConnections.filter(conn => conn.type === 'sqlite')
    };
  }, [filteredConnections]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
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
            <div className="flex gap-4 mt-4">
              <div className="flex-1">
                <Input
                  placeholder="Search databases..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <Select value={sortBy} onValueChange={(value: 'createdAt' | 'updatedAt' | 'name') => setSortBy(value)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">Created Date</SelectItem>
                  <SelectItem value="updatedAt">Updated Date</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {connectionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-slate-600">Loading databases...</span>
              </div>
            ) : filteredConnections.length === 0 && searchQuery ? (
              <div className="text-center py-8 text-slate-500">
                No databases match your search criteria.
              </div>
            ) : filteredConnections.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No databases created yet. Create your first database from files below.
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredConnections.map((conn) => (
                  <DatabaseConnectionCard 
                    key={conn.id} 
                    connection={conn} 
                    onEdit={handleEditConnection}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>


        {/* Database Types Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {databaseTypes.map((dbType) => {
            const Icon = dbType.icon;
            const existingConnections = connectionsByType[dbType.id as keyof typeof connectionsByType] || [];

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
                          <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
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
                          <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
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

                              {/* AI Analysis & Cleanup */}
                              {selectedFile && (
                                <div className="border p-4 rounded-lg bg-slate-50">
                                  <div className="flex items-center justify-between mb-3">
                                    <Label className="text-lg font-semibold">AI File Analysis</Label>
                                    <Button size="sm" onClick={handleAnalyzeFile} disabled={isLoading}>
                                      {isLoading ? 'Analyzing...' : 'Analyze File'}
                                    </Button>
                                  </div>

                                  {analysisError && (
                                    <Alert variant="destructive" className="mt-4">
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertTitle>Analysis Failed</AlertTitle>
                                      <AlertDescription>
                                        {analysisError}
                                        {analysisError.includes('Issues detected') && (
                                          <div className="mt-3">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={handleFileCleanup}
                                              disabled={isCreating}
                                              className="mr-2"
                                            >
                                              <Wrench className="w-4 h-4 mr-2" />
                                              Try File Cleanup
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={handleDiagnoseFile}
                                              disabled={isCreating}
                                            >
                                              <Search className="w-4 h-4 mr-2" />
                                              Diagnose Issues
                                            </Button>
                                          </div>
                                        )}
                                      </AlertDescription>
                                    </Alert>
                                  )}

                                  {diagnosis && (
                                    <Alert className="mt-4">
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertTitle>File Issues Detected</AlertTitle>
                                      <AlertDescription>
                                        <div className="space-y-2">
                                          <p><strong>Problems found:</strong></p>
                                          <ul className="list-disc pl-5 space-y-1">
                                            {diagnosis.issues.map((issue, index) => (
                                              <li key={index} className="text-sm">{issue}</li>
                                            ))}
                                          </ul>

                                          <p className="mt-3"><strong>Suggested fixes:</strong></p>
                                          <ul className="list-disc pl-5 space-y-1">
                                            {diagnosis.cleanupSuggestions.map((suggestion, index) => (
                                              <li key={index} className="text-sm text-muted-foreground">{suggestion}</li>
                                            ))}
                                          </ul>

                                          <div className="mt-3">
                                            <Button
                                              variant="default"
                                              size="sm"
                                              onClick={handleFileCleanup}
                                              disabled={isCreating}
                                            >
                                              <Wrench className="w-4 h-4 mr-2" />
                                              Create Cleaned File
                                            </Button>
                                          </div>
                                        </div>
                                      </AlertDescription>
                                    </Alert>
                                  )}

                                  {analysis && !analysisError && !diagnosis && (
                                    <div className="mt-4 border-t pt-4">
                                      <h4 className="font-medium mb-2">Analysis Summary:</h4>
                                      <p className="text-sm text-gray-700">
                                        {analysis.summary || "No specific summary available. Analysis complete."}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}


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
                                    setAnalysis(null);
                                    setAnalysisError(null);
                                    setDiagnosis(null);
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
                                onClick={async () => {
                                  if (confirm('Are you sure you want to delete this database connection?')) {
                                    try {
                                      await apiRequest("DELETE", `/api/database-connections/${connection.id}`);
                                      toast({
                                        title: "Success",
                                        description: "Database connection deleted successfully",
                                      });
                                      queryClient.invalidateQueries({ queryKey: ['/api/database-connections'] });
                                    } catch (error) {
                                      toast({
                                        title: "Error",
                                        description: "Failed to delete database connection",
                                        variant: "destructive",
                                      });
                                    }
                                  }
                                }}
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

        {/* Edit Database Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Configure Database</DialogTitle>
              <DialogDescription>
                Edit database settings, view schema, and manage SQL snippets
              </DialogDescription>
            </DialogHeader>

            {editingConnection && (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="border-b pb-2">
                  <div className="flex space-x-1">
                    <Button
                      variant={selectedTab === 'settings' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setSelectedTab('settings')}
                    >
                      Settings
                    </Button>
                    <Button
                      variant={selectedTab === 'schema' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setSelectedTab('schema')}
                    >
                      Schema
                    </Button>
                    <Button
                      variant={selectedTab === 'snippets' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setSelectedTab('snippets')}
                    >
                      SQL Snippets
                    </Button>
                    <Button
                      variant={selectedTab === 'inference' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setSelectedTab('inference')}
                    >
                      Type Inference
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 min-h-0">
                  {selectedTab === 'settings' && (
                    <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-name">Database Name</Label>
                    <Input
                      id="edit-name"
                      value={editingConnection.name}
                      onChange={(e) => setEditingConnection({
                        ...editingConnection,
                        name: e.target.value
                      })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-type">Type</Label>
                    <Input
                      id="edit-type"
                      value={editingConnection.type}
                      disabled
                      className="bg-gray-100"
                    />
                  </div>
                </div>

                {editingConnection.type !== 'sqlite' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="edit-host">Host</Label>
                        <Input
                          id="edit-host"
                          value={editingConnection.host || ''}
                          onChange={(e) => setEditingConnection({
                            ...editingConnection,
                            host: e.target.value
                          })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-port">Port</Label>
                        <Input
                          id="edit-port"
                          type="number"
                          value={editingConnection.port || ''}
                          onChange={(e) => setEditingConnection({
                            ...editingConnection,
                            port: parseInt(e.target.value) || undefined
                          })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="edit-database">Database Name</Label>
                        <Input
                          id="edit-database"
                          value={editingConnection.database || ''}
                          onChange={(e) => setEditingConnection({
                            ...editingConnection,
                            database: e.target.value
                          })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-username">Username</Label>
                        <Input
                          id="edit-username"
                          value={editingConnection.username || ''}
                          onChange={(e) => setEditingConnection({
                            ...editingConnection,
                            username: e.target.value
                          })}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={editingConnection.description || ''}
                    onChange={(e) => setEditingConnection({
                      ...editingConnection,
                      description: e.target.value
                    })}
                    placeholder="Optional description"
                  />
                </div>

                <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="edit-active"
                          checked={editingConnection.isActive}
                          onChange={(e) => setEditingConnection({
                            ...editingConnection,
                            isActive: e.target.checked
                          })}
                        />
                        <Label htmlFor="edit-active">Active</Label>
                      </div>
                    </div>
                  )}

                  {selectedTab === 'schema' && (
                    <div className="space-y-4">
                      {schemaLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                          <span className="ml-2">Discovering schema...</span>
                        </div>
                      ) : schemaData ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-blue-600">{schemaData.summary.totalTables}</div>
                              <div className="text-sm text-slate-600">Tables</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">{schemaData.summary.totalColumns}</div>
                              <div className="text-sm text-slate-600">Columns</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-purple-600">{schemaData.summary.estimatedRows}</div>
                              <div className="text-sm text-slate-600">Rows</div>
                            </div>
                          </div>

                          <div className="space-y-6">
                            {schemaData.tables.map((table: any) => (
                              <TableDataViewer key={table.name} table={table} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>Failed to discover schema</p>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedTab === 'snippets' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">SQL Snippets for AI Training</h4>
                          <p className="text-sm text-slate-600">Create example queries to help the AI understand your data better</p>
                        </div>
                        <Button onClick={addSqlSnippet} size="sm">
                          <Plus className="w-4 h-4 mr-2" />
                          Add Snippet
                        </Button>
                      </div>

                      {snippetsLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                          <span className="ml-2">Loading SQL snippets...</span>
                        </div>
                      ) : (
                        <div className="space-y-4 max-h-96 overflow-y-auto">
                          {/* Existing snippets from database */}
                          {snippetsData?.map((snippet: any) => (
                            <Card key={snippet.id} className="border">
                              <CardContent className="p-4">
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="font-medium">{snippet.name}</div>
                                    <Button
                                      onClick={() => deleteSqlSnippet(snippet.id)}
                                      size="sm"
                                      variant="ghost"
                                      className="text-red-600 hover:text-red-800"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                  {snippet.description && (
                                    <p className="text-sm text-slate-600">{snippet.description}</p>
                                  )}
                                  <div className="bg-slate-50 p-3 rounded-lg">
                                    <code className="text-sm">{snippet.sql}</code>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}

                          {/* New snippets being created */}
                          {sqlSnippets.map((snippet, index) => (
                            <Card key={index} className="border-dashed border-2">
                              <CardContent className="p-4">
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-sm font-medium">New SQL Snippet</Label>
                                    <div className="flex gap-2">
                                      <Button
                                        onClick={() => saveSqlSnippet(index)}
                                        size="sm"
                                        disabled={createSnippetMutation.isPending || updateSnippetMutation.isPending}
                                      >
                                        {createSnippetMutation.isPending || updateSnippetMutation.isPending ? (
                                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                        ) : (
                                          <Check className="w-3 h-3" />
                                        )}
                                      </Button>
                                      <Button
                                        onClick={() => removeSqlSnippet(index)}
                                        size="sm"
                                        variant="ghost"
                                      >
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <Label className="text-xs">Name</Label>
                                    <Input
                                      value={snippet.name}
                                      onChange={(e) => updateSqlSnippet(index, 'name', e.target.value)}
                                      placeholder="e.g., Get top 10 sales"
                                      className="text-sm"
                                    />
                                  </div>
                                  
                                  <div>
                                    <Label className="text-xs">Description (optional)</Label>
                                    <Input
                                      value={snippet.description}
                                      onChange={(e) => updateSqlSnippet(index, 'description', e.target.value)}
                                      placeholder="What does this query do?"
                                      className="text-sm"
                                    />
                                  </div>
                                  
                                  <div>
                                    <Label className="text-xs">SQL Query</Label>
                                    <Textarea
                                      value={snippet.sql}
                                      onChange={(e) => updateSqlSnippet(index, 'sql', e.target.value)}
                                      placeholder="SELECT * FROM sales ORDER BY amount DESC LIMIT 10"
                                      rows={3}
                                      className="text-sm font-mono"
                                    />
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}

                          {(!snippetsData || snippetsData.length === 0) && sqlSnippets.length === 0 && (
                            <div className="text-center py-8 text-slate-500">
                              <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                              <p>No SQL snippets yet</p>
                              <p className="text-xs mt-2">Add example queries to help the AI understand your data better</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedTab === 'inference' && (
                    <div className="space-y-4">
                      {inferenceLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                          <span className="ml-2">Analyzing data types...</span>
                        </div>
                      ) : inferenceData ? (
                        <div className="space-y-4">
                          {inferenceData.recommendations.length === 0 ? (
                            <div className="text-center py-8">
                              <Check className="w-12 h-12 mx-auto mb-4 text-green-500" />
                              <p className="text-green-600">All data types look optimal!</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <h4 className="font-medium">Data Type Recommendations</h4>
                              {inferenceData.recommendations.map((rec: any, index: number) => (
                                <div key={index} className="border rounded-lg p-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium">{rec.table}.{rec.column}</span>
                                    <Badge variant="outline" className="bg-blue-50">
                                      {Math.round(rec.confidence * 100)}% confidence
                                    </Badge>
                                  </div>
                                  <div className="text-sm text-slate-600 space-y-1">
                                    <div>Current: <code className="bg-red-100 px-1 rounded">{rec.currentType}</code></div>
                                    <div>Recommended: <code className="bg-green-100 px-1 rounded">{rec.recommendedType}</code></div>
                                    <div>Reason: {rec.reason}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>Failed to analyze data types</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {selectedTab === 'settings' && (
                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditDialogOpen(false);
                        setEditingConnection(null);
                        setSelectedTab('settings');
                        setSqlSnippets([]);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUpdateConnection}
                      disabled={updateDatabaseMutation.isPending}
                    >
                      {updateDatabaseMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Updating...
                        </>
                      ) : (
                        <>
                          <Settings className="w-4 h-4 mr-2" />
                          Update Database
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {selectedTab !== 'settings' && (
                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditDialogOpen(false);
                        setEditingConnection(null);
                        setSelectedTab('settings');
                        setSqlSnippets([]);
                      }}
                    >
                      Close
                    </Button>
                  </div>
                )}
              </div>
            )}
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