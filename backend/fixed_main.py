#!/usr/bin/env python3
"""
Fixed Python Backend with Working LangChain Chat and Search Services
"""

from fastapi import FastAPI, HTTPException, Depends, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Optional
import uvicorn
import os
from datetime import datetime

# Import fixed services
from services.fixed_chat_service import FixedChatService
from services.fixed_search_service import FixedSearchService

# Import existing services that work
from database import DatabaseService
from services.vector_service import VectorService
from services.document_processor import DocumentProcessor

app = FastAPI(title="AI-KMS Python Backend - Fixed", version="2.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
db_service = DatabaseService()
vector_service = VectorService()
document_processor = DocumentProcessor()
chat_service = FixedChatService()
search_service = FixedSearchService()

def get_current_user():
    """Mock authentication - returns demo user"""
    return {
        "user_id": "demo-user",
        "sub": "demo-user",
        "email": "demo@example.com"
    }

# Utility functions for frontend compatibility
def normalize_document_response(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize document response for frontend compatibility"""
    return {
        "id": doc.get("id") or doc.get("document_id"),
        "name": doc.get("name") or doc.get("title", "Unknown Document"),
        "content": doc.get("content", ""),
        "summary": doc.get("summary", ""),
        "createdAt": doc.get("created_at") or doc.get("createdAt", datetime.now().isoformat()),
        "fileSize": doc.get("file_size") or doc.get("fileSize", 0),
        "tags": doc.get("tags", []),
        "aiCategory": doc.get("ai_category") or doc.get("aiCategory") or doc.get("category", ""),
        "mimeType": doc.get("mime_type") or doc.get("mimeType", ""),
        "score": doc.get("score", 0.0),
        "match_type": doc.get("match_type", "")
    }

# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "chat": True,
            "search": True, 
            "vector": vector_service.embeddings_enabled,
            "database": True
        }
    }

# Documents endpoints
@app.get("/api/python/documents")
async def get_documents(current_user: dict = Depends(get_current_user)):
    """Get all documents for the user"""
    try:
        user_id = current_user.get("user_id") or current_user.get("sub")
        documents = await db_service.get_user_documents(user_id)
        
        # Normalize all documents for frontend compatibility
        normalized_docs = []
        for doc in documents:
            normalized_doc = normalize_document_response(doc)
            normalized_docs.append(normalized_doc)
        
        print(f"✅ Retrieved {len(normalized_docs)} documents for user {user_id}")
        return normalized_docs
        
    except Exception as e:
        print(f"❌ Error retrieving documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Search endpoints
@app.get("/api/python/documents/search")  
async def search_documents_get(
    query: str,
    type: str = "hybrid",
    limit: int = 10,
    current_user: dict = Depends(get_current_user)
):
    """Search documents using GET request (frontend compatible)"""
    try:
        user_id = current_user.get("user_id") or current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID not found")
        
        print(f"🔍 Search request: query='{query}', type={type}, limit={limit}")
        
        search_results = await search_service.smart_search(
            query=query,
            user_id=user_id,
            search_type=type,
            limit=limit
        )
        
        # Get results from search response
        results = search_results.get("results", [])
        
        # Normalize all results for frontend compatibility
        normalized_results = []
        for result in results:
            normalized_doc = normalize_document_response(result)
            normalized_results.append(normalized_doc)
        
        print(f"✅ Search completed with {len(normalized_results)} results")
        return normalized_results
        
    except Exception as e:
        print(f"❌ Search failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.post("/api/python/search")
async def search_documents_post(
    request: dict,
    current_user: dict = Depends(get_current_user)
):
    """Search documents using POST request"""
    try:
        query = request.get("query", "")
        search_type = request.get("search_type", "hybrid")
        limit = request.get("limit", 10)
        
        user_id = current_user.get("user_id") or current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID not found")
        
        search_results = await search_service.smart_search(
            query=query,
            user_id=user_id,
            search_type=search_type,
            limit=limit
        )
        
        # Return in expected format
        return {
            "query": query,
            "search_type": search_type,
            "results": [normalize_document_response(r) for r in search_results.get("results", [])],
            "total_found": search_results.get("total_found", 0)
        }
        
    except Exception as e:
        print(f"❌ POST search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

# Chat endpoints
@app.post("/api/python/chat")
async def chat_endpoint(request: dict, current_user: dict = Depends(get_current_user)):
    """Process chat messages with document search"""
    try:
        message = request.get("message", "")
        conversation_history = request.get("conversation_history", [])
        search_documents = request.get("search_documents", True)
        
        user_id = current_user.get("user_id") or current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID not found")
        
        print(f"💬 Chat request from user {user_id}: {message[:100]}...")
        
        response = await chat_service.process_message(
            message=message,
            user_id=user_id,
            conversation_history=conversation_history,
            search_documents=search_documents
        )
        
        # Ensure frontend-compatible response format
        return {
            "response": response.get("message", "No response generated"),
            "sources": response.get("sources", []),
            "search_performed": response.get("search_performed", False),
            "documents_found": response.get("documents_found", 0)
        }
        
    except Exception as e:
        print(f"❌ Chat processing failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {str(e)}")

@app.post("/api/python/chat/message")  
async def chat_message_endpoint(request: dict, current_user: dict = Depends(get_current_user)):
    """Alternative chat endpoint for frontend compatibility"""
    try:
        message = request.get("message", "")
        user_id = current_user.get("user_id") or current_user.get("sub")
        
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID not found")
        
        print(f"💬 Chat message from user {user_id}: {message[:100]}...")
        
        response = await chat_service.process_message(
            message=message,
            user_id=user_id,
            search_documents=True
        )
        
        # Ensure frontend-compatible response format
        return {
            "response": response.get("message", "No response generated"),
            "sources": response.get("sources", []),
            "search_performed": response.get("search_performed", False),
            "documents_found": response.get("documents_found", 0)
        }
        
    except Exception as e:
        print(f"❌ Chat message processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Document chat failed: {str(e)}")

# Document upload endpoint
@app.post("/api/python/process-document")
async def process_document(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Process uploaded document"""
    try:
        user_id = current_user.get("user_id") or current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID not found")
        
        print(f"📁 Processing document upload: {file.filename}")
        
        # Save uploaded file
        file_path = f"uploads/{file.filename}"
        os.makedirs("uploads", exist_ok=True)
        
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # Process document
        result = await document_processor.process_document(
            file_path=file_path,
            user_id=user_id
        )
        
        print(f"✅ Document processing completed: {result.get('name', 'Unknown')}")
        
        return {
            "success": True,
            "document_id": result.get("id", ""),
            "message": f"Document '{result.get('name', file.filename)}' processed successfully",
            "summary": result.get("summary", ""),
            "tags": result.get("tags", []),
            "category": result.get("ai_category", ""),
            "name": result.get("name", file.filename),
            "file_size": result.get("file_size", 0),
            "content_length": len(result.get("content", ""))
        }
        
    except Exception as e:
        print(f"❌ Document processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Document processing failed: {str(e)}")

# Stats endpoint
@app.get("/api/python/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    """Get system statistics"""
    try:
        vector_stats = vector_service.get_document_stats()
        
        return {
            "vectorService": vector_stats,
            "servicesStatus": {
                "chatService": True,
                "searchService": True,
                "vectorService": vector_service.embeddings_enabled,
                "documentProcessor": True
            }
        }
        
    except Exception as e:
        print(f"❌ Stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    print("🚀 Starting Fixed Python Backend...")
    print("✅ Chat Service: LangChain ConversationalRetrievalChain")
    print("✅ Search Service: BM25 + Vector Similarity") 
    print("✅ Frontend-Compatible Responses")
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        log_level="info"
    )