
<old_str>import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Folder } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const getCategoryIcon = (category: string) => {
  switch (category?.toLowerCase()) {
    case "technical":
      return "💻";
    case "administrative":
      return "📋";
    case "financial":
      return "💰";
    case "legal":
      return "⚖️";
    case "hr":
      return "👥";
    case "marketing":
      return "📈";
    default:
      return "📄";
  }
};

const getCategoryColor = (category: string) => {
  switch (category?.toLowerCase()) {
    case "technical":
      return "bg-blue-100 text-blue-800";
    case "administrative":
      return "bg-green-100 text-green-800";
    case "financial":
      return "bg-yellow-100 text-yellow-800";
    case "legal":
      return "bg-red-100 text-red-800";
    case "hr":
      return "bg-purple-100 text-purple-800";
    case "marketing":
      return "bg-pink-100 text-pink-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export default function CategoryStatsCards() {
  const { isLoaded, userId, isSignedIn } = useAuth();

  const { data: categoryStats = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: ["/api/stats/categories"],
    enabled: isSignedIn && isLoaded,
  }) as { data: Array<{ category: string; count: number }> };

  const { data: documents = [], isLoading: isLoadingDocuments } = useQuery({
    queryKey: ["/api/documents"],
    enabled: isSignedIn && isLoaded,
  }) as { data: Array<any> };

  // Generate AI category stats from documents if no manual categories exist
  const aiCategoryStats = documents.reduce((acc: { [key: string]: number }, doc: any) => {
    if (doc.aiCategory) {
      acc[doc.aiCategory] = (acc[doc.aiCategory] || 0) + 1;
    }
    return acc;
  }, {});

  const aiCategoryArray = Object.entries(aiCategoryStats).map(([category, count]) => ({
    category,
    count: count as number
  }));

  // Use AI categories if no manual categories exist
  const displayStats = categoryStats.length > 0 ? categoryStats : aiCategoryArray;

  const isLoading = isLoadingCategories || isLoadingDocuments;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5" />
            <span>Documents by Category</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg animate-pulse"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gray-200 rounded"></div>
                  <div className="w-20 h-4 bg-gray-200 rounded"></div>
                </div>
                <div className="w-8 h-4 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // แก้ไขการคำนวณ totalDocuments โดยแปลง count เป็น number ก่อน
  const totalDocuments = displayStats.reduce(
    (sum: number, sta</old_str>
<new_str>import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Folder } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const getCategoryIcon = (category: string) => {
  switch (category?.toLowerCase()) {
    case "technical":
      return "💻";
    case "administrative":
      return "📋";
    case "financial":
      return "💰";
    case "legal":
      return "⚖️";
    case "hr":
      return "👥";
    case "marketing":
      return "📈";
    default:
      return "📄";
  }
};

const getCategoryColor = (category: string) => {
  switch (category?.toLowerCase()) {
    case "technical":
      return "bg-blue-100 text-blue-800";
    case "administrative":
      return "bg-green-100 text-green-800";
    case "financial":
      return "bg-yellow-100 text-yellow-800";
    case "legal":
      return "bg-red-100 text-red-800";
    case "hr":
      return "bg-purple-100 text-purple-800";
    case "marketing":
      return "bg-pink-100 text-pink-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export default function CategoryStatsCards() {
  const { isLoaded, userId, isSignedIn } = useAuth();

  const { data: categoryStats = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: ["/api/stats/categories"],
    enabled: isSignedIn && isLoaded,
  });

  const { data: documents = [], isLoading: isLoadingDocuments } = useQuery({
    queryKey: ["/api/documents"],
    enabled: isSignedIn && isLoaded,
  });

  // Generate AI category stats from documents
  const aiCategoryStats = documents.reduce((acc: { [key: string]: number }, doc: any) => {
    if (doc.aiCategory) {
      acc[doc.aiCategory] = (acc[doc.aiCategory] || 0) + 1;
    }
    return acc;
  }, {});

  const aiCategoryArray = Object.entries(aiCategoryStats).map(([category, count]) => ({
    category,
    count: Number(count) || 0
  }));

  // Use manual categories if they exist and have documents, otherwise use AI categories
  let displayStats = [];
  if (Array.isArray(categoryStats) && categoryStats.length > 0) {
    // Check if manual categories have any documents
    const hasDocuments = categoryStats.some((stat: any) => Number(stat.count) > 0);
    if (hasDocuments) {
      displayStats = categoryStats.map((stat: any) => ({
        category: stat.category || stat.name || 'Unknown',
        count: Number(stat.count) || 0
      }));
    } else {
      displayStats = aiCategoryArray;
    }
  } else {
    displayStats = aiCategoryArray;
  }

  const isLoading = isLoadingCategories || isLoadingDocuments;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5" />
            <span>Documents by Category</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg animate-pulse"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gray-200 rounded"></div>
                  <div className="w-20 h-4 bg-gray-200 rounded"></div>
                </div>
                <div className="w-8 h-4 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate total documents with proper number conversion
  const totalDocuments = displayStats.reduce((sum: number, stat: any) => {
    return sum + (Number(stat.count) || 0);
  }, 0);

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <BarChart3 className="w-5 h-5" />
          <span>Documents by Category</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {displayStats.length === 0 ? (
          <div className="text-center py-8">
            <Folder className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No documents categorized yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Upload and categorize documents to see statistics
            </p>
          </div>
        ) : (
          <div className="h-full overflow-y-auto space-y-3 pr-2">
            {displayStats.map((stat: any, index: number) => {
              const count = Number(stat.count) || 0;
              const percentage = totalDocuments > 0 ? Math.round((count / totalDocuments) * 100) : 0;
              
              return (
                <div
                  key={`category-${stat.category || 'unknown'}-${index}-${count}`}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-xl">
                      {getCategoryIcon(stat.category || 'unknown')}
                    </span>
                    <div>
                      <Badge
                        variant="outline"
                        className={getCategoryColor(stat.category || 'unknown')}
                      >
                        {stat.category || 'Unknown'}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold">{count}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      ({percentage}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}</new_str>
