import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Folder, TrendingUp, BarChart3 } from "lucide-react";

interface CategoryStat {
  category: string;
  count: number;
}

const getCategoryIcon = (category: string) => {
  switch (category?.toLowerCase()) {
    case "technical":
      return "⚙️";
    case "administrative":
      return "📋";
    case "financial":
      return "💰";
    case "legal":
      return "⚖️";
    case "hr":
      return "👥";
    case "marketing":
      return "📢";
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
  const { data: categoryStats = [], isLoading } = useQuery({
    queryKey: ["/api/stats/categories"],
  });

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
  const totalDocuments = categoryStats.reduce(
    (sum: number, stat: CategoryStat) => {
      return sum + Number(stat.count);
    },
    0,
  );

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <BarChart3 className="w-5 h-5" />
          <span>Documents by Category</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {categoryStats.length === 0 ? (
          <div className="text-center py-8">
            <Folder className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No documents categorized yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Upload and categorize documents to see statistics
            </p>
          </div>
        ) : (
          <div className="h-full overflow-y-auto space-y-3 pr-2">
            {categoryStats.map((stat: CategoryStat) => (
              <div
                key={stat.category}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-xl">
                    {getCategoryIcon(stat.category)}
                  </span>
                  <div>
                    <Badge
                      variant="outline"
                      className={getCategoryColor(stat.category)}
                    >
                      {stat.category || "Uncategorized"}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-semibold text-gray-700">
                    {Number(stat.count)}
                  </span>
                  <div className="text-xs text-gray-500">
                    (
                    {totalDocuments > 0
                      ? Math.round((Number(stat.count) / totalDocuments) * 100)
                      : 0}
                    %)
                  </div>
                </div>
              </div>
            ))}

            <div className="mt-4 pt-3 border-t border-gray-200">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center space-x-2">
                  <FileText className="w-4 h-4" />
                  <span className="font-medium">Total Documents</span>
                </span>
                <span className="font-bold text-blue-600">
                  {totalDocuments}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
