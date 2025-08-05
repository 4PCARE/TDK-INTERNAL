
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uvicorn
import os
from typing import List, Optional, Dict, Any
import asyncio
from datetime import datetime

# Import our modules (we'll create these next)
from auth import AuthService
from database import DatabaseService
from services.document_processor import DocumentProcessor
from services.llm_service import LLMService
from services.vector_service import VectorService
from services.search_service import SearchService

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

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now()}

@app.get("/api/python/documents")
async def get_documents(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        user = await auth_service.verify_token(credentials.credentials)
        documents = await db_service.get_user_documents(user["id"])
        return {"documents": documents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/python/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        user = await auth_service.verify_token(credentials.credentials)
        
        # Process document
        result = await document_processor.process_file(file, user["id"])
        
        # Store in database
        document_id = await db_service.store_document(result, user["id"])
        
        # Generate embeddings
        await vector_service.generate_embeddings(document_id, result["content"])
        
        return {"success": True, "document_id": document_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/python/chat")
async def chat_endpoint(
    request: Dict[str, Any],
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        user = await auth_service.verify_token(credentials.credentials)
        message = request.get("message")
        
        # Search relevant documents
        search_results = await search_service.hybrid_search(message, user["id"])
        
        # Generate response
        response = await llm_service.generate_response(message, search_results)
        
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
