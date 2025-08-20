import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Star, Send } from "lucide-react";

interface SurveyFormProps {
  onSubmitted?: () => void;
}

export default function SurveyForm({ onSubmitted }: SurveyFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [satisfaction, setSatisfaction] = useState("");
  const [easeOfUse, setEaseOfUse] = useState("");
  const [improvements, setImprovements] = useState("");
  const [suggestions, setSuggestions] = useState("");

  const submitSurveyMutation = useMutation({
    mutationFn: async (surveyData: any) => {
      const response = await apiRequest("POST", "/api/survey/submit", surveyData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Survey submitted",
        description: "Thank you for your feedback! Your input helps us improve.",
      });
      // Reset form
      setSatisfaction("");
      setEaseOfUse("");
      setImprovements("");
      setSuggestions("");
      onSubmitted?.();
      queryClient.invalidateQueries({ queryKey: ["/api/survey"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit survey.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!satisfaction || !easeOfUse) {
      toast({
        title: "Please complete required fields",
        description: "Satisfaction and ease of use ratings are required.",
        variant: "destructive",
      });
      return;
    }

    submitSurveyMutation.mutate({
      satisfaction,
      easeOfUse,
      improvements,
      suggestions,
    });
  };

  const StarRating = ({ 
    value, 
    onChange, 
    name 
  }: { 
    value: string; 
    onChange: (value: string) => void; 
    name: string;
  }) => (
    <RadioGroup value={value} onValueChange={onChange} className="flex space-x-1">
      {[1, 2, 3, 4, 5].map((rating) => (
        <div key={rating} className="flex items-center space-x-1">
          <RadioGroupItem value={rating.toString()} id={`${name}-${rating}`} className="sr-only" />
          <Label
            htmlFor={`${name}-${rating}`}
            className="cursor-pointer"
          >
            <Star
              className={`w-6 h-6 ${
                parseInt(value) >= rating
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-gray-300'
              }`}
            />
          </Label>
        </div>
      ))}
    </RadioGroup>
  );

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Send className="w-5 h-5" />
          <span>AI-KMS Feedback Survey</span>
        </CardTitle>
        <p className="text-sm text-gray-600">
          Help us improve your experience with the AI Knowledge Management System
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Question 1: Satisfaction */}
          <div className="space-y-3">
            <Label className="text-base font-medium">
              How satisfied are you with the system? *
            </Label>
            <StarRating
              value={satisfaction}
              onChange={setSatisfaction}
              name="satisfaction"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Very Dissatisfied</span>
              <span>Very Satisfied</span>
            </div>
          </div>

          {/* Question 2: Ease of Use */}
          <div className="space-y-3">
            <Label className="text-base font-medium">
              Was the system easy to use? *
            </Label>
            <StarRating
              value={easeOfUse}
              onChange={setEaseOfUse}
              name="easeOfUse"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Very Difficult</span>
              <span>Very Easy</span>
            </div>
          </div>

          {/* Question 3: Improvements */}
          <div className="space-y-3">
            <Label htmlFor="improvements" className="text-base font-medium">
              What features would you like to see improved?
            </Label>
            <Textarea
              id="improvements"
              placeholder="Please describe any features you'd like to see improved or enhanced..."
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
              rows={4}
            />
          </div>

          {/* Question 4: Additional Suggestions */}
          <div className="space-y-3">
            <Label htmlFor="suggestions" className="text-base font-medium">
              Any additional suggestions?
            </Label>
            <Textarea
              id="suggestions"
              placeholder="Please share any other feedback or suggestions you have..."
              value={suggestions}
              onChange={(e) => setSuggestions(e.target.value)}
              rows={4}
            />
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={submitSurveyMutation.isPending}
          >
            {submitSurveyMutation.isPending ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Submitting...</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Send className="w-4 h-4" />
                <span>Submit Feedback</span>
              </div>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}