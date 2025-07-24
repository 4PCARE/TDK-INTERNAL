
import { storage } from '../storage';

interface SearchTerm {
  term: string;
  weight: number;
}

interface ChunkScore {
  documentId: number;
  chunkIndex: number;
  chunkContent: string;
  score: number;
  matchedTerms: string[];
  matchDetails: Array<{
    term: string;
    score: number;
    positions: number[];
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

  private chunkSize = 3000; // Characters per chunk
  private chunkOverlap = 300; // Overlap between chunks

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
      console.log(`Parsed search terms:`, searchTerms.map(t => t.term));

      // Debug: Show what we're actually searching for
      const significantTerms = searchTerms.filter(t => t.weight >= 1.0).map(t => t.term);
      console.log(`🔑 Keywords: [${significantTerms.join(', ')}]`);

      // Calculate chunk scores using chunk-level search
      const chunkScores = this.calculateChunkScores(documents, searchTerms);

      // Sort by relevance and limit results
      chunkScores.sort((a, b) => b.score - a.score);
      const topChunks = chunkScores.slice(0, limit);

      // Format results as chunks (similar to vector search results)
      const results = topChunks
        .filter(chunk => chunk.score > 0) // Only return chunks with matches
        .map(chunkScore => {
          const document = documents.find(d => d.id === chunkScore.documentId)!;

          return {
            id: document.id,
            name: document.name,
            content: chunkScore.chunkContent,
            summary: document.summary,
            aiCategory: document.aiCategory,
            similarity: Math.min(chunkScore.score / 10, 1.0), // Normalize to 0-1
            createdAt: document.createdAt.toISOString(),
            matchedTerms: chunkScore.matchedTerms,
            matchDetails: chunkScore.matchDetails
          };
        });

      console.log(`Advanced keyword search returned ${results.length} chunk results`);
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

    // Simple space-based tokenization to preserve keywords from query augmentation
    const individualTerms = remainingQuery
      .toLowerCase()
      .split(/\s+/) // Only split on spaces
      .map(term => term.trim())
      .filter(term => term.length > 0)
      .filter(term => !this.stopWords.has(term)) // Remove stop words
      .filter(term => term.length > 1); // Remove single characters

    // Remove duplicates while preserving order
    const uniqueTerms = [...new Set(individualTerms)];

    // Add individual terms with appropriate weights
    uniqueTerms.forEach(term => {
      // Higher weight for brand names and location names
      let weight = 1.0;
      if (['xolo', 'เดอะมอล', 'บางกะปิ', 'เดอะมอลบางกะปิ', 'bangkapi', 'mall', 'ร้าน', 'ร้านค้า', 'สินค้า', 'บริการ'].includes(term.toLowerCase())) {
        weight = 2.0; // Brand and location boost
      } else if (term.length >= 3) {
        weight = 1.0;
      } else {
        weight = 0.5; // Lower weight for short fragments
      }

      terms.push({ term, weight });
    });

    return terms;
  }

  private calculateChunkScores(documents: any[], searchTerms: SearchTerm[]): ChunkScore[] {
    const chunkScores: ChunkScore[] = [];

    console.log(`📚 Calculating chunk scores for ${documents.length} documents`);
    console.log(`🔍 Search terms: ${searchTerms.map(t => `"${t.term}" (weight: ${t.weight})`).join(', ')}`);

    for (const document of documents) {
      const docText = this.extractDocumentText(document);
      
      console.log(`\n📄 Processing document ID: ${document.id}, Name: "${document.name}"`);
      console.log(`📝 Extracted text length: ${docText.length} characters`);

      // Split document into chunks
      const chunks = this.createChunks(docText);
      console.log(`📦 Created ${chunks.length} chunks for document ${document.id}`);

      // Score each chunk
      chunks.forEach((chunk, chunkIndex) => {
        const chunkScore: ChunkScore = {
          documentId: document.id,
          chunkIndex,
          chunkContent: chunk,
          score: 0,
          matchedTerms: [],
          matchDetails: []
        };

        // Calculate simple match score for each search term in this chunk
        for (const searchTerm of searchTerms) {
          const termScore = this.calculateTermScore(searchTerm, chunk);

          if (termScore.score > 0) {
            chunkScore.score += termScore.score * searchTerm.weight;
            chunkScore.matchedTerms.push(searchTerm.term);
            chunkScore.matchDetails.push({
              term: searchTerm.term,
              score: termScore.score,
              positions: termScore.positions
            });
            console.log(`✅ Chunk ${chunkIndex}: Term "${searchTerm.term}" contributed score: ${termScore.score * searchTerm.weight}`);
          }
        }

        // Apply chunk-level boosters
        const originalScore = chunkScore.score;
        chunkScore.score = this.applyChunkBoosters(document, chunk, chunkScore.score, searchTerms);

        console.log(`📊 Document ${document.id}, Chunk ${chunkIndex} final score: ${chunkScore.score.toFixed(4)} (original: ${originalScore.toFixed(4)})`);

        if (chunkScore.score > 0) {
          chunkScores.push(chunkScore);
          console.log(`✅ Chunk ${chunkIndex} from Document ${document.id} added to results`);
        }
      });
    }

    console.log(`\n📊 Total chunks with scores > 0: ${chunkScores.length}`);
    return chunkScores;
  }

  private createChunks(text: string): string[] {
    const chunks: string[] = [];
    const textLength = text.length;
    
    if (textLength <= this.chunkSize) {
      return [text];
    }

    let start = 0;
    while (start < textLength) {
      let end = Math.min(start + this.chunkSize, textLength);
      
      // Try to break at word boundary if we're not at the end
      if (end < textLength) {
        const lastSpace = text.lastIndexOf(' ', end);
        if (lastSpace > start + this.chunkSize * 0.8) {
          end = lastSpace;
        }
      }
      
      chunks.push(text.substring(start, end));
      start = end - this.chunkOverlap;
      
      // Prevent infinite loop
      if (start >= end) {
        start = end;
      }
    }

    return chunks;
  }

  private extractDocumentText(document: any): string {
    const parts = [
      document.name || '',
      document.summary || '',
      document.content || '',
      ...(document.tags || [])
    ];

    const text = parts.join(' ').toLowerCase();

    console.log(`📄 Document ${document.id} text extraction:`);
    console.log(`   Name: "${document.name || 'N/A'}"`);
    console.log(`   Summary: "${(document.summary || 'N/A').substring(0, 100)}${(document.summary || '').length > 100 ? '...' : ''}"`);
    console.log(`   Content length: ${(document.content || '').length} chars`);
    console.log(`   Tags: [${(document.tags || []).join(', ')}]`);
    console.log(`   Combined text length: ${text.length} chars`);

    return text;
  }

  private calculateTermScore(
    searchTerm: SearchTerm,
    chunkText: string
  ): { score: number; positions: number[] } {
    const term = searchTerm.term.toLowerCase();
    const lowerChunkText = chunkText.toLowerCase();
    const positions: number[] = [];
    let matchCount = 0;

    console.log(`🔍 Calculating term score for: "${term}" in chunk (${chunkText.length} chars)`);

    // Simple case-insensitive string matching
    let index = 0;
    while ((index = lowerChunkText.indexOf(term, index)) !== -1) {
      positions.push(index);
      matchCount++;
      
      console.log(`✅ Found "${term}" at position ${index} in chunk`);
      
      index += term.length;
    }

    console.log(`📊 Term "${term}": ${matchCount} exact matches found in chunk`);

    // Simple scoring: number of matches
    const score = matchCount;

    console.log(`📈 Term "${term}": Chunk Score=${score}`);

    return { score, positions };
  }

  private applyChunkBoosters(document: any, chunk: string, baseScore: number, searchTerms: SearchTerm[]): number {
    let boostedScore = baseScore;

    // Boost if terms appear in document title (even though this is chunk-level search)
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

    // Boost chunks with higher keyword density
    const chunkLength = chunk.length;
    const keywordDensity = baseScore / chunkLength * 1000; // Keywords per 1000 characters
    if (keywordDensity > 5) {
      boostedScore *= 1.2; // 20% boost for high keyword density
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

  // Method to get chunks from search results - now returns the actual chunk content
  getChunksFromResults(results: Array<{
    content: string; // This is now chunk content, not full document content
    matchDetails: Array<{
      term: string;
    }>;
  }>): string[] {
    // Since results now contain chunk content directly, just return the content
    return results.map(result => result.content).slice(0, 5); // Max 5 chunks total
  }
}

export const advancedKeywordSearchService = new AdvancedKeywordSearchService();
