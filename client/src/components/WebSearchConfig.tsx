
import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Trash2, Plus, TestTube, Globe } from 'lucide-react';
import { useToast } from '../hooks/use-toast';

interface WhitelistedDomain {
  domain: string;
  description: string;
  searchKeywords: string[];
  priority: number;
  isActive: boolean;
}

interface WebSearchConfigProps {
  agentId: number;
  onConfigChange?: (config: any) => void;
}

export function WebSearchConfig({ agentId, onConfigChange }: WebSearchConfigProps) {
  const { toast } = useToast();
  const [config, setConfig] = useState({
    whitelistedDomains: [] as WhitelistedDomain[],
    maxResultsPerDomain: 2,
    enableAutoTrigger: true,
    searchConfidenceThreshold: 0.7,
  });
  const [loading, setLoading] = useState(true);
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState('');

  useEffect(() => {
    fetchConfig();
  }, [agentId]);

  const fetchConfig = async () => {
    try {
      const response = await fetch(`/api/agents/${agentId}/web-search-config`);
      if (response.ok) {
        const data = await response.json();
        setConfig(data || {
          whitelistedDomains: [],
          maxResultsPerDomain: 2,
          enableAutoTrigger: true,
          searchConfidenceThreshold: 0.7,
        });
      }
    } catch (error) {
      console.error('Error fetching config:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    try {
      const response = await fetch(`/api/agents/${agentId}/web-search-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        toast({ title: 'Success', description: 'Web search configuration saved' });
        onConfigChange?.(config);
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save configuration', variant: 'destructive' });
    }
  };

  const addDomain = () => {
    setConfig(prev => ({
      ...prev,
      whitelistedDomains: [
        ...prev.whitelistedDomains,
        {
          domain: '',
          description: '',
          searchKeywords: [],
          priority: 5,
          isActive: true,
        }
      ]
    }));
  };

  const updateDomain = (index: number, field: keyof WhitelistedDomain, value: any) => {
    setConfig(prev => ({
      ...prev,
      whitelistedDomains: prev.whitelistedDomains.map((domain, i) =>
        i === index ? { ...domain, [field]: value } : domain
      )
    }));
  };

  const removeDomain = (index: number) => {
    setConfig(prev => ({
      ...prev,
      whitelistedDomains: prev.whitelistedDomains.filter((_, i) => i !== index)
    }));
  };

  const testWebSearch = async (domain: string) => {
    if (!testQuery.trim()) {
      toast({ title: 'Error', description: 'Please enter a test query', variant: 'destructive' });
      return;
    }

    try {
      const response = await fetch('/api/web-search/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, query: testQuery }),
      });

      if (response.ok) {
        const data = await response.json();
        setTestResults(data.results);
      } else {
        throw new Error('Test failed');
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to test web search', variant: 'destructive' });
    }
  };

  const analyzeDomain = async (domain: string, index: number) => {
    try {
      const response = await fetch('/api/web-search/analyze-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });

      if (response.ok) {
        const analysis = await response.json();
        updateDomain(index, 'description', analysis.suggestedDescription);
        updateDomain(index, 'searchKeywords', analysis.suggestedKeywords);
        updateDomain(index, 'priority', analysis.recommendedPriority);
        
        toast({ 
          title: 'Success', 
          description: 'Domain analyzed and suggestions applied' 
        });
      }
    } catch (error) {
      toast({ 
        title: 'Error', 
        description: 'Failed to analyze domain', 
        variant: 'destructive' 
      });
    }
  };

  if (loading) {
    return <div>Loading web search configuration...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Web Search Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <label>Enable Auto-Trigger Search</label>
            <Switch
              checked={config.enableAutoTrigger}
              onCheckedChange={(checked) => 
                setConfig(prev => ({ ...prev, enableAutoTrigger: checked }))
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Max Results Per Domain
            </label>
            <Input
              type="number"
              min="1"
              max="10"
              value={config.maxResultsPerDomain}
              onChange={(e) => 
                setConfig(prev => ({ 
                  ...prev, 
                  maxResultsPerDomain: parseInt(e.target.value) || 2 
                }))
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Search Confidence Threshold (0.0 - 1.0)
            </label>
            <Input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={config.searchConfidenceThreshold}
              onChange={(e) => 
                setConfig(prev => ({ 
                  ...prev, 
                  searchConfidenceThreshold: parseFloat(e.target.value) || 0.7 
                }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Whitelisted Domains</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.whitelistedDomains.map((domain, index) => (
            <div key={index} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Input
                  placeholder="example.com"
                  value={domain.domain}
                  onChange={(e) => updateDomain(index, 'domain', e.target.value)}
                  className="flex-1 mr-2"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => analyzeDomain(domain.domain, index)}
                  disabled={!domain.domain}
                >
                  <Globe className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => removeDomain(index)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <Textarea
                placeholder="Description of what this domain provides..."
                value={domain.description}
                onChange={(e) => updateDomain(index, 'description', e.target.value)}
                rows={2}
              />

              <div>
                <label className="block text-sm font-medium mb-2">
                  Search Keywords (comma separated)
                </label>
                <Input
                  placeholder="keyword1, keyword2, keyword3"
                  value={domain.searchKeywords.join(', ')}
                  onChange={(e) => 
                    updateDomain(index, 'searchKeywords', 
                      e.target.value.split(',').map(k => k.trim()).filter(k => k)
                    )
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium mb-2">Priority (1-10)</label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={domain.priority}
                    onChange={(e) => 
                      updateDomain(index, 'priority', parseInt(e.target.value) || 5)
                    }
                    className="w-20"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={domain.isActive}
                    onCheckedChange={(checked) => updateDomain(index, 'isActive', checked)}
                  />
                  <span className="text-sm">Active</span>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testWebSearch(domain.domain)}
                  disabled={!domain.domain || !testQuery}
                >
                  <TestTube className="w-4 h-4 mr-1" />
                  Test
                </Button>
              </div>
            </div>
          ))}

          <Button onClick={addDomain} variant="outline" className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Add Domain
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test Web Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Enter a test query..."
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
          />
          
          {testResults && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Test Results:</h4>
              <pre className="whitespace-pre-wrap text-sm">{testResults}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={saveConfig}>
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
