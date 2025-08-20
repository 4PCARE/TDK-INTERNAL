import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Calendar,
  TrendingUp,
  Users,
  BarChart3,
  FileText,
  Download,
  Filter,
  Search,
  Eye,
  Hash,
} from "lucide-react";
import { format } from "date-fns";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
} from "recharts";

export default function UserFeedback() {
  const { isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("30");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFeedback, setSelectedFeedback] = useState<any>(null);
  const [documentNameFilter, setDocumentNameFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);

  // Force refresh data when component mounts
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/ai-feedback/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/ai-feedback"] });
  }, [queryClient]);

  // Check for documentId query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const documentId = urlParams.get("documentId");

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

  // Fetch feedback statistics
  const { data: feedbackStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/ai-feedback/stats"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Fetch all feedback data or document-specific feedback
  const { data: allFeedback = [], isLoading: feedbackLoading } = useQuery({
    queryKey: documentId
      ? [`/api/documents/${documentId}/feedback`]
      : ["/api/ai-feedback/export"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Debug: Log feedback data to see what we're getting
  useEffect(() => {
    if (allFeedback && allFeedback.length > 0) {
      console.log("Feedback data sample:", allFeedback[0]);
      console.log("Total feedback items:", allFeedback.length);
      const withDocumentName = allFeedback.filter((f: any) => f.documentName);
      console.log("Items with document name:", withDocumentName.length);
      
      // Check for AI category and tags data
      const withAiCategory = allFeedback.filter((f: any) => f.aiCategory);
      const withTags = allFeedback.filter((f: any) => f.tags && f.tags.length > 0);
      console.log("Items with AI category:", withAiCategory.length);
      console.log("Items with tags:", withTags.length);
      
      // Log detailed data for first few items
      allFeedback.slice(0, 5).forEach((feedback: any, index: number) => {
        console.log(`Feedback ${index} full object:`, feedback);
        console.log(`Feedback ${index} specific fields:`, {
          documentName: feedback.documentName,
          documentId: feedback.documentId,
          aiCategory: feedback.aiCategory,
          aiCategoryColor: feedback.aiCategoryColor,
          tags: feedback.tags,
          documentContext: feedback.documentContext,
          hasAiCategory: !!feedback.aiCategory,
          hasTags: !!(feedback.tags && feedback.tags.length > 0),
          tagsType: typeof feedback.tags,
          tagsValue: feedback.tags
        });
      });
      
      // Check for problematic data types
      allFeedback.forEach((feedback: any, index: number) => {
        if (typeof feedback.documentName === 'object' && feedback.documentName !== null) {
          console.warn(`Feedback ${index} has object documentName:`, feedback.documentName);
        }
        if (typeof feedback.documentId === 'object' && feedback.documentId !== null) {
          console.warn(`Feedback ${index} has object documentId:`, feedback.documentId);
        }
        if (typeof feedback.documentContext === 'object' && feedback.documentContext !== null) {
          console.log(`Feedback ${index} documentContext type:`, typeof feedback.documentContext, feedback.documentContext);
        }
      });
    }
  }, [allFeedback]);

  const handleExport = async () => {
    try {
      const response = await fetch("/api/ai-feedback/export", {
        method: "GET",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const csv = convertToCSV(data);
        const blob = new Blob([csv], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `user_feedback_${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast({
          title: "Export Complete",
          description: "User feedback data has been downloaded successfully",
        });
      }
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export feedback data. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Get unique AI categories for filtering
  const aiCategories = Array.isArray(allFeedback) 
    ? Array.from(new Set(allFeedback.map((feedback: any) => feedback.aiCategory).filter(Boolean)))
    : [];

  // Get unique tags for filtering
  const allTags = Array.isArray(allFeedback) 
    ? Array.from(new Set(
        allFeedback
          .filter((feedback: any) => feedback.tags && Array.isArray(feedback.tags))
          .flatMap((feedback: any) => feedback.tags)
          .filter(Boolean)
      ))
    : [];

  const convertToCSV = (data: any[]) => {
    const headers = [
      "Date",
      "Feedback Type",
      "User Query",
      "Assistant Response",
      "User Note",
      "Document Context",
    ];
    const rows = data.map((item) => [
      format(new Date(item.createdAt), "yyyy-MM-dd HH:mm:ss"),
      item.feedbackType,
      `"${item.userQuery.replace(/"/g, '""')}"`,
      `"${item.assistantResponse.replace(/"/g, '""')}"`,
      item.userNote ? `"${item.userNote.replace(/"/g, '""')}"` : "",
      item.documentContext
        ? `"${JSON.stringify(item.documentContext).replace(/"/g, '""')}"`
        : "",
    ]);

    return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  };

  // Filter feedback based on search and filter criteria
  const filteredFeedback = (
    Array.isArray(allFeedback) ? allFeedback : []
  ).filter((feedback: any) => {
    const matchesType =
      filterType === "all" || feedback.feedbackType === filterType;
    const matchesSearch =
      searchQuery === "" ||
      feedback.userQuery?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feedback.assistantResponse
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      (feedback.userNote &&
        feedback.userNote.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (feedback.documentName &&
        feedback.documentName
          .toLowerCase()
          .includes(searchQuery.toLowerCase()));

    const feedbackDate = new Date(feedback.createdAt);
    const daysAgo = parseInt(filterPeriod);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
    const matchesPeriod = feedbackDate >= cutoffDate;

    // Filter by document name
    const matchesDocumentName =
      documentNameFilter === "" ||
      (feedback.documentName &&
        feedback.documentName
          .toLowerCase()
          .includes(documentNameFilter.toLowerCase()));

    // Filter by AI category
    const matchesCategory =
      categoryFilter.length === 0 ||
      (feedback.aiCategory &&
        categoryFilter.includes(feedback.aiCategory));

    // Filter by tags
    const matchesTags =
      tagFilter.length === 0 ||
      (feedback.tags &&
        Array.isArray(feedback.tags) &&
        feedback.tags.some((tag: string) => tagFilter.includes(tag)));

    return (
      matchesType &&
      matchesSearch &&
      matchesPeriod &&
      matchesDocumentName &&
      matchesCategory &&
      matchesTags
    );
  });

  // Generate trend data for the last 7 days
  const trendData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dateStr = date.toISOString().split("T")[0];

    const dayFeedback = (Array.isArray(allFeedback) ? allFeedback : []).filter(
      (f: any) => f.createdAt.startsWith(dateStr),
    );

    return {
      date: format(date, "MM/dd"),
      helpful: dayFeedback.filter((f: any) => f.feedbackType === "helpful")
        .length,
      not_helpful: dayFeedback.filter(
        (f: any) => f.feedbackType === "not_helpful",
      ).length,
      total: dayFeedback.length,
    };
  });

  // Category breakdown
  const categoryData = [
    {
      name: "Helpful",
      value: (feedbackStats as any)?.helpfulCount || 0,
      color: "#10b981",
    },
    {
      name: "Not Helpful",
      value: (feedbackStats as any)?.notHelpfulCount || 0,
      color: "#ef4444",
    },
  ];

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {documentId
                ? `Document Feedback Analysis`
                : "User Feedback Dashboard"}
            </h1>
            <p className="text-slate-600 mt-1">
              {documentId
                ? `Analyze feedback for Document ID: ${documentId}`
                : "Analyze user feedback from Chat with Document interactions"}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {documentId && (
              <Button
                onClick={() => (window.location.href = "/user-feedback")}
                variant="outline"
              >
                <Eye className="w-4 h-4 mr-2" />
                View All Feedback
              </Button>
            )}
            <Button onClick={handleExport} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export Data
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
        {statsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="border border-slate-200">
                <CardContent className="p-6">
                  <div className="animate-pulse">
                    <div className="h-4 bg-slate-200 rounded w-1/2 mb-2"></div>
                    <div className="h-8 bg-slate-200 rounded w-3/4"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="border border-slate-200">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <MessageSquare className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-slate-600">
                      Total Feedback
                    </p>
                    <p className="text-2xl font-bold text-slate-900">
                      {(feedbackStats as any)?.totalFeedback || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <ThumbsUp className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-slate-600">
                      Helpful
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {(feedbackStats as any)?.helpfulCount || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <ThumbsDown className="w-6 h-6 text-red-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-slate-600">
                      Not Helpful
                    </p>
                    <p className="text-2xl font-bold text-red-600">
                      {(feedbackStats as any)?.notHelpfulCount || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-purple-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-slate-600">
                      Satisfaction Rate
                    </p>
                    <p className="text-2xl font-bold text-purple-600">
                      {(feedbackStats as any)?.totalFeedback > 0
                        ? Math.round(
                            ((feedbackStats as any).helpfulCount /
                              (feedbackStats as any).totalFeedback) *
                              100,
                          )
                        : 0}
                      %
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Feedback Trend Chart */}
          <Card className="border border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-slate-800 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2" />
                Feedback Trend (Last 7 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="helpful"
                    stackId="1"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.6}
                    name="Helpful"
                  />
                  <Area
                    type="monotone"
                    dataKey="not_helpful"
                    stackId="1"
                    stroke="#ef4444"
                    fill="#ef4444"
                    fillOpacity={0.6}
                    name="Not Helpful"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Feedback Distribution */}
          <Card className="border border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-slate-800 flex items-center">
                <Users className="w-5 h-5 mr-2" />
                Feedback Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center space-x-6 mt-4">
                {categoryData.map((entry, index) => (
                  <div key={index} className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: entry.color }}
                    ></div>
                    <span className="text-sm text-slate-600">
                      {entry.name}: {entry.value}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-800 flex items-center">
              <Filter className="w-5 h-5 mr-2" />
              Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <Input
                placeholder="Search feedback..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />

              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="helpful">Helpful</SelectItem>
                  <SelectItem value="not_helpful">Not Helpful</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Time Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline">
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
            </div>

            {/* Additional Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                placeholder="Filter by document name..."
                value={documentNameFilter}
                onChange={(e) => setDocumentNameFilter(e.target.value)}
                className="w-full"
              />

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="border-dashed min-w-[180px] justify-between">
                    <span>AI Categories ({categoryFilter.length})</span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0">
                  <Command>
                    <CommandInput placeholder="Search categories..." />
                    <CommandEmpty>No categories found.</CommandEmpty>
                    <CommandGroup className="max-h-64 overflow-auto">
                      {aiCategories.map((category: string) => (
                        <CommandItem
                          key={category}
                          onSelect={() => {
                            setCategoryFilter(prev =>
                              prev.includes(category)
                                ? prev.filter(c => c !== category)
                                : [...prev, category]
                            );
                          }}
                        >
                          <Checkbox
                            checked={categoryFilter.includes(category)}
                            className="mr-2"
                          />
                          {category}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="border-dashed min-w-[180px] justify-between">
                    <span>Tags ({tagFilter.length})</span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0">
                  <Command>
                    <CommandInput placeholder="Search tags..." />
                    <CommandEmpty>No tags found.</CommandEmpty>
                    <CommandGroup className="max-h-64 overflow-auto">
                      {allTags.map((tag: string) => (
                        <CommandItem
                          key={tag}
                          onSelect={() => {
                            setTagFilter(prev =>
                              prev.includes(tag)
                                ? prev.filter(t => t !== tag)
                                : [...prev, tag]
                            );
                          }}
                        >
                          <Checkbox
                            checked={tagFilter.includes(tag)}
                            className="mr-2"
                          />
                          {tag}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {/* Feedback List */}
        <Card className="border border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-800">
              Recent Feedback ({filteredFeedback.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {feedbackLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-slate-500">Loading feedback...</div>
              </div>
            ) : filteredFeedback.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-slate-500">No feedback found</div>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredFeedback.slice(0, 10).map((feedback: any) => (
                  <div
                    key={feedback.id}
                    className="border border-slate-200 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          {feedback.documentName && (
                            <Badge variant="outline" className="text-xs">
                              <FileText className="w-3 h-3 mr-1" />
                              {feedback.documentName}
                            </Badge>
                          )}
                          {!feedback.documentName && feedback.documentContext && (
                            <Badge variant="outline" className="text-xs text-orange-600">
                              <FileText className="w-3 h-3 mr-1" />
                              {typeof feedback.documentContext === 'object' && feedback.documentContext.documentName
                                ? feedback.documentContext.documentName
                                : String(feedback.documentContext)}
                            </Badge>
                          )}
                          
                          {/* AI Category Badge */}
                          {feedback.aiCategory && (
                            <Badge 
                              variant="outline" 
                              className="text-xs"
                              style={{ 
                                backgroundColor: feedback.aiCategoryColor ? `${feedback.aiCategoryColor}15` : "#dbeafe",
                                borderColor: feedback.aiCategoryColor || "#3b82f6",
                                color: feedback.aiCategoryColor || "#1d4ed8"
                              }}
                            >
                              {feedback.aiCategory}
                            </Badge>
                          )}
                          
                          {/* Tags */}
                          {feedback.tags && Array.isArray(feedback.tags) && feedback.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {feedback.tags.slice(0, 2).map((tag: string, index: number) => (
                                <Badge key={index} variant="outline" className="text-xs text-gray-600">
                                  <Hash className="w-2 h-2 mr-1" />
                                  {tag}
                                </Badge>
                              ))}
                              {feedback.tags.length > 2 && (
                                <Badge variant="outline" className="text-xs text-gray-500">
                                  +{feedback.tags.length - 2} more
                                </Badge>
                              )}
                            </div>
                          )}
                          <Badge
                            variant={
                              feedback.feedbackType === "helpful"
                                ? "default"
                                : "secondary"
                            }
                            className={
                              feedback.feedbackType === "helpful"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }
                          >
                            {feedback.feedbackType === "helpful" ? (
                              <>
                                <ThumbsUp className="w-3 h-3 mr-1" />
                                Helpful
                              </>
                            ) : (
                              <>
                                <ThumbsDown className="w-3 h-3 mr-1" />
                                Not Helpful
                              </>
                            )}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            {format(
                              new Date(feedback.createdAt),
                              "MMM dd, yyyy HH:mm",
                            )}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <div>
                            <p className="text-sm font-medium text-slate-700">
                              User Query:
                            </p>
                            <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded">
                              {feedback.userQuery.length > 150
                                ? `${feedback.userQuery.substring(0, 150)}...`
                                : feedback.userQuery}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm font-medium text-slate-700">
                              Assistant Response:
                            </p>
                            <p className="text-sm text-slate-600 bg-green-50 p-2 rounded">
                              {feedback.assistantResponse && feedback.assistantResponse.length > 200
                                ? `${feedback.assistantResponse.substring(0, 200)}...`
                                : feedback.assistantResponse || "No response recorded"}
                            </p>
                          </div>

                          {feedback.userNote && (
                            <div>
                              <p className="text-sm font-medium text-slate-700">
                                User Note:
                              </p>
                              <p className="text-sm text-slate-600 bg-blue-50 p-2 rounded">
                                {feedback.userNote}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Feedback Details</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <p className="font-medium text-slate-700">
                                Feedback Type:
                              </p>
                              <Badge
                                variant={
                                  feedback.feedbackType === "helpful"
                                    ? "default"
                                    : "secondary"
                                }
                                className={
                                  feedback.feedbackType === "helpful"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-red-100 text-red-800"
                                }
                              >
                                {feedback.feedbackType === "helpful" ? (
                                  <>
                                    <ThumbsUp className="w-3 h-3 mr-1" />
                                    Helpful
                                  </>
                                ) : (
                                  <>
                                    <ThumbsDown className="w-3 h-3 mr-1" />
                                    Not Helpful
                                  </>
                                )}
                              </Badge>
                            </div>

                            <div>
                              <p className="font-medium text-slate-700">
                                User Query:
                              </p>
                              <Textarea
                                value={feedback.userQuery}
                                readOnly
                                className="mt-1"
                                rows={3}
                              />
                            </div>

                            <div>
                              <p className="font-medium text-slate-700">
                                Assistant Response:
                              </p>
                              <Textarea
                                value={feedback.assistantResponse}
                                readOnly
                                className="mt-1"
                                rows={5}
                              />
                            </div>

                            {feedback.userNote && (
                              <div>
                                <p className="font-medium text-slate-700">
                                  User Note:
                                </p>
                                <Textarea
                                  value={feedback.userNote}
                                  readOnly
                                  className="mt-1"
                                  rows={3}
                                />
                              </div>
                            )}

                            {(feedback.documentName || feedback.documentContext) && (
                              <div>
                                <p className="font-medium text-slate-700">
                                  Document Information:
                                </p>
                                <div className="bg-slate-100 p-3 rounded">
                                  {feedback.documentName && (
                                    <p className="text-sm text-slate-700">
                                      <span className="font-medium">Name:</span> {String(feedback.documentName)}
                                    </p>
                                  )}
                                  {feedback.documentId && (
                                    <p className="text-sm text-slate-700">
                                      <span className="font-medium">ID:</span> {String(feedback.documentId)}
                                    </p>
                                  )}
                                  {feedback.aiCategory && (
                                    <p className="text-sm text-slate-700">
                                      <span className="font-medium">Category:</span> {String(feedback.aiCategory)}
                                    </p>
                                  )}
                                  {feedback.tags && Array.isArray(feedback.tags) && feedback.tags.length > 0 && (
                                    <p className="text-sm text-slate-700">
                                      <span className="font-medium">Tags:</span> {feedback.tags.map(tag => String(tag)).join(", ")}
                                    </p>
                                  )}
                                  {feedback.documentContext && (
                                    <details className="mt-2">
                                      <summary className="text-xs text-slate-600 cursor-pointer">Raw Context Data</summary>
                                      <pre className="text-xs bg-white p-2 rounded mt-1 overflow-x-auto">
                                        {JSON.stringify(feedback.documentContext, null, 2)}
                                      </pre>
                                    </details>
                                  )}
                                </div>
                              </div>
                            )}

                            <div>
                              <p className="font-medium text-slate-700">
                                Date:
                              </p>
                              <p className="text-sm text-slate-600">
                                {format(
                                  new Date(feedback.createdAt),
                                  "MMMM dd, yyyy HH:mm:ss",
                                )}
                              </p>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                ))}

                {filteredFeedback.length > 10 && (
                  <div className="text-center py-4">
                    <p className="text-sm text-slate-500">
                      Showing 10 of {filteredFeedback.length} feedback entries
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
