
import re
import math
from collections import Counter, defaultdict
from typing import List, Dict, Any, Optional, Tuple
from .vector_service import VectorService
import unicodedata

class SearchService:
    def __init__(self):
        self.vector_service = VectorService()
        print("Search service initialized with hybrid search capabilities")

    def _normalize_thai_text(self, text: str) -> str:
        """Normalize Thai text for better matching"""
        if not text:
            return text
        
        # Unicode normalization
        text = unicodedata.normalize('NFC', text)
        
        # Remove tone marks for better matching (optional)
        tone_marks = ['่', '้', '๊', '๋']
        for mark in tone_marks:
            text = text.replace(mark, '')
        
        return text
    
    def _tokenize(self, text: str) -> List[str]:
        """Enhanced tokenize text with Thai support"""
        if not text:
            return []
        
        text = text.lower()
        text = self._normalize_thai_text(text)
        
        # Combined regex for Thai and English words
        thai_pattern = r'[\u0E00-\u0E7F]+'
        english_pattern = r'\b[a-zA-Z]+\b'
        number_pattern = r'\b\d+\b'
        
        tokens = []
        
        # Extract Thai words
        thai_matches = re.findall(thai_pattern, text)
        for match in thai_matches:
            # Simple Thai word segmentation (can be enhanced with pythainlp)
            if len(match) > 1:
                tokens.append(match)
        
        # Extract English words
        english_matches = re.findall(english_pattern, text)
        tokens.extend([token for token in english_matches if len(token) > 1])
        
        # Extract numbers
        number_matches = re.findall(number_pattern, text)
        tokens.extend(number_matches)
        
        return list(set(tokens))  # Remove duplicates

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

    def _calculate_mass_selection_threshold(self, scores: List[float]) -> float:
        """Calculate dynamic threshold for mass selection (60% rule)"""
        if not scores:
            return 0.0
        
        sorted_scores = sorted(scores, reverse=True)
        if len(sorted_scores) == 1:
            return sorted_scores[0] * 0.6
        
        # Find the point where quality drops significantly
        max_score = sorted_scores[0]
        threshold = max_score * 0.6
        
        # Ensure we don't select too many low-quality results
        for i, score in enumerate(sorted_scores):
            if score < threshold:
                # If more than 70% of results are below threshold, raise it
                if i / len(sorted_scores) > 0.7:
                    threshold = max_score * 0.7
                break
        
        return threshold
    
    def _apply_mass_selection(self, results: List[Dict[str, Any]], threshold_factor: float = 0.6) -> List[Dict[str, Any]]:
        """Apply mass selection logic similar to Node.js implementation"""
        if not results:
            return results
        
        scores = [result.get('score', 0.0) for result in results]
        threshold = self._calculate_mass_selection_threshold(scores)
        
        # Filter results based on dynamic threshold
        filtered_results = [
            result for result in results 
            if result.get('score', 0.0) >= threshold
        ]
        
        print(f"Mass selection: {len(filtered_results)}/{len(results)} results above threshold {threshold:.3f}")
        return filtered_results
    
    async def new_search(
        self,
        query: str,
        user_id: str,
        search_type: str = "smart_hybrid",
        limit: int = 10,
        **kwargs
    ) -> Dict[str, Any]:
        """Enhanced search mirroring Node.js newSearch functionality"""
        try:
            # Query preprocessing
            processed_query = self._preprocess_query(query)
            
            # Perform search based on type
            if search_type == "smart_hybrid":
                results = await self.hybrid_search(
                    processed_query, user_id, None, limit * 2, **kwargs
                )
            elif search_type == "keyword":
                results = await self.keyword_search(processed_query, [], limit * 2)
            elif search_type == "semantic":
                results = await self.semantic_search(processed_query, user_id, limit * 2)
            else:
                results = await self.hybrid_search(
                    processed_query, user_id, None, limit * 2, **kwargs
                )
            
            # Apply mass selection
            selected_results = self._apply_mass_selection(results)
            
            # Limit final results
            final_results = selected_results[:limit]
            
            return {
                "results": final_results,
                "total_found": len(results),
                "selected_count": len(selected_results),
                "final_count": len(final_results),
                "query": query,
                "processed_query": processed_query,
                "search_type": search_type
            }
            
        except Exception as e:
            print(f"Error in new_search: {e}")
            return {
                "results": [],
                "total_found": 0,
                "selected_count": 0,
                "final_count": 0,
                "query": query,
                "error": str(e)
            }
    
    def _preprocess_query(self, query: str) -> str:
        """Preprocess query for better search results"""
        if not query:
            return query
        
        # Basic query cleaning
        query = query.strip()
        query = self._normalize_thai_text(query)
        
        # Remove excessive punctuation
        query = re.sub(r'[?!.]{2,}', '', query)
        
        return query
    
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
        
        # Use new_search for enhanced functionality
        search_result = await self.new_search(query, user_id, search_type, limit, **kwargs)
        return search_result.get("results", [])
