import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { 
  Calendar,
  Clock,
  Users,
  FileText,
  Download,
  Copy,
  ChevronDown,
  ChevronRight,
  RefreshCw
} from "lucide-react";

interface Meeting {
  id: string;
  subject: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  isOnlineMeeting: boolean;
  onlineMeetingProvider?: string;
}

interface MeetingNotes {
  meeting_id: string;
  notes: string;
  source: string;
  last_modified: string;
}

interface MeetingItemProps {
  meeting: Meeting;
  onFetchNotes: (meetingId: string) => Promise<MeetingNotes | null>;
  onExportPdf: (meeting: Meeting, notes: string) => Promise<void>;
  onCopyToClipboard: (notes: string) => Promise<void>;
  formatDateTime: (dateTime: string) => { date: string; time: string };
}

export function MeetingItem({ 
  meeting, 
  onFetchNotes, 
  onExportPdf, 
  onCopyToClipboard,
  formatDateTime 
}: MeetingItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState<MeetingNotes | null>(null);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notesLoaded, setNotesLoaded] = useState(false);

  const startDateTime = formatDateTime(meeting.start.dateTime);
  const endDateTime = formatDateTime(meeting.end.dateTime);

  const handleToggle = async () => {
    setIsOpen(!isOpen);
    
    // Fetch notes when expanding for the first time
    if (!isOpen && !notesLoaded) {
      setLoadingNotes(true);
      try {
        const meetingNotes = await onFetchNotes(meeting.id);
        setNotes(meetingNotes);
        setNotesLoaded(true);
      } catch (error) {
        console.error('Error fetching notes:', error);
      } finally {
        setLoadingNotes(false);
      }
    }
  };

  const handleExportPdf = async () => {
    if (notes) {
      await onExportPdf(meeting, notes.notes);
    }
  };

  const handleCopyToClipboard = async () => {
    if (notes) {
      await onCopyToClipboard(notes.notes);
    }
  };

  return (
    <Card className="border border-gray-200 dark:border-gray-700">
      <Collapsible open={isOpen} onOpenChange={handleToggle}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                  {meeting.subject}
                  {meeting.isOnlineMeeting && (
                    <Badge variant="secondary" className="ml-2">
                      Teams Meeting
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-2">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {startDateTime.date}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {startDateTime.time} - {endDateTime.time}
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {meeting.attendees.length} attendee{meeting.attendees.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            <Separator className="mb-4" />
            
            {/* Meeting Details */}
            <div className="space-y-4 mb-6">
              <div>
                <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-2">
                  Attendees
                </h4>
                <div className="flex flex-wrap gap-2">
                  {meeting.attendees.map((attendee, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {attendee.emailAddress.name || attendee.emailAddress.address}
                    </Badge>
                  ))}
                </div>
              </div>

              {meeting.onlineMeetingProvider && (
                <div>
                  <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-1">
                    Meeting Platform
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                    {meeting.onlineMeetingProvider.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                </div>
              )}
            </div>

            {/* Meeting Notes Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">
                  Meeting Notes
                </h4>
                {notes && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyToClipboard}
                      className="h-8"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportPdf}
                      className="h-8"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      PDF
                    </Button>
                  </div>
                )}
              </div>

              {loadingNotes ? (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  Loading meeting notes...
                </div>
              ) : notes ? (
                <div className="space-y-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Source: {notes.source} • Last modified: {new Date(notes.last_modified).toLocaleString()}
                  </div>
                  <Textarea
                    value={notes.notes}
                    readOnly
                    className="min-h-[120px] resize-none bg-gray-50 dark:bg-gray-800"
                    placeholder="No notes available for this meeting"
                  />
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No notes available</p>
                  <p className="text-xs">Notes from Teams chat or OneNote will appear here</p>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}