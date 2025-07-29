
-- Add description_embedding column to line_message_templates table
ALTER TABLE line_message_templates 
ADD COLUMN description_embedding text;
