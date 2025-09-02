
-- Add agent_web_search_whitelist table
CREATE TABLE IF NOT EXISTS agent_web_search_whitelist (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES agent_chatbots(id) ON DELETE CASCADE,
  url VARCHAR(500) NOT NULL,
  description TEXT,
  primary_details JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id VARCHAR(255) NOT NULL REFERENCES users(id)
);

-- Add indexes for better performance
CREATE INDEX idx_agent_web_search_whitelist_agent_id ON agent_web_search_whitelist(agent_id);
CREATE INDEX idx_agent_web_search_whitelist_url ON agent_web_search_whitelist(url);
CREATE INDEX idx_agent_web_search_whitelist_active ON agent_web_search_whitelist(is_active);

-- Add web_search_config column to agent_chatbots table
ALTER TABLE agent_chatbots 
ADD COLUMN IF NOT EXISTS web_search_config JSONB DEFAULT '{"enabled": false, "trigger_keywords": [], "max_results": 5}';

-- Add comment for documentation
COMMENT ON TABLE agent_web_search_whitelist IS 'Whitelisted URLs for agent web search functionality';
COMMENT ON COLUMN agent_chatbots.web_search_config IS 'Web search configuration including enabled status and trigger keywords';
