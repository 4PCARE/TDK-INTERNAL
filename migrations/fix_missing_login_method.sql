
-- Fix for missing login_method column
-- This migration adds the login_method column if it doesn't exist

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'login_method'
    ) THEN
        ALTER TABLE users ADD COLUMN login_method VARCHAR(50) DEFAULT 'replit';
        
        -- Update existing users to have 'replit' as default login method
        UPDATE users SET login_method = 'replit' WHERE login_method IS NULL;
        
        -- Make the column non-nullable now that all rows have a value
        ALTER TABLE users ALTER COLUMN login_method SET NOT NULL;
    END IF;
END $$;
