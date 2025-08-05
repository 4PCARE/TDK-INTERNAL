"""
API Contract Validation and Response Normalization
Handles serialization issues and ensures frontend-compatible responses
"""

import json
from typing import Any, Dict, List, Optional, Union
from datetime import datetime
from pydantic import BaseModel

class APIResponse(BaseModel):
    """Standardized API response structure"""
    success: bool = True
    data: Optional[Any] = None
    message: str = ""
    errors: List[str] = []
    timestamp: str = ""
    
    def __init__(self, **data):
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now().isoformat()
        super().__init__(**data)

class ChatResponse(BaseModel):
    """Chat response structure expected by frontend"""
    response: str
    sources: List[Dict[str, Any]] = []
    search_performed: bool = False
    documents_found: int = 0
    search_stats: Optional[Dict[str, Any]] = None

class DocumentResponse(BaseModel):
    """Document response structure expected by frontend"""
    id: Union[int, str]
    name: str
    content: str = ""
    summary: str = ""
    createdAt: str
    fileSize: int = 0
    tags: List[str] = []
    aiCategory: str = "Uncategorized"
    mimeType: str = "application/octet-stream"

class SearchResponse(BaseModel):
    """Search response structure"""
    query: str
    search_type: str
    results: List[Dict[str, Any]] = []
    total_found: int = 0

def sanitize_langchain_response(obj: Any) -> Any:
    """
    Sanitize LangChain objects for JSON serialization
    Handles complex objects that don't serialize properly
    """
    if obj is None:
        return None
    
    # Handle LangChain Document objects
    if hasattr(obj, 'page_content') and hasattr(obj, 'metadata'):
        return {
            'content': str(obj.page_content),
            'metadata': sanitize_langchain_response(obj.metadata)
        }
    
    # Handle LangChain BaseMessage objects  
    if hasattr(obj, 'content') and hasattr(obj, 'type'):
        return {
            'content': str(obj.content),
            'type': str(obj.type)
        }
    
    # Handle dictionaries
    if isinstance(obj, dict):
        return {key: sanitize_langchain_response(value) for key, value in obj.items()}
    
    # Handle lists
    if isinstance(obj, (list, tuple)):
        return [sanitize_langchain_response(item) for item in obj]
    
    # Handle primitive types
    if isinstance(obj, (str, int, float, bool)):
        return obj
    
    # Handle datetime objects
    if isinstance(obj, datetime):
        return obj.isoformat()
    
    # For everything else, try to convert to string
    try:
        return str(obj)
    except:
        return None

def normalize_chat_response(response: Dict[str, Any]) -> ChatResponse:
    """Normalize chat response to frontend-expected format"""
    sanitized = sanitize_langchain_response(response)
    
    return ChatResponse(
        response=sanitized.get('response', ''),
        sources=sanitized.get('sources', []),
        search_performed=sanitized.get('search_performed', False),
        documents_found=sanitized.get('documents_found', 0),
        search_stats=sanitized.get('search_stats')
    )

def normalize_document_response(doc: Dict[str, Any]) -> DocumentResponse:
    """Normalize document response to frontend-expected format"""
    sanitized = sanitize_langchain_response(doc)
    
    return DocumentResponse(
        id=sanitized.get('id'),
        name=sanitized.get('name', 'Unknown Document'),
        content=sanitized.get('content', ''),
        summary=sanitized.get('summary', ''),
        createdAt=sanitized.get('createdAt') or sanitized.get('created_at', datetime.now().isoformat()),
        fileSize=sanitized.get('fileSize') or sanitized.get('file_size', 0),
        tags=sanitized.get('tags', []),
        aiCategory=sanitized.get('aiCategory') or sanitized.get('ai_category', 'Uncategorized'),
        mimeType=sanitized.get('mimeType') or sanitized.get('mime_type', 'application/octet-stream')
    )

def safe_serialize(obj: Any) -> str:
    """Safely serialize objects to JSON, handling LangChain objects"""
    try:
        sanitized = sanitize_langchain_response(obj)
        return json.dumps(sanitized, default=str, ensure_ascii=False)
    except Exception as e:
        print(f"Serialization error: {e}")
        return json.dumps({"error": "Serialization failed", "message": str(e)})

def validate_response_schema(response: Any, expected_fields: List[str]) -> Dict[str, Any]:
    """Validate that response has expected fields"""
    errors = []
    
    if not isinstance(response, dict):
        errors.append("Response must be a dictionary")
        return {"valid": False, "errors": errors}
    
    for field in expected_fields:
        if field not in response:
            errors.append(f"Missing required field: {field}")
    
    return {"valid": len(errors) == 0, "errors": errors}