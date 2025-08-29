
-- SQL Snippets table for storing reusable query patterns
CREATE TABLE IF NOT EXISTS sql_snippets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  sql TEXT NOT NULL,
  description TEXT DEFAULT '',
  connection_id INTEGER NOT NULL,
  user_id VARCHAR REFERENCES users(id) NOT NULL,
  embedding VECTOR(1536), -- For OpenAI embeddings
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(name, connection_id, user_id)
);

-- AI Database Query History
CREATE TABLE IF NOT EXISTS ai_database_queries (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id) NOT NULL,
  connection_id INTEGER NOT NULL,
  user_query TEXT NOT NULL,
  generated_sql TEXT,
  execution_result JSONB,
  success BOOLEAN DEFAULT false,
  execution_time INTEGER, -- milliseconds
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sql_snippets_connection_user ON sql_snippets(connection_id, user_id);
CREATE INDEX IF NOT EXISTS idx_sql_snippets_embedding ON sql_snippets USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_ai_database_queries_user ON ai_database_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_database_queries_connection ON ai_database_queries(connection_id);
