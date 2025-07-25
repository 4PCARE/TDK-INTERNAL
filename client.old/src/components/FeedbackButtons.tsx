import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FeedbackButtonsProps {
  messageId: number;
  userQuery: string;
  assistantResponse: string;
  conversationId: number;
  documentContext?: any;
}

export function FeedbackButtons({ 
  messageId, 
  userQuery, 
  assistantResponse, 
  conversationId,
  documentContext 
}: FeedbackButtonsProps) {
  const [showNegativeFeedback, setShowNegativeFeedback] = useState(false);
  const [userNote, setUserNote] = useState("");
  const [feedbackGiven, setFeedbackGiven] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const feedbackMutation = useMutation({
    mutationFn: async ({ feedbackType, note }: { feedbackType: string; note?: string }) => {
      const response = await apiRequest("POST", "/api/ai-feedback", {
        chatMessageId: messageId,
        userQuery,
        assistantResponse,
        feedbackType,
        userNote: note || null,
        documentContext,
        conversationId,
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      setFeedbackGiven(variables.feedbackType);
      setShowNegativeFeedback(false);
      setUserNote("");
      
      toast({
        title: "ขอบคุณสำหรับการให้ข้อมูลย้อนกลับ",
        description: variables.feedbackType === 'helpful' 
          ? "ความคิดเห็นของคุณช่วยให้เราปรับปรุงระบบได้ดีขึ้น" 
          : "เราจะใช้ข้อมูลนี้เพื่อปรับปรุงการตอบกลับในอนาคต",
        variant: "default",
      });

      // Invalidate feedback stats if they exist
      queryClient.invalidateQueries({ queryKey: ["/api/ai-feedback/stats"] });
    },
    onError: (error) => {
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถบันทึกความคิดเห็นได้ กรุณาลองใหม่อีกครั้ง",
        variant: "destructive",
      });
    },
  });

  const handlePositiveFeedback = () => {
    if (!feedbackGiven) {
      feedbackMutation.mutate({ feedbackType: 'helpful' });
    }
  };

  const handleNegativeFeedback = () => {
    if (!feedbackGiven) {
      setShowNegativeFeedback(true);
    }
  };

  const submitNegativeFeedback = () => {
    feedbackMutation.mutate({ 
      feedbackType: 'not_helpful', 
      note: userNote.trim() || undefined 
    });
  };

  if (feedbackGiven) {
    return (
      <div className="flex items-center space-x-2 mt-2">
        <div className="flex items-center space-x-1 text-sm text-gray-500">
          {feedbackGiven === 'helpful' ? (
            <>
              <ThumbsUp className="w-4 h-4 text-green-600 fill-current" />
              <span>ขอบคุณสำหรับความคิดเห็น</span>
            </>
          ) : (
            <>
              <ThumbsDown className="w-4 h-4 text-red-600 fill-current" />
              <span>ได้รับข้อมูลย้อนกลับแล้ว</span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center space-x-2 mt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePositiveFeedback}
          disabled={feedbackMutation.isPending}
          className="flex items-center space-x-1 text-gray-500 hover:text-green-600 hover:bg-green-50"
        >
          <ThumbsUp className="w-4 h-4" />
          <span className="text-xs">ช่วยได้</span>
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNegativeFeedback}
          disabled={feedbackMutation.isPending}
          className="flex items-center space-x-1 text-gray-500 hover:text-red-600 hover:bg-red-50"
        >
          <ThumbsDown className="w-4 h-4" />
          <span className="text-xs">ไม่ช่วย</span>
        </Button>
      </div>

      <Dialog open={showNegativeFeedback} onOpenChange={setShowNegativeFeedback}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ช่วยเราปรับปรุง AI Assistant</DialogTitle>
            <DialogDescription>
              บอกเราว่าทำไมคำตอบนี้ไม่เป็นประโยชน์ เพื่อให้เราสามารถปรับปรุงการตอบกลับในอนาคต
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                คำอธิบายเพิ่มเติม (ไม่บังคับ)
              </label>
              <Textarea
                value={userNote}
                onChange={(e) => setUserNote(e.target.value)}
                placeholder="เช่น คำตอบไม่ตรงกับคำถาม, ข้อมูลไม่ถูกต้อง, หรือต้องการข้อมูลเพิ่มเติม..."
                className="min-h-[80px]"
                maxLength={500}
              />
              <p className="text-xs text-gray-500 mt-1">
                {userNote.length}/500 ตัวอักษร
              </p>
            </div>
            
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setShowNegativeFeedback(false)}
                disabled={feedbackMutation.isPending}
              >
                ยกเลิก
              </Button>
              <Button
                onClick={submitNegativeFeedback}
                disabled={feedbackMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {feedbackMutation.isPending ? "กำลังส่ง..." : "ส่งความคิดเห็น"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}