import { Document } from "@shared/schema";
import { vectorService } from './vectorService';
import { storage } from '../storage';

// Configuration: Mass selection percentage for smart selection algorithm
const MASS_SELECTION_PERCENTAGE = 0.3; // 20% - adjust this value to change selection criteria

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

// BM25 scoring implementation
function calculateBM25(searchTerms: string[], chunks: any[]): Map<string, { score: number; matchedTerms: string[] }> {
  const chunkScores = new Map<string, { score: number; matchedTerms: string[] }>();

  // BM25 parameters
  const k1 = 1.2; // Controls term frequency saturation
  const b = 0.75; // Controls document length normalization

  // Normalize search terms
  const normalizedSearchTerms = searchTerms.map(term => term.toLowerCase().trim()).filter(term => term.length > 0);
  
  console.log(`🔍 BM25: Processing ${normalizedSearchTerms.length} search terms: [${normalizedSearchTerms.join(', ')}]`);

  // Calculate document frequency for each term and average document length
  const termDF = new Map<string, number>();
  const totalChunks = chunks.length;
  let totalDocLength = 0;

  // First pass: calculate document frequencies and total length
  const chunkLengths = new Map<string, number>();
  for (const chunk of chunks) {
    const content = chunk.content || '';
    const tokens = tokenize(content);
    const chunkIndex = chunk.chunkIndex ?? 0;
    const chunkId = `${chunk.documentId}-${chunkIndex}`;
    
    chunkLengths.set(chunkId, tokens.length);
    totalDocLength += tokens.length;

    // Count document frequency for each search term
    const uniqueTokens = new Set(tokens);
    for (const term of normalizedSearchTerms) {
      if (uniqueTokens.has(term)) {
        termDF.set(term, (termDF.get(term) || 0) + 1);
      }
    }
  }

  console.log(`🔍 BM25: Document frequencies calculated:`, Array.from(termDF.entries()).map(([term, df]) => `${term}:${df}`));

  const avgDocLength = totalDocLength / totalChunks;

  // Second pass: calculate BM25 scores
  for (const chunk of chunks) {
    const chunkIndex = chunk.chunkIndex ?? 0;
    const chunkId = `${chunk.documentId}-${chunkIndex}`;
    const content = chunk.content || '';
    const tokens = tokenize(content);
    const docLength = chunkLengths.get(chunkId) || 1;
    
    const tokenCounts = new Map<string, number>();

    // Count term frequencies
    for (const token of tokens) {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    }

    let bm25Score = 0;
    const matchedTerms: string[] = [];

    for (const term of normalizedSearchTerms) {
      const tf = tokenCounts.get(term) || 0;

      if (tf > 0) {
        matchedTerms.push(term);
        
        // BM25 formula components
        const df = termDF.get(term) || 1;
        const idf = Math.log((totalChunks - df + 0.5) / (df + 0.5));
        
        // Term frequency component with saturation
        const tfComponent = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)));
        
        bm25Score += idf * tfComponent;
        
        console.log(`🔍 BM25 MATCH: Chunk ${chunkId}, term "${term}", tf=${tf}, df=${df}, idf=${idf.toFixed(3)}, tfComp=${tfComponent.toFixed(3)}, score+=${(idf * tfComponent).toFixed(3)}`);
      } else {
        // Try fuzzy matching for unmatched terms
        const fuzzyMatch = findBestFuzzyMatch(term, tokens);
        if (fuzzyMatch.score > 0.75) {
          matchedTerms.push(term);
          const fuzzyTf = fuzzyMatch.count;
          
          // Apply BM25 formula to fuzzy matches with penalty
          const df = termDF.get(term) || 1;
          const idf = Math.log((totalChunks - df + 0.5) / (df + 0.5));
          const tfComponent = (fuzzyTf * (k1 + 1)) / (fuzzyTf + k1 * (1 - b + b * (docLength / avgDocLength)));
          
          const fuzzyScore = idf * tfComponent * fuzzyMatch.score * 0.8;
          bm25Score += fuzzyScore;
          
          console.log(`🔍 BM25 FUZZY: Chunk ${chunkId}, term "${term}", fuzzyTf=${fuzzyTf}, fuzzyScore=${fuzzyMatch.score.toFixed(3)}, score+=${fuzzyScore.toFixed(3)}`);
        }
      }
    }

    if (bm25Score > 0) {
      chunkScores.set(chunkId, { score: bm25Score, matchedTerms });
    }
  }

  return chunkScores;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_,\.!?\(\)\[\]\/\\:\;\"\']+/)
    .filter(token => token.length > 0)
    .map(token => token.trim())
    .filter(token => token.length > 0);
}

function findBestFuzzyMatch(term: string, tokens: string[]): { score: number; count: number } {
  let bestScore = 0;
  let count = 0;

  for (const token of tokens) {
    const similarity = calculateSimilarity(term, token);
    if (similarity > 0.75) {
      bestScore = Math.max(bestScore, similarity);
      count++;
    }
  }

  return { score: bestScore, count };
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

  // Create a map for faster chunk lookup
  const chunkMap = new Map();
  for (const chunk of chunks) {
    const chunkId = `${chunk.documentId}-${chunk.chunkIndex}`;
    chunkMap.set(chunkId, chunk);
  }

  // Calculate BM25 scores for all chunks at once
  const bm25Results = calculateBM25(searchTerms, chunks);
  const keywordMatches: Record<string, number> = {};
  let totalMatches = 0;

  for (const [chunkId, bm25Match] of Array.from(bm25Results.entries())) {
    if (bm25Match.score > 0) {
      keywordMatches[chunkId] = bm25Match.score;
      totalMatches++;

      const [docId, chunkIndex] = chunkId.split('-');
      console.log(`🔍 KEYWORD MATCH (BM25): Doc ${docId} chunk ${chunkIndex} - ${bm25Match.matchedTerms.length}/${searchTerms.length} terms matched (${bm25Match.matchedTerms.join(', ')}) score: ${bm25Match.score.toFixed(5)}`);
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

  // Step 1: Collect all BM25 scores for statistical normalization
  const allBM25Scores = Object.values(keywordMatches).filter(score => score > 0);

  let normalizeKeywordScore = (score: number) => score;

  if (allBM25Scores.length > 1) {
    // Only normalize if we have more than one keyword match
    // Calculate statistics for normalization
    const minScore = Math.min(...allBM25Scores);
    const maxScore = Math.max(...allBM25Scores);
    const mean = allBM25Scores.reduce((a, b) => a + b, 0) / allBM25Scores.length;
    const std = Math.sqrt(allBM25Scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / allBM25Scores.length);

    console.log(`📊 BM25 STATS: min=${minScore.toFixed(4)}, max=${maxScore.toFixed(4)}, mean=${mean.toFixed(4)}, std=${std.toFixed(4)}`);

    // Choose normalization method based on score distribution
    const scoreRange = maxScore - minScore;
    const coefficientOfVariation = std / (mean + 1e-8);

    if (coefficientOfVariation > 1.0 || scoreRange > mean * 3) {
      // High variability: Use z-score with sigmoid for robust handling of outliers
      console.log(`📊 Using Z-SCORE normalization (high variability detected: CV=${coefficientOfVariation.toFixed(2)})`);
      normalizeKeywordScore = (score: number) => {
        if (score === 0) return 0;
        const zScore = (score - mean) / (std + 1e-8);
        const clippedZ = Math.max(-3, Math.min(3, zScore)); // Clip extreme outliers
        return 1 / (1 + Math.exp(-clippedZ)); // Sigmoid to [0,1]
      };
    } else {
      // Low variability: Use min-max normalization
      console.log(`📊 Using MIN-MAX normalization (low variability detected: CV=${coefficientOfVariation.toFixed(2)})`);
      normalizeKeywordScore = (score: number) => {
        if (score === 0) return 0;
        return (score - minScore) / (scoreRange + 1e-8);
      };
    }
  } else if (allBM25Scores.length === 1) {
    console.log(`📊 SKIPPING normalization: Only one keyword chunk detected, using raw BM25 score`);
  }

  for (const chunkId of allChunkIds) {
    // Fix: Split from the right to handle document IDs with dashes
    const parts = chunkId.split("-");
    const chunkIndexStr = parts[parts.length - 1];
    const docIdStr = parts.slice(0, -1).join("-");
    const docId = parseInt(docIdStr);
    const chunkIndex = parseInt(chunkIndexStr);
    const keywordScore = keywordMatches[chunkId] ?? 0;
    const vectorInfo = vectorMatches[chunkId];
    const vectorScore = vectorInfo?.score ?? 0;

    // Get content from vector search, or fallback to chunk map
    let content = vectorInfo?.content ?? "";
    if (!content && keywordScore > 0) {
      // Get the chunk content from the chunk map for keyword-only matches
      const chunk = chunkMap.get(chunkId);
      content = chunk?.content ?? "";
    }

    // Apply statistical normalization to TF-IDF scores
    const normalizedKeywordScore = normalizeKeywordScore(keywordScore);
    const finalScore = normalizedKeywordScore * keywordWeight + vectorScore * vectorWeight;

    console.log(`📊 CHUNK ${chunkId}: Keyword=${keywordScore.toFixed(4)}→${normalizedKeywordScore.toFixed(3)}, Vector=${vectorScore.toFixed(3)}, Final=${finalScore.toFixed(3)}`);

    if (finalScore > 0 && content.length > 0) {
      scoredChunks.push({
        docId,
        chunkIndex,
        content,
        finalScore,
        keywordScore: normalizedKeywordScore, // Store normalized score
        vectorScore
      });
    }
  }

  console.log(`✅ SCORED CHUNKS: ${scoredChunks.length} chunks with final scores > 0`);

  // 5. Sort by finalScore and apply smart selection
  scoredChunks.sort((a, b) => b.finalScore - a.finalScore);

  // Smart selection: TRUE 90% mass selection (not percentile!)
  const maxResults = Math.min(8, scoredChunks.length); // Cap at 50 results to prevent overwhelming responses

  let selectedChunks = [];

  if (scoredChunks.length > 0) {
    // Use TRUE mass-based selection - accumulate until we get 90% of total score
    const totalScore = scoredChunks.reduce((sum, c) => sum + c.finalScore, 0);
    const avgScore = totalScore / scoredChunks.length;

    if (avgScore > 0.05) {
      // Use configurable mass selection - keep adding chunks until we reach the target percentage of total score mass
      const scoreTarget = totalScore * MASS_SELECTION_PERCENTAGE;
      let accScore = 0;

      console.log(`📊 TRUE MASS SELECTION: Total score: ${totalScore.toFixed(4)}, ${(MASS_SELECTION_PERCENTAGE * 100).toFixed(1)}% target: ${scoreTarget.toFixed(4)}`);

      for (const chunk of scoredChunks) {
        // Check if adding this chunk would exceed the 30% mass target
        const potentialScore = accScore + chunk.finalScore;

        if (potentialScore > scoreTarget && selectedChunks.length > 0) {
          console.log(`📊 STOPPING: Adding chunk ${selectedChunks.length + 1} would exceed ${(MASS_SELECTION_PERCENTAGE * 100).toFixed(1)}% mass target (${(potentialScore/totalScore*100).toFixed(1)}% > ${(MASS_SELECTION_PERCENTAGE * 100).toFixed(1)}%) - stopping at ${selectedChunks.length} chunks`);
          break;
        }

        selectedChunks.push(chunk);
        accScore += chunk.finalScore;

        console.log(`📊 Chunk ${selectedChunks.length}: score=${chunk.finalScore.toFixed(4)}, accumulated=${accScore.toFixed(4)}, target=${scoreTarget.toFixed(4)}, mass=${(accScore/totalScore*100).toFixed(1)}% (need ${(MASS_SELECTION_PERCENTAGE * 100).toFixed(1)}%)`);

        // Check if we've reached the target mass
        if (accScore >= scoreTarget) {
          console.log(`📊 STOPPING: Reached ${(MASS_SELECTION_PERCENTAGE * 100).toFixed(1)}% mass target (${(accScore/totalScore*100).toFixed(1)}%) with ${selectedChunks.length} chunks`);
          break;
        }

        // Safety cap to prevent excessive results
        if (selectedChunks.length >= maxResults) {
          console.log(`📊 STOPPING: Hit safety cap at ${maxResults} chunks`);
          break;
        }
      }
    } else {
      // If scores are very low, take top 5 as fallback
      selectedChunks = scoredChunks.slice(0, Math.min(5, scoredChunks.length));
    }

    // Calculate selected chunks total score
    const selectedTotalScore = selectedChunks.reduce((sum, c) => sum + c.finalScore, 0);
    console.log(`📊 SCORE BREAKDOWN: ${selectedTotalScore.toFixed(4)} out of ${totalScore.toFixed(4)} (${(selectedTotalScore/totalScore*100).toFixed(1)}%)`);
    console.log(`🎯 TRUE MASS SELECTION (${(MASS_SELECTION_PERCENTAGE * 100).toFixed(1)}%): From ${scoredChunks.length} scored chunks, selected ${selectedChunks.length} chunks capturing ${(selectedTotalScore/totalScore*100).toFixed(1)}% of total score mass`);
  }

  const results: SearchResult[] = selectedChunks.map(chunk => {
    const doc = docMap.get(chunk.docId);
    const label = `(Chunk ${chunk.chunkIndex + 1})`;
    const documentName = doc?.name || `Document ${chunk.docId}`;
    return {
      id: `${chunk.docId}-${chunk.chunkIndex}`,
      name: `${documentName} ${label}`,
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
  if (typeof global.gc === "function") {
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

      // Create chunk objects with proper structure for TF-IDF calculation
      const chunkObjects = chunks.map((chunk, i) => ({
        content: chunk,
        chunkIndex: i,
        documentId: doc.id
      }));

      // Use BM25 instead of fuzzy matching
      const bm25Results = calculateBM25(searchTerms, chunkObjects);

      chunks.forEach((chunk, i) => {
        const chunkId = `${doc.id}-${i}`;
        const bm25Match = bm25Results.get(chunkId);

        if (bm25Match && bm25Match.score > 0) {
          keywordChunks[chunkId] = { content: chunk, score: bm25Match.score };
        }
      });
    }

    const vectorResults = await vectorService.searchDocuments(query, userId, 100, options.specificDocumentIds);
    const vectorChunks: Record<string, { content: string; score: number }> = {};
    for (const result of vectorResults) {
      if (!result.document) {
        console.warn("[WARN] vector result missing document field", result);
        continue;
      }

      const doc = result.document;
      const docId = parseInt(doc.metadata?.originalDocumentId || doc.id);
      const chunkIndex = doc.chunkIndex ?? 0;
      const chunkId = `${docId}-${chunkIndex}`;
      if (result.similarity >= threshold) {
        vectorChunks[chunkId] = {
          content: doc.content,
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

    // Step 3: Rank and select using 60% mass selection for better coverage
    const sortedChunks = Array.from(combinedChunkMap.values());
    sortedChunks.sort((a, b) => b.finalScore - a.finalScore);

    // Collect BM25 statistics for normalization
    const keywordScores = sortedChunks.map(chunk => chunk.keywordScore).filter(score => score > 0);
    const bm25Stats = {
      min: keywordScores.length > 0 ? Math.min(...keywordScores) : 0,
      max: keywordScores.length > 0 ? Math.max(...keywordScores) : 0,
      mean: keywordScores.length > 0 ? keywordScores.reduce((a, b) => a + b, 0) / keywordScores.length : 0,
      std: 0,
    };
    
    if (keywordScores.length > 0) {
      bm25Stats.std = Math.sqrt(keywordScores.reduce((sum, s) => sum + (s - bm25Stats.mean) ** 2, 0) / keywordScores.length);
    }

    // Normalize keyword scores
    sortedChunks.forEach(chunk => {
      chunk.normalizedKeywordScore = 0; // Initialize
    });

    // Apply BM25 normalization (prevent division by zero)
    if (bm25Stats.max > bm25Stats.min) {
      // Use MIN-MAX normalization for better score distribution
      if (bm25Stats.std / bm25Stats.mean < 0.1) {
        console.log(`📊 Using MIN-MAX normalization (low variability detected: CV=${(bm25Stats.std / bm25Stats.mean).toFixed(2)})`);
        sortedChunks.forEach(chunk => {
          if (chunk.keywordScore > 0) {
            chunk.normalizedKeywordScore = (chunk.keywordScore - bm25Stats.min) / (bm25Stats.max - bm25Stats.min);
          }
        });
      } else {
        console.log(`📊 Using Z-SCORE normalization (high variability detected: CV=${(bm25Stats.std / bm25Stats.mean).toFixed(2)})`);
        sortedChunks.forEach(chunk => {
          if (chunk.keywordScore > 0) {
            chunk.normalizedKeywordScore = Math.max(0, (chunk.keywordScore - bm25Stats.mean) / bm25Stats.std);
          }
        });
      }
    } else {
      console.log(`📊 All keyword scores identical (${bm25Stats.max}), using raw scores`);
      sortedChunks.forEach(chunk => {
        if (chunk.keywordScore > 0) {
          // When keyword weight is high but scores are low, boost them slightly
          if (keywordWeight > 0.7 && bm25Stats.max < 0.1) {
            chunk.normalizedKeywordScore = Math.min(1.0, chunk.keywordScore * 10); // Boost weak keyword matches
            console.log(`📊 BOOSTING weak keyword match: ${chunk.keywordScore.toFixed(4)} -> ${chunk.normalizedKeywordScore.toFixed(4)}`);
          } else {
            chunk.normalizedKeywordScore = chunk.keywordScore;
          }
        }
      });
    }

    // Calculate final combined scores
    console.log(`📐 FORMULA: Final Score = (Keyword Score × ${keywordWeight}) + (Vector Score × ${vectorWeight})`);

    sortedChunks.forEach(chunk => {
      const keywordComponent = (chunk.normalizedKeywordScore || 0) * keywordWeight;
      const vectorComponent = (chunk.vectorScore || 0) * vectorWeight;
      chunk.finalScore = keywordComponent + vectorComponent;

      // If keyword weight is high but no good keyword matches, fall back to vector scores
      if (keywordWeight > 0.7 && chunk.finalScore === 0 && chunk.vectorScore > 0.25) {
        chunk.finalScore = chunk.vectorScore * 0.3; // Give it a fighting chance
        console.log(`📊 FALLBACK: Chunk ${chunk.documentId}-${chunk.chunkIndex} boosted from vector score: ${chunk.finalScore.toFixed(3)}`);
      }

      console.log(`📊 CHUNK ${chunk.documentId}-${chunk.chunkIndex}: Keyword=${(chunk.keywordScore || 0).toFixed(4)}→${(chunk.normalizedKeywordScore || 0).toFixed(3)}, Vector=${(chunk.vectorScore || 0).toFixed(3)}, Final=${chunk.finalScore.toFixed(3)}`);
    });

    const totalScore = sortedChunks.reduce((sum, c) => sum + c.finalScore, 0);
    const scoreThreshold = totalScore * MASS_SELECTION_PERCENTAGE; // Use configurable mass selection

    const selectedChunks = [];
    let accumulatedScore = 0;
    const minResults = Math.min(2, sortedChunks.length);
    const maxChunks = Math.min(12, sortedChunks.length); // Increased from 3 to 12 for better coverage

    for (const chunk of sortedChunks) {
      selectedChunks.push(chunk);
      accumulatedScore += chunk.finalScore;
      if (accumulatedScore >= scoreThreshold && selectedChunks.length >= minResults) break;
      if (selectedChunks.length >= maxChunks) break;
    }

    // 5. Build Final SearchResult[]
    const docMap = new Map(allDocs.map(doc => [doc.id, doc]));

    const results: SearchResult[] = selectedChunks.map(chunk => {
      const doc = docMap.get(chunk.docId);
      const chunkLabel = chunk.chunkIndex !== undefined ? ` (Chunk ${chunk.chunkIndex + 1})` : "";
      const documentName = doc?.name || `Document ${chunk.docId}`;
      return {
        id: `${chunk.docId}-${chunk.chunkIndex}`,
        name: documentName + chunkLabel,
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