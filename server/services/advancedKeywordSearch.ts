import { storage } from '../storage';

interface SearchTerm {
  term: string;
  weight: number;
  fuzzy?: boolean;
}

interface DocumentScore {
  documentId: number;
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
    // English stop words
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    
    // Thai stop words
    'ที่', 'และ', 'หรือ', 'แต่', 'ใน', 'บน', 'เพื่อ', 'ของ', 'กับ', 'โดย', 'ได้', 
    'เป็น', 'มี', 'จาก', 'ไป', 'มา', 'ก็', 'จะ', 'ถึง', 'ให้', 'ยัง', 'คือ', 'ว่า',
    'นี้', 'นั้น', 'นะ', 'ครับ', 'ค่ะ', 'คะ', 'ไหม', 'มั้ย', 'อะไร', 'เมื่อไหร่', 'ที่ไหน',
    'ทำไม', 'อย่างไร', 'ใคร', 'ขอ', 'ช่วย', 'บอก', 'ดู', 'อยู่', 'เอา', 'ลอง', 'ให้',
    'หา', 'ต้อง', 'อยาก', 'ไม่', 'ไม่ได้', 'ไม่มี', 'แล้ว', 'เลย', 'เดี๋ยว', 'เอง'
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
      // Get all documents for the user
      let documents = await storage.getDocuments(userId);
      console.log(`Advanced keyword search: Found ${documents.length} total documents for user ${userId}`);

      // Filter by specific document IDs if provided
      if (specificDocumentIds && specificDocumentIds.length > 0) {
        documents = documents.filter(doc => specificDocumentIds.includes(doc.id));
        console.log(`Advanced keyword search: Filtered to ${documents.length} documents from specific IDs: [${specificDocumentIds.join(', ')}]`);
      }

      // Parse and analyze query
      console.log(`Advanced keyword search for: "${query}"`);
      const searchTerms = this.parseQuery(query);
      console.log(`Parsed search terms:`, searchTerms.map(t => `${t.term}(${t.weight}${t.fuzzy ? ',fuzzy' : ''})`));
      
      // Debug: Show what we're actually searching for
      const significantTerms = searchTerms.filter(t => t.weight >= 1.0).map(t => t.term);
      console.log(`Significant search terms: [${significantTerms.join(', ')}]`);

      // Calculate document scores
      const documentScores = this.calculateDocumentScores(documents, searchTerms);

      // Sort by relevance and limit results
      documentScores.sort((a, b) => b.score - a.score);
      const topDocuments = documentScores.slice(0, limit);

      // Format results
      const results = topDocuments
        .filter(doc => doc.score > 0.1) // Minimum relevance threshold
        .map(docScore => {
          const document = documents.find(d => d.id === docScore.documentId)!;

          return {
            id: document.id,
            name: document.name,
            content: document.content || '',
            summary: document.summary,
            aiCategory: document.aiCategory,
            similarity: Math.min(docScore.score / 10, 1.0), // Normalize to 0-1
            createdAt: document.createdAt.toISOString(),
            matchedTerms: docScore.matchedTerms,
            matchDetails: docScore.matchDetails
          };
        });

      console.log(`Advanced keyword search returned ${results.length} results`);
      return results;

    } catch (error) {
      console.error('Advanced keyword search error:', error);
      throw new Error('Advanced keyword search failed');
    }
  }

  private parseQuery(query: string): SearchTerm[] {
    const terms: SearchTerm[] = [];

    // Handle quoted phrases first
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

    // Improved tokenization for Thai and English text
    const individualTerms = remainingQuery
      .toLowerCase()
      // Split on spaces, punctuation, and Thai sentence boundaries
      .split(/[\s\-_,\.!?\(\)\[\]]+|(?=[ๆ])|(?<=[ๆ])|(?=[ไม่])|(?<=[ไม่])/)
      .map(term => term.trim())
      .filter(term => term.length > 0)
      // Further split Thai compound words and filter stop words
      .flatMap(term => {
        // Split on common Thai particles and connectors
        const subTerms = term.split(/(?=[หรือ])|(?<=[หรือ])|(?=[ที่])|(?<=[ที่])|(?=[จาก])|(?<=[จาก])|(?=[ของ])|(?<=[ของ])/)
          .map(subTerm => subTerm.trim())
          .filter(subTerm => subTerm.length > 0 && !this.stopWords.has(subTerm));
        
        return subTerms.length > 0 ? subTerms : [term];
      })
      .filter(term => term.length > 1 && !this.stopWords.has(term))
      .filter(term => term.length > 0);

    // Remove duplicates while preserving order
    const uniqueTerms = [...new Set(individualTerms)];

    // Add individual terms with appropriate weights
    uniqueTerms.forEach(term => {
      // Higher weight for brand names and location names
      let weight = 1.0;
      if (['xolo', 'เดอะมอล', 'บางกะปิ', 'bangkapi', 'mall'].includes(term.toLowerCase())) {
        weight = 1.5; // Brand and location boost
      } else if (term.length >= 3) {
        weight = 1.0;
      } else {
        weight = 0.7;
      }
      
      const fuzzy = term.length >= 4 && !['xolo'].includes(term.toLowerCase()); // No fuzzy for exact brand names
      terms.push({ term, weight, fuzzy });
    });

    return terms;
  }

  private calculateDocumentScores(documents: any[], searchTerms: SearchTerm[]): DocumentScore[] {
    const documentScores: DocumentScore[] = [];

    // Calculate IDF for each search term
    const termIDF = this.calculateIDF(documents, searchTerms);

    for (const document of documents) {
      const docText = this.extractDocumentText(document);
      const docTokens = this.tokenizeText(docText);

      const docScore: DocumentScore = {
        documentId: document.id,
        score: 0,
        matchedTerms: [],
        matchDetails: []
      };

      // Calculate TF-IDF score for each search term
      for (const searchTerm of searchTerms) {
        const termScore = this.calculateTermScore(
          searchTerm,
          docText,
          docTokens,
          termIDF.get(searchTerm.term) || 1.0
        );

        if (termScore.score > 0) {
          docScore.score += termScore.score * searchTerm.weight;
          docScore.matchedTerms.push(searchTerm.term);
          docScore.matchDetails.push({
            term: searchTerm.term,
            score: termScore.score,
            positions: termScore.positions,
            fuzzyMatch: termScore.fuzzyMatch
          });
        }
      }

      // Apply document-level boosters
      docScore.score = this.applyDocumentBoosters(document, docScore.score, searchTerms);

      if (docScore.score > 0) {
        documentScores.push(docScore);
      }
    }

    return documentScores;
  }

  private extractDocumentText(document: any): string {
    return [
      document.name || '',
      document.summary || '',
      document.content || '',
      ...(document.tags || [])
    ].join(' ').toLowerCase();
  }

  private tokenizeText(text: string): string[] {
    return text
      .split(/[\s\-_,\.!?\(\)\[\]]+/)
      .map(token => token.trim().toLowerCase())
      .filter(token => token.length > 0);
  }

  private calculateIDF(documents: any[], searchTerms: SearchTerm[]): Map<string, number> {
    const termIDF = new Map<string, number>();
    const totalDocs = documents.length;

    for (const searchTerm of searchTerms) {
      let docsWithTerm = 0;

      for (const document of documents) {
        const docText = this.extractDocumentText(document);
        if (this.termExistsInDocument(searchTerm.term, docText, searchTerm.fuzzy)) {
          docsWithTerm++;
        }
      }

      const idf = docsWithTerm > 0 ? Math.log(totalDocs / docsWithTerm) : 1.0;
      termIDF.set(searchTerm.term, idf);
    }

    return termIDF;
  }

  private calculateTermScore(
    searchTerm: SearchTerm,
    docText: string,
    docTokens: string[],
    idf: number
  ): { score: number; positions: number[]; fuzzyMatch?: boolean } {
    const term = searchTerm.term.toLowerCase();
    const positions: number[] = [];
    let exactMatches = 0;
    let fuzzyMatches = 0;

    // Check for exact matches
    let index = 0;
    while ((index = docText.indexOf(term, index)) !== -1) {
      positions.push(index);
      exactMatches++;
      index += term.length;
    }

    // Check for fuzzy matches if enabled and no exact matches
    let fuzzyMatch = false;
    if (searchTerm.fuzzy && exactMatches === 0) {
      for (let i = 0; i < docTokens.length; i++) {
        const token = docTokens[i];
        if (this.isFuzzyMatch(term, token)) {
          fuzzyMatches++;
          fuzzyMatch = true;
          // Find position in original text
          const tokenIndex = docText.indexOf(token, i > 0 ? positions[positions.length - 1] || 0 : 0);
          if (tokenIndex !== -1) {
            positions.push(tokenIndex);
          }
        }
      }
    }

    // Calculate TF (term frequency)
    const totalMatches = exactMatches + (fuzzyMatches * 0.7); // Fuzzy matches get lower weight
    const tf = totalMatches / Math.max(docTokens.length, 1);

    // Calculate TF-IDF score
    const score = tf * idf;

    return { score, positions, fuzzyMatch };
  }

  private termExistsInDocument(term: string, docText: string, fuzzy?: boolean): boolean {
    // Check exact match first
    if (docText.includes(term.toLowerCase())) {
      return true;
    }

    // Check fuzzy match if enabled
    if (fuzzy) {
      const tokens = this.tokenizeText(docText);
      return tokens.some(token => this.isFuzzyMatch(term, token));
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

  private applyDocumentBoosters(document: any, baseScore: number, searchTerms: SearchTerm[]): number {
    let boostedScore = baseScore;

    // Boost if terms appear in title
    const titleText = (document.name || '').toLowerCase();
    for (const searchTerm of searchTerms) {
      if (titleText.includes(searchTerm.term.toLowerCase())) {
        boostedScore *= 1.5; // 50% boost for title matches
      }
    }

    // Boost recent documents slightly
    const daysSinceCreated = (Date.now() - new Date(document.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(0.1, 1.0 - (daysSinceCreated / 365)); // Decay over a year
    boostedScore *= (1.0 + recencyBoost * 0.2); // Up to 20% boost for recent docs

    // Boost documents with summary (likely better quality)
    if (document.summary && document.summary.length > 50) {
      boostedScore *= 1.1; // 10% boost for documents with good summaries
    }

    return boostedScore;
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