
import re
import math
from collections import Counter, defaultdict
from typing import List, Dict, Any, Optional, Tuple
from .vector_service import VectorService

class SearchService:
    def __init__(self):
        self.vector_service = VectorService()
        print("Search service initialized with hybrid search capabilities")

    def _tokenize(self, text: str) -> List[str]:
        """Tokenize text into words"""
        # Simple tokenization - can be enhanced for Thai text
        text = text.lower()
        tokens = re.findall(r'\b\w+\b', text)
        return [token for token in tokens if len(token) > 1]

    def _calculate_tf(self, term: str, document: str) -> float:
        """Calculate term frequency"""
        tokens = self._tokenize(document)
        if not tokens:
            return 0.0
        return tokens.count(term) / len(tokens)

    def _calculate_idf(self, term: str, documents: List[str]) -> float:
        """Calculate inverse document frequency"""
        containing_docs = sum(1 for doc in documents if term in self._tokenize(doc))
        if containing_docs == 0:
            return 0.0
        return math.log(len(documents) / containing_docs)

    def _calculate_bm25_score(
        self, 
        query_terms: List[str], 
        document: str, 
        documents: List[str],
        k1: float = 1.2,
        b: float = 0.75
    ) -> float:
        """Calculate BM25 score for document given query"""
        doc_tokens = self._tokenize(document)
        doc_length = len(doc_tokens)
        
        if doc_length == 0:
            return 0.0
        
        # Calculate average document length
        avg_doc_length = sum(len(self._tokenize(doc)) for doc in documents) / len(documents)
        
        score = 0.0
        for term in query_terms:
            tf = self._calculate_tf(term, document)
            idf = self._calculate_idf(term, documents)
            
            # BM25 formula
            numerator = tf * (k1 + 1)
            denominator = tf + k1 * (1 - b + b * (doc_length / avg_doc_length))
            
            score += idf * (numerator / denominator)
        
        return score

    async def keyword_search(
        self, 
        query: str, 
        documents: List[Dict[str, Any]], 
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Perform BM25-based keyword search"""
        query_terms = self._tokenize(query)
        if not query_terms:
            return []

        # Extract document contents
        doc_contents = [doc.get('content', '') for doc in documents]
        
        results = []
        for i, doc in enumerate(documents):
            content = doc.get('content', '')
            if not content:
                continue
                
            bm25_score = self._calculate_bm25_score(query_terms, content, doc_contents)
            
            if bm25_score > 0:
                results.append({
                    **doc,
                    'keyword_score': bm25_score,
                    'score': bm25_score,
                    'match_type': 'keyword'
                })

        # Sort by BM25 score
        results.sort(key=lambda x: x['keyword_score'], reverse=True)
        return results[:limit]

    async def semantic_search(
        self, 
        query: str, 
        user_id: str, 
        limit: int = 10,
        threshold: float = 0.3,
        specific_document_ids: List[str] = None
    ) -> List[Dict[str, Any]]:
        """Perform semantic search using vector embeddings"""
        return await self.vector_service.search_similar(
            query, user_id, limit, threshold, specific_document_ids
        )

    async def hybrid_search(
        self, 
        query: str, 
        user_id: str, 
        documents: List[Dict[str, Any]] = None,
        limit: int = 10,
        keyword_weight: float = 0.4,
        vector_weight: float = 0.6,
        threshold: float = 0.1
    ) -> List[Dict[str, Any]]:
        """Perform hybrid search combining keyword and semantic search"""
        try:
            print(f"Hybrid search for: '{query[:50]}...' | kW={keyword_weight} vW={vector_weight}")

            # If no documents provided, create mock documents for demo
            if not documents:
                documents = [
                    {
                        'id': f'doc_{i}',
                        'content': f'Mock document {i} content related to: {query}',
                        'title': f'Sample Document {i}',
                        'summary': f'Summary of document {i}'
                    }
                    for i in range(1, 6)
                ]

            # Perform keyword search
            keyword_results = await self.keyword_search(query, documents, limit * 2)
            
            # Perform semantic search
            doc_ids = [str(doc.get('id', '')) for doc in documents]
            vector_results = await self.semantic_search(query, user_id, limit * 2, threshold, doc_ids)

            # Combine results
            combined_scores = defaultdict(lambda: {'keyword': 0.0, 'vector': 0.0, 'document': None})

            # Process keyword results
            for result in keyword_results:
                doc_id = str(result.get('id', ''))
                combined_scores[doc_id]['keyword'] = result.get('keyword_score', 0.0)
                combined_scores[doc_id]['document'] = result

            # Process vector results
            for result in vector_results:
                doc_id = str(result.get('document_id', ''))
                combined_scores[doc_id]['vector'] = result.get('similarity', 0.0)
                if not combined_scores[doc_id]['document']:
                    # Find document by ID
                    for doc in documents:
                        if str(doc.get('id', '')) == doc_id:
                            combined_scores[doc_id]['document'] = doc
                            break

            # Calculate hybrid scores
            final_results = []
            for doc_id, scores in combined_scores.items():
                if not scores['document']:
                    continue

                # Normalize scores (simple min-max normalization)
                keyword_score = scores['keyword']
                vector_score = scores['vector']
                
                # Calculate weighted hybrid score
                hybrid_score = (keyword_score * keyword_weight) + (vector_score * vector_weight)
                
                if hybrid_score > threshold:
                    final_results.append({
                        **scores['document'],
                        'keyword_score': keyword_score,
                        'vector_score': vector_score,
                        'hybrid_score': hybrid_score,
                        'score': hybrid_score,
                        'match_type': 'hybrid'
                    })

            # Sort by hybrid score
            final_results.sort(key=lambda x: x['hybrid_score'], reverse=True)
            results = final_results[:limit]

            print(f"Hybrid search completed: {len(results)} results")
            return results

        except Exception as e:
            print(f"Error performing hybrid search: {e}")
            return []

    async def smart_search(
        self,
        query: str,
        user_id: str,
        search_type: str = "hybrid",
        documents: List[Dict[str, Any]] = None,
        limit: int = 10,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """Smart search router - mirrors Node.js newSearch functionality"""
        
        if search_type == "keyword":
            return await self.keyword_search(query, documents or [], limit)
        elif search_type == "semantic":
            return await self.semantic_search(query, user_id, limit)
        elif search_type == "hybrid":
            return await self.hybrid_search(query, user_id, documents, limit, **kwargs)
        else:
            # Default to hybrid search
            return await self.hybrid_search(query, user_id, documents, limit, **kwargs)
