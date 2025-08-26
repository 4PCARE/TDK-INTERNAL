import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CalendarIcon, Folder } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface DocumentMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (metadata: DocumentMetadata) => void;
  fileName: string;
  currentFileIndex: number;
  totalFiles: number;
  defaultFolderId?: number | null;
}

export interface DocumentMetadata {
  name: string;
  effectiveStartDate: Date | null;
  effectiveEndDate: Date | null;
  folderId: number | null;
}

interface Folder {
  id: number;
  name: string;
  parentId?: number;
}

export default function DocumentMetadataModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  fileName,
  currentFileIndex,
  totalFiles,
  defaultFolderId,
}: DocumentMetadataModalProps) {
  const [name, setName] = useState(fileName);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(defaultFolderId === null ? "main" : defaultFolderId?.toString() || "main");

  // Update folder selection when defaultFolderId changes (for bulk uploads)
  useEffect(() => {
    setSelectedFolderId(defaultFolderId === null ? "main" : defaultFolderId?.toString() || "main");
  }, [defaultFolderId]);
  const [showDateFields, setShowDateFields] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch folders
  const { data: folders } = useQuery({
    queryKey: ["/api/folders"],
    queryFn: async () => {
      const response = await fetch("/api/folders");
      if (!response.ok) throw new Error("Failed to fetch folders");
      return await response.json();
    },
    enabled: isOpen,
  }) as { data: Folder[] | undefined };

  // Update name when fileName prop changes
  useEffect(() => {
    setName(fileName);
  }, [fileName]);

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

  const handleSubmit = () => {
    if (validateForm()) {
      onSubmit({
        name: name.trim(),
        effectiveStartDate: startDate,
        effectiveEndDate: endDate,
        folderId: selectedFolderId === "main" ? null : parseInt(selectedFolderId),
      });
      // Reset form for next file but don't close modal
      resetForm();
    }
  };

  const resetForm = () => {
    setStartDate(null);
    setEndDate(null);
    setShowDateFields(false);
    setErrors({});
    // Don't reset folder selection - it will be updated via useEffect when defaultFolderId changes
  };

  const handleClose = () => {
    setName(fileName);
    setStartDate(null);
    setEndDate(null);
    setSelectedFolderId(defaultFolderId === null ? "main" : defaultFolderId?.toString() || "main");
    setShowDateFields(false);
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
          <div className="grid gap-2">
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
          <div className="grid gap-2">
            <Label htmlFor="folder">Select Folder</Label>
            <Select value={selectedFolderId} onValueChange={setSelectedFolderId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a folder">
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4 text-blue-600" />
                    <span>
                      {selectedFolderId === "main" 
                        ? "Main Folder" 
                        : folders?.find(f => f.id.toString() === selectedFolderId)?.name || "Select folder"
                      }
                    </span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main">
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4 text-slate-600" />
                    <span>Main Folder</span>
                  </div>
                </SelectItem>
                {folders?.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id.toString()}>
                    <div className="flex items-center gap-2">
                      <Folder className="h-4 w-4 text-blue-600" />
                      <span>{folder.name}</span>
                    </div>
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
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            {currentFileIndex < totalFiles - 1 ? "Next File" : "Upload All"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}