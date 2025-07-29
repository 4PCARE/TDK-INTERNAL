import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
      type: "carousel",
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
      const response = await apiRequest("POST", "/api/line-templates", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/line-templates"] });
      toast({
        title: "Success",
        description: "Template created successfully",
      });
      setIsCreating(false);
      form.reset();
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

  // Edit template
  const handleEditTemplate = (template: LineTemplate) => {
    setSelectedTemplate(template);
    setIsCreating(true);
    
    // Populate form with template data
    form.reset({
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
        })),
      })),
    });
  };

  // Submit form
  const onSubmit = (data: TemplateFormData) => {
    if (selectedTemplate) {
      updateTemplateMutation.mutate({ id: selectedTemplate.template.id, data });
    } else {
      createTemplateMutation.mutate(data);
    }
  };

  // Get action icon
  const getActionIcon = (type: string) => {
    switch (type) {
      case "uri":
        return <ExternalLink className="w-4 h-4" />;
      case "postback":
        return <MousePointerClick className="w-4 h-4" />;
      case "message":
        return <MessageSquare className="w-4 h-4" />;
      default:
        return <MousePointerClick className="w-4 h-4" />;
    }
  };

  const lineOaIntegrations = Array.isArray(integrations) ? integrations.filter((int: any) => int.type === "lineoa") : [];

  return (
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
            setIsCreating(true);
            setSelectedTemplate(null);
            form.reset();
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
                                {lineOaIntegrations.find((int: any) => int.id === template.template.integrationId)?.name || "Unknown Integration"}
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

                      {/* Template Preview */}
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {template.columns.slice(0, 3).map((col, index) => (
                          <div key={index} className="border rounded p-3 bg-white">
                            {col.column.thumbnailImageUrl && (
                              <div className="w-full h-20 bg-muted rounded mb-2 flex items-center justify-center">
                                <Image className="w-6 h-6 text-muted-foreground" />
                              </div>
                            )}
                            <h4 className="font-medium text-sm mb-1">{col.column.title}</h4>
                            <p className="text-xs text-muted-foreground mb-2">{col.column.text}</p>
                            <div className="space-y-1">
                              {col.actions.slice(0, 2).map((action, actionIndex) => (
                                <div key={actionIndex} className="flex items-center space-x-1">
                                  {getActionIcon(action.type)}
                                  <span className="text-xs">{action.label}</span>
                                </div>
                              ))}
                              {col.actions.length > 2 && (
                                <div className="text-xs text-muted-foreground">+{col.actions.length - 2} more</div>
                              )}
                            </div>
                          </div>
                        ))}
                        {template.columns.length > 3 && (
                          <div className="border rounded p-3 bg-muted flex items-center justify-center">
                            <span className="text-sm text-muted-foreground">+{template.columns.length - 3} more</span>
                          </div>
                        )}
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
                Template preview feature coming soon
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Template Dialog */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedTemplate ? "Edit Template" : "Create New Template"}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                <FormField
                  control={form.control}
                  name="integrationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Line OA Integration (Optional)</FormLabel>
                      <Select
                        value={field.value?.toString() || ""}
                        onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select integration" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {lineOaIntegrations.map((integration: any) => (
                            <SelectItem key={integration.id} value={integration.id.toString()}>
                              {integration.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Carousel Columns */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Carousel Columns</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      appendColumn({
                        title: "",
                        text: "",
                        thumbnailImageUrl: "",
                        actions: [{ type: "uri", label: "", uri: "" }],
                      })
                    }
                    disabled={columnFields.length >= 10}
                  >
                    <Plus className="w-4 h-4" />
                    Add Column
                  </Button>
                </div>

                {columnFields.map((field, columnIndex) => (
                  <ColumnEditor
                    key={field.id}
                    columnIndex={columnIndex}
                    form={form}
                    onRemove={() => removeColumn(columnIndex)}
                    canRemove={columnFields.length > 1}
                  />
                ))}
              </div>

              {/* Submit */}
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreating(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {selectedTemplate ? "Update" : "Create"} Template
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
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
          <CardTitle className="text-base">Column {columnIndex + 1}</CardTitle>
          {canRemove && (
            <Button type="button" variant="outline" size="sm" onClick={onRemove}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Column Fields */}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Actions (1-3 required)</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendAction({ type: "uri", label: "", uri: "" })}
              disabled={actionFields.length >= 3}
            >
              <Plus className="w-4 h-4" />
              Add Action
            </Button>
          </div>

          {actionFields.map((actionField, actionIndex) => (
            <ActionEditor
              key={actionField.id}
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