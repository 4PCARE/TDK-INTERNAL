import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  Zap, 
  Sparkles, 
  Brain,
  FileText,
  MessageSquare
} from "lucide-react";

interface SearchBarProps {
  onSearch: (query: string, type: "keyword" | "semantic") => void;
}

export default function SearchBar({ onSearch }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"keyword" | "semantic">("keyword");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim(), searchType);
    }
  };

  const handleQuickSearch = (quickQuery: string, type: "keyword" | "semantic") => {
    setQuery(quickQuery);
    setSearchType(type);
    onSearch(quickQuery, type);
  };

  const keywordExamples = [
    "financial report 2024",
    "budget analysis",
    "user manual",
    "meeting notes",
  ];

  const semanticExamples = [
    "documents about company performance",
    "information on user onboarding",
    "technical specifications for products",
    "legal compliance requirements",
  ];

  return (
    <div className="space-y-6">
      {/* Main Search */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {searchType === "semantic" ? (
              <Zap className="h-5 w-5 text-blue-500" />
            ) : (
              <Search className="h-5 w-5 text-slate-400" />
            )}
          </div>
          <Input
            type="text"
            placeholder={
              searchType === "semantic" 
                ? "Describe what you're looking for in natural language..."
                : "Enter keywords to search documents..."
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 pr-4 py-3 text-base"
          />
        </div>
        
        <div className="flex items-center justify-between">
          <Tabs value={searchType} onValueChange={(value) => setSearchType(value as "keyword" | "semantic")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="keyword" className="flex items-center space-x-2">
                <Search className="w-4 h-4" />
                <span>Keyword Search</span>
              </TabsTrigger>
              <TabsTrigger value="semantic" className="flex items-center space-x-2">
                <Zap className="w-4 h-4" />
                <span>Semantic Search</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          <Button 
            type="submit" 
            disabled={!query.trim()}
            className="ml-4 bg-primary text-white hover:bg-blue-700"
          >
            Search
          </Button>
        </div>
      </form>

      {/* Search Type Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className={`border transition-colors ${searchType === "keyword" ? "border-primary bg-blue-50" : "border-slate-200"}`}>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Search className="w-5 h-5 text-slate-600" />
              <h3 className="font-medium text-slate-800">Keyword Search</h3>
              {searchType === "keyword" && (
                <Badge variant="default" className="text-xs">Active</Badge>
              )}
            </div>
            <p className="text-sm text-slate-600 mb-3">
              Search for exact words and phrases in document titles and content.
            </p>
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700">Quick examples:</p>
              <div className="flex flex-wrap gap-1">
                {keywordExamples.map((example, index) => (
                  <Badge 
                    key={index}
                    variant="outline" 
                    className="cursor-pointer hover:bg-slate-100 text-xs"
                    onClick={() => handleQuickSearch(example, "keyword")}
                  >
                    {example}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border transition-colors ${searchType === "semantic" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Zap className="w-5 h-5 text-blue-500" />
              <h3 className="font-medium text-slate-800">Semantic Search</h3>
              {searchType === "semantic" && (
                <Badge className="bg-blue-500 text-white text-xs">Active</Badge>
              )}
            </div>
            <p className="text-sm text-slate-600 mb-3">
              AI-powered search that understands meaning and context, not just keywords.
            </p>
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700">Quick examples:</p>
              <div className="flex flex-wrap gap-1">
                {semanticExamples.map((example, index) => (
                  <Badge 
                    key={index}
                    variant="outline" 
                    className="cursor-pointer hover:bg-blue-100 hover:border-blue-300 text-xs"
                    onClick={() => handleQuickSearch(example, "semantic")}
                  >
                    {example}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search Tips */}
      <Card className="border-slate-200">
        <CardContent className="p-4">
          <h3 className="font-medium text-slate-800 mb-3 flex items-center">
            <Sparkles className="w-5 h-5 mr-2 text-amber-500" />
            Search Tips
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600">
            <div>
              <h4 className="font-medium text-slate-700 mb-2">For Keyword Search:</h4>
              <ul className="space-y-1 text-xs">
                <li>• Use specific terms and phrases</li>
                <li>• Include dates, names, or technical terms</li>
                <li>• Try different variations of words</li>
                <li>• Use quotation marks for exact phrases</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-slate-700 mb-2">For Semantic Search:</h4>
              <ul className="space-y-1 text-xs">
                <li>• Describe what you're looking for naturally</li>
                <li>• Use concepts and ideas, not just keywords</li>
                <li>• Ask questions or describe scenarios</li>
                <li>• Include context and related concepts</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
