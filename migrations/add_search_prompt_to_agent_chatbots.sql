
-- Add searchPrompt column to agent_chatbots table
ALTER TABLE agent_chatbots 
ADD COLUMN search_prompt TEXT DEFAULT NULL;

-- Add comment for the new column
COMMENT ON COLUMN agent_chatbots.search_prompt IS 'Custom prompt to enhance document search effectiveness';
