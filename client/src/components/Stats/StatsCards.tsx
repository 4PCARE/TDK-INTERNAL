import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, CheckCircle, HardDrive, Bot, TrendingUp } from "lucide-react";

// Helper function to format storage size
const formatStorageSize = (sizeInMB: number): string => {
  if (sizeInMB === 0) return "0 MB";
  if (sizeInMB < 1024) return `${sizeInMB} MB`;

  const sizeInGB = (sizeInMB / 1024).toFixed(1);
  return `${sizeInGB} GB`;
};

export default function StatsCards() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/stats"],
  }) as { data: { totalDocuments: number; processedToday: number; storageUsed: number; aiQueries?: number } | undefined };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-16 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statsData = [
    {
      label: "Total Documents",
      value: stats?.totalDocuments || 0,
      change: "+12% from last month",
      icon: FileText,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600"
    },
    {
      label: "Processed Today",
      value: stats?.processedToday || 0,
      change: "+8% from yesterday",
      icon: CheckCircle,
      iconBg: "bg-green-100",
      iconColor: "text-green-600"
    },
    {
      label: "Storage Used",
      value: formatStorageSize(stats?.storageUsed || 0),
      change: "of 10GB available",
      icon: HardDrive,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600"
    },
    {
      label: "AI Queries",
      value: stats?.aiQueries || 0,
      change: "+23% this week",
      icon: Bot,
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statsData.map((stat, index) => (
        <Card key={index} className="bg-white border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                <p className="text-3xl font-semibold text-gray-900 mt-2">{stat.value}</p>
                <p className="text-sm text-green-600 mt-2 flex items-center">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  <span>{stat.change}</span>
                </p>
              </div>
              <div className={`w-12 h-12 ${stat.iconBg} rounded-lg flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}