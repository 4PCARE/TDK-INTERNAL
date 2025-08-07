
-- Add isPlatformWidget column to chat_widgets table
ALTER TABLE chat_widgets 
ADD COLUMN is_platform_widget BOOLEAN DEFAULT FALSE;

-- Ensure only one widget can be the platform widget
CREATE UNIQUE INDEX CONCURRENTLY idx_unique_platform_widget 
ON chat_widgets (is_platform_widget) 
WHERE is_platform_widget = TRUE;
