
-- Add embedding_multi column to document_vectors table for multi-provider support
ALTER TABLE document_vectors 
ADD COLUMN embedding_multi jsonb;

-- Add index for better performance on the new column
CREATE INDEX IF NOT EXISTS idx_document_vectors_embedding_multi ON document_vectors USING gin (embedding_multi);

-- Comment for documentation
COMMENT ON COLUMN document_vectors.embedding_multi IS 'Multi-provider embedding storage in JSON format with provider keys (openai, gemini, etc.)';
