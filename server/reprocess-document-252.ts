
import { db } from './db';
import { documents } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { thaiTextProcessor } from './services/thaiTextProcessor';
import { documentProcessor } from './services/documentProcessor';

/**
 * Re-process document 252 to update content with Thai text segmentation
 */
async function reprocessDocument252() {
  console.log('🚀 Re-processing document 252 for content column only...');

  try {
    // Get document 252
    const document = await db.select().from(documents).where(eq(documents.id, 252)).limit(1);
    
    if (document.length === 0) {
      console.log('❌ Document 252 not found');
      return;
    }

    const doc = document[0];
    console.log(`📄 Found document: ${doc.name} (${doc.mimeType})`);
    console.log(`📁 File path: ${doc.filePath}`);

    if (!doc.filePath) {
      console.log('❌ No file path found for document 252');
      return;
    }

    // Re-extract content from the original file
    console.log('🔄 Re-extracting content from original file...');
    const processor = new (await import('./services/documentProcessor')).DocumentProcessor();
    const freshContent = await processor.extractTextFromFile(doc.filePath, doc.mimeType);
    
    console.log(`📊 Extracted ${freshContent.length} characters from original file`);

    if (!freshContent || freshContent.trim().length === 0) {
      console.log('⚠️ No content extracted from file');
      return;
    }

    // Process content with Thai segmentation
    console.log('🇹🇭 Processing content with Thai text segmentation...');
    const processedContent = await thaiTextProcessor.processForSearch(freshContent);

    console.log(`📝 Content processing completed:`);
    console.log(`   - Original length: ${freshContent.length} characters`);
    console.log(`   - Processed length: ${processedContent.length} characters`);
    console.log(`   - Sample processed: "${processedContent.substring(0, 200)}..."`);

    // Update only the content column in database
    console.log('💾 Updating content column in database...');
    await db.update(documents)
      .set({ 
        content: processedContent,
        processedAt: new Date()
      })
      .where(eq(documents.id, 252));

    console.log('✅ Document 252 content successfully updated with Thai segmentation');
    console.log(`📋 Final content length: ${processedContent.length} characters`);

  } catch (error) {
    console.error('❌ Error re-processing document 252:', error);
  }
}

// Run the script if this file is executed directly
if (require.main === module) {
  reprocessDocument252()
    .then(() => {
      console.log('🎉 Document 252 re-processing completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Document 252 re-processing failed:', error);
      process.exit(1);
    });
}

export { reprocessDocument252 };
