
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uvicorn
import os
from typing import List, Optional, Dict, Any
import asyncio
from datetime import datetime
from pydantic import BaseModel

# Import our modules
from auth import AuthService
from database import DatabaseService
from services.document_processor import DocumentProcessor
from services.llm_service import LLMService
from services.vector_service import VectorService
from services.search_service import SearchService
from services.chat_service import ChatService

app = FastAPI(title="AI-KMS Python Backend", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()

# Global services
auth_service = AuthService()
db_service = DatabaseService()
document_processor = DocumentProcessor()
llm_service = LLMService()
vector_service = VectorService()
search_service = SearchService()
chat_service = ChatService()

# Pydantic models
class ChatMessage(BaseModel):
    message: str
    conversation_history: Optional[List[Dict[str, str]]] = None
    search_documents: bool = True

class SearchQuery(BaseModel):
    query: str
    search_type: str = "hybrid"
    limit: int = 10
    keyword_weight: float = 0.4
    vector_weight: float = 0.6

class DocumentChat(BaseModel):
    message: str
    document_ids: Optional[List[str]] = None
    conversation_history: Optional[List[Dict[str, str]]] = None

@app.get("/")
async def root():
    return {
        "message": "AI-KMS Python Backend API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "documents": "/api/python/documents",
            "upload": "/api/python/documents/upload",
            "chat": "/api/python/chat",
            "search": "/api/python/search",
            "document_chat": "/api/python/documents/chat",
            "stats": "/api/python/stats"
        }
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy", 
        "timestamp": datetime.now(),
        "services": {
            "llm": llm_service.enabled,
            "vector": vector_service.embeddings_enabled,
            "search": True,
            "chat": True
        }
    }

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Extract user from token - simplified for demo"""
    # In production, verify JWT token properly
    token = credentials.credentials
    if not token:
        raise HTTPException(status_code=403, detail="No authentication token provided")
    
    # For now, accept any non-empty token and extract user info
    # In production, decode JWT properly and validate
    try:
        # Simple token validation - accept any Bearer token for development
        if token and len(token) > 10:  # Basic length check
            return {"user_id": "demo_user", "token": token, "sub": "demo_user"}
        else:
            raise HTTPException(status_code=403, detail="Invalid token format")
    except Exception as e:
        raise HTTPException(status_code=403, detail="Authentication failed")

@app.get("/api/python/documents")
async def get_documents(current_user: dict = Depends(get_current_user)):
    """Get user documents from main database"""
    try:
        user_id = current_user.get("sub") or current_user.get("user_id")
        
        # Fetch documents from main Node.js API
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "http://localhost:5000/api/documents",
                headers={"Authorization": f"Bearer {current_user.get('token', 'dummy-token')}"},
                timeout=10.0
            )
            
            if response.status_code == 200:
                documents = response.json()
                # Convert to Python backend format
                formatted_docs = []
                for doc in documents:
                    formatted_docs.append({
                        "id": str(doc.get("id")),
                        "name": doc.get("name", "Unknown Document"),
                        "content": doc.get("content", ""),
                        "summary": doc.get("summary", ""),
                        "created_at": doc.get("createdAt", datetime.now().isoformat()),
                        "file_size": doc.get("fileSize", 0),
                        "tags": doc.get("tags", []),
                        "category": doc.get("aiCategory", "Uncategorized")
                    })
                return formatted_docs
            else:
                print(f"Failed to fetch documents from main API: {response.status_code}")
                return []
                
    except Exception as e:
        print(f"Error fetching documents: {e}")
        # Return empty list instead of sample data when there's an error
        return []

@app.post("/api/python/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload and process document"""
    try:
        print(f"Python backend: Processing upload for user {user_id}, file: {file.filename}")
        
        # Process the uploaded file
        result = await document_processor.process_file(file, user_id)
        
        print(f"Python backend: File processed successfully, got {len(result.get('content', ''))} chars of content")
        
        # Generate embeddings for the document if content exists
        if result.get("content"):
            try:
                await vector_service.add_document(
                    document_id=str(result.get("document_id", "temp")),
                    content=result["content"]
                )
                print("Python backend: Vector embeddings generated successfully")
            except Exception as vector_error:
                print(f"Python backend: Vector embedding failed: {vector_error}")
        
        response_data = {
            "success": True,
            "document_id": result.get("document_id", "temp"),
            "message": "Document uploaded and processed successfully",
            "summary": result.get("summary", ""),
            "tags": result.get("tags", []),
            "category": result.get("category", ""),
            "name": result.get("name", file.filename),
            "file_size": result.get("file_size", 0),
            "content_length": len(result.get("content", ""))
        }
        
        print(f"Python backend: Returning response: {response_data}")
        return response_data
        
    except Exception as e:
        print(f"Python backend upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.post("/api/python/chat")
async def chat_with_ai(
    chat_data: ChatMessage,
    current_user: dict = Depends(get_current_user)
):
    """Chat with AI assistant"""
    try:
        user_id = current_user["user_id"]
        
        response = await chat_service.process_message(
            message=chat_data.message,
            user_id=user_id,
            conversation_history=chat_data.conversation_history,
            search_documents=chat_data.search_documents
        )
        
        return response
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")

@app.post("/api/python/search")
async def search_documents(
    search_data: SearchQuery,
    current_user: dict = Depends(get_current_user)
):
    """Search documents using hybrid search"""
    try:
        user_id = current_user["user_id"]
        
        results = await search_service.smart_search(
            query=search_data.query,
            user_id=user_id,
            search_type=search_data.search_type,
            limit=search_data.limit,
            keyword_weight=search_data.keyword_weight,
            vector_weight=search_data.vector_weight
        )
        
        return {
            "query": search_data.query,
            "search_type": search_data.search_type,
            "results": results,
            "total_found": len(results)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.post("/api/python/documents/chat")
async def chat_with_documents(
    chat_data: DocumentChat,
    current_user: dict = Depends(get_current_user)
):
    """Chat about specific documents"""
    try:
        user_id = current_user["user_id"]
        
        response = await chat_service.chat_with_documents(
            message=chat_data.message,
            user_id=user_id,
            document_ids=chat_data.document_ids,
            conversation_history=chat_data.conversation_history
        )
        
        return response
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document chat failed: {str(e)}")

@app.get("/api/python/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    """Get system statistics"""
    try:
        vector_stats = vector_service.get_document_stats()
        
        return {
            "vector_service": vector_stats,
            "services_status": {
                "llm_service": llm_service.enabled,
                "vector_service": vector_service.embeddings_enabled,
                "search_service": True,
                "chat_service": True
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
