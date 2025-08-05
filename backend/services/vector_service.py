
import os
import numpy as np
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
import json
import asyncio
from .llm_service import LLMService

load_dotenv()

class VectorService:
    def __init__(self):
        self.llm_service = LLMService()
        self.embeddings_enabled = self.llm_service.enabled
        self.vector_store = {}  # In-memory store for demo
        print(f"Vector service initialized (embeddings {'enabled' if self.embeddings_enabled else 'disabled'})")

    def _split_into_chunks(self, text: str, chunk_size: int = 1000, overlap: int = 100) -> List[str]:
        """Split text into overlapping chunks"""
        if not text or len(text) < chunk_size:
            return [text] if text else []

        chunks = []
        start = 0
        
        while start < len(text):
            end = min(start + chunk_size, len(text))
            
            # Try to break at sentence boundary
            if end < len(text):
                for i in range(end, max(start + chunk_size//2, end - 100), -1):
                    if text[i] in '.!?\n':
                        end = i + 1
                        break
            
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            
            start = end - overlap if end < len(text) else end
            
        return chunks

    async def generate_embeddings(self, document_id: str, content: str) -> bool:
        """Generate embeddings for document content"""
        if not self.embeddings_enabled:
            print(f"Embeddings disabled - skipping document {document_id}")
            return False

        try:
            # Split content into chunks
            chunks = self._split_into_chunks(content)
            print(f"Processing document {document_id}: {len(chunks)} chunks")

            # Generate embeddings for each chunk
            chunk_embeddings = []
            for i, chunk in enumerate(chunks):
                if len(chunk.strip()) < 10:  # Skip very short chunks
                    continue
                    
                embedding = await self.llm_service.generate_embedding(chunk)
                if embedding:
                    chunk_embeddings.append({
                        'chunk_index': i,
                        'content': chunk,
                        'embedding': embedding
                    })
                
                # Small delay to avoid rate limiting
                await asyncio.sleep(0.1)

            # Store in vector store
            self.vector_store[document_id] = {
                'chunks': chunk_embeddings,
                'total_chunks': len(chunks)
            }

            print(f"Generated embeddings for document {document_id}: {len(chunk_embeddings)} chunks")
            return True

        except Exception as e:
            print(f"Error generating embeddings for document {document_id}: {e}")
            return False

    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        try:
            a = np.array(vec1)
            b = np.array(vec2)
            return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
        except:
            return 0.0

    async def search_similar(
        self, 
        query: str, 
        user_id: str, 
        limit: int = 5,
        threshold: float = 0.3,
        specific_document_ids: List[str] = None
    ) -> List[Dict[str, Any]]:
        """Search for similar content using embeddings"""
        if not self.embeddings_enabled:
            print("Embeddings disabled - returning empty results")
            return []

        try:
            # Generate query embedding
            query_embedding = await self.llm_service.generate_embedding(query)
            if not query_embedding:
                return []

            results = []
            
            # Search through vector store
            search_docs = specific_document_ids if specific_document_ids else list(self.vector_store.keys())
            
            for doc_id in search_docs:
                if doc_id not in self.vector_store:
                    continue
                
                doc_data = self.vector_store[doc_id]
                
                for chunk_data in doc_data['chunks']:
                    similarity = self._cosine_similarity(query_embedding, chunk_data['embedding'])
                    
                    if similarity >= threshold:
                        results.append({
                            'document_id': doc_id,
                            'chunk_index': chunk_data['chunk_index'],
                            'content': chunk_data['content'],
                            'similarity': float(similarity),
                            'score': float(similarity)
                        })

            # Sort by similarity and limit results
            results.sort(key=lambda x: x['similarity'], reverse=True)
            results = results[:limit]

            print(f"Vector search for '{query[:50]}...': {len(results)} results (threshold: {threshold})")
            return results

        except Exception as e:
            print(f"Error in vector search: {e}")
            return []

    async def add_document(self, document_id: str, content: str, metadata: Dict[str, Any] = None) -> bool:
        """Add document to vector store with metadata support"""
        success = await self.generate_embeddings(document_id, content)
        
        if success and metadata:
            # Store metadata alongside embeddings
            if document_id in self.vector_store:
                self.vector_store[document_id]['metadata'] = metadata
        
        return success
    
    def get_document_metadata(self, document_id: str) -> Dict[str, Any]:
        """Get document metadata"""
        if document_id in self.vector_store:
            return self.vector_store[document_id].get('metadata', {})
        return {}
    
    async def search_by_metadata(self, filters: Dict[str, Any], limit: int = 10) -> List[Dict[str, Any]]:
        """Search documents by metadata filters"""
        results = []
        
        for doc_id, doc_data in self.vector_store.items():
            metadata = doc_data.get('metadata', {})
            
            # Check if document matches all filters
            matches = True
            for key, value in filters.items():
                if key not in metadata or metadata[key] != value:
                    matches = False
                    break
            
            if matches:
                results.append({
                    'document_id': doc_id,
                    'metadata': metadata,
                    'chunks_count': len(doc_data.get('chunks', []))
                })
        
        return results[:limit]

    async def remove_document(self, document_id: str) -> bool:
        """Remove document from vector store"""
        try:
            if document_id in self.vector_store:
                del self.vector_store[document_id]
                print(f"Removed document {document_id} from vector store")
                return True
            return False
        except Exception as e:
            print(f"Error removing document {document_id}: {e}")
            return False

    def get_document_stats(self) -> Dict[str, Any]:
        """Get vector store statistics"""
        total_docs = len(self.vector_store)
        total_chunks = sum(len(doc_data['chunks']) for doc_data in self.vector_store.values())
        
        return {
            'total_documents': total_docs,
            'total_chunks': total_chunks,
            'embeddings_enabled': self.embeddings_enabled
        }
