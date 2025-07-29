import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  ArrowLeft, 
  Settings,
  ExternalLink,
  MessageSquare,
  MousePointerClick,
  Image,
  Type,
  Link as LinkIcon
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import DashboardLayout from "@/components/Layout/DashboardLayout";

// Validation schemas
const templateActionSchema = z.object({
  type: z.enum(["uri", "postback", "message"]),
  label: z.string().min(1, "Label is required").max(20, "Label must be 20 characters or less"),
  uri: z.string().url().optional().or(z.literal("")),
  data: z.string().optional(),
  text: z.string().optional(),
});

const carouselColumnSchema = z.object({
  thumbnailImageUrl: z.string().url().optional().or(z.literal("")),
  title: z.string().min(1, "Title is required").max(40, "Title must be 40 characters or less"),
  text: z.string().min(1, "Text is required").max(120, "Text must be 120 characters or less"),
  actions: z.array(templateActionSchema).min(1, "At least one action is required").max(3, "Maximum 3 actions allowed"),
});

const templateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  description: z.string().min(1, "Template description is required for intent matching"),
  type: z.enum(["carousel"]),
  integrationId: z.number().optional(),
  columns: z.array(carouselColumnSchema).min(1, "At least one column is required").max(10, "Maximum 10 columns allowed"),
});

type TemplateFormData = z.infer<typeof templateSchema>;

interface LineTemplate {
  template: {
    id: number;
    name: string;
    type: string;
    integrationId: number | null;
    userId: string;
    createdAt: string;
    updatedAt: string;
  };
  columns: Array<{
    column: {
      id: number;
      templateId: number;
      order: number;
      thumbnailImageUrl: string | null;
      title: string;
      text: string;
    };
    actions: Array<{
      id: number;
      columnId: number;
      order: number;
      type: string;
      label: string;
      uri: string | null;
      data: string | null;
      text: string | null;
    }>;
  }>;
}

export default function LineConfiguration() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<LineTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Get integrationId from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const integrationId = urlParams.get('integrationId') ? parseInt(urlParams.get('integrationId')!) : null;

  console.log("LineConfiguration render - integrationId:", integrationId, "isCreating:", isCreating, "selectedTemplate:", selectedTemplate);

  useEffect(() => {
    console.log("useEffect - isCreating changed to:", isCreating);
  }, [isCreating]);

  useEffect(() => {
    console.log("useEffect - selectedTemplate changed to:", selectedTemplate);
  }, [selectedTemplate]);

  // Fetch Line OA integrations
  const { data: integrations } = useQuery({
    queryKey: ["/api/social-integrations"],
  });

  // Fetch Line message templates
  const { data: templates, isLoading } = useQuery({
    queryKey: ["/api/line-templates"],
  });

  // Form setup
  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "carousel",
      integrationId: integrationId || undefined,
      columns: [
        {
          title: "",
          text: "",
          thumbnailImageUrl: "",
          actions: [
            {
              type: "uri",
              label: "",
              uri: "",
            },
          ],
        },
      ],
    },
  });

  const { fields: columnFields, append: appendColumn, remove: removeColumn } = useFieldArray({
    control: form.control,
    name: "columns",
  });

  // Mutations
  const createTemplateMutation = useMutation({
    mutationFn: async (data: TemplateFormData) => {
      console.log("New Template button clicked!", data);
      // Ensure integrationId is included
      const templateData = {
        ...data,
        integrationId: integrationId || data.integrationId
      };
      console.log("Template data with integrationId:", templateData);
      const response = await apiRequest("POST", "/api/line-templates", templateData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/line-templates"] });
      toast({
        title: "Success",
        description: "Template created successfully",
      });
      setIsCreating(false);
      form.reset({
        name: "",
        description: "",
        type: "carousel",
        integrationId: integrationId || undefined,
        columns: [
          {
            title: "",
            text: "",
            thumbnailImageUrl: "",
            actions: [
              {
                type: "uri",
                label: "",
                uri: "",
              },
            ],
          },
        ],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create template",
        variant: "destructive",
      });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: TemplateFormData }) => {
      const response = await apiRequest("PUT", `/api/line-templates/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/line-templates"] });
      toast({
        title: "Success",
        description: "Template updated successfully",
      });
      setSelectedTemplate(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update template",
        variant: "destructive",
      });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/line-templates/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/line-templates"] });
      toast({
        title: "Success",
        description: "Template deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete template",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const handleSubmit = (data: TemplateFormData) => {
    if (selectedTemplate) {
      updateTemplateMutation.mutate({
        id: selectedTemplate.template.id,
        data,
      });
    } else {
      createTemplateMutation.mutate(data);
    }
  };

  // Handle edit template
  const handleEditTemplate = (template: LineTemplate) => {
    setSelectedTemplate(template);
    setIsCreating(false);
    
    // Transform template data for form
    const formData = {
      name: template.template.name,
      type: template.template.type as "carousel",
      integrationId: template.template.integrationId || undefined,
      columns: template.columns.map(col => ({
        title: col.column.title,
        text: col.column.text,
        thumbnailImageUrl: col.column.thumbnailImageUrl || "",
        actions: col.actions.map(action => ({
          type: action.type as "uri" | "postback" | "message",
          label: action.label,
          uri: action.uri || "",
          data: action.data || "",
          text: action.text || "",
        }))
      }))
    };
    
    form.reset(formData);
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case "uri":
        return <ExternalLink className="w-4 h-4" />;
      case "message":
        return <MessageSquare className="w-4 h-4" />;
      case "postback":
        return <MousePointerClick className="w-4 h-4" />;
      default:
        return <MousePointerClick className="w-4 h-4" />;
    }
  };

  const lineOaIntegrations = Array.isArray(integrations) ? integrations.filter((int: any) => int.type === "lineoa") : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/integrations")}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Integrations</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Line Configuration</h1>
              <p className="text-muted-foreground">Manage Line OA message templates</p>
            </div>
          </div>

          <Button
            onClick={() => {
              console.log("New Template button clicked!");
              setIsCreating(true);
              setSelectedTemplate(null);
              form.reset();
              console.log("isCreating set to:", true);
            }}
            className="flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>New Template</span>
          </Button>
        </div>

        <Tabs defaultValue="templates" className="space-y-6">
          <TabsList>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="space-y-6">
            {/* Templates List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="w-5 h-5" />
                  <span>Message Templates</span>
                  <Badge variant="secondary">{Array.isArray(templates) ? templates.length : 0}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">Loading templates...</div>
                ) : !Array.isArray(templates) || templates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No templates created yet. Create your first carousel template to get started.
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {Array.isArray(templates) && templates.map((template: LineTemplate) => (
                      <div
                        key={template.template.id}
                        className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <h3 className="font-medium">{template.template.name}</h3>
                              <Badge variant="outline">{template.template.type}</Badge>
                              {template.template.integrationId && (
                                <Badge variant="secondary">
                                  {(() => {
                                    const integration = lineOaIntegrations.find((int: any) => int.id === template.template.integrationId);
                                    return integration?.name || `Integration ID: ${template.template.integrationId}`;
                                  })()}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {template.columns.length} columns • Created {new Date(template.template.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditTemplate(template)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteTemplateMutation.mutate(template.template.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Template Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  Select a template to preview its carousel layout
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Template Creation/Edit Modal */}
        <Dialog open={isCreating || selectedTemplate !== null} onOpenChange={(open) => {
          console.log("Dialog onOpenChange called with:", open, "isCreating:", isCreating, "selectedTemplate:", selectedTemplate);
          if (!open) {
            setIsCreating(false);
            setSelectedTemplate(null);
            form.reset();
          }
        }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedTemplate ? "Edit Template" : "Create New Template"}
              </DialogTitle>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                {/* Template Name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter template name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Template Description */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe when this template should be used (for AI intent matching)"
                          rows={3}
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Columns */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-lg">Carousel Columns</Label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => appendColumn({
                        title: "",
                        text: "",
                        thumbnailImageUrl: "",
                        actions: [{ type: "uri", label: "", uri: "" }],
                      })}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Column
                    </Button>
                  </div>

                  {columnFields.map((column, columnIndex) => (
                    <ColumnEditor
                      key={column.id}
                      columnIndex={columnIndex}
                      form={form}
                      onRemove={() => removeColumn(columnIndex)}
                      canRemove={columnFields.length > 1}
                    />
                  ))}
                </div>

                {/* Submit Buttons */}
                <div className="flex justify-end space-x-4 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreating(false);
                      setSelectedTemplate(null);
                      form.reset();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    {selectedTemplate ? "Update Template" : "Create Template"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

// Column Editor Component
function ColumnEditor({
  columnIndex,
  form,
  onRemove,
  canRemove,
}: {
  columnIndex: number;
  form: any;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { fields: actionFields, append: appendAction, remove: removeAction } = useFieldArray({
    control: form.control,
    name: `columns.${columnIndex}.actions`,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Column {columnIndex + 1}</CardTitle>
          {canRemove && (
            <Button type="button" variant="outline" size="sm" onClick={onRemove}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Thumbnail Image URL */}
        <FormField
          control={form.control}
          name={`columns.${columnIndex}.thumbnailImageUrl`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Thumbnail Image URL (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="https://example.com/image.jpg" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Title */}
        <FormField
          control={form.control}
          name={`columns.${columnIndex}.title`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title (Max 40 chars)</FormLabel>
              <FormControl>
                <Input placeholder="Column title" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Text */}
        <FormField
          control={form.control}
          name={`columns.${columnIndex}.text`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Text (Max 120 chars)</FormLabel>
              <FormControl>
                <Textarea placeholder="Column description" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Actions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base">Actions</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendAction({
                type: "uri",
                label: "",
                uri: "",
              })}
              disabled={actionFields.length >= 3}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Action
            </Button>
          </div>

          {actionFields.map((action, actionIndex) => (
            <ActionEditor
              key={action.id}
              columnIndex={columnIndex}
              actionIndex={actionIndex}
              form={form}
              onRemove={() => removeAction(actionIndex)}
              canRemove={actionFields.length > 1}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Action Editor Component
function ActionEditor({
  columnIndex,
  actionIndex,
  form,
  onRemove,
  canRemove,
}: {
  columnIndex: number;
  actionIndex: number;
  form: any;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const actionType = form.watch(`columns.${columnIndex}.actions.${actionIndex}.type`);

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Action {actionIndex + 1}</Label>
        {canRemove && (
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name={`columns.${columnIndex}.actions.${actionIndex}.type`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="uri">URI (External Link)</SelectItem>
                  <SelectItem value="postback">Postback (Data)</SelectItem>
                  <SelectItem value="message">Message (Text)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`columns.${columnIndex}.actions.${actionIndex}.label`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Label (Max 20 chars)</FormLabel>
              <FormControl>
                <Input placeholder="Button text" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Conditional fields based on action type */}
      {actionType === "uri" && (
        <FormField
          control={form.control}
          name={`columns.${columnIndex}.actions.${actionIndex}.uri`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL</FormLabel>
              <FormControl>
                <Input placeholder="https://example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {actionType === "postback" && (
        <FormField
          control={form.control}
          name={`columns.${columnIndex}.actions.${actionIndex}.data`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Postback Data</FormLabel>
              <FormControl>
                <Input placeholder="custom_data_value" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {actionType === "message" && (
        <FormField
          control={form.control}
          name={`columns.${columnIndex}.actions.${actionIndex}.text`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Message Text</FormLabel>
              <FormControl>
                <Input placeholder="Text to send" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}