import { Document } from "@shared/schema";
import { vectorService } from './vectorService';
import { storage } from '../storage';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configuration: Mass selection percentage for smart selection algorithm
const MASS_SELECTION_PERCENTAGE = 0.3; // 30% - adjust this value to change selection criteria

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

    // Ensure we don't break words at chunk boundaries (except for the last chunk)
    if (end < text.length) {
      // Find the last complete word within the chunk size
      while (end > start && text[end] !== ' ' && text[end] !== '\n' && text[end] !== '\t') {
        end--;
      }

      // If we couldn't find a word boundary, use the original end
      if (end === start) {
        end = Math.min(start + maxChunkSize, text.length);
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;

    // Adjust start to next word boundary if we're overlapping
    if (start > 0 && start < text.length) {
      while (start < text.length && text[start] !== ' ' && text[start] !== '\n' && text[start] !== '\t') {
        start++;
      }
      // Skip the space
      if (start < text.length && (text[start] === ' ' || text[start] === '\n' || text[start] === '\t')) {
        start++;
      }
    }
  }

  return chunks.filter(chunk => chunk.length > 0);
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
// Calculate BM25 scores for all chunks at once
async function calculateBM25(
  searchTerms: string[],
  chunks: any[]
): Promise<Map<string, { score: number; matchedTerms: string[] }>> {
  const chunkScores = new Map<string, { score: number; matchedTerms: string[] }>();

  // BM25 parameters
  const k1 = 1.2; // Controls term frequency saturation
  const b = 0.75; // Controls document length normalization

  // Normalize search terms - avoid creating corrupted Thai variants
  const expandedSearchTerms = [];
  for (const term of searchTerms) {
    const normalizedTerm = term.toLowerCase().trim();
    if (normalizedTerm.length > 0) {
      expandedSearchTerms.push(normalizedTerm);

      // Only add Thai normalized variant for very simple normalization (case + whitespace)
      // Don't create corrupted versions by removing vowels/tone marks
      if (/[\u0E00-\u0E7F]/.test(normalizedTerm)) {
        const minimalNormalized = normalizedTerm.replace(/\s+/g, '');
        if (minimalNormalized !== normalizedTerm && minimalNormalized.length > 0) {
          expandedSearchTerms.push(minimalNormalized);
        }
      }
    }
  }

  const normalizedSearchTerms = [...new Set(expandedSearchTerms)];

  console.log(`🔍 BM25: Processing ${normalizedSearchTerms.length} search terms (with Thai variants): [${normalizedSearchTerms.join(', ')}]`);

  // Calculate document frequency for each term and average document length
  const termDF = new Map<string, number>();
  const totalChunks = chunks.length;
  let totalDocLength = 0;

  // First pass: calculate document frequencies and total length
  const chunkLengths = new Map<string, number>();
  for (const chunk of chunks) {
    const content = chunk.content || '';
    const tokens = await tokenizeWithThaiNormalization(content);
    const chunkIndex = chunk.chunkIndex ?? 0;
    const chunkId = `${chunk.documentId}-${chunk.chunkIndex}`;

    chunkLengths.set(chunkId, tokens.length);
    totalDocLength += tokens.length;

    // Count document frequency for each search term with fuzzy matching
    const uniqueTokens = new Set(tokens);
    for (const term of normalizedSearchTerms) {
      let hasMatch = false;

      // Exact match first
      if (uniqueTokens.has(term)) {
        hasMatch = true;
      } else {
        // Fuzzy match for Thai text
        for (const token of uniqueTokens) {
          if (isThaiTokenSimilar(term, token)) {
            hasMatch = true;
            break;
          }
        }
      }

      if (hasMatch) {
        termDF.set(term, (termDF.get(term) || 0) + 1);
      }
    }
  }

  console.log(`🔍 BM25: Document frequencies calculated:`, Array.from(termDF.entries()).map(([term, df]) => `${term}:${df}`));

  const avgDocLength = totalChunks > 0 ? totalDocLength / totalChunks : 1;

  // Second pass: calculate BM25 scores
  for (const chunk of chunks) {
    const chunkIndex = chunk.chunkIndex ?? 0;
    const chunkId = `${chunk.documentId}-${chunk.chunkIndex}`;
    const content = chunk.content || '';
    const tokens = await tokenizeWithThaiNormalization(content);
    const docLength = chunkLengths.get(chunkId) || 1;

    const tokenCounts = new Map<string, number>();

    // Count term frequencies
    for (const token of tokens) {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    }

    let bm25Score = 0;
    const matchedTerms: string[] = [];

    const processedTerms = new Set<string>(); // Track which terms we've already processed for this chunk

    for (const term of normalizedSearchTerms) {
      // Skip if we've already processed this term for this chunk
      if (processedTerms.has(term)) {
        continue;
      }

      let tf = tokenCounts.get(term) || 0;

      if (tf > 0) {
        // Exact match found
        matchedTerms.push(term);
        processedTerms.add(term);

        // BM25 formula components
        const df = termDF.get(term) || 1;
        // Fix IDF calculation to ensure positive scores
        const idf = Math.log(totalChunks / df) + 1; // Add 1 to ensure positive scores

        // Term frequency component with saturation
        const tfComponent = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)));

        bm25Score += idf * tfComponent;

        console.log(`🔍 BM25 MATCH: Chunk ${chunkId}, term "${term}", tf=${tf}, df=${df}, idf=${idf.toFixed(3)}, tfComp=${tfComponent.toFixed(3)}, score+=${(idf * tfComponent).toFixed(3)}`);
      } else {
        // Try fuzzy matching for unmatched terms only
        let fuzzyMatch = { score: 0, count: 0 };
        if (isThaiText(term)) {
          fuzzyMatch = findBestFuzzyMatchThai(term, tokens);
        } else {
          fuzzyMatch = findBestFuzzyMatch(term, tokens);
        }

        // Lower threshold for Thai text due to spacing variations
        const threshold = isThaiText(term) ? 0.65 : 0.75;
        if (fuzzyMatch.score > threshold) {
          matchedTerms.push(term);
          processedTerms.add(term);
          const fuzzyTf = fuzzyMatch.count;

          // Apply BM25 formula to fuzzy matches with penalty
          const df = termDF.get(term) || 1;
          // Fix IDF calculation to ensure positive scores
          const idf = Math.log(totalChunks / df) + 1; // Add 1 to ensure positive scores
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

function isThaiText(text: string): boolean {
  return /[\u0E00-\u0E7F]/.test(text);
}

function normalizeThaiText(text: string): string {
  // Only apply minimal normalization to preserve readability
  return text
    .replace(/\s+/g, '') // Remove whitespaces
    .toLowerCase();
}

async function tokenizeWithThaiNormalization(text: string): string[] {
  // Simple tokenization without Thai segmentation for documents
  // Thai segmentation should only be used for query processing

  // First normalize Thai spacing
  let normalizedText = normalizeThaiSpacing(text);

  const tokens = normalizedText
    .toLowerCase()
    .split(/[\s\-_,\.!?\(\)\[\]\/\\:\;\"\']+/)
    .filter(token => token.length > 0)
    .map(token => token.trim())
    .filter(token => token.length > 0);

  return tokens;
}

function normalizeThaiSpacing(text: string): string {
  // More conservative Thai text normalization
  return text
    // Only collapse multiple consecutive spaces to single space
    .replace(/\s{2,}/g, ' ')
    // Trim leading/trailing spaces
    .trim();
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

function findBestFuzzyMatchThai(term: string, tokens: string[]): { score: number; count: number } {
  let bestScore = 0;
  let count = 0;

  for (const token of tokens) {
    if (isThaiTokenSimilar(term, token)) {
      bestScore = 0.8; // Assign a fixed score for Thai similarity
      count++;
    }
  }

  return { score: bestScore, count };
}

function isThaiTokenSimilar(term1: string, term2: string): boolean {
  // Normalize spaces for both terms
  const normalized1 = term1.toLowerCase().replace(/\s+/g, '');
  const normalized2 = term2.toLowerCase().replace(/\s+/g, '');

  // Exact match after space normalization
  if (normalized1 === normalized2) return true;

  // Special handling for Thai brand names with spacing variations
  // Check if removing spaces makes them match (e.g., "แมคโดนัลด์" vs "แมค โดนัลด์")
  const spaceless1 = term1.replace(/\s+/g, '');
  const spaceless2 = term2.replace(/\s+/g, '');
  if (spaceless1.toLowerCase() === spaceless2.toLowerCase()) {
    return true;
  }

  // Check if one contains the other (for partial matches like "แมค" vs "แมคโดนัลด์")
  if (normalized1.length >= 3 && normalized2.length >= 3) {
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return true;
    }

    // Also check with original spacing preserved
    const lower1 = term1.toLowerCase();
    const lower2 = term2.toLowerCase();
    if (lower1.includes(lower2) || lower2.includes(lower1)) {
      return true;
    }

    // Levenshtein distance for typos (both with and without spaces)
    const similarity1 = calculateSimilarity(normalized1, normalized2);
    const similarity2 = calculateSimilarity(lower1, lower2);
    return Math.max(similarity1, similarity2) >= 0.85;
  }

  return false;
}

// Remove duplicate GPT enrichment - use preprocessor instead

export async function searchSmartHybridDebug(
  query: string,
  userId: string,
  options: Omit<SearchOptions, "searchType"> & {
    massSelectionPercentage?: number;
    enhancedQuery?: string; // Accept preprocessed query from queryPreprocessor
    isLineOAContext?: boolean; // Flag to indicate context
    documentTokenLimit?: number; // Token limit for document content
    finalTokenLimit?: number; // Token limit for final context
  }
): Promise<SearchResult[]> {
  const keywordWeight = options.keywordWeight ?? 0.5;
  const vectorWeight = options.vectorWeight ?? 0.5;
  const threshold = options.threshold ?? 0.3;
  const massSelectionPercentage = options.massSelectionPercentage || MASS_SELECTION_PERCENTAGE;
  const isLineOAContext = options.isLineOAContext ?? false; // Get context flag

  // Use enhanced query from preprocessor if provided, otherwise use original
  const searchQuery = options.enhancedQuery || query;
  console.log(`🔍 SEARCH: Using ${options.enhancedQuery ? 'preprocessed' : 'original'} query: "${searchQuery}"`);

  // Only use PythaiNLP for query processing, not document processing
  console.log(`🔍 QUERY PROCESSING: Segmenting Thai text for search terms only`);
  const { thaiTextProcessor } = await import('./thaiTextProcessor');

  // First normalize Thai spacing in the search query
  const normalizedQuery = normalizeThaiSpacing(searchQuery);
  console.log(`🔍 THAI NORMALIZATION: "${searchQuery}" → "${normalizedQuery}"`);

  const tokenizedQuery = await thaiTextProcessor.segmentThaiText(normalizedQuery);
  console.log(`🔍 QUERY PROCESSING: Result: "${tokenizedQuery}"`);

  const searchTerms = tokenizedQuery.toLowerCase().split(/\s+/).filter(Boolean);

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
  const { eq, and, or, inArray } = await import('drizzle-orm');

  let whereCondition: any = eq(documentVectors.userId, userId);

  if (options.specificDocumentIds && options.specificDocumentIds.length > 0) {
    whereCondition = and(
      eq(documentVectors.userId, userId),
      inArray(documentVectors.documentId, options.specificDocumentIds)
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
  const bm25Results = await calculateBM25(searchTerms, chunks);
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

  if (totalMatches === 0) {
    console.log(`⚠️ KEYWORD SEARCH DEBUG: No positive BM25 scores found. This might indicate:`)
    console.log(`   - Search terms: [${searchTerms.join(', ')}]`)
    console.log(`   - Total chunks processed: ${chunks.length}`)
    console.log(`   - No document frequencies found for any search terms`)
  }

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

  // Smart selection: TRUE mass-based selection with context-aware limits
  let minResults, maxResults;

  if (isLineOAContext) {
    // LINE OA context: Use agent's chunk configuration properly
    if (options.chunkMaxType === 'percentage' && options.chunkMaxValue > 0) {
      // Calculate percentage based on total available chunks
      const totalAvailableChunks = scoredChunks.length;
      const maxChunks = Math.max(1, Math.ceil(totalAvailableChunks * (options.chunkMaxValue / 100)));
      minResults = Math.min(2, maxChunks);
      maxResults = Math.min(maxChunks, scoredChunks.length);
      console.log(`📊 LINE OA: Using ${options.chunkMaxValue}% limit: ${options.chunkMaxValue}% of ${totalAvailableChunks} total chunks = ${maxResults} max chunks`);
    } else if (options.chunkMaxType === 'number' && options.chunkMaxValue > 0) {
      // Use fixed number of chunks
      minResults = Math.min(2, options.chunkMaxValue);
      maxResults = Math.min(options.chunkMaxValue, scoredChunks.length);
      console.log(`📊 LINE OA: Using fixed limit: ${maxResults} max chunks`);
    } else {
      // Fallback to default LINE OA limits
      if (massSelectionPercentage >= 0.6) {
        minResults = 8; // Document bots need minimum 8 chunks
        maxResults = Math.min(16, scoredChunks.length); // Document bots cap at 16 chunks
      } else {
        minResults = 2; // General chat needs minimum 2 chunks
        maxResults = Math.min(22, scoredChunks.length); // Allow up to 22 chunks for general chat
      }
    }
  } else {
    // Document Bot context: Always use document-focused limits
    minResults = 8;
    maxResults = Math.min(16, scoredChunks.length);
  }

  let selectedChunks = [];
  let totalScore = scoredChunks.reduce((sum, c) => sum + c.finalScore, 0); // Initialize totalScore

  if (scoredChunks.length > 0) {
    // Use TRUE mass-based selection - accumulate until we get the target percentage of total score mass
    const scoreTarget = totalScore * massSelectionPercentage;
    let accScore = 0;

    console.log(`📊 TRUE MASS SELECTION: Total score: ${totalScore.toFixed(4)}, ${(massSelectionPercentage * 100).toFixed(1)}% target: ${scoreTarget.toFixed(4)}, min ${minResults} chunks, max ${maxResults} chunks`);

    for (const chunk of scoredChunks) {
      const potentialScore = accScore + chunk.finalScore;

      // For document bots (60% mass), don't stop until we have at least 8 chunks, regardless of mass target
      if (potentialScore > scoreTarget && selectedChunks.length >= minResults) {
        console.log(`📊 STOPPING: Adding chunk ${selectedChunks.length + 1} would exceed ${(massSelectionPercentage * 100).toFixed(1)}% mass target (${(potentialScore/totalScore*100).toFixed(1)}% > ${(massSelectionPercentage * 100).toFixed(1)}%) - stopping at ${selectedChunks.length} chunks`);
        break;
      }

      selectedChunks.push(chunk);
      accScore += chunk.finalScore;

      if (selectedChunks.length >= maxResults) {
        console.log(`📊 STOPPING: Reached maximum ${maxResults} chunks`);
        break;
      }
    }

    // Calculate selected chunks total score
    const selectedTotalScore = selectedChunks.reduce((sum, c) => sum + c.finalScore, 0);
    console.log(`📊 SCORE BREAKDOWN: ${selectedTotalScore.toFixed(4)} out of ${totalScore.toFixed(4)} (${(selectedTotalScore/totalScore*100).toFixed(1)}%)`);
    // Update log to include context
    console.log(`🎯 TRUE MASS SELECTION (${(massSelectionPercentage * 100).toFixed(1)}%): From ${scoredChunks.length} scored chunks, selected ${selectedChunks.length} chunks capturing ${(selectedTotalScore/totalScore*100).toFixed(1)}% of total score mass (${isLineOAContext ? 'LINE OA' : 'Document Bot'} context)`);
  } else {
      // If scores are very low, take top 5 as fallback
      selectedChunks = scoredChunks.slice(0, Math.min(5, scoredChunks.length));
      totalScore = selectedChunks.reduce((sum, c) => sum + c.finalScore, 0); // Update totalScore for fallback case
  }

  // Calculate selected chunks total score (recalculate in case of fallback)
  const selectedTotalScore = selectedChunks.reduce((sum, c) => sum + c.finalScore, 0);
  console.log(`📊 SCORE BREAKDOWN: ${selectedTotalScore.toFixed(4)} out of ${totalScore.toFixed(4)} (${(selectedTotalScore/totalScore*100).toFixed(1)}%)`);
  // Update log to include context
  console.log(`🎯 TRUE MASS SELECTION (${(massSelectionPercentage * 100).toFixed(1)}%): From ${scoredChunks.length} scored chunks, selected ${selectedChunks.length} chunks capturing ${(selectedTotalScore/totalScore*100).toFixed(1)}% of total score mass (${isLineOAContext ? 'LINE OA' : 'Document Bot'} context)`);


  const searchResults = selectedChunks.map(chunk => {
    const doc = docMap.get(chunk.docId);
    const label = `(Chunk ${chunk.chunkIndex + 1})`;
    const documentName = doc?.name || `Document ${chunk.docId}`;
    return {
      id: `${chunk.docId}-${chunk.chunkIndex}`,
      chunkId: `${chunk.docId}-${chunk.chunkIndex}`,
      documentId: chunk.docId?.toString() || '0',
      content: chunk.content,
      similarity: chunk.finalScore || 0,
      metadata: {
        originalDocumentId: chunk.docId?.toString() || '0',
        chunkIndex: chunk.chunkIndex || 0,
        name: chunk.name || `Document ${chunk.docId || 0}`,
      },
      name: documentName + label,
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

  console.log("✅ searchSmartHybridDebug: returning", searchResults.length, "results");
  console.log("Memory usage:", process.memoryUsage());

  return searchResults;
}

export async function searchSmartHybridV1(
  query: string,
  userId: string,
  options: Omit<SearchOptions, "searchType"> & {
    massSelectionPercentage?: number;
    enhancedQuery?: string; // Accept preprocessed query from queryPreprocessor
  }
): Promise<SearchResult[]> {
  try {
    const keywordWeight = options.keywordWeight ?? 0.5;
    const vectorWeight = options.vectorWeight ?? 0.5;
    const threshold = options.threshold ?? 0.3;

    // Use enhanced query from preprocessor if provided, otherwise use original
    const searchQuery = options.enhancedQuery || query;
    console.log(`🔍 SEARCH V1: Using ${options.enhancedQuery ? 'preprocessed' : 'original'} query: "${searchQuery}"`);

    // Only tokenize with PythaiNLP for proper Thai word boundaries
    console.log(`🔍 TOKENIZATION V1: Segmenting Thai text for search terms`);
    const { thaiTextProcessor } = await import('./thaiTextProcessor');
    const tokenizedQuery = await thaiTextProcessor.segmentThaiText(searchQuery);
    console.log(`🔍 TOKENIZATION V1: Result: "${tokenizedQuery}"`);

    const searchTerms = tokenizedQuery.toLowerCase().split(/\s+/).filter(Boolean);

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
      const bm25Results = await calculateBM25(searchTerms, chunkObjects);

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
      const docId = parseInt(result.metadata?.originalDocumentId || result.id);
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
        vectorScore * adaptedVectorWeight + keywordScore * adaptedKeywordWeight,
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

    // 4. Adaptive weighting based on search results
    const hasKeywordResults = Object.keys(keywordChunks).length > 0;
    const hasVectorResults = Object.keys(vectorChunks).length > 0;

    let adaptedKeywordWeight = keywordWeight;
    let adaptedVectorWeight = vectorWeight;

    if (!hasKeywordResults && hasVectorResults) {
      // No keyword matches found - use vector-only search
      adaptedKeywordWeight = 0.0;
      adaptedVectorWeight = 1.0;
      console.log(`🔄 ADAPTIVE WEIGHTING: No keyword matches found, switching to vector-only search`);
    } else if (hasKeywordResults && !hasVectorResults) {
      // No vector matches found - use keyword-only search
      adaptedKeywordWeight = 1.0;
      adaptedVectorWeight = 0.0;
      console.log(`🔄 ADAPTIVE WEIGHTING: No vector matches found, switching to keyword-only search`);
    } else if (!hasKeywordResults && !hasVectorResults) {
      console.log(`🔄 ADAPTIVE WEIGHTING: No results from either search method`);
    } else {
      console.log(`🔄 ADAPTIVE WEIGHTING: Both search methods found results, using original weights`);
    }

    // Recalculate final scores with adaptive weights
    for (const [chunkId, chunkData] of combinedChunkMap.entries()) {
      const hybridScore = Math.max(
        chunkData.vectorScore * adaptedVectorWeight + chunkData.keywordScore * adaptedKeywordWeight,
        chunkData.vectorScore,
        chunkData.keywordScore
      );
      chunkData.finalScore = hybridScore;
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

    if(keywordScores.length > 0) {
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
    console.log(`📐 FORMULA: Final Score = (Keyword Score × ${adaptedKeywordWeight}) + (Vector Score × ${adaptedVectorWeight})`);

    sortedChunks.forEach(chunk => {
      const keywordComponent = (chunk.normalizedKeywordScore || 0) * adaptedKeywordWeight;
      const vectorComponent = (chunk.vectorScore || 0) * adaptedVectorWeight;
      chunk.finalScore = keywordComponent + vectorComponent;

      // If keyword weight is high but no good keyword matches, fall back to vector scores
      if (keywordWeight > 0.7 && chunk.finalScore === 0 && chunk.vectorScore > 0.25) {
        chunk.finalScore = chunk.vectorScore * 0.3; // Give it a fighting chance
        console.log(`📊 FALLBACK: Chunk ${chunk.documentId}-${chunk.chunkIndex} boosted from vector score: ${chunk.finalScore.toFixed(3)}`);
      }

      console.log(`📊 CHUNK ${chunk.documentId}-${chunk.chunkIndex}: Keyword=${(chunk.keywordScore || 0).toFixed(4)}→${(chunk.normalizedKeywordScore || 0).toFixed(3)}, Vector=${(chunk.vectorScore || 0).toFixed(3)}, Final=${chunk.finalScore.toFixed(3)}`);
    });

    const totalScore = sortedChunks.reduce((sum, c) => sum + c.finalScore, 0);
    const massSelectionPercentage = options.massSelectionPercentage || MASS_SELECTION_PERCENTAGE;
    const scoreThreshold = totalScore * massSelectionPercentage; // Use configurable mass selection

    const selectedChunks = [];
    let accumulatedScore = 0;
    const minResults = Math.min(5, sortedChunks.length); // Ensure at least 5 chunks
    const maxChunks = Math.min(15, sortedChunks.length); // Increased for better coverage

    for (const chunk of sortedChunks) {
      selectedChunks.push(chunk);
      accumulatedScore += chunk.finalScore;
      // Don't stop until we have at least 5 chunks, regardless of mass target
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

async function performKeywordSearch(
  query: string,
  chunks: Array<{ content: string; chunkIndex: number; documentId: number; documentName: string }>
): Promise<Array<{ chunk: any; score: number; reason: string }>> {
  // Only tokenize with PythaiNLP - no GPT enrichment here
  console.log(`🔍 performKeywordSearch: Tokenizing query: "${query}"`);
  const { thaiTextProcessor } = await import('./thaiTextProcessor');
  const tokenizedQuery = await thaiTextProcessor.segmentThaiText(query);

  const searchTerms = tokenizedQuery.toLowerCase().split(/\s+/).filter(Boolean);
  console.log(`🔍 performKeywordSearch: Starting with tokenized terms: [${searchTerms.join(', ')}]`);

  // Calculate BM25 scores
  const bm25Results = await calculateBM25(searchTerms, chunks);

  const results: Array<{ chunk: any; score: number; reason: string }> = [];

  for (const [chunkId, bm25Result] of Array.from(bm25Results.entries())) {
    if (bm25Result.score > 0) {
      // Find the chunk object corresponding to the chunkId
      const chunk = chunks.find(c => `${c.documentId}-${c.chunkIndex}` === chunkId);
      if (chunk) {
        results.push({ chunk: chunk, score: bm25Result.score, reason: "BM25 match" });
      }
    }
  }

  console.log(`🔍 performKeywordSearch: Found ${results.length} chunks with keyword matches out of ${chunks.length} total chunks`)
  return results;
}

async function calculateBM25Score(
  searchTerms: string[],
  documentText: string,
  documents: Array<{ content: string }>,
  k1: number = 1.2,
  b: number = 0.75
): Promise<number> {
  // Calculate document frequency for each term
  const termFrequency = new Map<string, number>();
  for (const term of searchTerms) {
    termFrequency.set(term, 0);
  }

  // Tokenize the document
  const docTokens = await tokenizeWithThaiNormalization(documentText);

  // Count term frequency in the document
  for (const token of docTokens) {
    if (termFrequency.has(token)) {
      termFrequency.set(token, termFrequency.get(token)! + 1);
    }
  }

  // Calculate average document length
  const avgDocLength = documents.length > 0 ? documents.reduce((sum, doc) => sum + (doc.content?.length || 0), 0) / documents.length : 1;

  // Calculate BM25 score
  let score = 0;
  for (const term of searchTerms) {
    const tf = termFrequency.get(term) || 0;
    const df = documents.filter(doc => doc.content && doc.content.includes(term)).length;
    const idf = Math.log((documents.length - df + 0.5) / (df + 0.5) + 1);
    score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (documentText.length / avgDocLength)));
  }

  return score;
}