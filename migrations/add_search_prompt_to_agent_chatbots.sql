
-- Add searchPrompt column to agent_chatbots table
ALTER TABLE agent_chatbots 
ADD COLUMN search_prompt TEXT DEFAULT NULL;

-- Add aliases column to agent_chatbots table
ALTER TABLE agent_chatbots 
ADD COLUMN aliases JSONB DEFAULT NULL;

-- Add comments for the new columns
COMMENT ON COLUMN agent_chatbots.search_prompt IS 'Custom prompt to enhance document search effectiveness';
COMMENT ON COLUMN agent_chatbots.aliases IS 'Term aliases mapping for query expansion - JSON object where keys are primary terms and values are arrays of alternate terms';
