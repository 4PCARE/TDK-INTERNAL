
-- Add search_configuration column to agent_chatbots table
ALTER TABLE agent_chatbots 
ADD COLUMN search_configuration jsonb;

-- Add comment for documentation
COMMENT ON COLUMN agent_chatbots.search_configuration IS 'Search configuration settings for custom search behavior';
