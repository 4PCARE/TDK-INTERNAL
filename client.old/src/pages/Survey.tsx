import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/Layout/Sidebar";
import TopBar from "@/components/TopBar";
import SurveyForm from "@/components/Survey/SurveyForm";

export default function Survey() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

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

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <main className="flex-1 overflow-auto p-6 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Customer Feedback Survey
              </h1>
              <p className="text-lg text-gray-600">
                Your feedback helps us improve the AI-KMS experience
              </p>
            </div>

            {/* Survey Form */}
            <SurveyForm 
              onSubmitted={() => {
                toast({
                  title: "Thank you!",
                  description: "Your feedback has been submitted successfully.",
                });
              }}
            />

            {/* Additional Info */}
            <div className="mt-8 text-center text-sm text-gray-500">
              <p>
                Your responses are anonymous and will be used to improve our system.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}