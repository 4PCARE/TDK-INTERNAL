import { storage } from '../storage';
import { aiKeywordExpansionService } from './aiKeywordExpansion';
import { db } from '../db';
import { documentVectors } from '@shared/schema';
import { eq, and, or } from 'drizzle-orm';

interface SearchTerm {
  term: string;
  weight: number;
  fuzzy?: boolean;
  source?: 'original' | 'ai_expanded' | 'contextual';
}

interface ChunkScore {
  documentId: number;
  chunkIndex: number;
  content: string;
  score: number;
  matchedTerms: string[];
  matchDetails: Array<{
    term: string;
    score: number;
    positions: number[];
    fuzzyMatch?: boolean;
  }>;
}

export class AdvancedKeywordSearchService {
  private stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'ที่', 'และ', 'หรือ', 'แต่', 'ใน', 'บน', 'ที่', 'เพื่อ', 'ของ', 'กับ', 'โดย', 'ได้', 
    'เป็น', 'มี', 'จาก', 'ไป', 'มา', 'ก็', 'จะ', 'ถึง', 'ให้', 'ยัง', 'คือ', 'ว่า'
  ]);

  async searchDocuments(
    query: string,
    userId: string,
    limit: number = 20,
    specificDocumentIds?: number[]
  ): Promise<Array<{
    id: number;
    name: string;
    content: string;
    summary?: string | null;
    aiCategory?: string | null;
    similarity: number;
    createdAt: string;
    matchedTerms: string[];
    matchDetails: any;
  }>> {
    try {
      // Get document chunks from document_vectors table
      let whereCondition: any = eq(documentVectors.userId, userId);

      if (specificDocumentIds && specificDocumentIds.length > 0) {
        whereCondition = and(
          eq(documentVectors.userId, userId),
          or(...specificDocumentIds.map(id => eq(documentVectors.documentId, id)))
        );
        console.log(`Advanced keyword search: Filtering to ${specificDocumentIds.length} specific documents: [${specificDocumentIds.join(', ')}]`);
      }

      const chunks = await db.select()
        .from(documentVectors)
        .where(whereCondition);

      console.log(`Advanced keyword search: Found ${chunks.length} chunks for user ${userId}`);

      if (chunks.length === 0) {
        return [];
      }

      // Parse and analyze query
      console.log(`Advanced keyword search for: "${query}"`);
      const searchTerms = this.parseQuery(query);
      console.log(`Parsed search terms:`, searchTerms.map(t => `${t.term}(${t.weight})`));

      // Calculate chunk scores
      const chunkScores = this.calculateChunkScores(chunks, searchTerms);

      // Sort by relevance and limit results
      chunkScores.sort((a, b) => b.score - a.score);
      const topChunks = chunkScores.slice(0, limit);

      // Get document metadata for the top chunks
      const documents = await storage.getDocuments(userId);
      const docMap = new Map(documents.map(doc => [doc.id, doc]));

      // Format results - aggregate chunks by document and take the best chunk per document
      const documentResults = new Map<number, any>();

      topChunks
        .filter(chunk => chunk.score > 0.1) // Minimum relevance threshold
        .forEach(chunkScore => {
          const document = docMap.get(chunkScore.documentId);
          if (!document) return;

          const existingResult = documentResults.get(chunkScore.documentId);

          // If this document already has a result, only replace if this chunk has a better score
          if (!existingResult || chunkScore.score > existingResult.similarity) {
            documentResults.set(chunkScore.documentId, {
              id: document.id,
              name: document.name,
              content: chunkScore.content, // Use chunk content instead of full document
              summary: document.summary,
              aiCategory: document.aiCategory,
              similarity: Math.min(chunkScore.score / 10, 1.0), // Normalize to 0-1
              createdAt: document.createdAt.toISOString(),
              matchedTerms: chunkScore.matchedTerms,
              matchDetails: chunkScore.matchDetails
            });
          }
        });

      const results = Array.from(documentResults.values())
        .sort((a, b) => b.similarity - a.similarity);

      console.log(`Advanced keyword search returned ${results.length} results from ${chunkScores.length} scored chunks`);
      return results;

    } catch (error) {
      console.error('Advanced keyword search error:', error);
      throw new Error('Advanced keyword search failed');
    }
  }

  private parseQuery(query: string): SearchTerm[] {
    const terms: SearchTerm[] = [];

    // Handle quoted phrases
    const quotedPhrases = query.match(/"([^"]+)"/g);
    let remainingQuery = query;

    if (quotedPhrases) {
      quotedPhrases.forEach(phrase => {
        const cleanPhrase = phrase.replace(/"/g, '').trim();
        if (cleanPhrase.length > 0) {
          terms.push({ term: cleanPhrase, weight: 2.0 }); // Higher weight for exact phrases
        }
        remainingQuery = remainingQuery.replace(phrase, '');
      });
    }

    // Handle remaining individual terms
    const individualTerms = remainingQuery
      .toLowerCase()
      .split(/[\s\-_,\.!?\(\)\[\]]+/)
      .filter(term => term.length > 1 && !this.stopWords.has(term))
      .map(term => term.trim())
      .filter(term => term.length > 0);

    // Add individual terms with fuzzy matching for longer terms
    individualTerms.forEach(term => {
      const weight = term.length >= 3 ? 1.0 : 0.7;
      const fuzzy = term.length >= 4;
      terms.push({ term, weight, fuzzy });
    });

    return terms;
  }

  private calculateChunkScores(chunks: any[], searchTerms: SearchTerm[]): ChunkScore[] {
    const chunkScores: ChunkScore[] = [];

    // Calculate IDF for each search term across all chunks
    const termIDF = this.calculateIDF(chunks, searchTerms);

    for (const chunk of chunks) {
      const chunkText = chunk.content.toLowerCase();
      const chunkTokens = this.tokenizeText(chunkText);

      const chunkScore: ChunkScore = {
        documentId: chunk.documentId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        score: 0,
        matchedTerms: [],
        matchDetails: []
      };

      // Calculate TF-IDF score for each search term
      for (const searchTerm of searchTerms) {
        const termScore = this.calculateTermScore(
          searchTerm,
          chunkText,
          chunkTokens,
          termIDF.get(searchTerm.term) || 1.0
        );

        if (termScore.score > 0) {
          chunkScore.score += termScore.score * searchTerm.weight;
          chunkScore.matchedTerms.push(searchTerm.term);
          chunkScore.matchDetails.push({
            term: searchTerm.term,
            score: termScore.score,
            positions: termScore.positions,
            fuzzyMatch: termScore.fuzzyMatch
          });
        }
      }

      // Apply chunk-level boosters
      chunkScore.score = this.applyChunkBoosters(chunk, chunkScore.score, searchTerms);

      if (chunkScore.score > 0) {
        chunkScores.push(chunkScore);
      }
    }

    return chunkScores;
  }

  private tokenizeText(text: string): string[] {
    return text
      .split(/[\s\-_,\.!?\(\)\[\]]+/)
      .map(token => token.trim().toLowerCase())
      .filter(token => token.length > 0);
  }

  private calculateIDF(chunks: any[], searchTerms: SearchTerm[]): Map<string, number> {
    const termIDF = new Map<string, number>();
    const totalChunks = chunks.length;

    for (const searchTerm of searchTerms) {
      let chunksWithTerm = 0;

      for (const chunk of chunks) {
        const chunkText = chunk.content.toLowerCase();
        if (this.termExistsInText(searchTerm.term, chunkText, searchTerm.fuzzy)) {
          chunksWithTerm++;
        }
      }

      const idf = chunksWithTerm > 0 ? Math.log(totalChunks / chunksWithTerm) : 1.0;
      termIDF.set(searchTerm.term, idf);
    }

    return termIDF;
  }

  private calculateTermScore(
    searchTerm: SearchTerm,
    chunkText: string,
    chunkTokens: string[],
    idf: number
  ): { score: number; positions: number[]; fuzzyMatch?: boolean } {
    const term = searchTerm.term.toLowerCase();
    const positions: number[] = [];
    let exactMatches = 0;
    let fuzzyMatches = 0;
    let partialMatches = 0;

    // Check for exact matches first
    let index = 0;
    while ((index = chunkText.indexOf(term, index)) !== -1) {
      positions.push(index);
      exactMatches++;
      index += term.length;
    }

    let fuzzyMatch = false;

    // If no exact matches, try fuzzy matching
    if (exactMatches === 0) {
      // Token-level fuzzy matching
      if (searchTerm.fuzzy) {
        for (let i = 0; i < chunkTokens.length; i++) {
          const token = chunkTokens[i];
          if (this.isFuzzyMatch(term, token)) {
            fuzzyMatches++;
            fuzzyMatch = true;
            const tokenIndex = chunkText.indexOf(token, i > 0 ? positions[positions.length - 1] || 0 : 0);
            if (tokenIndex !== -1) {
              positions.push(tokenIndex);
            }
          }
        }
      }

      // Partial matching for longer terms
      if (fuzzyMatches === 0 && term.length >= 4) {
        const partialPositions = this.findPartialMatches(term, chunkText);
        positions.push(...partialPositions);
        partialMatches = partialPositions.length;
        if (partialMatches > 0) {
          fuzzyMatch = true;
        }
      }
    }

    // Calculate weighted matches
    const totalMatches = exactMatches + (fuzzyMatches * 0.8) + (partialMatches * 0.5);
    const tf = totalMatches / Math.max(chunkTokens.length, 1);

    // Boost score for exact matches
    let score = tf * idf;
    if (exactMatches > 0) {
      score *= 1.2; // 20% boost for exact matches
    }

    return { score, positions, fuzzyMatch };
  }

  private termExistsInText(term: string, text: string, fuzzy?: boolean): boolean {
    // Check exact match first
    if (text.includes(term.toLowerCase())) {
      return true;
    }

    // Check fuzzy match if enabled
    if (fuzzy) {
      const tokens = this.tokenizeText(text);
      return tokens.some(token => this.isFuzzyMatch(term, token));
    }

    return false;
  }

  private isFuzzyMatch(term1: string, term2: string): boolean {
    if (Math.abs(term1.length - term2.length) > 3) {
      return false;
    }

    // Special handling for Thai text
    if (/[\u0E00-\u0E7F]/.test(term1) || /[\u0E00-\u0E7F]/.test(term2)) {
      return this.isThaiApproximateMatch(term1, term2);
    }

    const distance = this.levenshteinDistance(term1, term2);
    const maxLength = Math.max(term1.length, term2.length);
    const similarity = (maxLength - distance) / maxLength;

    // Adjust threshold based on word length
    const threshold = term1.length <= 3 ? 0.8 : 0.75;
    return similarity >= threshold;
  }

  private isThaiApproximateMatch(term1: string, term2: string): boolean {
    // Remove Thai tone marks and normalize vowels for better matching
    const normalize = (str: string) => str
      .replace(/[์็่้๊๋]/g, '') // Remove tone marks
      .replace(/[ะาิีึืุูเแโใไ]/g, 'a') // Normalize vowels
      .toLowerCase();

    const norm1 = normalize(term1);
    const norm2 = normalize(term2);

    const distance = this.levenshteinDistance(norm1, norm2);
    const maxLength = Math.max(norm1.length, norm2.length);
    const similarity = (maxLength - distance) / maxLength;

    return similarity >= 0.75; // Slightly lower threshold for Thai
  }

  private findPartialMatches(term: string, text: string): number[] {
    const positions: number[] = [];

    // Find partial matches for longer terms
    if (term.length >= 4) {
      const words = text.split(/\s+/);
      let currentPos = 0;

      for (const word of words) {
        const wordPos = text.indexOf(word, currentPos);

        // Check if word contains most characters from the term
        const termChars = term.toLowerCase().split('');
        const wordChars = word.toLowerCase().split('');
        const matchingChars = termChars.filter(char => wordChars.includes(char));

        if (matchingChars.length >= Math.ceil(term.length * 0.7)) {
          positions.push(wordPos);
        }

        currentPos = wordPos + word.length;
      }
    }

    return positions;
  }

  private levenshteinDistance(str1: string, str2: string): number {
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

  private applyChunkBoosters(chunk: any, baseScore: number, searchTerms: SearchTerm[]): number {
    let boostedScore = baseScore;

    // Boost if chunk has high relevance (more matches in smaller content)
    const chunkLength = chunk.content.length;
    if (chunkLength > 0 && chunkLength < 1000) { // Shorter chunks with matches get slight boost
      boostedScore *= 1.1;
    }

    // Boost if chunk is from the beginning of document (likely more important)
    if (chunk.chunkIndex === 0) {
      boostedScore *= 1.2; // 20% boost for first chunk
    }

    return boostedScore;
  }

  // AI-Enhanced search with chat history context
  async searchDocumentsWithAI(
    query: string,
    userId: string,
    chatHistory: Array<{messageType: string; content: string; createdAt: Date}> = [],
    limit: number = 20,
    specificDocumentIds?: number[]
  ): Promise<Array<{
    id: number;
    name: string;
    content: string;
    summary?: string | null;
    aiCategory?: string | null;
    similarity: number;
    createdAt: string;
    matchedTerms: string[];
    matchDetails: any;
    aiKeywordExpansion?: {
      expandedKeywords: string[];
      isContextual: boolean;
      confidence: number;
    };
  }>> {
    try {
      // Get AI keyword expansion
      console.log(`Getting AI keyword expansion for: "${query}"`);
      const expansionResult = await aiKeywordExpansionService.getExpandedSearchTerms(query, chatHistory);

      console.log(`AI Expansion Result:`, {
        original: expansionResult.original,
        expanded: expansionResult.expanded,
        isContextual: expansionResult.isContextual,
        confidence: expansionResult.confidence
      });

      // Parse original query
      const originalSearchTerms = this.parseQuery(query);

      // Create enhanced search terms combining original and AI-expanded
      const enhancedSearchTerms: SearchTerm[] = [
        // Original terms with high weight
        ...originalSearchTerms.map(term => ({
          ...term,
          source: 'original' as const
        })),

        // AI-expanded terms with contextual weight
        ...expansionResult.expanded
          .filter(keyword => !originalSearchTerms.some(ot => ot.term.toLowerCase() === keyword.toLowerCase()))
          .map(keyword => ({
            term: keyword,
            weight: expansionResult.isContextual ? 0.8 : 0.6, // Higher weight if contextual
            fuzzy: keyword.length >= 4,
            source: expansionResult.isContextual ? 'contextual' as const : 'ai_expanded' as const
          }))
      ];

      console.log(`Enhanced search terms:`, enhancedSearchTerms.map(t => `${t.term}(${t.weight}, ${t.source})`));

      // Get document chunks from document_vectors table
      let whereCondition: any = eq(documentVectors.userId, userId);

      if (specificDocumentIds && specificDocumentIds.length > 0) {
        whereCondition = and(
          eq(documentVectors.userId, userId),
          or(...specificDocumentIds.map(id => eq(documentVectors.documentId, id)))
        );
        console.log(`AI-enhanced search: Filtering to ${specificDocumentIds.length} documents from specific IDs: [${specificDocumentIds.join(', ')}]`);
      }

      const chunks = await db.select()
        .from(documentVectors)
        .where(whereCondition);

      console.log(`AI-enhanced keyword search: Found ${chunks.length} chunks for user ${userId}`);

      if (chunks.length === 0) {
        return [];
      }

      // Calculate chunk scores with enhanced terms
      const chunkScores = this.calculateChunkScores(chunks, enhancedSearchTerms);

      // Sort by relevance and limit results
      chunkScores.sort((a, b) => b.score - a.score);
      const topChunks = chunkScores.slice(0, limit);

      // Get document metadata for the top chunks
      const documents = await storage.getDocuments(userId);
      const docMap = new Map(documents.map(doc => [doc.id, doc]));

      // Format results - aggregate chunks by document and take the best chunk per document
      const documentResults = new Map<number, any>();

      topChunks
        .filter(chunk => chunk.score > 0.1) // Minimum relevance threshold
        .forEach(chunkScore => {
          const document = docMap.get(chunkScore.documentId);
          if (!document) return;

          const existingResult = documentResults.get(chunkScore.documentId);

          // If this document already has a result, only replace if this chunk has a better score
          if (!existingResult || chunkScore.score > existingResult.similarity) {
            documentResults.set(chunkScore.documentId, {
              id: document.id,
              name: document.name,
              content: chunkScore.content, // Use chunk content instead of full document
              summary: document.summary,
              aiCategory: document.aiCategory,
              similarity: Math.min(chunkScore.score / 10, 1.0), // Normalize to 0-1
              createdAt: document.createdAt.toISOString(),
              matchedTerms: chunkScore.matchedTerms,
              matchDetails: chunkScore.matchDetails,
              aiKeywordExpansion: {
                expandedKeywords: expansionResult.expanded,
                isContextual: expansionResult.isContextual,
                confidence: expansionResult.confidence
              }
            });
          }
        });

      const results = Array.from(documentResults.values())
        .sort((a, b) => b.similarity - a.similarity);

      console.log(`AI-enhanced keyword search returned ${results.length} results with expansion confidence: ${expansionResult.confidence}`);
      return results;

    } catch (error) {
      console.error('AI-enhanced keyword search error:', error);
      // Fallback to regular search
      console.log('Falling back to regular keyword search...');
      return this.searchDocuments(query, userId, limit, specificDocumentIds);
    }
  }

  // Method to get keyword highlights for display
  getHighlights(content: string, searchTerms: string[], maxLength: number = 500): string[] {
    const highlights: string[] = [];
    const lowerContent = content.toLowerCase();

    for (const term of searchTerms) {
      let index = 0;
      while ((index = lowerContent.indexOf(term.toLowerCase(), index)) !== -1) {
        const start = Math.max(0, index - 100);
        const end = Math.min(content.length, index + term.length + 100);
        const highlight = content.substring(start, end);

        highlights.push((start > 0 ? '...' : '') + highlight + (end < content.length ? '...' : ''));

        index += term.length;
        if (highlights.length >= 3) break; // Limit highlights per term
      }
    }

    return highlights.slice(0, 5); // Max 5 highlights total
  }
}

export const advancedKeywordSearchService = new AdvancedKeywordSearchService();

import { SearchOptions, SearchResult } from '@shared/types';

export async function performAdvancedKeywordSearch(
  query: string,
  userId: string,
  documentIds?: number[],
  options: SearchOptions = {},
  agentAliases?: Record<string, string[]>
): Promise<SearchResult[]> {
  console.log(`🔍 ADVANCED KEYWORD SEARCH: Starting search for "${query}" for user ${userId}`);

  try {
    // Get Thai segmentation
    const { ThaiTextProcessor } = await import('./thaiTextProcessor');
    const processor = new ThaiTextProcessor();
    const segmentedQuery = await processor.segmentThaiText(query);
    console.log(`🔍 Thai segmentation result:`, segmentedQuery);

    // Extract individual terms from the segmented text
    let searchTerms = segmentedQuery.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    console.log(`🔍 BM25: Individual terms from Thai segmentation:`, searchTerms);

    // Apply alias expansion if provided (works both ways: key->values and values->key)
    if (agentAliases) {
      console.log(`🔍 BM25: Applying bidirectional alias expansion with ${Object.keys(agentAliases).length} alias groups`);
      const expandedTerms = new Set(searchTerms);

      // Use the already segmented individual terms for alias matching
      const individualTerms = new Set(searchTerms.map(term => term.toLowerCase()));

      console.log(`🔍 BM25: Individual terms for alias matching:`, Array.from(individualTerms));

      // Process each individual term for alias expansion
      for (const term of individualTerms) {
        const lowerTerm = term.toLowerCase();

        // Method 1: Check if this term is a key in aliases (key -> values)
        if (agentAliases[term] || agentAliases[lowerTerm]) {
          const aliasGroup = agentAliases[term] || agentAliases[lowerTerm];
          aliasGroup.forEach(alias => {
            expandedTerms.add(alias.toLowerCase());
            // Also add individual words from multi-word aliases
            const aliasWords = alias.toLowerCase().split(/\s+/).filter(word => word.length > 0);
            aliasWords.forEach(word => expandedTerms.add(word));
          });
          console.log(`🔍 BM25: Expanded key "${term}" with values:`, aliasGroup);
        }

        // Method 2: Check if this term is a value in any alias group (value -> key + other values)
        for (const [key, values] of Object.entries(agentAliases)) {
          const lowerValues = values.map(v => v.toLowerCase());
          const matchFound = lowerValues.includes(lowerTerm) || 
            lowerValues.some(value => value.toLowerCase().split(/\s+/).includes(lowerTerm));

          if (matchFound) {
            // Add the key
            expandedTerms.add(key.toLowerCase());
            // Add all values in this group
            values.forEach(alias => {
              expandedTerms.add(alias.toLowerCase());
              // Also add individual words from multi-word aliases
              const aliasWords = alias.toLowerCase().split(/\s+/).filter(word => word.length > 0);
              aliasWords.forEach(word => expandedTerms.add(word));
            });
            console.log(`🔍 BM25: Found "${term}" as value, expanded with key "${key}" and all values:`, values);
            break; // Found in this group, no need to check others
          }
        }
      }

      searchTerms = Array.from(expandedTerms);
      console.log(`🔍 BM25: Final bidirectionally expanded terms:`, searchTerms);
    }

    console.log(`🔍 BM25: Processing ${searchTerms.length} search terms (with Thai variants):`, searchTerms);

    // Get chunks from database - use the same imports as other functions
    const { db } = await import('../db');
    const { documentVectors } = await import('@shared/schema');
    const { eq, and, or } = await import('drizzle-orm');

    let whereCondition: any = eq(documentVectors.userId, userId);
    if (documentIds && documentIds.length > 0) {
      whereCondition = and(
        eq(documentVectors.userId, userId),
        or(...documentIds.map(id => eq(documentVectors.documentId, id)))
      );
    }

    const chunks = await db.select().from(documentVectors).where(whereCondition);
    console.log(`🔍 ADVANCED KEYWORD: Found ${chunks.length} chunks to search`);

    if (chunks.length === 0) {
      console.log(`🔍 ADVANCED KEYWORD: No chunks found for user ${userId}`);
      return [];
    }

    // Use the advanced keyword search service with proper search terms
    const service = new AdvancedKeywordSearchService();
    const searchTermObjects = searchTerms.map(term => ({
      term: term.toLowerCase(),
      weight: 1.0,
      fuzzy: term.length >= 4,
      source: 'original' as const
    }));

    console.log(`🔍 ADVANCED KEYWORD: Processing ${searchTermObjects.length} search term objects`);
    const chunkScores = service['calculateChunkScores'](chunks, searchTermObjects);

    console.log(`🔍 ADVANCED KEYWORD: Calculated scores for ${chunkScores.length} chunks`);

    // Filter out zero scores first
    const scoredChunks = chunkScores.filter(chunk => chunk.score > 0);
    console.log(`🔍 ADVANCED KEYWORD: ${scoredChunks.length} chunks have positive scores`);

    let totalMatches = 0;
    for (const chunkScore of chunkScores) {
      if (chunkScore.score > 0) {
        totalMatches++;
        console.log(`🔍 KEYWORD MATCH (Advanced): Doc ${chunkScore.documentId} chunk ${chunkScore.chunkIndex + 1} - score: ${chunkScore.score.toFixed(5)} with aliases`);
      }
    }

    console.log(`🔍 KEYWORD SEARCH: Found ${totalMatches} chunks with keyword matches (with aliases) out of ${chunks.length} total chunks`)

  // Display top 5 keyword chunks with matched terms
  if (chunkScores.length > 0) {
    const topKeywordChunks = chunkScores
      .filter(chunk => chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    console.log(`\n🏆 TOP 5 KEYWORD CHUNKS WITH MATCHED TERMS:`);
    topKeywordChunks.forEach((chunk, index) => {
      console.log(`\n${index + 1}. Doc ${chunk.documentId} Chunk ${chunk.chunkIndex + 1} - Score: ${chunk.score.toFixed(5)}`);
      console.log(`   📝 Matched Terms (${chunk.matchedTerms.length}): [${chunk.matchedTerms.join(', ')}]`);
      console.log(`   🔍 Match Details:`);
      chunk.matchDetails.forEach(detail => {
        const fuzzyLabel = detail.fuzzyMatch ? ' (fuzzy)' : ' (exact)';
        console.log(`      - "${detail.term}": score ${detail.score.toFixed(4)}${fuzzyLabel}, positions: [${detail.positions.join(', ')}]`);
      });
      console.log(`   📄 Content Preview: "${chunk.content.substring(0, 150).replace(/\n/g, ' ')}${chunk.content.length > 150 ? '...' : ''}"`);
    });
    console.log(`\n`);
  }

    // Sort by relevance and limit results
    scoredChunks.sort((a, b) => b.score - a.score);
    const limit = options.limit || 20;
    const topChunks = scoredChunks.slice(0, limit);

    if (topChunks.length > 0) {
      console.log(`🔍 ADVANCED KEYWORD: Top 3 scoring chunks:`);
      topChunks.slice(0, 3).forEach((chunk, i) => {
        console.log(`  ${i + 1}. Doc ${chunk.documentId}, Chunk ${chunk.chunkIndex}, Score: ${chunk.score.toFixed(4)}`);
      });
    }

    // Get document metadata for the top chunks
    const { storage } = await import('../storage');
    const documents = await storage.getDocuments(userId);
    const docMap = new Map(documents.map(doc => [doc.id, doc]));

    // Format results
    const results: SearchResult[] = [];

    topChunks
        .filter(chunk => chunk.score > (options.threshold || 0.1))
        .forEach(chunkScore => {
          const document = docMap.get(chunkScore.documentId);
          if (!document) return;

          // Use consistent chunk ID format: docId-chunkIndex
          const chunkId = `${chunkScore.documentId}-${chunkScore.chunkIndex}`;
          const chunkLabel = `(Chunk ${chunkScore.chunkIndex + 1})`;
          const documentName = document.name || `Document ${chunkScore.documentId}`;

          results.push({
            id: chunkId, // Use consistent chunk ID format
            name: `${documentName} ${chunkLabel}`,
            content: chunkScore.content,
            summary: chunkScore.content.slice(0, 200) + "...",
            aiCategory: document.aiCategory ?? null,
            aiCategoryColor: document.aiCategoryColor ?? null,
            similarity: Math.min(chunkScore.score / 10, 1.0), // Normalize to 0-1
            createdAt: document.createdAt?.toISOString() ?? new Date().toISOString(),
            categoryId: document.categoryId ?? null,
            tags: document.tags ?? null,
            fileSize: document.fileSize ?? null,
            mimeType: document.mimeType ?? null,
            isFavorite: document.isFavorite ?? null,
            updatedAt: document.updatedAt?.toISOString() ?? null,
            userId: document.userId ?? userId
          });
        });

    console.log(`🔍 ADVANCED KEYWORD SEARCH: Returning ${results.length} results with alias expansion`);
    return results;

  } catch (error) {
    console.error('❌ performAdvancedKeywordSearch error:', error);
    return [];
  }
}