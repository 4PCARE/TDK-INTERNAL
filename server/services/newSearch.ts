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

  // For Thai text, also check with space normalization
  if (/[\u0E00-\u0E7F]/.test(searchTerm)) {
    const normalizedSearchTerm = searchTerm.replace(/\s+/g, '');
    const normalizedText = text.replace(/\s+/g, '');
    if (normalizedText.includes(normalizedSearchTerm)) {
      return { score: 0.95, matchedText: searchTerm };
    }
  }

  // Check word-level fuzzy matches
  for (const word of words) {
    const cleanWord = word.replace(/[^\w\u0E00-\u0E7F]/g, ''); // Keep Thai and English chars
    if (cleanWord.length < 2) continue;

    // Enhanced Thai matching
    if (/[\u0E00-\u0E7F]/.test(searchTerm) && /[\u0E00-\u0E7F]/.test(cleanWord)) {
      if (isThaiTokenSimilar(searchTerm, cleanWord)) {
        const normalized1 = searchTerm.toLowerCase().replace(/\s+/g, '');
        const normalized2 = cleanWord.toLowerCase().replace(/\s+/g, '');

        if (normalized1 === normalized2) {
          bestScore = 0.95;
          bestMatch = cleanWord;
        } else if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
          if (bestScore < 0.85) {
            bestScore = 0.85;
            bestMatch = cleanWord;
          }
        } else if (bestScore < 0.80) {
          bestScore = 0.80;
          bestMatch = cleanWord;
        }
        continue;
      }
    }

    // Regular similarity for non-Thai or when Thai matching doesn't apply
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

  // First pass: calculate document frequencies and total length with enhanced fuzzy matching
  const chunkLengths = new Map<string, number>();
  for (const chunk of chunks) {
    const content = chunk.content || '';
    const tokens = await tokenizeWithThaiNormalization(content);
    const chunkIndex = chunk.chunkIndex ?? 0;
    // Use consistent chunk ID format: docId-chunkIndex
    const chunkId = `${chunk.documentId}-${chunk.chunkIndex}`;

    chunkLengths.set(chunkId, tokens.length);
    totalDocLength += tokens.length;

    // Count document frequency for each search term with comprehensive fuzzy matching
    for (const term of normalizedSearchTerms) {
      let hasMatch = false;

      // Strategy 1: Exact match
      if (tokens.includes(term)) {
        hasMatch = true;
      } else {
        // Strategy 2: Enhanced fuzzy matching
        for (const token of tokens) {
          // Thai-specific similarity
          if (isThaiText(term) && isThaiTokenSimilar(term, token)) {
            hasMatch = true;
            break;
          }

          // English/general fuzzy matching
          if (!isThaiText(term) && calculateSimilarity(term, token) > 0.75) {
            hasMatch = true;
            break;
          }
        }

        // Strategy 3: Partial and substring matching
        if (!hasMatch) {
          const partialMatch = findPartialStringMatches(term, tokens);
          const substringMatch = findSubstringMatches(term, tokens);

          if (partialMatch.score > 0.6 || substringMatch.score > 0.5) {
            hasMatch = true;
          }
        }
      }

      if (hasMatch) {
        termDF.set(term, (termDF.get(term) || 0) + 1);
      }
    }
  }

  console.log(`🔍 BM25: Document frequencies calculated:`, Array.from(termDF.entries()).map(([term, df]) => `${term}:${df}`));

  const avgDocLength = totalDocLength / totalChunks;

  // Second pass: calculate BM25 scores with enhanced fuzzy matching
  for (const chunk of chunks) {
    const chunkIndex = chunk.chunkIndex ?? 0;
    const chunkId = `${chunk.documentId}-${chunkIndex}`;
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

      let bestScore = 0;
      let bestTf = 0;
      let matchType = 'none';

      // 1. Check for exact matches first
      const exactTf = tokenCounts.get(term) || 0;
      if (exactTf > 0) {
        bestScore = 1.0; // Perfect match
        bestTf = exactTf;
        matchType = 'exact';
      } else {
        // 2. Enhanced fuzzy matching with multiple strategies
        const fuzzyResults = [];

        // Strategy A: Token-level fuzzy matching
        if (isThaiText(term)) {
          const thaiMatch = findBestFuzzyMatchThai(term, tokens);
          if (thaiMatch.score > 0.65) { // Lower threshold for Thai
            fuzzyResults.push({ ...thaiMatch, type: 'thai' });
          }
        } else {
          const fuzzyMatch = findBestFuzzyMatch(term, tokens);
          if (fuzzyMatch.score > 0.75) {
            fuzzyResults.push({ ...fuzzyMatch, type: 'fuzzy' });
          }
        }

        // Strategy B: Partial string matching (for compound words)
        const partialMatches = findPartialStringMatches(term, tokens);
        if (partialMatches.score > 0.6) {
          fuzzyResults.push({ ...partialMatches, type: 'partial' });
        }

        // Strategy C: Substring containment (for brand names, etc.)
        const substringMatches = findSubstringMatches(term, tokens);
        if (substringMatches.score > 0.5) {
          fuzzyResults.push({ ...substringMatches, type: 'substring' });
        }

        // Select the best fuzzy match
        if (fuzzyResults.length > 0) {
          const bestFuzzy = fuzzyResults.reduce((best, current) => 
            current.score > best.score ? current : best
          );
          bestScore = bestFuzzy.score;
          bestTf = bestFuzzy.count;
          matchType = bestFuzzy.type;
        }
      }

      // Calculate BM25 score if we have any match
      if (bestScore > 0 && bestTf > 0) {
        matchedTerms.push(term);
        processedTerms.add(term);

        // BM25 formula components
        const df = termDF.get(term) || 1;
        const idf = Math.log(totalChunks / df) + 1; // Ensure positive scores

        // Term frequency component with saturation
        const tfComponent = (bestTf * (k1 + 1)) / (bestTf + k1 * (1 - b + b * (docLength / avgDocLength)));

        // Apply match quality penalty for fuzzy matches
        const qualityMultiplier = matchType === 'exact' ? 1.0 : 
                                 matchType === 'thai' ? 0.9 :
                                 matchType === 'fuzzy' ? 0.8 :
                                 matchType === 'partial' ? 0.7 : 0.6;

        const termScore = idf * tfComponent * bestScore * qualityMultiplier;
        bm25Score += termScore;

        console.log(`🔍 BM25 ${matchType.toUpperCase()}: Chunk ${chunkId}, term "${term}", tf=${bestTf}, quality=${bestScore.toFixed(3)}, multiplier=${qualityMultiplier}, score+=${termScore.toFixed(3)}`);
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
      // Calculate more nuanced similarity score
      const normalized1 = term.toLowerCase().replace(/\s+/g, '');
      const normalized2 = token.toLowerCase().replace(/\s+/g, '');

      if (normalized1 === normalized2) {
        bestScore = Math.max(bestScore, 0.95); // Very high score for exact match after space normalization
      } else if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
        bestScore = Math.max(bestScore, 0.85); // High score for containment
      } else {
        bestScore = Math.max(bestScore, 0.80); // Good score for fuzzy match
      }
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

    // Enhanced fuzzy matching: Check if terms are similar when spaces are normalized
    if (Math.abs(normalized1.length - normalized2.length) <= 2) {
      const similarity = calculateSimilarity(normalized1, normalized2);
      if (similarity >= 0.85) {
        return true;
      }
    }

    // Also check similarity with original spacing
    if (Math.abs(term1.length - term2.length) <= 3) {
      const similarity = calculateSimilarity(term1.toLowerCase(), term2.toLowerCase());
      if (similarity >= 0.80) {
        return true;
      }
    }
  }

  return false;
}

function findPartialStringMatches(term: string, tokens: string[]): { score: number; count: number } {
  let bestScore = 0;
  let count = 0;
  const termLower = term.toLowerCase();

  for (const token of tokens) {
    const tokenLower = token.toLowerCase();

    // Check if term is contained in token or vice versa
    if (termLower.length >= 3 && tokenLower.length >= 3) {
      if (tokenLower.includes(termLower)) {
        // Term is contained in token (e.g., "แมค" in "แมคโดนัลด์")
        bestScore = Math.max(bestScore, termLower.length / tokenLower.length);
        count++;
      } else if (termLower.includes(tokenLower)) {
        // Token is contained in term
        bestScore = Math.max(bestScore, tokenLower.length / termLower.length);
        count++;
      }
    }
  }

  return { score: bestScore, count };
}

function findSubstringMatches(term: string, tokens: string[]): { score: number; count: number } {
  let bestScore = 0;
  let count = 0;
  const termLower = term.toLowerCase();

  // For compound searches like "แมคโดนัลด์ เดอะมอลล์"
  const termParts = termLower.split(/\s+/).filter(part => part.length > 2);

  for (const token of tokens) {
    const tokenLower = token.toLowerCase();

    // Check if any part of the term matches with the token
    for (const part of termParts) {
      if (part.length >= 3) {
        // Exact substring match
        if (tokenLower.includes(part) || part.includes(tokenLower)) {
          const overlap = Math.min(part.length, tokenLower.length);
          const maxLength = Math.max(part.length, tokenLower.length);
          bestScore = Math.max(bestScore, overlap / maxLength);
          count++;
        }

        // Character-level similarity for Thai text
        if (isThaiText(part) && isThaiText(tokenLower)) {
          const similarity = calculateThaiSimilarity(part, tokenLower);
          if (similarity > 0.7) {
            bestScore = Math.max(bestScore, similarity);
            count++;
          }
        }
      }
    }
  }

  return { score: bestScore, count };
}

// Remove duplicate GPT enrichment - use preprocessor instead

export async function searchSmartHybridDebug(
  query: string,
  userId: string,
  options: Omit<SearchOptions, "searchType"> & { 
    massSelectionPercentage?: number;
    enhancedQuery?: string; // Accept preprocessed query from queryPreprocessor
    agentAliases?: Record<string, string[]>; // Agent aliases for term expansion
  }
): Promise<SearchResult[]> {
  const keywordWeight = options.keywordWeight ?? 0.5;
  const vectorWeight = options.vectorWeight ?? 0.5;
  const threshold = options.threshold ?? 0.3;
  const massSelectionPercentage = options.massSelectionPercentage || MASS_SELECTION_PERCENTAGE;

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

  // 2. Get vector search results (get all available chunks)
  console.log(`🔍 VECTOR SEARCH: Starting vector search for "${query}"`);
  const vectorResults = await vectorService.searchDocuments(query, userId, -1, options.specificDocumentIds);

  const vectorMatches: Record<string, { score: number, content: string }> = {};
  for (const result of vectorResults) {
    const docId = parseInt(result.document.metadata.originalDocumentId || result.document.id);
    const chunkIndex = result.document.chunkIndex ?? 0;
    // Use consistent chunk ID format: docId-chunkIndex
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
    matchedTerms: string[];
    matchDetails: any[];
  }[] = [];

  console.log(`🧮 SCORING CALCULATION: Combining ${allChunkIds.size} unique chunks`);
  console.log(`📊 WEIGHTS: Keyword=${keywordWeight}, Vector=${vectorWeight}`);
  console.log(`📐 FORMULA: Final Score = (Keyword Score × ${keywordWeight}) + (Vector Score × ${vectorWeight})`);

  // Step 1: Collect all BM25 scores for statistical normalization
  const allBM25Scores = Object.values(keywordMatches).map(match => match.score).filter(score => score > 0);

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
    const lastDashIndex = chunkId.lastIndexOf("-");
    if (lastDashIndex === -1) {
      console.warn(`⚠️  Invalid chunk ID format: ${chunkId}`);
      continue;
    }
    const docIdStr = chunkId.substring(0, lastDashIndex);
    const chunkIndexStr = chunkId.substring(lastDashIndex + 1);
    const docId = parseInt(docIdStr);
    const chunkIndex = parseInt(chunkIndexStr);

    const keywordInfo = keywordMatches[chunkId];
    const keywordScore = keywordInfo?.score ?? 0;
    const vectorInfo = vectorMatches[chunkId];
    let vectorScore = vectorInfo?.score ?? 0;

    // If vector score is 0 but keyword score exists, apply minimum vector baseline
    if (vectorScore === 0 && keywordScore > 0) {
      // Use a small baseline vector score (10% of average vector score if available)
      const vectorScores = Object.values(vectorMatches).map(v => v.score).filter(s => s > 0);
      if (vectorScores.length > 0) {
        const avgVectorScore = vectorScores.reduce((a, b) => a + b, 0) / vectorScores.length;
        vectorScore = Math.max(0.1, avgVectorScore * 0.1); // 10% of average as baseline
        console.log(`📊 BASELINE: Chunk ${chunkId} assigned baseline vector score: ${vectorScore.toFixed(4)}`);
      }
    }

    // Get content from either source, prioritizing vector content for consistency
    let content = vectorInfo?.content ?? "";
    if (!content && keywordInfo) {
      content = keywordInfo.content;
    }
    // Fallback to chunk map if still no content
    if (!content) {
      const chunk = chunkMap.get(chunkId);
      content = chunk?.content ?? "";
    }

    // Apply statistical normalization to keyword scores
    const normalizedKeywordScore = normalizeKeywordScore(keywordScore);
    const finalScore = normalizedKeywordScore * keywordWeight + vectorScore * vectorWeight;

    console.log(`📊 CHUNK ${chunkId}: Keyword=${keywordScore.toFixed(4)}→${normalizedKeywordScore.toFixed(3)}, Vector=${vectorScore.toFixed(3)}, Final=${finalScore.toFixed(3)}`);

    // Option 1: Require both scores > 0 (uncomment to enable strict filtering)
    // const requireBothScores = keywordScore > 0 && (vectorInfo?.score ?? 0) > 0;
    // if (finalScore > 0 && content.length > 0 && requireBothScores) {

    // Option 2: Accept any positive final score (current behavior)
    if (finalScore > 0 && content.length > 0) {
      scoredChunks.push({
        docId,
        chunkIndex,
        content,
        finalScore,
        keywordScore: normalizedKeywordScore, // Store normalized score
        vectorScore,
        matchedTerms: keywordInfo?.matchedTerms ?? [],
        matchDetails: keywordInfo?.matchDetails ?? []
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
      const scoreTarget = totalScore * massSelectionPercentage;
      let accScore = 0;

      console.log(`TRUE MASS SELECTION: Total score: ${totalScore.toFixed(4)}, ${(massSelectionPercentage * 100).toFixed(1)}% target: ${scoreTarget.toFixed(4)}`);

      for (const chunk of scoredChunks) {
        const potentialScore = accScore + chunk.finalScore;

        // For document chat, don't stop until we have at least 5 chunks, regardless of mass target
        // For other origins, use default minimum of 2 chunks
        const minChunks = massSelectionPercentage >= 0.3 ? 5 : 2; // 30% mass = document chat, needs 5 chunks minimum

        if (potentialScore > scoreTarget && selectedChunks.length >= minChunks) {
          console.log(`STOPPING: Adding chunk ${selectedChunks.length + 1} would exceed ${(massSelectionPercentage * 100).toFixed(1)}% mass target (${(potentialScore/totalScore*100).toFixed(1)}% > ${(massSelectionPercentage * 100).toFixed(1)}%) - stopping at ${selectedChunks.length} chunks`);
          break;
        }

        selectedChunks.push(chunk);
        accScore += chunk.finalScore;

        console.log(`Chunk ${selectedChunks.length}: score=${chunk.finalScore.toFixed(4)}, accumulated=${accScore.toFixed(4)}, target=${scoreTarget.toFixed(4)}, mass=${(accScore/totalScore*100).toFixed(1)}% (need ${(massSelectionPercentage * 100).toFixed(1)}%)`);

        // Check if we've reached the target mass AND minimum chunks
        if (accScore >= scoreTarget && selectedChunks.length >= minChunks) {
          console.log(`STOPPING: Reached ${(massSelectionPercentage * 100).toFixed(1)}% mass target (${(accScore/totalScore*100).toFixed(1)}%) with ${selectedChunks.length} chunks`);
          break;
        }

        // Safety cap to prevent excessive results
        if (selectedChunks.length >= maxResults) {
          console.log(`STOPPING: Hit safety cap at ${maxResults} chunks`);
          break;
        }
      }
    } else {
      // If scores are very low, take top 5 as fallback
      selectedChunks = scoredChunks.slice(0, Math.min(5, scoredChunks.length));
    }

    // Calculate selected chunks total score
    const selectedTotalScore = selectedChunks.reduce((sum, c) => sum + c.finalScore, 0);
    console.log(`SCORE BREAKDOWN: ${selectedTotalScore.toFixed(4)} out of ${totalScore.toFixed(4)} (${(selectedTotalScore/totalScore*100).toFixed(1)}%)`);
    console.log(`TRUE MASS SELECTION (${(massSelectionPercentage * 100).toFixed(1)}%): From ${scoredChunks.length} scored chunks, selected ${selectedChunks.length} chunks capturing ${(selectedTotalScore/totalScore*100).toFixed(1)}% of total score mass`);
  }

  const results: SearchResult[] = selectedChunks.map(chunk => {
    const doc = docMap.get(chunk.docId);
    const label = `(Chunk ${chunk.chunkIndex + 1})`;
    const documentName = doc?.name || `Document ${chunk.docId}`;

      // Generate consistent chunk ID format
      const chunkId = `doc${chunk.docId}_chunk${chunk.chunkIndex}`;

      return {
        id: chunkId,
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
       // Generate consistent chunk ID format
      const chunkId = `doc${chunk.docId}_chunk${chunk.chunkIndex}`;

      return {
        id: chunkId,
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

  for (const bm25Result of bm25Results) {
    if (bm25Result.score > 0) {
      results.push({ chunk: bm25Result.chunk, score: bm25Result.score, reason: "BM25 match" });
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
  const avgDocLength = documents.reduce((sum, doc) => sum + doc.content.length, 0) / documents.length;

  // Calculate BM25 score
  let score = 0;
  for (const term of searchTerms) {
    const tf = termFrequency.get(term) || 0;
    const idf = Math.log((documents.length - documents.filter(doc => doc.content.includes(term)).length + 0.5) / (documents.filter(doc => doc.content.includes(term)).length + 0.5) + 1);
    score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (documentText.length / avgDocLength)));
  }

  return score;
}

async function performChunkSplitAndRankSearch(
    query: string,
    userId: string,
    options: Omit<SearchOptions, 'searchType'> & {
      keywordWeight?: number;
      vectorWeight?: number;
      massSelectionPercentage?: number;
    } = {}
  ): Promise<SearchResult[]> {
    const {
      maxResults = 50,
      includeContent = true,
      specificDocumentIds,
      keywordWeight = 0.3,
      vectorWeight = 0.7,
      massSelectionPercentage = 0.3, // 30% score mass threshold for document chat
    } = options;

  //TODO: Implementation
  return []
}