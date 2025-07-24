import { storage } from '../storage';

interface SearchResult {
  id: number;
  name: string;
  content: string;
  summary?: string | null;
  aiCategory?: string | null;
  similarity: number;
  createdAt: string;
  matchedTerms: string[];
  matchDetails: any;
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
  ): Promise<SearchResult[]> {
    try {
      console.log(`Simple keyword search for: "${query}"`);

      // Get all documents for the user
      let documents = await storage.getDocuments(userId);
      console.log(`Found ${documents.length} total documents for user ${userId}`);

      // Filter by specific document IDs if provided
      if (specificDocumentIds && specificDocumentIds.length > 0) {
        documents = documents.filter(doc => specificDocumentIds.includes(doc.id));
        console.log(`Filtered to ${documents.length} documents from specific IDs: [${specificDocumentIds.join(', ')}]`);
      }

      // Parse query into search terms
      const searchTerms = this.parseQuery(query);
      console.log(`Search terms: [${searchTerms.join(', ')}]`);

      // Search through documents
      const results: SearchResult[] = [];

      for (const document of documents) {
        const documentText = this.extractDocumentText(document);
        const matches = this.findMatches(documentText, searchTerms);

        if (matches.matchedTerms.length > 0) {
          // Calculate simple similarity score based on number of matched terms
          const similarity = matches.matchedTerms.length / searchTerms.length;

          results.push({
            id: document.id,
            name: document.name,
            content: matches.relevantContent,
            summary: document.summary,
            aiCategory: document.aiCategory,
            similarity: similarity,
            createdAt: document.createdAt.toISOString(),
            matchedTerms: matches.matchedTerms,
            matchDetails: matches.matchDetails
          });
        }
      }

      // Sort by similarity (highest first) and limit results
      results.sort((a, b) => b.similarity - a.similarity);
      const limitedResults = results.slice(0, limit);

      console.log(`Simple keyword search returned ${limitedResults.length} results`);
      return limitedResults;

    } catch (error) {
      console.error('Simple keyword search error:', error);
      throw new Error('Simple keyword search failed');
    }
  }

  private parseQuery(query: string): string[] {
    // Handle quoted phrases first
    const quotedPhrases: string[] = [];
    const quotedMatches = query.match(/"([^"]+)"/g);
    let remainingQuery = query;

    if (quotedMatches) {
      quotedMatches.forEach(phrase => {
        const cleanPhrase = phrase.replace(/"/g, '').trim();
        if (cleanPhrase.length > 0) {
          quotedPhrases.push(cleanPhrase);
        }
        remainingQuery = remainingQuery.replace(phrase, '');
      });
    }

    // Split remaining query into individual terms
    const individualTerms = remainingQuery
      .toLowerCase()
      .split(/\s+/)
      .map(term => term.trim())
      .filter(term => term.length > 1)
      .filter(term => !this.stopWords.has(term));

    // Combine quoted phrases and individual terms
    const allTerms = [...quotedPhrases, ...individualTerms];

    // Remove duplicates
    return [...new Set(allTerms)];
  }

  private extractDocumentText(document: any): string {
    const name = document.name || '';
    const summary = document.summary || '';
    const content = document.content || '';
    const tags = (document.tags || []).join(' ');

    return [name, summary, content, tags].join(' ').toLowerCase();
  }

  private findMatches(documentText: string, searchTerms: string[]): {
    matchedTerms: string[];
    matchDetails: any[];
    relevantContent: string;
  } {
    const matchedTerms: string[] = [];
    const matchDetails: any[] = [];
    const matchPositions: number[] = [];

    // Find all matches
    for (const term of searchTerms) {
      const termLower = term.toLowerCase();
      let index = 0;
      let termMatches = 0;

      while ((index = documentText.indexOf(termLower, index)) !== -1) {
        matchPositions.push(index);
        termMatches++;
        index += termLower.length;
      }

      if (termMatches > 0) {
        matchedTerms.push(term);
        matchDetails.push({
          term: term,
          count: termMatches,
          positions: matchPositions.slice(-10) // Keep last 10 positions for this term
        });
      }
    }

    // Extract relevant content around matches
    let relevantContent = '';
    if (matchPositions.length > 0) {
      // Sort positions and get content around first few matches
      matchPositions.sort((a, b) => a - b);
      const uniquePositions = [...new Set(matchPositions)].slice(0, 3); // Max 3 snippets

      const contentSnippets: string[] = [];
      for (const position of uniquePositions) {
        const start = Math.max(0, position - 200);
        const end = Math.min(documentText.length, position + 300);
        const snippet = documentText.substring(start, end);
        contentSnippets.push((start > 0 ? '...' : '') + snippet + (end < documentText.length ? '...' : ''));
      }

      relevantContent = contentSnippets.join('\n\n');
    } else {
      // If no matches, return first 500 characters
      relevantContent = documentText.substring(0, 500) + (documentText.length > 500 ? '...' : '');
    }

    return {
      matchedTerms,
      matchDetails,
      relevantContent
    };
  }

  // Method to get keyword highlights for display
  getHighlights(content: string, searchTerms: string[], maxLength: number = 500): string[] {
    const highlights: string[] = [];
    const lowerContent = content.toLowerCase();

    for (const term of searchTerms) {
      let index = 0;
      while ((index = lowerContent.indexOf(term.toLowerCase(), index)) !== -1) {
        const start = Math.max(0, index - 200);
        const end = Math.min(content.length, index + term.length + 200);
        const highlight = content.substring(start, end);

        highlights.push((start > 0 ? '...' : '') + highlight + (end < content.length ? '...' : ''));

        index += term.length;
        if (highlights.length >= 3) break; // Limit highlights per term
      }
    }

    return highlights.slice(0, 5); // Max 5 highlights total
  }

  // Method to get chunks from search results
  getChunksFromResults(results: SearchResult[]): string[] {
    return results.map(result => result.content).slice(0, 5); // Max 5 chunks total
  }
}

export const advancedKeywordSearchService = new AdvancedKeywordSearchService();