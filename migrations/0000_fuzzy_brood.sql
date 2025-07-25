CREATE TABLE "agent_chatbot_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_chatbots" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"system_prompt" text NOT NULL,
	"user_id" varchar NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"personality" varchar,
	"profession" varchar,
	"response_style" varchar,
	"special_skills" jsonb DEFAULT '[]'::jsonb,
	"content_filtering" boolean DEFAULT true,
	"toxicity_prevention" boolean DEFAULT true,
	"privacy_protection" boolean DEFAULT true,
	"factual_accuracy" boolean DEFAULT true,
	"response_length" varchar DEFAULT 'medium',
	"allowed_topics" jsonb DEFAULT '[]'::jsonb,
	"blocked_topics" jsonb DEFAULT '[]'::jsonb,
	"memory_enabled" boolean DEFAULT true,
	"guardrails_config" jsonb,
	"memory_limit" integer DEFAULT 10,
	"lineoa_config" jsonb,
	"facebook_config" jsonb,
	"tiktok_config" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_assistant_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_message_id" integer,
	"user_id" varchar NOT NULL,
	"user_query" text NOT NULL,
	"assistant_response" text NOT NULL,
	"feedback_type" varchar NOT NULL,
	"user_note" text,
	"document_context" jsonb,
	"conversation_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_response_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_message_id" integer,
	"user_id" varchar NOT NULL,
	"user_query" text NOT NULL,
	"assistant_response" text NOT NULL,
	"analysis_result" varchar NOT NULL,
	"analysis_confidence" real,
	"analysis_reason" text,
	"document_context" jsonb,
	"response_time" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"action" varchar NOT NULL,
	"resource_id" varchar,
	"resource_type" varchar,
	"details" jsonb,
	"ip_address" varchar,
	"user_agent" text,
	"success" boolean DEFAULT true,
	"error_message" text,
	"duration" integer,
	"timestamp" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"color" varchar DEFAULT '#3B82F6' NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"channel_type" varchar NOT NULL,
	"channel_id" varchar NOT NULL,
	"agent_id" integer NOT NULL,
	"message_type" varchar NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" varchar NOT NULL,
	"content" text NOT NULL,
	"document_ids" integer[],
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_widgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"widget_key" varchar NOT NULL,
	"is_active" boolean DEFAULT true,
	"agent_id" integer,
	"primary_color" varchar DEFAULT '#2563eb',
	"text_color" varchar DEFAULT '#ffffff',
	"position" varchar DEFAULT 'bottom-right',
	"welcome_message" text DEFAULT 'Hi! How can I help you today?',
	"offline_message" text DEFAULT 'We''re currently offline. Please leave a message.',
	"enable_hr_lookup" boolean DEFAULT false,
	"hr_api_endpoint" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "chat_widgets_widget_key_unique" UNIQUE("widget_key")
);
--> statement-breakpoint
CREATE TABLE "data_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"type" varchar NOT NULL,
	"db_type" varchar,
	"host" varchar,
	"port" integer,
	"database" varchar,
	"username" varchar,
	"password" varchar,
	"connection_string" text,
	"api_url" text,
	"method" varchar,
	"headers" jsonb,
	"body" text,
	"auth_type" varchar,
	"auth_config" jsonb,
	"enterprise_type" varchar,
	"instance_url" varchar,
	"client_id" varchar,
	"client_secret" varchar,
	"is_active" boolean DEFAULT true,
	"last_tested" timestamp,
	"test_status" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "departments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "document_access" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"access_type" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"content" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"total_chunks" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_department_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"department_id" integer NOT NULL,
	"permission_type" varchar DEFAULT 'read',
	"granted_at" timestamp DEFAULT now(),
	"granted_by" varchar
);
--> statement-breakpoint
CREATE TABLE "document_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"language" varchar NOT NULL,
	"translated_summary" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_user_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"permission_type" varchar DEFAULT 'read',
	"granted_at" timestamp DEFAULT now(),
	"granted_by" varchar
);
--> statement-breakpoint
CREATE TABLE "document_vectors" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"total_chunks" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" real[] NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"file_name" varchar NOT NULL,
	"file_path" varchar NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar NOT NULL,
	"content" text,
	"summary" text,
	"tags" text[],
	"ai_category" varchar(50),
	"ai_category_color" varchar(10),
	"category_id" integer,
	"user_id" varchar NOT NULL,
	"is_public" boolean DEFAULT false,
	"is_favorite" boolean DEFAULT false,
	"processed_at" timestamp,
	"is_endorsed" boolean DEFAULT false,
	"endorsed_by" varchar,
	"endorsed_at" timestamp,
	"effective_start_date" date,
	"effective_end_date" date,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hr_employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar NOT NULL,
	"citizen_id" varchar(13) NOT NULL,
	"name" varchar NOT NULL,
	"department" varchar NOT NULL,
	"position" varchar NOT NULL,
	"email" varchar,
	"phone" varchar,
	"hire_date" timestamp,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "hr_employees_employee_id_unique" UNIQUE("employee_id"),
	CONSTRAINT "hr_employees_citizen_id_unique" UNIQUE("citizen_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"type" varchar NOT NULL,
	"description" text,
	"channel_id" varchar,
	"channel_secret" varchar,
	"channel_access_token" varchar,
	"bot_user_id" varchar,
	"facebook_page_id" varchar,
	"facebook_access_token" varchar,
	"tiktok_channel_id" varchar,
	"tiktok_access_token" varchar,
	"agent_id" integer,
	"is_active" boolean DEFAULT true,
	"is_verified" boolean DEFAULT false,
	"last_verified_at" timestamp,
	"config" jsonb DEFAULT '{}'::jsonb,
	"webhook_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_favorites" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"document_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" varchar DEFAULT 'user' NOT NULL,
	"department_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "widget_chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar NOT NULL,
	"role" varchar NOT NULL,
	"content" text NOT NULL,
	"message_type" varchar DEFAULT 'text',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "widget_chat_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"widget_id" integer NOT NULL,
	"session_id" varchar NOT NULL,
	"visitor_id" varchar,
	"visitor_name" varchar,
	"visitor_email" varchar,
	"visitor_phone" varchar,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "widget_chat_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "agent_chatbot_documents" ADD CONSTRAINT "agent_chatbot_documents_agent_id_agent_chatbots_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_chatbots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chatbot_documents" ADD CONSTRAINT "agent_chatbot_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chatbot_documents" ADD CONSTRAINT "agent_chatbot_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chatbots" ADD CONSTRAINT "agent_chatbots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_assistant_feedback" ADD CONSTRAINT "ai_assistant_feedback_chat_message_id_chat_messages_id_fk" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_response_analysis" ADD CONSTRAINT "ai_response_analysis_chat_message_id_chat_messages_id_fk" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_history" ADD CONSTRAINT "chat_history_agent_id_agent_chatbots_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_chatbots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD CONSTRAINT "chat_widgets_agent_id_agent_chatbots_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_chatbots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_connections" ADD CONSTRAINT "data_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access" ADD CONSTRAINT "document_access_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access" ADD CONSTRAINT "document_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_translations" ADD CONSTRAINT "document_translations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_vectors" ADD CONSTRAINT "document_vectors_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_vectors" ADD CONSTRAINT "document_vectors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_endorsed_by_users_id_fk" FOREIGN KEY ("endorsed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_integrations" ADD CONSTRAINT "social_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_integrations" ADD CONSTRAINT "social_integrations_agent_id_agent_chatbots_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_chatbots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_history_user_channel_idx" ON "chat_history" USING btree ("user_id","channel_type","channel_id");--> statement-breakpoint
CREATE INDEX "chat_history_agent_idx" ON "chat_history" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "chat_history_created_at_idx" ON "chat_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");