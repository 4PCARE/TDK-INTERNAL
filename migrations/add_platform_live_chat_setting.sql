
-- Add platform live chat setting to system_settings table
-- If the table doesn't exist, create it with the new column
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  max_file_size INTEGER DEFAULT 25,
  allowed_file_types TEXT[] DEFAULT ARRAY['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv', 'json'],
  retention_days INTEGER DEFAULT 365,
  auto_backup BOOLEAN DEFAULT FALSE,
  enable_analytics BOOLEAN DEFAULT TRUE,
  enable_platform_live_chat BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- If the table exists but doesn't have the column, add it
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'system_settings' 
                   AND column_name = 'enable_platform_live_chat') THEN
        ALTER TABLE system_settings ADD COLUMN enable_platform_live_chat BOOLEAN DEFAULT TRUE;
    END IF;
END $$;

-- Insert default settings if no record exists
INSERT INTO system_settings (id, enable_platform_live_chat) 
VALUES (1, TRUE)
ON CONFLICT (id) 
DO UPDATE SET enable_platform_live_chat = EXCLUDED.enable_platform_live_chat;
