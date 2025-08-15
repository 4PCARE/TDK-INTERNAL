
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { Checkbox } from "../components/ui/checkbox";
import { useToast } from "../hooks/use-toast";
import { useAuth } from "../hooks/useAuth";
import DashboardLayout from "../components/Layout/DashboardLayout";
import { 
  MessageSquare, 
  Star, 
  Send, 
  CheckCircle,
  ThumbsUp,
  Users,
  BarChart3
} from "lucide-react";

interface SurveyResponse {
  satisfaction: number;
  easeOfUse: number;
  features: string[];
  improvements: string;
  recommendation: number;
  additionalComments: string;
}

export default function Survey() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  const submitMutation = useMutation({
    mutationFn: async (data: SurveyResponse) => {
      const response = await fetch("/api/survey/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) throw new Error("Failed to submit survey");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Survey Submitted",
        description: "Thank you for your feedback! Your response has been recorded.",
      });
      setIsSubmitted(true);
    },
    onError: () => {
      toast({
        title: "Submission Failed",
        description: "Failed to submit survey. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data: SurveyResponse = {
      satisfaction: parseInt(formData.get("satisfaction") as string),
      easeOfUse: parseInt(formData.get("easeOfUse") as string),
      features: selectedFeatures,
      improvements: formData.get("improvements") as string,
      recommendation: parseInt(formData.get("recommendation") as string),
      additionalComments: formData.get("additionalComments") as string,
    };

    submitMutation.mutate(data);
  };

  const handleFeatureChange = (feature: string, checked: boolean) => {
    setSelectedFeatures(prev => 
      checked 
        ? [...prev, feature]
        : prev.filter(f => f !== feature)
    );
  };

  const features = [
    "Document upload and management",
    "AI-powered search",
    "Chat with documents",
    "Category organization",
    "User permissions",
    "Analytics and reporting",
    "Mobile responsiveness",
    "Integration capabilities",
  ];

  const StarRating = ({ name, label, required = false }: {
    name: string;
    label: string;
    required?: boolean;
  }) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label} {required && <span className="text-red-500">*</span>}</Label>
      <RadioGroup name={name} className="flex space-x-2" required={required}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <div key={rating} className="flex items-center space-x-1">
            <RadioGroupItem value={rating.toString()} id={`${name}-${rating}`} />
            <Label htmlFor={`${name}-${rating}`} className="cursor-pointer">
              <div className="flex items-center space-x-1">
                <Star className="w-4 h-4 text-yellow-400 fill-current" />
                <span className="text-sm">{rating}</span>
              </div>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );

  if (isSubmitted) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="text-center py-12">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Thank You!</h2>
              <p className="text-gray-600 mb-6">
                Your feedback has been successfully submitted. We appreciate you taking the time to help us improve our platform.
              </p>
              <div className="flex justify-center space-x-4">
                <Button onClick={() => setIsSubmitted(false)} variant="outline">
                  Submit Another Response
                </Button>
                <Button asChild>
                  <a href="/customer-survey">View Survey Analytics</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">User Feedback Survey</h1>
            </div>
          </div>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Help us improve our platform by sharing your experience. Your feedback is valuable and will help us provide better service.
          </p>
        </div>

        {/* Survey Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="w-5 h-5" />
              <span>Your Experience</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Overall Satisfaction */}
              <StarRating
                name="satisfaction"
                label="How satisfied are you with the platform overall?"
                required
              />

              {/* Ease of Use */}
              <StarRating
                name="easeOfUse"
                label="How easy is the platform to use?"
                required
              />

              {/* Features */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">
                  Which features do you find most valuable? (Select all that apply)
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {features.map((feature) => (
                    <div key={feature} className="flex items-center space-x-2">
                      <Checkbox
                        id={feature}
                        checked={selectedFeatures.includes(feature)}
                        onCheckedChange={(checked) => handleFeatureChange(feature, checked as boolean)}
                      />
                      <Label htmlFor={feature} className="text-sm cursor-pointer">
                        {feature}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Improvements */}
              <div className="space-y-2">
                <Label htmlFor="improvements" className="text-sm font-medium">
                  What improvements would you like to see?
                </Label>
                <Textarea
                  id="improvements"
                  name="improvements"
                  placeholder="Please describe any features or improvements you'd like to see..."
                  className="min-h-[100px]"
                />
              </div>

              {/* Recommendation */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  How likely are you to recommend this platform to others? <span className="text-red-500">*</span>
                </Label>
                <RadioGroup name="recommendation" className="grid grid-cols-2 md:grid-cols-5 gap-4" required>
                  {[
                    { value: "1", label: "Very Unlikely" },
                    { value: "2", label: "Unlikely" },
                    { value: "3", label: "Neutral" },
                    { value: "4", label: "Likely" },
                    { value: "5", label: "Very Likely" },
                  ].map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={option.value} id={`rec-${option.value}`} />
                      <Label htmlFor={`rec-${option.value}`} className="text-sm cursor-pointer">
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Additional Comments */}
              <div className="space-y-2">
                <Label htmlFor="additionalComments" className="text-sm font-medium">
                  Additional Comments
                </Label>
                <Textarea
                  id="additionalComments"
                  name="additionalComments"
                  placeholder="Any other feedback or comments you'd like to share..."
                  className="min-h-[120px]"
                />
              </div>

              {/* Submit Button */}
              <div className="flex justify-end space-x-4 pt-6 border-t">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={submitMutation.isPending}
                  className="flex items-center space-x-2"
                >
                  {submitMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Survey</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Privacy Notice */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <ThumbsUp className="w-5 h-5 text-blue-600" />
              <div>
                <h4 className="font-medium text-blue-900">Privacy Notice</h4>
                <p className="text-sm text-blue-700">
                  Your responses are anonymous and will only be used to improve our platform. We do not share individual feedback data with third parties.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
