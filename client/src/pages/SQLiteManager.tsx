
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Database, Upload, FileSpreadsheet, Plus, Trash2, Play } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface FileInfo {
  id: number;
  name: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  createdAt: string;
  mimeType: string;
}

interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
}

interface SQLSnippet {
  question: string;
  sql: string;
  description?: string;
}

export default function SQLiteManager() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  
  // State
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFilePath, setUploadedFilePath] = useState<string>("");
  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const [dbName, setDbName] = useState("");
  const [tableName, setTableName] = useState("");
  const [description, setDescription] = useState("");
  const [snippets, setSnippets] = useState<SQLSnippet[]>([]);
  const [testSql, setTestSql] = useState("");
  const [queryResult, setQueryResult] = useState<any>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Queries
  const { data: existingFiles = [] } = useQuery({
    queryKey: ['/api/sqlite/existing-files'],
    enabled: isAuthenticated,
  });

  // Mutations
  const analyzeFileMutation = useMutation({
    mutationFn: async (filePath: string) => {
      const response = await fetch('/api/sqlite/analyze-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
      return response.json();
    },
    onSuccess: (data) => {
      setSchema(data.schema);
      setPreview(data.preview);
      if (!tableName) {
        setTableName(selectedFile?.name.replace(/\.[^/.]+$/, "") || "table1");
      }
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/sqlite/upload-file', {
        method: 'POST',
        body: formData,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setSchema(data.schema);
      setPreview(data.preview);
      setUploadedFilePath(data.filePath);
      if (!tableName) {
        setTableName(data.originalName.replace(/\.[^/.]+$/, "") || "table1");
      }
    },
  });

  const createDatabaseMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/sqlite/create-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Database created successfully!" });
      setShowCreateDialog(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/database-connections'] });
    },
  });

  const testQueryMutation = useMutation({
    mutationFn: async ({ connectionId, sql }: { connectionId: number, sql: string }) => {
      const response = await fetch('/api/sqlite/test-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, sql }),
      });
      return response.json();
    },
    onSuccess: (data) => {
      setQueryResult(data);
    },
  });

  // Handlers
  const handleFileSelect = (file: FileInfo) => {
    setSelectedFile(file);
    setUploadedFile(null);
    setUploadedFilePath("");
    if (!dbName) {
      setDbName(file.name);
    }
    analyzeFileMutation.mutate(file.filePath);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setSelectedFile(null);
      if (!dbName) {
        setDbName(file.name.replace(/\.[^/.]+$/, ""));
      }
      uploadFileMutation.mutate(file);
    }
  };

  const addSnippet = () => {
    setSnippets([...snippets, { question: "", sql: "", description: "" }]);
  };

  const updateSnippet = (index: number, field: keyof SQLSnippet, value: string) => {
    const updated = [...snippets];
    updated[index] = { ...updated[index], [field]: value };
    setSnippets(updated);
  };

  const removeSnippet = (index: number) => {
    setSnippets(snippets.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setSelectedFile(null);
    setUploadedFile(null);
    setUploadedFilePath("");
    setSchema([]);
    setPreview([]);
    setDbName("");
    setTableName("");
    setDescription("");
    setSnippets([]);
  };

  const handleCreateDatabase = () => {
    if (!dbName || !tableName || (!selectedFile && !uploadedFile)) {
      toast({ title: "Error", description: "Please fill in all required fields" });
      return;
    }

    const filePath = selectedFile?.filePath || uploadedFilePath;
    
    createDatabaseMutation.mutate({
      filePath,
      dbName,
      tableName,
      description,
      snippets: snippets.filter(s => s.question && s.sql),
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Database className="w-8 h-8 text-blue-600" />
            SQLite Database Manager
          </h1>
          <p className="text-slate-600 mt-2">
            Create AI-enabled databases from your Excel and CSV files
          </p>
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Database
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New SQLite Database</DialogTitle>
            </DialogHeader>
            
            <Tabs defaultValue="select-file" className="space-y-4">
              <TabsList>
                <TabsTrigger value="select-file">Select File</TabsTrigger>
                <TabsTrigger value="configure">Configure</TabsTrigger>
                <TabsTrigger value="snippets">AI Snippets</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>

              <TabsContent value="select-file" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Upload New File */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Upload className="w-5 h-5" />
                        Upload New File
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                        <Input
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          onChange={handleFileUpload}
                          className="hidden"
                          id="file-upload"
                        />
                        <Label htmlFor="file-upload" className="cursor-pointer">
                          <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                          <p className="text-sm text-slate-600">
                            Click to upload CSV or Excel file
                          </p>
                        </Label>
                      </div>
                      {uploadedFile && (
                        <Alert className="mt-4">
                          <AlertDescription>
                            Uploaded: {uploadedFile.name}
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>

                  {/* Existing Files */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5" />
                        Existing Files
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {existingFiles.map((file: FileInfo) => (
                          <div
                            key={file.id}
                            className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                              selectedFile?.id === file.id 
                                ? 'border-blue-500 bg-blue-50' 
                                : 'hover:bg-slate-50'
                            }`}
                            onClick={() => handleFileSelect(file)}
                          >
                            <div className="font-medium">{file.name}</div>
                            <div className="text-xs text-slate-500">
                              {(file.fileSize / 1024).toFixed(1)} KB
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="configure" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="dbName">Database Name *</Label>
                    <Input
                      id="dbName"
                      value={dbName}
                      onChange={(e) => setDbName(e.target.value)}
                      placeholder="My Database"
                    />
                  </div>
                  <div>
                    <Label htmlFor="tableName">Table Name *</Label>
                    <Input
                      id="tableName"
                      value={tableName}
                      onChange={(e) => setTableName(e.target.value)}
                      placeholder="main_table"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe what this database contains..."
                    rows={3}
                  />
                </div>

                {schema.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Detected Schema</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {schema.map((col, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Badge variant="outline">{col.name}</Badge>
                            <Badge variant={col.type === 'TEXT' ? 'secondary' : 'default'}>
                              {col.type}
                            </Badge>
                            {col.nullable && <Badge variant="outline">Nullable</Badge>}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="snippets" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">SQL Snippets for AI Training</h3>
                  <Button onClick={addSnippet} size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Snippet
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {snippets.map((snippet, index) => (
                    <Card key={index}>
                      <CardContent className="pt-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>Question/Description</Label>
                            <Button
                              onClick={() => removeSnippet(index)}
                              size="sm"
                              variant="ghost"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                          <Input
                            value={snippet.question}
                            onChange={(e) => updateSnippet(index, 'question', e.target.value)}
                            placeholder="What are the top 10 sales by amount?"
                          />
                          <Label>SQL Query</Label>
                          <Textarea
                            value={snippet.sql}
                            onChange={(e) => updateSnippet(index, 'sql', e.target.value)}
                            placeholder="SELECT * FROM sales ORDER BY amount DESC LIMIT 10"
                            rows={3}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="preview" className="space-y-4">
                {preview.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Data Preview (First 10 rows)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(preview[0]).map((key) => (
                              <TableHead key={key}>{key}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.map((row, index) => (
                            <TableRow key={index}>
                              {Object.values(row).map((value: any, cellIndex) => (
                                <TableCell key={cellIndex}>
                                  {String(value)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
                
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateDatabase}
                    disabled={createDatabaseMutation.isPending}
                  >
                    {createDatabaseMutation.isPending ? "Creating..." : "Create Database"}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quick Test Section */}
      <Card>
        <CardHeader>
          <CardTitle>Test SQL Query</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={testSql}
            onChange={(e) => setTestSql(e.target.value)}
            placeholder="SELECT * FROM your_table LIMIT 10"
            rows={3}
          />
          <Button 
            onClick={() => {
              // This would need a connection ID - you'd need to select a database first
              toast({ title: "Info", description: "Please create a database first to test queries" });
            }}
            disabled={!testSql.trim()}
          >
            <Play className="w-4 h-4 mr-2" />
            Run Query
          </Button>
          
          {queryResult && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Results:</h4>
              <pre className="bg-slate-100 p-4 rounded-lg text-sm overflow-auto">
                {JSON.stringify(queryResult, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
