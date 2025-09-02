
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Globe, 
  Plus, 
  Trash2, 
  TestTube,
  ExternalLink,
  Search,
  RefreshCw
} from "lucide-react";

interface WhitelistUrl {
  id: number;
  url: string;
  description: string;
  primaryDetails: {
    title: string;
    description: string;
    metadata: any;
  };
  isActive: boolean;
  createdAt: string;
}

interface WebSearchConfig {
  enabled: boolean;
  triggerKeywords: string[];
  maxResults: number;
  requireWhitelist: boolean;
}

interface WebSearchWhitelistProps {
  agentId: number;
}

export default function WebSearchWhitelist({ agentId }: WebSearchWhitelistProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [testQuery, setTestQuery] = useState("");
  const [isTestingSearch, setIsTestingSearch] = useState(false);

  // Fetch whitelist URLs
  const { data: whitelistUrls, isLoading } = useQuery({
    queryKey: [`/api/agent-chatbots/${agentId}/whitelist-urls`],
    enabled: !!agentId,
  }) as { data: WhitelistUrl[] | undefined; isLoading: boolean };

  // Fetch agent details to get web search config
  const { data: agentData } = useQuery({
    queryKey: [`/api/agent-chatbots/${agentId}`],
    enabled: !!agentId,
  });

  // Ensure proper default values for web search config
  const webSearchConfig: WebSearchConfig = {
    enabled: agentData?.webSearchConfig?.enabled || false,
    triggerKeywords: agentData?.webSearchConfig?.triggerKeywords || [],
    maxResults: agentData?.webSearchConfig?.maxResults || 5,
    requireWhitelist: agentData?.webSearchConfig?.requireWhitelist !== false // Default to true
  };

  // Add URL mutation
  const addUrlMutation = useMutation({
    mutationFn: async (data: { url: string; description: string }) => {
      const response = await fetch(`/api/agent-chatbots/${agentId}/whitelist-urls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to add URL");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "URL Added",
        description: "URL has been added to the whitelist successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/agent-chatbots/${agentId}/whitelist-urls`] });
      setIsAddDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add URL",
        variant: "destructive",
      });
    },
  });

  // Remove URL mutation
  const removeUrlMutation = useMutation({
    mutationFn: async (urlId: number) => {
      const response = await fetch(`/api/agent-chatbots/${agentId}/whitelist-urls/${urlId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to remove URL");
      }
    },
    onSuccess: () => {
      toast({
        title: "URL Removed",
        description: "URL has been removed from the whitelist.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/agent-chatbots/${agentId}/whitelist-urls`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove URL",
        variant: "destructive",
      });
    },
  });

  // Update web search config mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (config: WebSearchConfig) => {
      const response = await fetch(`/api/agent-chatbots/${agentId}/web-search-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error("Failed to update configuration");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Configuration Updated",
        description: "Web search configuration has been saved.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/agent-chatbots/${agentId}`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update configuration",
        variant: "destructive",
      });
    },
  });

  // Test web search mutation
  const testSearchMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await fetch(`/api/agent-chatbots/${agentId}/test-web-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error("Failed to test web search");
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Search Test Completed",
        description: `Found ${data.results.length} results from ${data.searchedUrls} whitelisted URLs.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Search Test Failed",
        description: error.message || "Failed to test web search",
        variant: "destructive",
      });
    },
  });

  const handleAddUrl = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    addUrlMutation.mutate({
      url: formData.get("url") as string,
      description: formData.get("description") as string,
    });
  };

  const handleTestSearch = () => {
    if (!testQuery.trim()) {
      toast({
        title: "Query Required",
        description: "Please enter a search query to test.",
        variant: "destructive",
      });
      return;
    }

    setIsTestingSearch(true);
    testSearchMutation.mutate(testQuery, {
      onSettled: () => setIsTestingSearch(false)
    });
  };

  const updateConfig = (updates: Partial<WebSearchConfig>) => {
    const newConfig = { ...webSearchConfig, ...updates };
    updateConfigMutation.mutate(newConfig);
  };

  return (
    <div className="space-y-6">
      {/* Configuration Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Globe className="w-5 h-5" />
            <span>Web Search Configuration</span>
          </CardTitle>
          <p className="text-sm text-gray-600">
            Configure web search settings for this agent. Current status: {webSearchConfig.enabled ? '✅ Enabled' : '❌ Disabled'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="webSearchEnabled">Enable Web Search</Label>
              <p className="text-sm text-gray-500">Allow this agent to search the web</p>
            </div>
            <Switch
              id="webSearchEnabled"
              checked={webSearchConfig.enabled}
              onCheckedChange={(enabled) => updateConfig({ enabled })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="requireWhitelist">Require Whitelist</Label>
              <p className="text-sm text-gray-500">Only search whitelisted URLs</p>
            </div>
            <Switch
              id="requireWhitelist"
              checked={webSearchConfig.requireWhitelist}
              onCheckedChange={(requireWhitelist) => updateConfig({ requireWhitelist })}
            />
          </div>

          <div>
            <Label htmlFor="maxResults">Maximum Results</Label>
            <Input
              id="maxResults"
              type="number"
              min="1"
              max="10"
              value={webSearchConfig.maxResults}
              onChange={(e) => updateConfig({ maxResults: parseInt(e.target.value) || 5 })}
              className="w-20"
            />
          </div>
        </CardContent>
      </Card>

      {/* Whitelist Management Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Search className="w-5 h-5" />
              <span>Whitelisted URLs</span>
              <Badge variant="outline">{whitelistUrls?.length || 0}</Badge>
            </CardTitle>
            
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="flex items-center space-x-2">
                  <Plus className="w-4 h-4" />
                  <span>Add URL</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add URL to Whitelist</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddUrl} className="space-y-4">
                  <div>
                    <Label htmlFor="url">URL</Label>
                    <Input
                      id="url"
                      name="url"
                      type="url"
                      placeholder="https://example.com"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description (optional)</Label>
                    <Textarea
                      id="description"
                      name="description"
                      placeholder="Brief description of this URL's content"
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={addUrlMutation.isPending}>
                      {addUrlMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        "Add URL"
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : whitelistUrls && whitelistUrls.length > 0 ? (
            <div className="space-y-4">
              {whitelistUrls.map((url) => (
                <div key={url.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-medium">{url.primaryDetails?.title || url.url}</h4>
                        <a
                          href={url.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{url.url}</p>
                      {url.description && (
                        <p className="text-sm text-gray-500 mt-2">{url.description}</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeUrlMutation.mutate(url.id)}
                      disabled={removeUrlMutation.isPending}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No whitelisted URLs configured. Add URLs to enable web search for this agent.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TestTube className="w-5 h-5" />
            <span>Test Web Search</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="testQuery">Search Query</Label>
            <Input
              id="testQuery"
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              placeholder="Enter a test query..."
            />
          </div>
          
          <Button
            onClick={handleTestSearch}
            disabled={isTestingSearch || !testQuery.trim()}
            className="flex items-center space-x-2"
          >
            {isTestingSearch ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Searching...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Test Search</span>
              </>
            )}
          </Button>

          {testSearchMutation.data && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium mb-2">Test Results:</h4>
              <p className="text-sm text-gray-600 mb-2">
                Query: "{testSearchMutation.data.query}" - Found {testSearchMutation.data.results.length} results
              </p>
              {testSearchMutation.data.results.length > 0 ? (
                <div className="space-y-2">
                  {testSearchMutation.data.results.map((result: any, index: number) => (
                    <div key={index} className="border-l-2 border-blue-500 pl-3">
                      <h5 className="font-medium text-sm">{result.title}</h5>
                      <p className="text-xs text-gray-500">{result.url}</p>
                      <p className="text-sm text-gray-600 mt-1">{result.snippet}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No results found.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
