
from typing import List, Dict, Any
from .vector_service import VectorService

class SearchService:
    def __init__(self):
        self.vector_service = VectorService()
    
    async def hybrid_search(self, query: str, user_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Perform hybrid search combining keyword and vector search"""
        try:
            # For now, use vector search as the primary method
            results = await self.vector_service.search_similar(query, user_id, limit)
            
            # In production, you'd combine keyword and vector search results
            # and apply ranking algorithms
            
            return results
            
        except Exception as e:
            print(f"Error in hybrid search: {e}")
            return []
    
    async def keyword_search(self, query: str, user_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Perform keyword-based search"""
        # Implement keyword search logic here
        return []
    
    async def semantic_search(self, query: str, user_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Perform semantic search using embeddings"""
        return await self.vector_service.search_similar(query, user_id, limit)
