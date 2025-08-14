import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResizableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  defaultWidth?: string;
  defaultHeight?: string;
  minWidth?: number;
  minHeight?: number;
  children: React.ReactNode;
  className?: string;
}

export function ResizableDialog({
  open,
  onOpenChange,
  title,
  defaultWidth = "60%",
  defaultHeight = "70%",
  minWidth = 400,
  minHeight = 300,
  children,
  className,
}: ResizableDialogProps) {
  const [size, setSize] = useState({
    width: defaultWidth,
    height: defaultHeight,
  });
  
  const [position, setPosition] = useState({
    x: '20%',
    y: '5%', // Start higher up on screen
  });

  const dialogRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const element = dialogRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const startWidth = rect.width;
    const startHeight = rect.height;
    const startLeft = rect.left;
    const startTop = rect.top;

    const doDrag = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newLeft = startLeft;
      let newTop = startTop;
      
      // Handle horizontal resizing
      if (direction.includes('right')) {
        newWidth = Math.max(minWidth, startWidth + deltaX);
      }
      if (direction.includes('left')) {
        newWidth = Math.max(minWidth, startWidth - deltaX);
        if (newWidth > minWidth) {
          newLeft = startLeft + deltaX;
        }
      }
      
      // Handle vertical resizing
      if (direction.includes('bottom')) {
        newHeight = Math.max(minHeight, startHeight + deltaY);
      }
      if (direction.includes('top')) {
        newHeight = Math.max(minHeight, startHeight - deltaY);
        if (newHeight > minHeight) {
          newTop = startTop + deltaY;
        }
      }
      
      setSize({
        width: `${newWidth}px`,
        height: `${newHeight}px`,
      });
      
      setPosition({
        x: `${newLeft}px`,
        y: `${newTop}px`,
      });
    };

    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
      <div
        ref={dialogRef}
        className={cn(
          "fixed bg-white rounded-lg shadow-lg border",
          "dark:bg-gray-900 dark:border-gray-800",
          className
        )}
        style={{
          width: size.width,
          height: size.height,
          left: position.x,
          top: position.y,
          minWidth: `${minWidth}px`,
          minHeight: `${minHeight}px`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-4" style={{ height: 'calc(100% - 65px)' }}>
          {children}
        </div>

        {/* Resize handles */}
        {/* Corner handles */}
        <div
          className="absolute -top-1 -left-1 w-4 h-4 cursor-nw-resize bg-blue-500 opacity-0 hover:opacity-50 rounded-full transition-opacity"
          onMouseDown={(e) => handleMouseDown(e, 'top-left')}
        />
        <div
          className="absolute -top-1 -right-1 w-4 h-4 cursor-ne-resize bg-blue-500 opacity-0 hover:opacity-50 rounded-full transition-opacity"
          onMouseDown={(e) => handleMouseDown(e, 'top-right')}
        />
        <div
          className="absolute -bottom-1 -left-1 w-4 h-4 cursor-sw-resize bg-blue-500 opacity-0 hover:opacity-50 rounded-full transition-opacity"
          onMouseDown={(e) => handleMouseDown(e, 'bottom-left')}
        />
        <div
          className="absolute -bottom-1 -right-1 w-4 h-4 cursor-se-resize bg-blue-500 opacity-0 hover:opacity-50 rounded-full transition-opacity"
          onMouseDown={(e) => handleMouseDown(e, 'bottom-right')}
        />

        {/* Edge handles */}
        <div
          className="absolute -top-1 left-4 right-4 h-2 cursor-n-resize bg-blue-500 opacity-0 hover:opacity-30 transition-opacity"
          onMouseDown={(e) => handleMouseDown(e, 'top')}
        />
        <div
          className="absolute -bottom-1 left-4 right-4 h-2 cursor-s-resize bg-blue-500 opacity-0 hover:opacity-30 transition-opacity"
          onMouseDown={(e) => handleMouseDown(e, 'bottom')}
        />
        <div
          className="absolute -left-1 top-4 bottom-4 w-2 cursor-w-resize bg-blue-500 opacity-0 hover:opacity-30 transition-opacity"
          onMouseDown={(e) => handleMouseDown(e, 'left')}
        />
        <div
          className="absolute -right-1 top-4 bottom-4 w-2 cursor-e-resize bg-blue-500 opacity-0 hover:opacity-30 transition-opacity"
          onMouseDown={(e) => handleMouseDown(e, 'right')}
        />
      </div>
    </div>
  );
}