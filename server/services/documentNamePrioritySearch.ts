import { Document } from "@shared/schema";
import { vectorService } from './vectorService';
import { storage } from '../storage';
import { thaiTextProcessor } from './thaiTextProcessor';

export interface DocumentNameSearchResult {
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
  matchType: 'name' | 'keyword' | 'semantic';
  nameScore?: number;
  keywordScore?: number;
  semanticScore?: number;
}

export interface DocumentNameSearchOptions {
  limit?: number;
  massSelectionPercentage?: number;
  specificDocumentIds?: number[];
}

export class DocumentNamePrioritySearchService {
  private MASS_SELECTION_PERCENTAGE = 0.3; // 30% like chatbot search

  async searchDocuments(
    query: string,
    userId: string,
    options: DocumentNameSearchOptions = {}
  ): Promise<DocumentNameSearchResult[]> {
    const { 
      limit = 20, 
      massSelectionPercentage = this.MASS_SELECTION_PERCENTAGE,
      specificDocumentIds 
    } = options;

    console.log(`🔍 DOCUMENT NAME PRIORITY SEARCH: Starting search for "${query}"`);
    console.log(`📊 Using ${(massSelectionPercentage * 100).toFixed(1)}% mass selection`);

    // Get all documents for this user
    const allDocuments = await storage.getDocuments(userId, { limit: 1000 });
    let documents = specificDocumentIds?.length 
      ? allDocuments.filter(doc => specificDocumentIds.includes(doc.id))
      : allDocuments;

    console.log(`📂 Found ${documents.length} documents to search`);

    // Tokenize query for better matching
    const tokenizedQuery = await thaiTextProcessor.segmentThaiText(query);
    const searchTerms = tokenizedQuery.toLowerCase().split(/\s+/).filter(Boolean);
    console.log(`🔤 Search terms: [${searchTerms.join(', ')}]`);

    const results: DocumentNameSearchResult[] = [];

    // 1. PRIORITY 1: Document Name Matches
    const nameMatches = this.findNameMatches(documents, query, searchTerms);
    console.log(`📄 Found ${nameMatches.length} name matches`);

    // 2. PRIORITY 2: Keyword Content Matches (exclude name matches)
    const nameMatchIds = new Set(nameMatches.map(m => m.id));
    const remainingDocs = documents.filter(doc => !nameMatchIds.has(doc.id));
    const keywordMatches = await this.findKeywordMatches(remainingDocs, query, searchTerms, userId);
    console.log(`🔑 Found ${keywordMatches.length} keyword matches`);

    // 3. PRIORITY 3: Semantic Matches (exclude name and keyword matches)
    const keywordMatchIds = new Set(keywordMatches.map(m => m.id));
    const semanticCandidates = remainingDocs.filter(doc => !keywordMatchIds.has(doc.id));
    const semanticMatches = await this.findSemanticMatches(semanticCandidates, query, userId);
    console.log(`🧠 Found ${semanticMatches.length} semantic matches`);

    // Combine all results with priority scores
    const allResults = [
      ...nameMatches.map(r => ({ ...r, matchType: 'name' as const, similarity: r.nameScore || 1.0 })),
      ...keywordMatches.map(r => ({ ...r, matchType: 'keyword' as const, similarity: r.keywordScore || 0.8 })),
      ...semanticMatches.map(r => ({ ...r, matchType: 'semantic' as const, similarity: r.semanticScore || 0.6 }))
    ];

    console.log(`📊 Total candidates: ${allResults.length} (${nameMatches.length} name + ${keywordMatches.length} keyword + ${semanticMatches.length} semantic)`);

    // Apply mass-based selection
    const selectedResults = this.applyMassSelection(allResults, massSelectionPercentage, limit);

    console.log(`✅ DOCUMENT NAME PRIORITY SEARCH: Returning ${selectedResults.length} results`);
    return selectedResults;
  }

  private findNameMatches(documents: any[], query: string, searchTerms: string[]): DocumentNameSearchResult[] {
    const matches: DocumentNameSearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const doc of documents) {
      const docName = (doc.name || doc.originalName || '').toLowerCase();
      let nameScore = 0;

      // Exact match gets highest score
      if (docName.includes(queryLower)) {
        nameScore = 1.0;
      } else {
        // Check individual terms
        const matchingTerms = searchTerms.filter(term => docName.includes(term));
        if (matchingTerms.length > 0) {
          nameScore = matchingTerms.length / searchTerms.length * 0.9; // Slightly lower than exact match
        }
      }

      if (nameScore > 0) {
        matches.push({
          id: doc.id.toString(),
          name: doc.name || doc.originalName,
          content: doc.content || '',
          summary: doc.summary,
          aiCategory: doc.aiCategory,
          aiCategoryColor: doc.aiCategoryColor,
          similarity: nameScore,
          createdAt: doc.createdAt?.toISOString() || new Date().toISOString(),
          categoryId: doc.categoryId,
          tags: doc.tags,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          isFavorite: doc.isFavorite,
          updatedAt: doc.updatedAt?.toISOString(),
          userId: doc.userId,
          matchType: 'name',
          nameScore
        });
      }
    }

    // Sort by name score descending
    return matches.sort((a, b) => (b.nameScore || 0) - (a.nameScore || 0));
  }

  private async findKeywordMatches(
    documents: any[], 
    query: string, 
    searchTerms: string[], 
    userId: string
  ): Promise<DocumentNameSearchResult[]> {
    const matches: DocumentNameSearchResult[] = [];

    for (const doc of documents) {
      const content = doc.content || '';
      const contentLower = content.toLowerCase();
      let keywordScore = 0;

      // Check for search terms in content
      const matchingTerms = searchTerms.filter(term => contentLower.includes(term));
      if (matchingTerms.length > 0) {
        // Calculate TF-like score
        const totalTermOccurrences = matchingTerms.reduce((sum, term) => {
          const occurrences = (contentLower.match(new RegExp(term, 'g')) || []).length;
          return sum + occurrences;
        }, 0);

        // Normalize by document length and term coverage
        const termCoverage = matchingTerms.length / searchTerms.length;
        const frequencyScore = Math.min(totalTermOccurrences / 10, 1); // Cap at 1
        keywordScore = termCoverage * 0.7 + frequencyScore * 0.3;
      }

      if (keywordScore > 0) {
        matches.push({
          id: doc.id.toString(),
          name: doc.name || doc.originalName,
          content: content,
          summary: doc.summary,
          aiCategory: doc.aiCategory,
          aiCategoryColor: doc.aiCategoryColor,
          similarity: keywordScore,
          createdAt: doc.createdAt?.toISOString() || new Date().toISOString(),
          categoryId: doc.categoryId,
          tags: doc.tags,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          isFavorite: doc.isFavorite,
          updatedAt: doc.updatedAt?.toISOString(),
          userId: doc.userId,
          matchType: 'keyword',
          keywordScore
        });
      }
    }

    // Sort by keyword score descending
    return matches.sort((a, b) => (b.keywordScore || 0) - (a.keywordScore || 0));
  }

  private async findSemanticMatches(
    documents: any[], 
    query: string, 
    userId: string
  ): Promise<DocumentNameSearchResult[]> {
    if (documents.length === 0) return [];

    // Use existing vector service for semantic search
    const specificDocumentIds = documents.map(doc => doc.id);
    const vectorResults = await vectorService.searchDocuments(
      query, 
      userId, 
      Math.min(documents.length * 2, 100), // Get more results for filtering
      specificDocumentIds
    );

    const matches: DocumentNameSearchResult[] = [];
    const docMap = new Map(documents.map(doc => [doc.id, doc]));

    // Group vector results by document and take the best chunk score per document
    const docScores = new Map<number, number>();

    for (const result of vectorResults) {
      const docId = parseInt(result.document.metadata.originalDocumentId || result.document.id);
      const currentScore = docScores.get(docId) || 0;
      if (result.similarity > currentScore) {
        docScores.set(docId, result.similarity);
      }
    }

    // Convert to results format
    for (const [docId, semanticScore] of docScores.entries()) {
      const doc = docMap.get(docId);
      if (doc && semanticScore >= 0.3) { // Minimum semantic threshold
        matches.push({
          id: doc.id.toString(),
          name: doc.name || doc.originalName,
          content: doc.content || '',
          summary: doc.summary,
          aiCategory: doc.aiCategory,
          aiCategoryColor: doc.aiCategoryColor,
          similarity: semanticScore,
          createdAt: doc.createdAt?.toISOString() || new Date().toISOString(),
          categoryId: doc.categoryId,
          tags: doc.tags,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          isFavorite: doc.isFavorite,
          updatedAt: doc.updatedAt?.toISOString(),
          userId: doc.userId,
          matchType: 'semantic',
          semanticScore
        });
      }
    }

    // Sort by semantic score descending
    return matches.sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0));
  }

  private applyMassSelection(
    results: DocumentNameSearchResult[], 
    massSelectionPercentage: number, 
    maxLimit: number
  ): DocumentNameSearchResult[] {
    if (results.length === 0) return [];

    // Calculate total score mass
    const totalScore = results.reduce((sum, r) => sum + r.similarity, 0);
    const targetMass = totalScore * massSelectionPercentage;

    console.log(`📊 MASS SELECTION: Total score: ${totalScore.toFixed(4)}, target mass: ${targetMass.toFixed(4)} (${(massSelectionPercentage * 100).toFixed(1)}%)`);

    const selected: DocumentNameSearchResult[] = [];
    let accumulatedScore = 0;
    const minResults = Math.min(5, results.length); // Ensure at least 5 results
    const maxResults = Math.min(maxLimit, results.length);

    for (const result of results) {
      selected.push(result);
      accumulatedScore += result.similarity;

      console.log(`📊 Selected ${result.matchType} match: "${result.name}" (score: ${result.similarity.toFixed(3)}, accumulated: ${accumulatedScore.toFixed(3)})`);

      // Stop if we've reached the target mass and minimum results
      if (accumulatedScore >= targetMass && selected.length >= minResults) {
        console.log(`📊 STOPPING: Reached ${(accumulatedScore/totalScore*100).toFixed(1)}% of total score mass with ${selected.length} results`);
        break;
      }

      // Don't exceed maximum limit
      if (selected.length >= maxResults) {
        console.log(`📊 STOPPING: Reached maximum limit of ${maxResults} results`);
        break;
      }
    }

    console.log(`🎯 MASS SELECTION RESULT: Selected ${selected.length} documents capturing ${(accumulatedScore/totalScore*100).toFixed(1)}% of total score mass`);

    return selected;
  }
}

export const documentNamePrioritySearchService = new DocumentNamePrioritySearchService();