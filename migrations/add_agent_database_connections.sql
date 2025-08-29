
-- Add agent database connections table
CREATE TABLE agent_database_connections (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES agent_chatbots(id) ON DELETE CASCADE,
  connection_id INTEGER NOT NULL REFERENCES data_connections(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(agent_id, connection_id)
);

-- Add indexes for performance
CREATE INDEX idx_agent_database_connections_agent_id ON agent_database_connections(agent_id);
CREATE INDEX idx_agent_database_connections_connection_id ON agent_database_connections(connection_id);
CREATE INDEX idx_agent_database_connections_user_id ON agent_database_connections(user_id);
