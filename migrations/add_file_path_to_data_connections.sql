
-- Add file_path column to data_connections table for SQLite support
ALTER TABLE data_connections ADD COLUMN file_path VARCHAR;
ALTER TABLE data_connections ADD COLUMN original_excel_path VARCHAR;
