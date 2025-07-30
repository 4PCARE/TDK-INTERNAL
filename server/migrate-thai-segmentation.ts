
import { db } from './db';
import { documentVectors, documents } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { thaiTextProcessor } from './services/thaiTextProcessor';
import { vectorService } from './services/vectorService';

/**
 * Migration script to re-process existing documents with Thai text segmentation
 * Run this once after implementing Thai text processing
 */
async function migrateExistingDocuments() {
  console.log('🚀 Starting Thai text segmentation migration...');

  try {
    // Get all documents from the database
    const allDocuments = await db.select().from(documents);
    
    console.log(`📄 Found ${allDocuments.length} documents to process`);

    let processedCount = 0;
    let skippedCount = 0;

    for (const doc of allDocuments) {
      try {
        console.log(`\n📝 Processing document ${doc.id}: ${doc.name}`);

        if (!doc.content || doc.content.trim().length === 0) {
          console.log(`⏭️ Skipping document ${doc.id} - no content`);
          skippedCount++;
          continue;
        }

        // Check if document contains Thai text
        const containsThai = /[\u0E00-\u0E7F]/.test(doc.content);
        if (!containsThai) {
          console.log(`⏭️ Skipping document ${doc.id} - no Thai content detected`);
          skippedCount++;
          continue;
        }

        // Process content with Thai segmentation
        const processedContent = await thaiTextProcessor.processForSearch(doc.content);

        // Update document content in database
        await db.update(documents)
          .set({ 
            content: processedContent,
            processedAt: new Date()
          })
          .where(eq(documents.id, doc.id));

        // Re-vectorize the document with processed content
        await vectorService.addDocument(doc.id.toString(), processedContent, {
          userId: doc.userId,
          documentName: doc.name,
          mimeType: doc.mimeType || 'text/plain',
          tags: doc.tags || [],
        });

        processedCount++;
        console.log(`✅ Successfully processed document ${doc.id}`);

        // Add small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (docError) {
        console.error(`❌ Error processing document ${doc.id}:`, docError);
        // Continue with next document
      }
    }

    console.log(`\n🎉 Migration completed!`);
    console.log(`   - Processed: ${processedCount} documents`);
    console.log(`   - Skipped: ${skippedCount} documents`);
    console.log(`   - Total: ${allDocuments.length} documents`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateExistingDocuments()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateExistingDocuments };
