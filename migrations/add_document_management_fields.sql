
-- Add endorsement and validity date fields to documents table
-- Use IF NOT EXISTS to avoid duplicate column errors

-- Add endorsed column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'documents' AND column_name = 'endorsed') THEN
    ALTER TABLE documents ADD COLUMN endorsed BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add is_endorsed column (new naming convention)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'documents' AND column_name = 'is_endorsed') THEN
    ALTER TABLE documents ADD COLUMN is_endorsed BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add endorsed_by column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'documents' AND column_name = 'endorsed_by') THEN
    ALTER TABLE documents ADD COLUMN endorsed_by VARCHAR REFERENCES users(id);
  END IF;
END $$;

-- endorsed_at already exists, skip it

-- Add effective_start_date column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'documents' AND column_name = 'effective_start_date') THEN
    ALTER TABLE documents ADD COLUMN effective_start_date DATE;
  END IF;
END $$;

-- Add effective_end_date column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'documents' AND column_name = 'effective_end_date') THEN
    ALTER TABLE documents ADD COLUMN effective_end_date DATE;
  END IF;
END $$;

-- Add valid_start_date column if it doesn't exist (legacy naming)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'documents' AND column_name = 'valid_start_date') THEN
    ALTER TABLE documents ADD COLUMN valid_start_date TIMESTAMP;
  END IF;
END $$;

-- Add valid_end_date column if it doesn't exist (legacy naming)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'documents' AND column_name = 'valid_end_date') THEN
    ALTER TABLE documents ADD COLUMN valid_end_date TIMESTAMP;
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_documents_endorsed ON documents(is_endorsed);
CREATE INDEX IF NOT EXISTS idx_documents_effective_dates ON documents(effective_start_date, effective_end_date);
CREATE INDEX IF NOT EXISTS idx_documents_valid_dates ON documents(valid_start_date, valid_end_date);
