
from typing import List, Dict, Any

class SearchService:
    def __init__(self):
        print("Search service initialized")

    async def hybrid_search(self, query: str, user_id: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Perform hybrid search combining keyword and semantic search"""
        try:
            # For now, return mock results
            print(f"Performing hybrid search for: {query[:50]}...")
            
            # Mock search results
            mock_results = [
                {
                    "id": "doc_1",
                    "content": f"Mock document content related to: {query}",
                    "title": "Sample Document 1",
                    "score": 0.95
                },
                {
                    "id": "doc_2", 
                    "content": f"Another relevant document for: {query}",
                    "title": "Sample Document 2",
                    "score": 0.87
                }
            ]
            
            return mock_results[:limit]
            
        except Exception as e:
            print(f"Error performing hybrid search: {e}")
            return []

    async def keyword_search(self, query: str, user_id: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Perform keyword-based search"""
        print(f"Performing keyword search for: {query[:50]}...")
        return await self.hybrid_search(query, user_id, limit)
