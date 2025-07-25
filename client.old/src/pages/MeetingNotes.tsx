import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/Sidebar";
import { MeetingItem } from "@/components/MeetingItem";
import { 
  Calendar,
  Clock,
  Users,
  FileText,
  Download,
  Copy,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  RefreshCw
} from "lucide-react";

interface User {
  name: string;
  email: string;
  user_id: string;
}

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

const TEAMS_API_BASE = "http://localhost:8000"; // Teams Meeting Notes API

export default function MeetingNotes() {
  const [user, setUser] = useState<User | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>("demo-token"); // Demo mode
  const { toast } = useToast();

  // Demo data for showing the interface
  const demoUser: User = {
    name: "John Smith",
    email: "john.smith@company.com",
    user_id: "demo-user"
  };

  const demoMeetings: Meeting[] = [
    {
      id: "meeting-1",
      subject: "Q1 Planning Review",
      start: {
        dateTime: "2025-01-15T09:00:00Z",
        timeZone: "UTC"
      },
      end: {
        dateTime: "2025-01-15T10:00:00Z",
        timeZone: "UTC"
      },
      attendees: [
        { emailAddress: { name: "John Smith", address: "john.smith@company.com" } },
        { emailAddress: { name: "Sarah Johnson", address: "sarah.j@company.com" } },
        { emailAddress: { name: "Mike Wilson", address: "mike.w@company.com" } }
      ],
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness"
    },
    {
      id: "meeting-2",
      subject: "Product Development Sync",
      start: {
        dateTime: "2025-01-14T14:30:00Z",
        timeZone: "UTC"
      },
      end: {
        dateTime: "2025-01-14T15:30:00Z",
        timeZone: "UTC"
      },
      attendees: [
        { emailAddress: { name: "John Smith", address: "john.smith@company.com" } },
        { emailAddress: { name: "Emily Chen", address: "emily.chen@company.com" } },
        { emailAddress: { name: "David Rodriguez", address: "david.r@company.com" } },
        { emailAddress: { name: "Lisa Park", address: "lisa.park@company.com" } }
      ],
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness"
    },
    {
      id: "meeting-3",
      subject: "Weekly Team Standup",
      start: {
        dateTime: "2025-01-13T10:00:00Z",
        timeZone: "UTC"
      },
      end: {
        dateTime: "2025-01-13T10:30:00Z",
        timeZone: "UTC"
      },
      attendees: [
        { emailAddress: { name: "John Smith", address: "john.smith@company.com" } },
        { emailAddress: { name: "Alex Turner", address: "alex.turner@company.com" } },
        { emailAddress: { name: "Maria Garcia", address: "maria.g@company.com" } }
      ],
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness"
    }
  ];

  // Initialize demo data on component mount
  useEffect(() => {
    // Simulate loading and then show demo data
    setLoading(true);
    setTimeout(() => {
      setUser(demoUser);
      setMeetings(demoMeetings);
      setLoading(false);
    }, 1000);
  }, []);

  const fetchUserInfo = async () => {
    try {
      const response = await fetch(`${TEAMS_API_BASE}/api/user`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        throw new Error('Failed to fetch user info');
      }
    } catch (err) {
      console.error('Error fetching user info:', err);
      setError('Failed to fetch user information');
    }
  };

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${TEAMS_API_BASE}/api/meetings?limit=10`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMeetings(data.meetings || []);
      } else {
        throw new Error('Failed to fetch meetings');
      }
    } catch (err) {
      console.error('Error fetching meetings:', err);
      setError('Failed to fetch meetings');
      toast({
        title: "Error",
        description: "Failed to fetch meetings from Microsoft Teams.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setAuthLoading(true);
    try {
      const response = await fetch(`${TEAMS_API_BASE}/auth/login`);
      const data = await response.json();
      
      if (data.auth_url) {
        // Open Microsoft OAuth in popup
        const popup = window.open(
          data.auth_url,
          'microsoft-auth',
          'width=500,height=600,scrollbars=yes,resizable=yes'
        );

        // Monitor popup for completion
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            setAuthLoading(false);
            // Check if authentication was successful by looking for token
            const savedToken = localStorage.getItem('teams_auth_token');
            if (savedToken) {
              setAuthToken(savedToken);
            }
          }
        }, 1000);
      }
    } catch (err) {
      console.error('Error initiating Microsoft login:', err);
      setAuthLoading(false);
      toast({
        title: "Error",
        description: "Failed to initiate Microsoft login.",
        variant: "destructive",
      });
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    setUser(null);
    setMeetings([]);
    localStorage.removeItem('teams_auth_token');
    toast({
      title: "Logged out",
      description: "Successfully disconnected from Microsoft Teams.",
    });
  };

  const fetchMeetingNotes = async (meetingId: string): Promise<MeetingNotes | null> => {
    // Demo notes data
    const demoNotes: { [key: string]: MeetingNotes } = {
      "meeting-1": {
        meeting_id: "meeting-1",
        notes: `Q1 Planning Review - Meeting Notes

Attendees: John Smith, Sarah Johnson, Mike Wilson

Key Discussion Points:
1. Q1 Budget allocation and resource planning
2. Project prioritization for the quarter
3. Team capacity and hiring needs

Decisions Made:
• Approved $150K budget for Product Development team
• Agreed to prioritize mobile app development over web redesign
• Authorized hiring 2 additional developers

Action Items:
- Sarah: Finalize budget proposal by Jan 20 
- Mike: Interview candidates for developer positions by Jan 25
- John: Review project timelines and update stakeholders by Jan 18

Next Meeting: Q1 Mid-quarter review scheduled for February 15th`,
        source: "Teams Chat",
        last_modified: "2025-01-15T10:05:00Z"
      },
      "meeting-2": {
        meeting_id: "meeting-2", 
        notes: `Product Development Sync - Meeting Notes

Attendees: John Smith, Emily Chen, David Rodriguez, Lisa Park

Sprint Review:
• Completed 85% of planned user stories
• Mobile authentication module finished ahead of schedule
• API integration delayed due to third-party dependencies

Current Blockers:
- Waiting for security audit approval
- Payment gateway integration pending vendor response
- UI testing delayed due to design changes

Technical Decisions:
• Adopted React Native for cross-platform development
• Implemented JWT authentication with refresh tokens
• Selected PostgreSQL for data persistence

Action Items:
- Emily: Follow up with security team for audit status
- David: Contact payment vendor for integration timeline
- Lisa: Finalize new UI designs by end of week
- John: Update project roadmap with current status

Next Sprint Planning: Thursday, Jan 16 at 2:00 PM`,
        source: "OneNote",
        last_modified: "2025-01-14T15:35:00Z"
      },
      "meeting-3": {
        meeting_id: "meeting-3",
        notes: `Weekly Team Standup - Meeting Notes

Attendees: John Smith, Alex Turner, Maria Garcia

Team Updates:

Alex Turner:
- Completed user registration flow
- Working on email verification feature
- Blocked: Need design approval for confirmation page

Maria Garcia:
- Finished database migration scripts
- Implemented user profile management
- Next: Working on account settings page

John Smith:
- Reviewed pull requests from last week
- Conducted code review sessions
- Planning: Preparing for client demo next week

General Discussion:
• Team velocity is improving - ahead of schedule
• Client feedback on prototype was positive
• Need to schedule team building event

Upcoming:
- Client demo: Friday, Jan 17 at 3:00 PM
- Code freeze: Wednesday, Jan 22
- Team lunch: Friday, Jan 24`,
        source: "Teams Chat",
        last_modified: "2025-01-13T10:35:00Z"
      }
    };

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return demoNotes[meetingId] || null;
  };

  const exportToPdf = async (meeting: Meeting, notes: string) => {
    // Demo PDF export - create a simple text file instead
    try {
      const pdfContent = `${meeting.subject} - Meeting Notes

Date: ${new Date(meeting.start.dateTime).toLocaleDateString()}
Time: ${new Date(meeting.start.dateTime).toLocaleTimeString()} - ${new Date(meeting.end.dateTime).toLocaleTimeString()}

Attendees:
${meeting.attendees.map(a => `- ${a.emailAddress.name} (${a.emailAddress.address})`).join('\n')}

Meeting Notes:
${notes}

Generated by AI-KMS Meeting Notes Integration
Date Exported: ${new Date().toLocaleString()}`;

      const blob = new Blob([pdfContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `meeting-notes-${meeting.subject.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.txt`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export successful",
        description: "Meeting notes exported successfully.",
      });
    } catch (err) {
      console.error('Error exporting notes:', err);
      toast({
        title: "Error",
        description: "Failed to export meeting notes.",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = async (notes: string) => {
    try {
      await navigator.clipboard.writeText(notes);
      toast({
        title: "Copied to clipboard",
        description: "Meeting notes copied to clipboard.",
      });
    } catch (err) {
      console.error('Error copying to clipboard:', err);
      toast({
        title: "Error",
        description: "Failed to copy notes to clipboard.",
        variant: "destructive",
      });
    }
  };

  const formatDateTime = (dateTimeString: string) => {
    const date = new Date(dateTimeString);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex">
        <Sidebar />
        
        <div className="flex-1 p-8">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Meeting Notes
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Access and manage your Microsoft Teams meeting notes
              </p>
            </div>

            {error && (
              <Alert className="mb-6" variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Authentication Section */}
            {!authToken ? (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ExternalLink className="h-5 w-5" />
                    Connect to Microsoft Teams
                  </CardTitle>
                  <CardDescription>
                    Sign in with your Microsoft account to access your Teams meetings and notes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={handleMicrosoftLogin}
                    disabled={authLoading}
                    className="w-full sm:w-auto"
                  >
                    {authLoading ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Sign in with Microsoft
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* User Info */}
                {user && (
                  <Card className="mb-8">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-500" />
                          Connected to Microsoft Teams
                        </div>
                        <Button variant="outline" onClick={handleLogout}>
                          Disconnect
                        </Button>
                      </CardTitle>
                      <CardDescription>
                        Signed in as {user.name} ({user.email})
                      </CardDescription>
                    </CardHeader>
                  </Card>
                )}

                {/* Meetings Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Recent Meetings
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={fetchMeetings}
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Refresh
                          </>
                        )}
                      </Button>
                    </CardTitle>
                    <CardDescription>
                      Your last 10 Teams meetings with notes
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="animate-pulse">
                            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                          </div>
                        ))}
                      </div>
                    ) : meetings.length > 0 ? (
                      <div className="space-y-4">
                        {meetings.map((meeting) => (
                          <MeetingItem
                            key={meeting.id}
                            meeting={meeting}
                            onFetchNotes={fetchMeetingNotes}
                            onExportPdf={exportToPdf}
                            onCopyToClipboard={copyToClipboard}
                            formatDateTime={formatDateTime}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No meetings found</p>
                        <p className="text-sm">Your recent Teams meetings will appear here</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}