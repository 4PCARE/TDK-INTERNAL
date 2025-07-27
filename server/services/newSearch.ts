
import { Document } from "@shared/schema";
import { vectorService } from './vectorService';
import { storage } from '../storage';

export interface SearchResult {
  id: string;
  name: string;
  content: string;
  summary?: string | null;
  aiCategory?: string | null;
  aiCategoryColor?: string | null;
  similarity: number;
  createdAt: string;
  categoryId?: number | null;
  tags?: string[] | null;
  fileSize?: number;
  mimeType?: string;
  isFavorite?: boolean | null;
  updatedAt?: string | null;
  userId?: string;
}

export interface SearchOptions {
  searchType: 'semantic' | 'keyword' | 'hybrid';
  limit?: number;
  threshold?: number;
  categoryFilter?: string;
  dateRange?: {
    from: Date;
    to: Date;
  };
  keywordWeight?: number;
  vectorWeight?: number;
  specificDocumentIds?: number[];
}

function splitIntoChunks(text: string, maxChunkSize = 3000, overlap = 300): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
  }
  return chunks;
}

// Fuzzy matching helper functions
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}

function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1.0;
  
  const distance = levenshteinDistance(str1, str2);
  return (maxLength - distance) / maxLength;
}

function findBestMatch(searchTerm: string, text: string): { score: number; matchedText: string } {
  const words = text.split(/\s+/);
  let bestScore = 0;
  let bestMatch = '';
  
  // Check exact matches first
  if (text.includes(searchTerm)) {
    return { score: 1.0, matchedText: searchTerm };
  }
  
  // Check word-level fuzzy matches
  for (const word of words) {
    const cleanWord = word.replace(/[^\w\u0E00-\u0E7F]/g, ''); // Keep Thai and English chars
    if (cleanWord.length < 2) continue;
    
    const similarity = calculateSimilarity(searchTerm, cleanWord);
    if (similarity > bestScore && similarity >= 0.7) { // 70% similarity threshold
      bestScore = similarity;
      bestMatch = cleanWord;
    }
  }
  
  // Check partial matches for longer terms
  if (searchTerm.length >= 4 && bestScore < 0.8) {
    const regex = new RegExp(searchTerm.split('').join('.*'), 'i');
    for (const word of words) {
      if (regex.test(word) && word.length >= searchTerm.length - 2) {
        const partialScore = 0.6; // Lower score for partial matches
        if (partialScore > bestScore) {
          bestScore = partialScore;
          bestMatch = word;
        }
      }
    }
  }
  
  // Check character-level similarity for Thai text
  if (searchTerm.length >= 3 && /[\u0E00-\u0E7F]/.test(searchTerm)) {
    for (const word of words) {
      if (word.length >= searchTerm.length - 1 && word.length <= searchTerm.length + 2) {
        const thaiSimilarity = calculateThaiSimilarity(searchTerm, word);
        if (thaiSimilarity > bestScore && thaiSimilarity >= 0.75) {
          bestScore = thaiSimilarity;
          bestMatch = word;
        }
      }
    }
  }
  
  return { score: bestScore, matchedText: bestMatch };
}

function calculateThaiSimilarity(str1: string, str2: string): number {
  // Special handling for Thai text with tone marks and vowels
  const normalize = (str: string) => str
    .replace(/[์็่้๊๋]/g, '') // Remove tone marks
    .replace(/[ะาิีึืุูเแโใไ]/g, '') // Simplify vowels
    .toLowerCase();
  
  const norm1 = normalize(str1);
  const norm2 = normalize(str2);
  
  return calculateSimilarity(norm1, norm2);
}

function performFuzzyMatching(searchTerms: string[], text: string): { matchedTerms: string[]; totalScore: number } {
  const matchedTerms: string[] = [];
  let totalScore = 0;
  
  for (const term of searchTerms) {
    const { score, matchedText } = findBestMatch(term, text);
    
    if (score > 0.6) { // Minimum threshold for fuzzy match
      matchedTerms.push(matchedText || term);
      totalScore += score;
    }
  }
  
  return { matchedTerms, totalScore };
}

export async function searchSmartHybridDebug(
  query: string,
  userId: string,
  options: Omit<SearchOptions, "searchType">
): Promise<SearchResult[]> {
  const keywordWeight = options.keywordWeight ?? 0.5;
  const vectorWeight = options.vectorWeight ?? 0.5;
  const threshold = options.threshold ?? 0.3;

  const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

  // 1. Get documents with memory optimization
  const limit = options.specificDocumentIds?.length ? Math.min(options.specificDocumentIds.length, 100) : 100;
  const documents = await storage.getDocuments(userId, { limit });
  const relevantDocs = options.specificDocumentIds?.length
    ? documents.filter(doc => options.specificDocumentIds!.includes(doc.id))
    : documents.slice(0, 50); // Limit to 50 docs to prevent memory issues

  const docMap = new Map(relevantDocs.map(doc => [doc.id, doc]));

  // 2. Perform keyword search on the same chunks from document_vectors table
  console.log(`🔍 KEYWORD SEARCH: Starting with terms: [${searchTerms.join(', ')}]`);
  
  // Get chunks from database (same source as vector search)
  const { db } = await import('../db');
  const { documentVectors } = await import('@shared/schema');
  const { eq, and, or } = await import('drizzle-orm');
  
  let whereCondition: any = eq(documentVectors.userId, userId);
  if (options.specificDocumentIds?.length) {
    whereCondition = and(
      eq(documentVectors.userId, userId),
      or(...options.specificDocumentIds.map(id => eq(documentVectors.documentId, id)))
    );
  }
  
  const chunks = await db.select().from(documentVectors).where(whereCondition);
  console.log(`🔍 KEYWORD SEARCH: Found ${chunks.length} chunks to search`);
  
  const keywordMatches: Record<string, number> = {};
  let totalMatches = 0;
  
  for (const chunk of chunks) {
    const chunkId = `${chunk.documentId}-${chunk.chunkIndex}`;
    const lowerChunk = chunk.content.toLowerCase();
    
    // Enhanced fuzzy matching
    const { matchedTerms, totalScore } = performFuzzyMatching(searchTerms, lowerChunk);
    
    if (matchedTerms.length > 0) {
      const score = totalScore / searchTerms.length;
      keywordMatches[chunkId] = score;
      totalMatches++;
      
      console.log(`🔍 KEYWORD MATCH (FUZZY): Doc ${chunk.documentId} chunk ${chunk.chunkIndex} - ${matchedTerms.length}/${searchTerms.length} terms matched (${matchedTerms.join(', ')}) score: ${score.toFixed(3)}`);
    }
  }
  
  console.log(`🔍 KEYWORD SEARCH: Found ${totalMatches} chunks with keyword matches out of ${chunks.length} total chunks`)

  // 3. Perform vector search
  const vectorResults = await vectorService.searchDocuments(query, userId, 100, options.specificDocumentIds);
  const vectorMatches: Record<string, { score: number, content: string }> = {};
  for (const result of vectorResults) {
    const docId = parseInt(result.document.metadata.originalDocumentId || result.document.id);
    const chunkIndex = result.document.chunkIndex ?? 0;
    const chunkId = `${docId}-${chunkIndex}`;
    const score = result.similarity;

    if (score >= threshold) {
      vectorMatches[chunkId] = {
        score,
        content: result.document.content
      };
    }
  }

  // 4. Combine
  const allChunkIds = new Set([
    ...Object.keys(keywordMatches),
    ...Object.keys(vectorMatches)
  ]);

  const scoredChunks: {
    docId: number;
    chunkIndex: number;
    content: string;
    finalScore: number;
    keywordScore: number;
    vectorScore: number;
  }[] = [];

  console.log(`🧮 SCORING CALCULATION: Combining ${allChunkIds.size} unique chunks`);
  console.log(`📊 WEIGHTS: Keyword=${keywordWeight}, Vector=${vectorWeight}`);
  console.log(`📐 FORMULA: Final Score = (Keyword Score × ${keywordWeight}) + (Vector Score × ${vectorWeight})`);
  
  for (const chunkId of allChunkIds) {
    const [docIdStr, chunkIndexStr] = chunkId.split("-");
    const docId = parseInt(docIdStr);
    const chunkIndex = parseInt(chunkIndexStr);
    const keywordScore = keywordMatches[chunkId] ?? 0;
    const vectorInfo = vectorMatches[chunkId];
    const vectorScore = vectorInfo?.score ?? 0;
    
    // Get content from vector search, or fallback to finding it in chunks array
    let content = vectorInfo?.content ?? "";
    if (!content && keywordScore > 0) {
      // Find the chunk content from the database chunks for keyword-only matches
      const chunk = chunks.find(c => `${c.documentId}-${c.chunkIndex}` === chunkId);
      content = chunk?.content ?? "";
    }

    const finalScore = keywordScore * keywordWeight + vectorScore * vectorWeight;

    // Show detailed calculation for each chunk
    if (finalScore > 0 && content.length > 0) {
      const keywordWeighted = keywordScore * keywordWeight;
      const vectorWeighted = vectorScore * vectorWeight;
      
      console.log(`  📋 Chunk ${docId}-${chunkIndex}:`);
      console.log(`    Keyword: ${keywordScore.toFixed(4)} × ${keywordWeight} = ${keywordWeighted.toFixed(4)}`);
      console.log(`    Vector:  ${vectorScore.toFixed(4)} × ${vectorWeight} = ${vectorWeighted.toFixed(4)}`);
      console.log(`    Final:   ${keywordWeighted.toFixed(4)} + ${vectorWeighted.toFixed(4)} = ${finalScore.toFixed(4)}`);
      
      scoredChunks.push({
        docId,
        chunkIndex,
        content,
        keywordScore,
        vectorScore,
        finalScore
      });
    }
  }
  
  console.log(`✅ SCORED CHUNKS: ${scoredChunks.length} chunks with final scores > 0`);

  // 5. Sort by finalScore and apply smart selection
  scoredChunks.sort((a, b) => b.finalScore - a.finalScore);
  
  // Smart selection: take top chunks but ensure we get results
  const minResults = Math.min(5, scoredChunks.length); // At least 5 results if available
  const maxResults = Math.min(15, scoredChunks.length); // Cap at 15 results
  
  let selectedChunks = [];
  
  if (scoredChunks.length > 0) {
    // Method 1: Use score-based selection if scores are reasonable
    const totalScore = scoredChunks.reduce((sum, c) => sum + c.finalScore, 0);
    const avgScore = totalScore / scoredChunks.length;
    
    if (avgScore > 0.1) {
      // Use 10% mass selection if average scores are decent
      const scoreTarget = totalScore * 0.10;
      let accScore = 0;
      for (const chunk of scoredChunks) {
        selectedChunks.push(chunk);
        accScore += chunk.finalScore;
        if (accScore >= scoreTarget && selectedChunks.length >= minResults) break;
        if (selectedChunks.length >= maxResults) break;
      }
    } else {
      // If scores are very low, just take top N results
      selectedChunks = scoredChunks.slice(0, minResults);
    }
    
    console.log(`🎯 SELECTION: From ${scoredChunks.length} scored chunks, selected ${selectedChunks.length} (avg score: ${avgScore.toFixed(4)})`);
  }

  const results: SearchResult[] = selectedChunks.map(chunk => {
    const doc = docMap.get(chunk.docId);
    const label = `(Chunk ${chunk.chunkIndex + 1})`;
    return {
      id: `${chunk.docId}-${chunk.chunkIndex}`,
      name: `${doc?.name ?? "Untitled"} ${label}`,
      content: chunk.content,
      summary: chunk.content.slice(0, 200) + "...",
      aiCategory: doc?.aiCategory ?? null,
      aiCategoryColor: doc?.aiCategoryColor ?? null,
      similarity: chunk.finalScore,
      createdAt: doc?.createdAt?.toISOString() ?? new Date().toISOString(),
      categoryId: doc?.categoryId ?? null,
      tags: doc?.tags ?? null,
      fileSize: doc?.fileSize ?? null,
      mimeType: doc?.mimeType ?? null,
      isFavorite: doc?.isFavorite ?? null,
      updatedAt: doc?.updatedAt?.toISOString() ?? null,
      userId: doc?.userId ?? userId
    };
  });

  // Memory cleanup - clear the objects instead of assigning null
  Object.keys(keywordMatches).forEach(key => delete keywordMatches[key]);
  Object.keys(vectorMatches).forEach(key => delete vectorMatches[key]);
  allChunkIds.clear();
  scoredChunks.length = 0;
  selectedChunks.length = 0;
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  console.log("✅ searchSmartHybridDebug: returning", results.length, "results");
  console.log("Memory usage:", process.memoryUsage());
  
  return results;
}

export async function searchSmartHybridV1(
  query: string,
  userId: string,
  options: Omit<SearchOptions, "searchType">
): Promise<SearchResult[]> {
  try {
    const keywordWeight = options.keywordWeight ?? 0.5;
    const vectorWeight = options.vectorWeight ?? 0.5;
    const threshold = options.threshold ?? 0.3;
    const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

    console.log(`🧠 SmartHybrid Search: "${query}" | kW=${keywordWeight} vW=${vectorWeight}`);

    // 1. Keyword Search (simple string matching)
    const allDocs = await storage.getDocuments(userId, { limit: 1000 });
    const keywordChunks: Record<string, { content: string; score: number }> = {};

    for (const doc of allDocs) {
      if (options.specificDocumentIds && !options.specificDocumentIds.includes(doc.id)) continue;

      const chunks: string[] = doc.chunks || splitIntoChunks(doc.content || "", 3000, 300);
      chunks.forEach((chunk, i) => {
        const chunkText = chunk.toLowerCase();
        
        // Use fuzzy matching instead of exact matching
        const { matchedTerms, totalScore } = performFuzzyMatching(searchTerms, chunkText);
        let score = totalScore / searchTerms.length;

        // Apply store boost for specific terms
        const storeBoostTerms = ['xolo', 'kamu', 'floor', 'ชั้น', 'บางกะปิ', 'bangkapi'];
        const hasStoreBoost = matchedTerms.some(matched => 
          storeBoostTerms.some(boost => calculateSimilarity(matched.toLowerCase(), boost) > 0.8)
        );
        if (hasStoreBoost && score > 0.5) {
          score = Math.min(1.0, score + 0.3);
        }

        if (score > 0.3) { // Lower threshold for fuzzy matches
          keywordChunks[`${doc.id}-${i}`] = { content: chunk, score };
        }
      });
    }

    // 2. Semantic Search
    const vectorResults = await vectorService.searchDocuments(query, userId, 100, options.specificDocumentIds);
    const vectorChunks: Record<string, { content: string; score: number }> = {};
    for (const result of vectorResults) {
      const docId = parseInt(result.document.metadata.originalDocumentId || result.document.id);
      const chunkIndex = result.document.chunkIndex ?? 0;
      const chunkId = `${docId}-${chunkIndex}`;
      if (result.similarity >= threshold) {
        vectorChunks[chunkId] = {
          content: result.document.content,
          score: result.similarity
        };
      }
    }

    // 3. Merge & Take Higher Score per chunk
    const combinedChunkMap = new Map<string, {
      docId: number;
      chunkIndex: number;
      content: string;
      keywordScore: number;
      vectorScore: number;
      finalScore: number;
    }>();

    const allChunkIds = new Set([...Object.keys(keywordChunks), ...Object.keys(vectorChunks)]);

    for (const chunkId of allChunkIds) {
      const [docIdStr, chunkIdxStr] = chunkId.split("-");
      const docId = parseInt(docIdStr);
      const chunkIndex = parseInt(chunkIdxStr);
      const keywordScore = keywordChunks[chunkId]?.score ?? 0;
      const vectorScore = vectorChunks[chunkId]?.score ?? 0;
      const content = keywordChunks[chunkId]?.content || vectorChunks[chunkId]?.content || "";

      const hybridScore = Math.max(
        vectorScore * vectorWeight + keywordScore * keywordWeight,
        vectorScore,
        keywordScore
      );

      combinedChunkMap.set(chunkId, {
        docId,
        chunkIndex,
        content,
        keywordScore,
        vectorScore,
        finalScore: hybridScore
      });
    }

    // 4. Select top 66% score mass
    const sortedChunks = [...combinedChunkMap.values()].sort((a, b) => b.finalScore - a.finalScore);
    const totalScore = sortedChunks.reduce((sum, c) => sum + c.finalScore, 0);
    const targetScore = totalScore * 0.10;
    const selectedChunks = [];
    let acc = 0;
    for (const chunk of sortedChunks) {
      selectedChunks.push(chunk);
      acc += chunk.finalScore;
      if (acc >= targetScore) break;
    }

    // 5. Build Final SearchResult[]
    const docMap = new Map(allDocs.map(doc => [doc.id, doc]));

    const results: SearchResult[] = selectedChunks.map(chunk => {
      const doc = docMap.get(chunk.docId);
      const chunkLabel = chunk.chunkIndex !== undefined ? ` (Chunk ${chunk.chunkIndex + 1})` : "";
      return {
        id: `${chunk.docId}-${chunk.chunkIndex}`,
        name: (doc?.name || "Untitled") + chunkLabel,
        content: chunk.content,
        summary: chunk.content.slice(0, 200) + "...",
        aiCategory: doc?.aiCategory ?? null,
        aiCategoryColor: doc?.aiCategoryColor ?? null,
        similarity: chunk.finalScore,
        createdAt: doc?.createdAt?.toISOString() ?? new Date().toISOString(),
        categoryId: doc?.categoryId ?? null,
        tags: doc?.tags ?? null,
        fileSize: doc?.fileSize ?? null,
        mimeType: doc?.mimeType ?? null,
        isFavorite: doc?.isFavorite ?? null,
        updatedAt: doc?.updatedAt?.toISOString() ?? null,
        userId: doc?.userId ?? userId
      };
    });

    console.log(`✅ SmartHybrid: Returning ${results.length} chunks from ${combinedChunkMap.size} scored`);
    return results;

  } catch (error) {
    console.error("❌ SmartHybrid Search Failed:", error);
    throw new Error("SmartHybrid Search Error");
  }
}
