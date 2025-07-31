
-- Ensure sessions table exists for persistent authentication
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR NOT NULL COLLATE "default",
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

-- Add primary key if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_pkey') THEN
    ALTER TABLE sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (sid);
  END IF;
END
$$;

-- Create index on expire column for efficient cleanup
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);
