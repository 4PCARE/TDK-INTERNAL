
import { db } from './db';
import { documents, documentChunks } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function populateDocumentChunks() {
  try {
    console.log('Starting document chunking process...');
    
    // Get all documents that don't have chunks yet
    const allDocuments = await db.select().from(documents);
    console.log(`Found ${allDocuments.length} total documents`);
    
    // Check which documents already have chunks
    const existingChunks = await db.select().from(documentChunks);
    const documentsWithChunks = new Set(existingChunks.map(chunk => chunk.documentId));
    
    const documentsToProcess = allDocuments.filter(doc => !documentsWithChunks.has(doc.id));
    console.log(`Processing ${documentsToProcess.length} documents without chunks`);
    
    let totalChunksCreated = 0;
    
    for (const document of documentsToProcess) {
      console.log(`Processing document ${document.id}: ${document.name}`);
      
      // Get document content
      const content = document.content || document.summary || '';
      if (!content || content.length < 50) {
        console.log(`  Skipping document ${document.id} - insufficient content`);
        continue;
      }
      
      // Split content into chunks (approximately 1000 characters each)
      const chunkSize = 1000;
      const overlap = 200; // Overlap between chunks for better context
      const chunks = [];
      
      for (let i = 0; i < content.length; i += chunkSize - overlap) {
        const chunkContent = content.substring(i, i + chunkSize);
        if (chunkContent.trim().length > 0) {
          chunks.push(chunkContent.trim());
        }
      }
      
      // If content is short, create at least one chunk
      if (chunks.length === 0) {
        chunks.push(content.trim());
      }
      
      // Insert chunks into database
      for (let i = 0; i < chunks.length; i++) {
        await db.insert(documentChunks).values({
          documentId: document.id,
          content: chunks[i],
          chunkIndex: i,
          totalChunks: chunks.length
        });
        totalChunksCreated++;
      }
      
      console.log(`  Created ${chunks.length} chunks for document ${document.id}`);
    }
    
    console.log(`✅ Chunking completed! Created ${totalChunksCreated} total chunks`);
    
    // Verify the chunks were created
    const finalChunkCount = await db.select().from(documentChunks);
    console.log(`Total chunks in database: ${finalChunkCount.length}`);
    
  } catch (error) {
    console.error('Error populating document chunks:', error);
    throw error;
  }
}

populateDocumentChunks()
  .then(() => {
    console.log('Document chunking completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Document chunking failed:', error);
    process.exit(1);
  });
