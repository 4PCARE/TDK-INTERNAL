
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

  // 2. Perform keyword search manually with memory optimization
  const keywordMatches: Record<string, number> = {};
  for (const doc of relevantDocs) {
    // Limit content processing to prevent memory issues
    const content = doc.content ? doc.content.substring(0, 50000) : "";
    const chunks = doc.chunks || splitIntoChunks(content, 3000, 300);
    
    // Process maximum 20 chunks per document
    const limitedChunks = chunks.slice(0, 20);
    
    limitedChunks.forEach((chunk, index) => {
      const lowerChunk = chunk.toLowerCase();
      const matched = searchTerms.filter(term => lowerChunk.includes(term));
      if (matched.length > 0) {
        const score = matched.length / searchTerms.length;
        keywordMatches[`${doc.id}-${index}`] = score;
      }
    });
    
    // Clear processed chunks from memory
    if (doc.chunks) {
      doc.chunks = null;
    }
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

  for (const chunkId of allChunkIds) {
    const [docIdStr, chunkIndexStr] = chunkId.split("-");
    const docId = parseInt(docIdStr);
    const chunkIndex = parseInt(chunkIndexStr);
    const keywordScore = keywordMatches[chunkId] ?? 0;
    const vectorInfo = vectorMatches[chunkId];
    const vectorScore = vectorInfo?.score ?? 0;
    const content = vectorInfo?.content ?? ""; // fallback to nothing if not in vector search

    const finalScore = keywordScore * keywordWeight + vectorScore * vectorWeight;

    if (finalScore > 0 && content.length > 0) {
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

  // 5. Sort by finalScore and select top 66%
  const totalScore = scoredChunks.reduce((sum, c) => sum + c.finalScore, 0);
  const scoreTarget = totalScore * 0.66;

  scoredChunks.sort((a, b) => b.finalScore - a.finalScore);
  const selectedChunks = [];
  let accScore = 0;
  for (const chunk of scoredChunks) {
    selectedChunks.push(chunk);
    accScore += chunk.finalScore;
    if (accScore >= scoreTarget) break;
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

  // Memory cleanup
  keywordMatches = null;
  vectorMatches = null;
  allChunkIds = null;
  scoredChunks = null;
  selectedChunks = null;
  
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
        const matched = searchTerms.filter(term => chunkText.includes(term));
        let score = matched.length / searchTerms.length;

        const storeBoostTerms = ['xolo', 'kamu', 'floor', 'ชั้น', 'บางกะปิ', 'bangkapi'];
        const storeBoost = searchTerms.some(term => storeBoostTerms.some(sk => sk.includes(term)));
        if (storeBoost && score > 0.5) score = Math.min(1.0, score + 0.3);

        if (score > 0) {
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
    const targetScore = totalScore * 0.66;
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
