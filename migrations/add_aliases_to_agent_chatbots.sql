
-- Add aliases column to agent_chatbots table
ALTER TABLE agent_chatbots ADD COLUMN IF NOT EXISTS aliases JSONB;

-- Add comment for documentation
COMMENT ON COLUMN agent_chatbots.aliases IS 'Term aliases for search query expansion - JSON object where keys are primary terms and values are arrays of alternate terms';
