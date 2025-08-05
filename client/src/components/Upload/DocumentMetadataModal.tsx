import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export interface DocumentMetadata {
  name: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
}

interface DocumentMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (metadata: DocumentMetadata) => void;
  fileName: string;
  currentFileIndex?: number;
  totalFiles?: number;
}

// Helper function to get file extension from filename
const getFileExtension = (filename: string): string => {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex !== -1 ? filename.substring(lastDotIndex) : '';
};

// Helper function to get filename without extension
const getFileNameWithoutExtension = (filename: string): string => {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex !== -1 ? filename.substring(0, lastDotIndex) : filename;
};

// Helper function to ensure proper file extension
const ensureCorrectExtension = (inputName: string, originalFileName: string): string => {
  const originalExtension = getFileExtension(originalFileName);

  if (!originalExtension) {
    return inputName; // No extension to enforce
  }

  // If the input already has the correct extension, return as-is
  if (inputName.toLowerCase().endsWith(originalExtension.toLowerCase())) {
    return inputName;
  }

  // If the input has no extension, add the original extension
  if (getFileExtension(inputName) === '') {
    return inputName + originalExtension;
  }

  // If the input has a different extension, append the original extension
  return inputName + originalExtension;
};

export default function DocumentMetadataModal({
  isOpen,
  onClose,
  onSubmit,
  fileName,
  currentFileIndex = 0,
  totalFiles = 1
}: DocumentMetadataModalProps) {
  const [name, setName] = useState(fileName);
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [hasUserTyped, setHasUserTyped] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens with new file
  useEffect(() => {
    if (isOpen) {
      setName(fileName);
      setIsNameFocused(false);
      setHasUserTyped(false);
      setStartDate(null);
      setEndDate(null);
      setErrors({});
    }
  }, [isOpen, fileName]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Document name is required";
    }

    if (startDate && endDate && startDate > endDate) {
      newErrors.dateRange = "Start date must be before end date";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNameFocus = () => {
    setIsNameFocused(true);
  };

  const handleNameBlur = () => {
    setIsNameFocused(false);
    // If user hasn't typed anything or input is empty, revert to filename
    if (!hasUserTyped || name.trim() === '') {
      setName(fileName);
      setHasUserTyped(false);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setHasUserTyped(true);
  };

  const handleSubmit = () => {
    if (validateForm()) {
      // Get the final name, defaulting to fileName if empty
      let finalName = name.trim() || fileName;

      // Ensure correct file extension
      finalName = ensureCorrectExtension(finalName, fileName);

      // Update the name state to the final processed name to prevent flash
      setName(finalName);

      onSubmit({
        name: finalName,
        effectiveStartDate: startDate,
        effectiveEndDate: endDate,
      });
      handleClose();
    }
  };

  const handleClose = () => {
    setName(fileName);
    setStartDate(null);
    setEndDate(null);
    setErrors({});
    onClose();
  };

  const handleSkip = () => {
    // Ensure correct file extension even when skipping
    const finalName = ensureCorrectExtension(fileName, fileName);

    // Update the name state to prevent any visual flash
    setName(finalName);

    onSubmit({
      name: finalName,
    });
    handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            Document Information ({currentFileIndex + 1} of {totalFiles})
          </DialogTitle>
          {totalFiles > 1 && (
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((currentFileIndex + 1) / totalFiles) * 100}%` }}
                ></div>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Document Name */}
          <div className="grid gap-2">
            <Label htmlFor="name">Document Name *</Label>
            <Input
              ref={nameInputRef}
              id="name"
              value={name}
              onChange={handleNameChange}
              onFocus={handleNameFocus}
              onBlur={handleNameBlur}
              placeholder="Enter document name"
              className={cn(
                "transition-colors",
                isNameFocused && !hasUserTyped && "text-gray-400"
              )}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name}</p>
            )}
            <p className="text-xs text-gray-500">
              Defaults to filename. File extension will be automatically added if needed.
            </p>
          </div>

          {/* Effective Date Range */}
          <div className="grid gap-2">
            <Label>Document Effective Period</Label>
            <div className="grid grid-cols-2 gap-2">
              {/* Start Date */}
              <div>
                <Label htmlFor="start-date" className="text-sm text-muted-foreground">
                  Start Date
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate || undefined}
                      onSelect={(date) => setStartDate(date || null)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End Date */}
              <div>
                <Label htmlFor="end-date" className="text-sm text-muted-foreground">
                  End Date
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate || undefined}
                      onSelect={(date) => setEndDate(date || null)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {errors.dateRange && (
              <p className="text-sm text-red-500">{errors.dateRange}</p>
            )}

            <p className="text-xs text-muted-foreground">
              Optional: Set when this document is effective (e.g., policy effective dates)
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleSkip}>
            Skip
          </Button>
          <Button onClick={handleSubmit}>
            Continue Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}