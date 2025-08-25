import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CalendarIcon, FileText } from 'lucide-react';
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery } from '@tanstack/react-query';

interface DocumentMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (metadata: DocumentMetadata) => void;
  fileName: string;
  currentFileIndex?: number;
  totalFiles?: number;
}

export interface DocumentMetadata {
  name: string;
  effectiveStartDate: Date | null;
  effectiveEndDate: Date | null;
  folderId: string | null;
}

export default function DocumentMetadataModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  fileName,
  currentFileIndex = 0,
  totalFiles = 1
}: DocumentMetadataModalProps) {
  const [name, setName] = useState(fileName || '');
  const [effectiveStartDate, setEffectiveStartDate] = useState<Date | null>(null);
  const [effectiveEndDate, setEffectiveEndDate] = useState<Date | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [showDateFields, setShowDateFields] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch folders for selection
  const { data: folders } = useQuery({
    queryKey: ["/api/folders"],
    queryFn: async () => {
      const response = await fetch("/api/folders");
      if (!response.ok) throw new Error("Failed to fetch folders");
      return await response.json();
    },
  });

  // Update name and reset folderId when fileName prop changes
  useEffect(() => {
    setName(fileName || '');
    setFolderId(null); // Reset folder selection when file changes
  }, [fileName]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Document name is required";
    }

    if (effectiveStartDate && effectiveEndDate && effectiveStartDate > effectiveEndDate) {
      newErrors.dateRange = "Start date must be before end date";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      onSubmit({
        name: name.trim(),
        effectiveStartDate: effectiveStartDate,
        effectiveEndDate: effectiveEndDate,
        folderId: folderId,
      });
      handleClose();
    }
  };

  const handleClose = () => {
    setName(fileName || ''); // Reset name to original fileName on close
    setEffectiveStartDate(null);
    setEffectiveEndDate(null);
    setFolderId(null); // Reset folder selection on close
    setErrors({});
    onClose();
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
          <div className="space-y-2">
            <Label htmlFor="name">Document Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter document name"
              className={errors.name ? "border-red-500" : ""}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Folder Selection */}
          <div className="space-y-2">
            <Label htmlFor="folder">Folder</Label>
            <Select 
              onValueChange={setFolderId} 
              value={folderId || ''} 
            >
              <SelectTrigger>
                <SelectValue placeholder="Main Folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">
                  <div className="flex items-center">
                    <FileText className="w-4 h-4 mr-2" />
                    Main Folder
                  </div>
                </SelectItem>
                {folders?.map((folder: { id: string; name: string }) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Fields Toggle */}
          <div className="flex items-center space-x-2">
            <Switch
              id="show-dates"
              checked={showDateFields}
              onCheckedChange={setShowDateFields}
            />
            <Label htmlFor="show-dates">Set active date period</Label>
          </div>

          {/* Effective Date Range */}
          {showDateFields && (
            <div className="space-y-2">
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
                        !effectiveStartDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {effectiveStartDate ? format(effectiveStartDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={effectiveStartDate || undefined}
                      onSelect={(date) => setEffectiveStartDate(date || null)}
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
                        !effectiveEndDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {effectiveEndDate ? format(effectiveEndDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={effectiveEndDate || undefined}
                      onSelect={(date) => setEffectiveEndDate(date || null)}
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
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            Continue Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}