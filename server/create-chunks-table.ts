
import { db } from './db';

async function createDocumentChunksTable() {
  try {
    console.log('Creating document_chunks table...');
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        total_chunks INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('✅ document_chunks table created successfully');
    
    // Create an index for better query performance
    await db.execute(`
      CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx ON document_chunks(document_id);
    `);
    
    console.log('✅ Index created successfully');
    
  } catch (error) {
    console.error('Error creating document_chunks table:', error);
    throw error;
  }
}

createDocumentChunksTable()
  .then(() => {
    console.log('Database setup completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Database setup failed:', error);
    process.exit(1);
  });
