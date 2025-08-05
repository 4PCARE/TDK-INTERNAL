
-- Add endorsement and validity date fields to documents table
ALTER TABLE documents 
ADD COLUMN endorsed BOOLEAN DEFAULT FALSE,
ADD COLUMN endorsed_at TIMESTAMP,
ADD COLUMN endorsed_by VARCHAR(255),
ADD COLUMN valid_start_date TIMESTAMP,
ADD COLUMN valid_end_date TIMESTAMP;

-- Add index for endorsed documents
CREATE INDEX idx_documents_endorsed ON documents(endorsed);
CREATE INDEX idx_documents_valid_dates ON documents(valid_start_date, valid_end_date);
