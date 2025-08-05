
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
    try:
        token = credentials.credentials if credentials else None
        
        if not token:
            print("Python backend: No authentication token provided")
            raise HTTPException(status_code=403, detail="No authentication token provided")
        
        # For development, accept any reasonable token format
        if token and len(token) > 5:  # Basic length check
            # Try to extract user info from token if it's a JWT-like structure
            # For development, create a consistent user object
            user_info = {
                "user_id": "demo_user", 
                "token": token, 
                "sub": "demo_user",
                "email": "demo@example.com"
            }
            
            print(f"Python backend: Successfully authenticated user with token: {token[:20]}...")
            return user_info
        else:
            print(f"Python backend: Invalid token format, length: {len(token) if token else 0}")
            raise HTTPException(status_code=403, detail="Invalid token format - token too short")
            
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        print(f"Python backend: Unexpected authentication error: {str(e)}")
        raise HTTPException(status_code=403, detail=f"Authentication failed: {str(e)}")

@app.get("/api/python/documents")
async def get_documents(current_user: dict = Depends(get_current_user)):
    """Get user documents from database"""
    try:
        user_id = current_user.get("sub") or current_user.get("user_id")
        
        # Access documents directly from the database
        from database import DatabaseService
        
        db_service = DatabaseService()
        documents = await db_service.get_user_documents(user_id)
        
        # Convert to Python backend format
        formatted_docs = []
        for doc in documents:
            formatted_docs.append({
                "id": str(doc.get("id")),
                "name": doc.get("name", "Unknown Document"),
                "content": doc.get("content", ""),
                "summary": doc.get("summary", ""),
                "created_at": doc.get("created_at", datetime.now().isoformat()),
                "file_size": doc.get("file_size", 0),
                "tags": doc.get("tags", []),
                "category": doc.get("ai_category", "Uncategorized")
            })
        
        return formatted_docs
                
    except Exception as e:
        print(f"Error fetching documents: {e}")
        # Return empty list when there's an error
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
