from typing import List, Dict, Any, Optional
import re
import math
from collections import Counter
import asyncio

class FixedSearchService:
    """
    Fixed search service with proper BM25 + vector similarity implementation
    """
    
    def __init__(self):
        # BM25 parameters
        self.k1 = 1.2
        self.b = 0.75
        
        print("✅ Fixed Search Service initialized with BM25 + Vector")

    def _tokenize(self, text: str) -> List[str]:
        """Tokenize text for BM25 search"""
        if not text:
            return []
        
        # Clean and tokenize
        text = text.lower()
        text = re.sub(r'[^\w\s]', ' ', text)
        tokens = text.split()
        
        # Remove short tokens
        tokens = [token for token in tokens if len(token) > 2]
        
        return tokens

    def _calculate_bm25_score(
        self, 
        query_terms: List[str], 
        doc_terms: List[str], 
        doc_count: int, 
        avg_doc_length: float
    ) -> float:
        """Calculate BM25 score for a document"""
        if not query_terms or not doc_terms:
            return 0.0
        
        doc_length = len(doc_terms)
        term_counts = Counter(doc_terms)
        score = 0.0
        
        for term in query_terms:
            if term in term_counts:
                tf = term_counts[term]
                # Document frequency (simplified - assume all docs contain the term)
                df = 1
                idf = math.log((doc_count - df + 0.5) / (df + 0.5))
                
                # BM25 formula
                numerator = tf * (self.k1 + 1)
                denominator = tf + self.k1 * (1 - self.b + self.b * (doc_length / avg_doc_length))
                score += idf * (numerator / denominator)
        
        return score

    async def keyword_search(
        self, 
        query: str, 
        documents: List[Dict[str, Any]], 
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Perform BM25-based keyword search"""
        if not documents or not query:
            print("⚠️ No documents or query provided for keyword search")
            return []
            
        print(f"🔍 Performing keyword search on {len(documents)} documents")
        
        query_terms = self._tokenize(query)
        if not query_terms:
            return []

        # Calculate average document length
        all_doc_lengths = []
        doc_terms_list = []
        
        for doc in documents:
            content = doc.get('content', '')
            doc_terms = self._tokenize(content)
            doc_terms_list.append(doc_terms)
            all_doc_lengths.append(len(doc_terms))
        
        avg_doc_length = sum(all_doc_lengths) / len(all_doc_lengths) if all_doc_lengths else 1
        
        results = []
        for i, doc in enumerate(documents):
            if i < len(doc_terms_list):
                doc_terms = doc_terms_list[i]
                score = self._calculate_bm25_score(
                    query_terms, doc_terms, len(documents), avg_doc_length
                )
                
                if score > 0:
                    result = doc.copy()
                    result['score'] = score
                    result['match_type'] = 'keyword'
                    results.append(result)

        # Sort by score descending
        results.sort(key=lambda x: x.get('score', 0.0), reverse=True)
        
        print(f"📊 Keyword search found {len(results)} results")
        return results[:limit]

    async def vector_search(
        self,
        query: str,
        user_id: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Perform vector similarity search"""
        try:
            print(f"🔮 Performing vector search for user {user_id}")
            
            # Import vector service
            from .vector_service import VectorService
            vector_service = VectorService()
            
            results = await vector_service.search_documents(
                query=query,
                user_id=user_id,
                limit=limit
            )
            
            if results:
                for result in results:
                    result['match_type'] = 'semantic'
                print(f"📊 Vector search found {len(results)} results")
            else:
                print("⚠️ No vector search results")
                results = []
            
            return results
            
        except Exception as e:
            print(f"❌ Vector search failed: {e}")
            return []

    async def hybrid_search(
        self,
        query: str,
        user_id: str,
        search_type: str = "hybrid",
        limit: int = 10,
        keyword_weight: float = 0.4,
        vector_weight: float = 0.6
    ) -> List[Dict[str, Any]]:
        """
        Perform hybrid search combining BM25 keyword + vector similarity with proper scoring
        """
        
        try:
            print(f"🔄 Starting hybrid search for query: '{query}' (user: {user_id})")
            
            # Get user documents from database
            from ..database import DatabaseService
            db_service = DatabaseService()
            documents = await db_service.get_user_documents(user_id)
            
            if not documents:
                print(f"⚠️ No documents found for user {user_id}")
                return []
            
            print(f"📚 Searching across {len(documents)} documents")
            
            all_results = {}  # Track scores by document ID
            
            # Keyword search with BM25
            if search_type in ["keyword", "hybrid"]:
                try:
                    keyword_results = await self.keyword_search(query, documents, limit * 2)
                    
                    for result in keyword_results:
                        doc_id = result.get('id')
                        if doc_id:
                            if doc_id not in all_results:
                                all_results[doc_id] = result.copy()
                                all_results[doc_id]['scores'] = {}
                            
                            keyword_score = result.get('score', 0.0) * keyword_weight
                            all_results[doc_id]['scores']['keyword'] = keyword_score
                            all_results[doc_id]['match_types'] = all_results[doc_id].get('match_types', []) + ['keyword']
                            
                    print(f"🔍 Keyword search contributed {len(keyword_results)} results")
                    
                except Exception as keyword_error:
                    print(f"❌ Keyword search failed: {keyword_error}")

            # Vector/semantic search
            if search_type in ["semantic", "vector", "hybrid"]:
                try:
                    vector_results = await self.vector_search(query, user_id, limit * 2)
                    
                    for result in vector_results:
                        doc_id = result.get('id')
                        if doc_id:
                            if doc_id not in all_results:
                                all_results[doc_id] = result.copy()
                                all_results[doc_id]['scores'] = {}
                            
                            vector_score = result.get('score', 0.0) * vector_weight
                            all_results[doc_id]['scores']['vector'] = vector_score
                            all_results[doc_id]['match_types'] = all_results[doc_id].get('match_types', []) + ['semantic']
                    
                    print(f"🔮 Vector search contributed {len(vector_results)} results")
                        
                except Exception as vector_error:
                    print(f"❌ Vector search failed: {vector_error}")

            # Calculate combined scores and prepare final results
            final_results = []
            for doc_id, result in all_results.items():
                scores = result.get('scores', {})
                
                # Combine scores
                combined_score = 0.0
                if 'keyword' in scores:
                    combined_score += scores['keyword']
                if 'vector' in scores:
                    combined_score += scores['vector']
                
                # Update result with combined information
                result['score'] = combined_score
                result['match_type'] = ', '.join(set(result.get('match_types', [])))
                
                # Clean up temporary fields
                result.pop('scores', None)
                result.pop('match_types', None)
                
                final_results.append(result)
            
            # Sort by combined score descending
            final_results.sort(key=lambda x: x.get('score', 0.0), reverse=True)
            
            # Return top results
            top_results = final_results[:limit]
            print(f"✅ Hybrid search returning {len(top_results)} results")
            
            return top_results
            
        except Exception as e:
            print(f"❌ Hybrid search error: {e}")
            import traceback
            traceback.print_exc()
            return []

    async def smart_search(
        self,
        query: str,
        user_id: str,
        search_type: str = "hybrid",
        limit: int = 10,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Smart search wrapper that returns frontend-compatible format
        """
        
        try:
            print(f"🧠 Smart search starting: '{query}' (type: {search_type})")
            
            if search_type in ["hybrid", "smart_hybrid"]:
                results = await self.hybrid_search(query, user_id, "hybrid", limit, **kwargs)
            elif search_type == "keyword":
                from ..database import DatabaseService
                db_service = DatabaseService()
                documents = await db_service.get_user_documents(user_id)
                results = await self.keyword_search(query, documents, limit)
            elif search_type in ["semantic", "vector"]:
                results = await self.vector_search(query, user_id, limit)
            else:
                # Default to hybrid
                results = await self.hybrid_search(query, user_id, "hybrid", limit, **kwargs)
            
            print(f"✅ Smart search completed with {len(results)} results")
            
            return {
                "query": query,
                "search_type": search_type,
                "results": results,
                "total_found": len(results)
            }
            
        except Exception as e:
            print(f"❌ Smart search error: {e}")
            return {
                "query": query,
                "search_type": search_type,
                "results": [],
                "total_found": 0,
                "error": str(e)
            }