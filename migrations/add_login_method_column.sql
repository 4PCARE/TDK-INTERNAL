
-- Add login_method column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_method TEXT NOT NULL DEFAULT 'replit';

-- Update existing Microsoft users based on claims pattern (if identifiable)
-- This is a best-effort approach - you may need to manually update some users
UPDATE users SET login_method = 'microsoft' 
WHERE id ~ '^[0-9]+$' AND length(id) = 8; -- Microsoft Object IDs are typically 8-digit numbers

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_users_login_method ON users(login_method);
