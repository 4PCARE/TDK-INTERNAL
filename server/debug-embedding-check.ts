
import { db } from './db';
import { documentVectors } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function checkEmbeddingQuality() {
  try {
    console.log('🔍 Checking embedding quality in database...');
    
    // Get a sample of vectors from the database
    const sampleVectors = await db.select()
      .from(documentVectors)
      .limit(20);

    console.log(`📊 Checking ${sampleVectors.length} sample vectors...`);

    let validEmbeddings = 0;
    let invalidEmbeddings = 0;
    let nullEmbeddings = 0;
    let wrongDimensions = 0;
    let hasNaNValues = 0;

    for (const vector of sampleVectors) {
      const docId = vector.documentId;
      const chunkIndex = vector.chunkIndex;
      const embedding = vector.embedding;

      console.log(`\n📋 Doc ${docId} Chunk ${chunkIndex}:`);

      if (!embedding) {
        console.log(`   ❌ NULL/undefined embedding`);
        nullEmbeddings++;
        invalidEmbeddings++;
        continue;
      }

      if (!Array.isArray(embedding)) {
        console.log(`   ❌ Not an array: ${typeof embedding}`);
        invalidEmbeddings++;
        continue;
      }

      if (embedding.length === 0) {
        console.log(`   ❌ Empty array`);
        invalidEmbeddings++;
        continue;
      }

      if (embedding.length !== 1536) {
        console.log(`   ❌ Wrong dimension: ${embedding.length} (expected 1536)`);
        wrongDimensions++;
        invalidEmbeddings++;
        continue;
      }

      // Check for NaN or invalid values
      const invalidValues = embedding.filter(val => typeof val !== 'number' || isNaN(val));
      if (invalidValues.length > 0) {
        console.log(`   ❌ Has ${invalidValues.length} invalid values`);
        hasNaNValues++;
        invalidEmbeddings++;
        continue;
      }

      // Check if embedding is all zeros (invalid)
      const nonZeroValues = embedding.filter(val => val !== 0);
      if (nonZeroValues.length === 0) {
        console.log(`   ❌ All zeros embedding`);
        invalidEmbeddings++;
        continue;
      }

      // Calculate magnitude to check if embedding is reasonable
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      console.log(`   ✅ Valid embedding (dimension: ${embedding.length}, magnitude: ${magnitude.toFixed(4)})`);
      validEmbeddings++;
    }

    console.log(`\n📊 EMBEDDING QUALITY SUMMARY:`);
    console.log(`   Valid embeddings: ${validEmbeddings}/${sampleVectors.length} (${(validEmbeddings/sampleVectors.length*100).toFixed(1)}%)`);
    console.log(`   Invalid embeddings: ${invalidEmbeddings}/${sampleVectors.length} (${(invalidEmbeddings/sampleVectors.length*100).toFixed(1)}%)`);
    console.log(`   Null embeddings: ${nullEmbeddings}`);
    console.log(`   Wrong dimensions: ${wrongDimensions}`);
    console.log(`   Has NaN values: ${hasNaNValues}`);

    if (invalidEmbeddings > 0) {
      console.log(`\n⚠️  RECOMMENDATION: You have ${invalidEmbeddings} invalid embeddings. Consider:`);
      console.log(`   1. Re-vectorizing documents with invalid embeddings`);
      console.log(`   2. Checking the document processing pipeline`);
      console.log(`   3. Verifying OpenAI API responses during embedding generation`);
    }

  } catch (error) {
    console.error('❌ Error checking embedding quality:', error);
  }
}

// Run the check
checkEmbeddingQuality().then(() => {
  console.log('✅ Embedding quality check completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Embedding quality check failed:', error);
  process.exit(1);
});
