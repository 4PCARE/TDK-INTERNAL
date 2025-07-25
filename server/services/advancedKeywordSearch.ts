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
          // Since chunks are already filtered by document IDs in DB query, document should always exist
          // But add fallback just in case
          if (!document) {
            console.warn(`Document ID ${chunkScore.documentId} not found in docMap - using chunk data directly`);
            // Create result directly from chunk if document metadata is missing
            const existingResult = documentResults.get(chunkScore.documentId);
            if (!existingResult || chunkScore.score > existingResult.similarity) {
              documentResults.set(chunkScore.documentId, {
                id: chunkScore.documentId,
                name: `Document ${chunkScore.documentId}`,
                content: chunkScore.content,
                summary: null,
                aiCategory: null,
                similarity: Math.min(chunkScore.score / 10, 1.0),
                createdAt: new Date().toISOString(),
                matchedTerms: chunkScore.matchedTerms,
                matchDetails: chunkScore.matchDetails
              });
            }
            return;
          }

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

    // Check for exact matches
    let index = 0;
    while ((index = chunkText.indexOf(term, index)) !== -1) {
      positions.push(index);
      exactMatches++;
      index += term.length;
    }

    // Check for fuzzy matches if enabled and no exact matches
    let fuzzyMatch = false;
    if (searchTerm.fuzzy && exactMatches === 0) {
      for (let i = 0; i < chunkTokens.length; i++) {
        const token = chunkTokens[i];
        if (this.isFuzzyMatch(term, token)) {
          fuzzyMatches++;
          fuzzyMatch = true;
          // Find position in original text
          const tokenIndex = chunkText.indexOf(token, i > 0 ? positions[positions.length - 1] || 0 : 0);
          if (tokenIndex !== -1) {
            positions.push(tokenIndex);
          }
        }
      }
    }

    // Calculate TF (term frequency)
    const totalMatches = exactMatches + (fuzzyMatches * 0.7); // Fuzzy matches get lower weight
    const tf = totalMatches / Math.max(chunkTokens.length, 1);

    // Calculate TF-IDF score
    const score = tf * idf;

    return { score, positions, fuzzyMatch };
  }

  private termExistsInText(term: string, text: string, fuzzy?: boolean): boolean {
    const lowerTerm = term.toLowerCase();
    const lowerText = text.toLowerCase();
    
    // Check exact match first (case insensitive)
    if (lowerText.includes(lowerTerm)) {
      return true;
    }

    // Check fuzzy match if enabled
    if (fuzzy) {
      const tokens = this.tokenizeText(lowerText);
      return tokens.some(token => this.isFuzzyMatch(lowerTerm, token));
    }

    return false;
  }

  private isFuzzyMatch(term1: string, term2: string): boolean {
    if (Math.abs(term1.length - term2.length) > 2) {
      return false;
    }

    const distance = this.levenshteinDistance(term1, term2);
    const maxLength = Math.max(term1.length, term2.length);
    const similarity = (maxLength - distance) / maxLength;

    return similarity >= 0.8; // 80% similarity threshold
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
      interface EnhancedSearchTerm {
        keyword: string;
        weight: number;
        type: 'original' | 'contextual';
      }

      // Get AI keyword expansion
      console.log(`Getting AI keyword expansion for: "${query}"`);
      const expansionResult = await aiKeywordExpansionService.getExpandedSearchTerms(query, chatHistory);

      console.log(`AI Expansion Result:`, {
        original: expansionResult.original,
        expanded: expansionResult.expanded,
        isContextual: expansionResult.isContextual,
        confidence: expansionResult.confidence
      });

      // Create enhanced search terms combining original and AI-expanded
      const originalTerms: EnhancedSearchTerm[] = this.parseQuery(query).map(term => ({
        keyword: term.term,
        weight: term.weight,
        type: 'original' as const
      }));

      const contextualTerms: EnhancedSearchTerm[] = expansionResult.expanded
        .filter(keyword => !originalTerms.some(ot => ot.keyword.toLowerCase() === keyword.toLowerCase()))
        .map(keyword => ({
          keyword: keyword,
          weight: expansionResult.isContextual ? 0.8 : 0.6, // Higher weight if contextual
          type: 'contextual' as const
        }));

      const enhancedTerms: EnhancedSearchTerm[] = [...originalTerms, ...contextualTerms];

      console.log(`Enhanced search terms: [${enhancedTerms.map(t => `${t.keyword}(${t.weight}, ${t.type})`).join(', ')}]`);
    console.log(`Search terms breakdown:`, {
      original: enhancedTerms.filter(t => t.type === 'original').map(t => t.keyword),
      expanded: enhancedTerms.filter(t => t.type === 'contextual').map(t => t.keyword),
      totalTerms: enhancedTerms.length
    });

      // Get document chunks from document_vectors table
      let allChunks = await db.select()
        .from(documentVectors)
        .where(eq(documentVectors.userId, userId));
    
      if (specificDocumentIds && specificDocumentIds.length > 0) {
          allChunks = allChunks.filter(chunk => specificDocumentIds.includes(chunk.documentId));
      }

      console.log(`AI-enhanced keyword search: Found ${allChunks.length} chunks for user ${userId}`);

      if (allChunks.length === 0) {
        return [];
      }

    // Score each chunk
    const scoredChunks = allChunks.map((chunk, index) => {
      const { score, matchedTerms } = this.calculateKeywordScore(chunk.content, enhancedTerms);

      if (index < 5) { // Log first 5 chunks for debugging
        console.log(`Chunk ${index + 1} from doc ${chunk.documentId}:`);
        console.log(`  Score: ${score.toFixed(4)}, Matched: [${matchedTerms.join(', ')}]`);
        console.log(`  Content preview: ${chunk.content.substring(0, 150)}...`);
        console.log(`  Contains OPPO: ${chunk.content.toLowerCase().includes('oppo')}`);
        console.log(`  Contains ท่าพระ: ${chunk.content.toLowerCase().includes('ท่าพระ')}`);
      }

      return {
        id: chunk.documentId,
        name: '', // Will be filled later
        content: chunk.content,
        similarity: score,
        matchedTerms,
        aiKeywordExpansion: expansionResult
      };
    });

    // Filter and sort results with lower threshold
    const filteredResults = scoredChunks
      .filter(result => result.similarity > 0.05) // Lower minimum threshold
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    console.log(`Advanced keyword search: Filtered ${filteredResults.length} results above threshold 0.05`);
    console.log(`Top 5 scores:`, 
      scoredChunks.slice(0, 5).map(r => ({ 
        docId: r.id, 
        score: r.similarity.toFixed(3),
        matchedTerms: r.matchedTerms,
        preview: r.content.substring(0, 100) + '...'
      }))
    );

    if (filteredResults.length === 0) {
      console.log(`❌ No results found above similarity threshold 0.05`);
      console.log(`All keyword scores:`, 
        scoredChunks.slice(0, 10).map(r => ({ 
          docId: r.id, 
          score: r.similarity.toFixed(4),
          matchedTerms: r.matchedTerms?.length || 0,
          hasOPPO: r.content.toLowerCase().includes('oppo'),
          hasThapha: r.content.toLowerCase().includes('ท่าพระ'),
          hasMall: r.content.toLowerCase().includes('เดอะมอลล์')
        }))
      );
    }

    // Get document metadata for the top chunks
    const documents = await storage.getDocuments(userId);
    const docMap = new Map(documents.map(doc => [doc.id, doc]));

    // Format results - aggregate chunks by document and take the best chunk per document
    const documentResults = new Map<number, any>();

    filteredResults.forEach(scoredChunk => {
      const document = docMap.get(scoredChunk.id);

      if (!document) {
        console.warn(`Document ID ${scoredChunk.id} not found in docMap - using chunk data directly`);

        documentResults.set(scoredChunk.id, {
          id: scoredChunk.id,
          name: `Document ${scoredChunk.id}`,
          content: scoredChunk.content,
          summary: null,
          aiCategory: null,
          similarity: scoredChunk.similarity,
          createdAt: new Date().toISOString(),
          matchedTerms: scoredChunk.matchedTerms,
          matchDetails: [], // No match details available
          aiKeywordExpansion: scoredChunk.aiKeywordExpansion
        });
        return;
      }

      documentResults.set(scoredChunk.id, {
        id: document.id,
        name: document.name,
        content: scoredChunk.content,
        summary: document.summary,
        aiCategory: document.aiCategory,
        similarity: scoredChunk.similarity,
        createdAt: document.createdAt.toISOString(),
        matchedTerms: scoredChunk.matchedTerms,
        matchDetails: [], // No match details available
        aiKeywordExpansion: scoredChunk.aiKeywordExpansion
      });
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

  private calculateKeywordScore(content: string, searchTerms: EnhancedSearchTerm[]): { score: number; matchedTerms: string[] } {
    const lowerContent = content.toLowerCase();
    let totalScore = 0;
    const matchedTerms: string[] = [];
    let totalPossibleScore = 0;

    for (const term of searchTerms) {
      const keyword = term.keyword.toLowerCase();
      totalPossibleScore += term.weight;

      // Special handling for brand names like OPPO
      let matches = 0;
      
      // For OPPO, also check for "oppo brand shop", "oppo shop", etc.
      if (keyword === 'oppo' || keyword === 'ออปโป้') {
        const brandVariations = [
          'oppo brand shop',
          'oppo shop', 
          'oppo store',
          'ออปโป้',
          'oppo'
        ];
        
        for (const variation of brandVariations) {
          const variationMatches = lowerContent.split(variation).length - 1;
          if (variationMatches > 0) {
            matches += variationMatches;
            console.log(`Found OPPO variation "${variation}": ${variationMatches} times`);
          }
        }
      } else {
        // Try exact match first (case insensitive)
        const exactRegex = new RegExp(`\\b${this.escapeRegExp(keyword)}\\b`, 'gi');
        const exactMatches = (lowerContent.match(exactRegex) || []).length;

        if (exactMatches > 0) {
          matches = exactMatches;
        } else {
          // Try partial match for Thai text and compound words (case insensitive)
          const partialRegex = new RegExp(this.escapeRegExp(keyword), 'gi');
          const partialMatches = (lowerContent.match(partialRegex) || []).length;
          if (partialMatches > 0) {
            matches = partialMatches * 0.8; // Partial match gets 80% weight
          }
        }

        // Also try simple substring match for better coverage (case insensitive)
        if (matches === 0) {
          const substringMatches = lowerContent.split(keyword).length - 1;
          if (substringMatches > 0) {
            matches = substringMatches * 0.6; // Substring match gets 60% weight
          }
        }
      }

      if (matches > 0) {
        // Apply term weight and frequency bonus
        const termScore = term.weight * Math.min(1 + Math.log(matches + 1) * 0.3, 2.0);
        totalScore += termScore;
        matchedTerms.push(term.keyword);

        console.log(`Keyword "${keyword}" found ${matches} times, term score: ${termScore.toFixed(3)}, weight: ${term.weight}`);
      }
    }

    // Calculate score as percentage of maximum possible score
    const normalizedScore = totalPossibleScore > 0 ? totalScore / totalPossibleScore : 0;

    console.log(`Total score: ${totalScore.toFixed(3)}, Max possible: ${totalPossibleScore.toFixed(3)}, Normalized: ${normalizedScore.toFixed(3)}`);

    return {
      score: Math.min(normalizedScore, 1.0), // Cap at 1.0
      matchedTerms
    };
  }

  // Method to get keyword highlights for display
  getHighlights(content: string, searchTerms: string[], maxLength: number = 500): string[] {
    const highlights: string[] = [];
    const lowerContent = content.toLowerCase();

    for (const term of searchTerms) {
      const lowerTerm = term.toLowerCase();
      let index = 0;
      while ((index = lowerContent.indexOf(lowerTerm, index)) !== -1) {
        const start = Math.max(0, index - 100);
        const end = Math.min(content.length, index + lowerTerm.length + 100);
        const highlight = content.substring(start, end);

        highlights.push((start > 0 ? '...' : '') + highlight + (end < content.length ? '...' : ''));

        index += lowerTerm.length;
        if (highlights.length >= 3) break; // Limit highlights per term
      }
    }

    return highlights.slice(0, 5); // Max 5 highlights total
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
  }
}

export const advancedKeywordSearchService = new AdvancedKeywordSearchService();