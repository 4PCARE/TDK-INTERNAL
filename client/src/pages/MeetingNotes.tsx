import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { 
  Calendar, 
  Plus, 
  Search, 
  Users, 
  Clock, 
  FileText,
  Edit,
  Trash2,
  Save,
  X
} from "lucide-react";

interface MeetingNote {
  id: number;
  title: string;
  content: string;
  date: string;
  attendees: string[];
  tags: string[];
  duration?: number;
  location?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export default function MeetingNotes() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: meetings = [], isLoading } = useQuery({
    queryKey: ["/api/meeting-notes", searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);

      const response = await fetch(`/api/meeting-notes?${params}`);
      if (!response.ok) throw new Error("Failed to fetch meeting notes");
      return response.json();
    },
  }) as { data: MeetingNote[]; isLoading: boolean };

  const createMutation = useMutation({
    mutationFn: async (data: Omit<MeetingNote, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) => {
      const response = await fetch("/api/meeting-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("Failed to create meeting note");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Meeting Note Created",
        description: "Your meeting note has been successfully created.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/meeting-notes"] });
      setIsCreating(false);
    },
    onError: () => {
      toast({
        title: "Creation Failed",
        description: "Failed to create meeting note. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<MeetingNote> }) => {
      const response = await fetch(`/api/meeting-notes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("Failed to update meeting note");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Meeting Note Updated",
        description: "Your meeting note has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/meeting-notes"] });
      setEditingId(null);
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update meeting note. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/meeting-notes/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete meeting note");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Meeting Note Deleted",
        description: "The meeting note has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/meeting-notes"] });
    },
    onError: () => {
      toast({
        title: "Deletion Failed",
        description: "Failed to delete meeting note. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>, isEdit: boolean = false) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const data = {
      title: formData.get("title") as string,
      content: formData.get("content") as string,
      date: formData.get("date") as string,
      attendees: (formData.get("attendees") as string).split(",").map(a => a.trim()).filter(Boolean),
      tags: (formData.get("tags") as string).split(",").map(t => t.trim()).filter(Boolean),
      duration: formData.get("duration") ? parseInt(formData.get("duration") as string) : undefined,
      location: formData.get("location") as string || undefined,
    };

    if (isEdit && editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return null;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins > 0 ? mins + 'm' : ''}`;
    }
    return `${mins}m`;
  };

  const MeetingForm = ({ meeting, onCancel }: { 
    meeting?: MeetingNote; 
    onCancel: () => void; 
  }) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center space-x-2">
            <FileText className="w-5 h-5" />
            <span>{meeting ? 'Edit Meeting Note' : 'Create New Meeting Note'}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => handleSubmit(e, !!meeting)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title">Meeting Title</Label>
              <Input
                id="title"
                name="title"
                defaultValue={meeting?.title}
                required
                placeholder="Enter meeting title"
              />
            </div>

            <div>
              <Label htmlFor="date">Meeting Date</Label>
              <Input
                id="date"
                name="date"
                type="date"
                defaultValue={meeting?.date}
                required
              />
            </div>

            <div>
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                name="duration"
                type="number"
                defaultValue={meeting?.duration}
                placeholder="60"
              />
            </div>

            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                name="location"
                defaultValue={meeting?.location}
                placeholder="Conference Room A"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="attendees">Attendees</Label>
            <Input
              id="attendees"
              name="attendees"
              defaultValue={meeting?.attendees?.join(", ")}
              placeholder="John Doe, Jane Smith, Bob Johnson"
            />
            <p className="text-xs text-gray-500 mt-1">Comma-separated list of attendee names</p>
          </div>

          <div>
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              name="tags"
              defaultValue={meeting?.tags?.join(", ")}
              placeholder="planning, quarterly, review"
            />
            <p className="text-xs text-gray-500 mt-1">Comma-separated list of tags</p>
          </div>

          <div>
            <Label htmlFor="content">Meeting Notes</Label>
            <Textarea
              id="content"
              name="content"
              defaultValue={meeting?.content}
              required
              placeholder="Enter your meeting notes here..."
              className="min-h-[200px]"
            />
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex items-center space-x-2"
            >
              <Save className="w-4 h-4" />
              <span>{meeting ? 'Update' : 'Create'} Note</span>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Meeting Notes</h1>
              <p className="text-gray-600">Manage your meeting notes and action items</p>
            </div>
          </div>

          <Button 
            onClick={() => setIsCreating(true)}
            className="flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>New Note</span>
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search meeting notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Create Form */}
        {isCreating && (
          <MeetingForm onCancel={() => setIsCreating(false)} />
        )}

        {/* Meeting Notes List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading meeting notes...</p>
            </div>
          ) : meetings.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Meeting Notes</h3>
                <p className="text-gray-500 mb-4">
                  {searchQuery ? 'No notes match your search.' : 'Get started by creating your first meeting note.'}
                </p>
                {!searchQuery && (
                  <Button onClick={() => setIsCreating(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Note
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            meetings.map((meeting) => (
              <div key={meeting.id}>
                {editingId === meeting.id ? (
                  <MeetingForm 
                    meeting={meeting} 
                    onCancel={() => setEditingId(null)} 
                  />
                ) : (
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{meeting.title}</CardTitle>
                          <div className="flex items-center space-x-4 text-sm text-gray-500 mt-2">
                            <div className="flex items-center space-x-1">
                              <Calendar className="w-4 h-4" />
                              <span>{formatDate(meeting.date)}</span>
                            </div>
                            {meeting.duration && (
                              <div className="flex items-center space-x-1">
                                <Clock className="w-4 h-4" />
                                <span>{formatDuration(meeting.duration)}</span>
                              </div>
                            )}
                            {meeting.location && (
                              <span>📍 {meeting.location}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingId(meeting.id)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteMutation.mutate(meeting.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {meeting.attendees.length > 0 && (
                        <div className="mb-4">
                          <div className="flex items-center space-x-2 mb-2">
                            <Users className="w-4 h-4 text-gray-500" />
                            <span className="text-sm font-medium text-gray-700">Attendees</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {meeting.attendees.map((attendee, index) => (
                              <Badge key={index} variant="outline">
                                {attendee}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Notes</h4>
                        <div className="prose prose-sm max-w-none text-gray-600">
                          {meeting.content.split('\n').map((line, index) => (
                            <p key={index}>{line}</p>
                          ))}
                        </div>
                      </div>

                      {meeting.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {meeting.tags.map((tag, index) => (
                            <Badge key={index} variant="secondary">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}