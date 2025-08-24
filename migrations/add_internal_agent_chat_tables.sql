
-- Create internal agent chat sessions table
CREATE TABLE IF NOT EXISTS internal_agent_chat_sessions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  agent_id INTEGER NOT NULL REFERENCES agent_chatbots(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  last_message_at TIMESTAMP NOT NULL,
  message_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create internal agent chat messages table
CREATE TABLE IF NOT EXISTS internal_agent_chat_messages (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES internal_agent_chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_internal_sessions_user_id ON internal_agent_chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_internal_sessions_agent_id ON internal_agent_chat_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_internal_sessions_updated_at ON internal_agent_chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_internal_messages_session_id ON internal_agent_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_internal_messages_created_at ON internal_agent_chat_messages(created_at);
