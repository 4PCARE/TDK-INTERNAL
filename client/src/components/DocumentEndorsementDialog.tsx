import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ThumbsUp, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface DocumentEndorsementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: number;
  documentName: string;
}

export default function DocumentEndorsementDialog({
  isOpen,
  onClose,
  documentId,
  documentName,
}: DocumentEndorsementDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [effectiveStartDate, setEffectiveStartDate] = useState<Date | undefined>(new Date());
  const [effectiveEndDate, setEffectiveEndDate] = useState<Date | undefined>();
  const [showConfirmation, setShowConfirmation] = useState(false);

  const endorseDocumentMutation = useMutation({
    mutationFn: async (endorsementData: {
      effectiveStartDate: string;
      effectiveEndDate?: string;
    }) => {
      const response = await apiRequest("POST", `/api/documents/${documentId}/endorse`, endorsementData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document Endorsed",
        description: `${documentName} has been successfully endorsed for public use.`,
      });
      
      // Invalidate document queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${documentId}`] });
      
      onClose();
      setShowConfirmation(false);
      
      // Reset form
      setEffectiveStartDate(new Date());
      setEffectiveEndDate(undefined);
    },
    onError: (error: any) => {
      toast({
        title: "Endorsement Failed",
        description: error.message || "Failed to endorse document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleEndorse = () => {
    if (!effectiveStartDate) {
      toast({
        title: "Validation Error",
        description: "Please select an effective start date.",
        variant: "destructive",
      });
      return;
    }

    if (effectiveEndDate && effectiveEndDate <= effectiveStartDate) {
      toast({
        title: "Validation Error",
        description: "End date must be after start date.",
        variant: "destructive",
      });
      return;
    }

    setShowConfirmation(true);
  };

  const handleConfirmEndorsement = () => {
    const endorsementData = {
      effectiveStartDate: effectiveStartDate!.toISOString().split('T')[0],
      effectiveEndDate: effectiveEndDate?.toISOString().split('T')[0],
    };

    endorseDocumentMutation.mutate(endorsementData);
  };

  const handleClose = () => {
    onClose();
    setShowConfirmation(false);
    setEffectiveStartDate(new Date());
    setEffectiveEndDate(undefined);
  };

  return (
    <>
      {/* Main Endorsement Dialog */}
      <Dialog open={isOpen && !showConfirmation} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ThumbsUp className="w-5 h-5 text-green-600" />
              Endorse Document
            </DialogTitle>
            <DialogDescription>
              Mark "{documentName}" as verified and ready for public use by setting its effective date range.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Effective Start Date */}
            <div className="space-y-2">
              <Label htmlFor="start-date">Effective Start Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !effectiveStartDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {effectiveStartDate ? format(effectiveStartDate, "PPP") : "Select start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={effectiveStartDate}
                    onSelect={setEffectiveStartDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Effective End Date */}
            <div className="space-y-2">
              <Label htmlFor="end-date">Effective End Date (Optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !effectiveEndDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {effectiveEndDate ? format(effectiveEndDate, "PPP") : "Select end date (optional)"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={effectiveEndDate}
                    onSelect={setEffectiveEndDate}
                    disabled={(date) => 
                      effectiveStartDate ? date <= effectiveStartDate : date < new Date()
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Info Box */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Endorsing this document will mark it as verified and ready for public use. 
                This action will be logged and attributed to your account.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleEndorse}
              disabled={!effectiveStartDate}
              className="bg-green-600 hover:bg-green-700"
            >
              <ThumbsUp className="w-4 h-4 mr-2" />
              Endorse Document
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              Confirm Document Endorsement
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Are you sure you want to endorse <strong>"{documentName}"</strong> for public use?
              </p>
              <div className="bg-gray-50 p-3 rounded-lg text-sm">
                <p><strong>Effective Period:</strong></p>
                <p>Start: {effectiveStartDate ? format(effectiveStartDate, "PPP") : "Not set"}</p>
                <p>End: {effectiveEndDate ? format(effectiveEndDate, "PPP") : "No end date"}</p>
              </div>
              <p className="text-sm text-gray-600">
                This action will promote the document for public use and will be permanently logged under your account.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmEndorsement}
              disabled={endorseDocumentMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {endorseDocumentMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Endorsing...
                </div>
              ) : (
                <>
                  <ThumbsUp className="w-4 h-4 mr-2" />
                  Confirm Endorsement
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}