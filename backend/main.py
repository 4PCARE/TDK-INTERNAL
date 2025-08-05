
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
    if not token or token == "dummy-token-for-testing":
        raise HTTPException(status_code=403, detail="Invalid authentication")
    
    # Extract user ID from token (simplified)
    # In production, decode JWT properly
    return {"user_id": "demo_user", "token": token}

@app.get("/api/python/documents")
async def get_documents(current_user: dict = Depends(get_current_user)):
    """Get user documents"""
    try:
        # Return demo documents for now
        documents = [
            {
                "id": "1",
                "name": "Sample Document 1.pdf",
                "content": "This is sample content for document 1 about artificial intelligence and machine learning.",
                "summary": "A document about AI and ML concepts",
                "created_at": datetime.now().isoformat(),
                "file_size": 1024,
                "tags": ["AI", "ML", "technology"]
            },
            {
                "id": "2", 
                "name": "Sample Document 2.docx",
                "content": "This is sample content for document 2 about business processes and workflow optimization.",
                "summary": "A document about business process optimization",
                "created_at": datetime.now().isoformat(),
                "file_size": 2048,
                "tags": ["business", "process", "workflow"]
            }
        ]
        return documents
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/python/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload and process document"""
    try:
        user_id = current_user["user_id"]
        
        # Process the uploaded file
        result = await document_processor.process_file(file, user_id)
        
        # Generate embeddings for the document
        if result.get("content"):
            await vector_service.add_document(
                document_id=str(result.get("document_id", "temp")),
                content=result["content"]
            )
        
        return {
            "success": True,
            "document_id": result.get("document_id", "temp"),
            "message": "Document uploaded and processed successfully",
            "summary": result.get("summary", ""),
            "tags": result.get("tags", []),
            "category": result.get("category", "")
        }
        
    except Exception as e:
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
