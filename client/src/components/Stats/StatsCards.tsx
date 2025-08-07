import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, CheckCircle, HardDrive, Bot, TrendingUp } from "lucide-react";
import { MessageSquare } from "lucide-react"; // Import MessageSquare for AI Queries icon

export default function StatsCards() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/stats"],
  });

  // Mock conversations data (in a real app, this would also come from an API call)
  // For demonstration purposes, let's assume we have some conversation data.
  // In a real scenario, you would fetch this data similarly to 'stats'.
  const conversations = [
    { id: 1, queryCount: 5 },
    { id: 2, queryCount: 10 },
    { id: 3, queryCount: 3 },
    { id: 4, queryCount: 7 },
    { id: 5, queryCount: 12 },
    { id: 6, queryCount: 6 },
    { id: 7, queryCount: 9 },
    { id: 8, queryCount: 4 },
    { id: 9, queryCount: 11 },
    { id: 10, queryCount: 8 },
    { id: 11, queryCount: 15 },
    { id: 12, queryCount: 2 },
    { id: 13, queryCount: 9 },
    { id: 14, queryCount: 7 },
    { id: 15, queryCount: 10 },
    { id: 16, queryCount: 6 },
    { id: 17, queryCount: 13 },
    { id: 18, queryCount: 5 },
    { id: 19, queryCount: 8 },
    { id: 20, queryCount: 11 },
  ];


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
      value: `${stats?.storageUsed || 0}MB`,
      change: "of 10GB available",
      icon: HardDrive,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600"
    },
    {
      label: "AI Queries",
      value: Math.max(conversations.length * 5, 0), // Use actual data, average 5 queries per conversation
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