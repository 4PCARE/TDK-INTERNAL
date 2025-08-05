"""
OpenAPI Schema Generation for Frontend-Backend Contract Validation
Auto-generates API documentation that can be consumed by frontend for type safety
"""

from fastapi.openapi.utils import get_openapi
from fastapi import FastAPI
from typing import Dict, Any
import json

def generate_openapi_schema(app: FastAPI) -> Dict[str, Any]:
    """Generate OpenAPI schema for the Python backend"""
    
    if app.openapi_schema:
        return app.openapi_schema
    
    openapi_schema = get_openapi(
        title="AI-KMS Python Backend API",
        version="1.0.0",
        description="""
        Python microservice for AI-KMS handling LLM operations, document processing, and search.
        
        ## Authentication
        All endpoints require Bearer token authentication passed from the Node.js gateway.
        
        ## Response Formats
        All responses follow consistent patterns for frontend compatibility:
        
        ### Chat Endpoints
        - `response`: String - AI generated response
        - `sources`: Array - Referenced documents 
        - `search_performed`: Boolean - Whether document search was performed
        - `documents_found`: Number - Count of documents found
        
        ### Document Endpoints  
        - `id`: Number/String - Document identifier
        - `name`: String - Document name
        - `createdAt`: String - ISO timestamp (camelCase for frontend)
        - `fileSize`: Number - File size in bytes (camelCase for frontend)
        - `aiCategory`: String - AI-generated category (camelCase for frontend)
        
        ### Search Endpoints
        - `results`: Array - Search results
        - `total_found`: Number - Total results count
        - `query`: String - Original search query
        """,
        routes=app.routes,
    )
    
    # Add custom response examples
    openapi_schema["components"]["examples"] = {
        "ChatResponse": {
            "summary": "Successful chat response",
            "value": {
                "response": "Based on the documents, here's what I found...",
                "sources": [
                    {"id": "123", "title": "Document Title", "score": 0.95}
                ],
                "search_performed": True,
                "documents_found": 3
            }
        },
        "DocumentResponse": {
            "summary": "Document list response",
            "value": [
                {
                    "id": 123,
                    "name": "Sample Document.pdf",
                    "content": "Document content...",
                    "createdAt": "2024-01-01T00:00:00Z",
                    "fileSize": 1024,
                    "tags": ["important", "report"],
                    "aiCategory": "Financial"
                }
            ]
        },
        "ErrorResponse": {
            "summary": "Error response",
            "value": {
                "detail": "Error message describing what went wrong"
            }
        }
    }
    
    app.openapi_schema = openapi_schema
    return app.openapi_schema

def export_schema_for_frontend(app: FastAPI, output_path: str = "api_schema.json"):
    """Export OpenAPI schema as JSON file for frontend consumption"""
    schema = generate_openapi_schema(app)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(schema, f, indent=2, ensure_ascii=False)
    
    print(f"OpenAPI schema exported to {output_path}")
    return schema

def generate_typescript_types(schema: Dict[str, Any]) -> str:
    """Generate TypeScript type definitions from OpenAPI schema"""
    
    typescript_types = """
// Auto-generated TypeScript types for Python Backend API
// Generated from OpenAPI schema

export interface ChatRequest {
  message: string;
  conversation_history?: Array<{role: string; content: string}>;
  search_documents?: boolean;
}

export interface ChatResponse {
  response: string;
  sources: Array<{
    id: string;
    title: string;
    score: number;
    match_type?: string;
  }>;
  search_performed: boolean;
  documents_found: number;
  search_stats?: {
    total_found: number;
    selected_count: number;
    final_count: number;
  };
}

export interface DocumentResponse {
  id: number | string;
  name: string;
  content: string;
  summary: string;
  createdAt: string;
  fileSize: number;
  tags: string[];
  aiCategory: string;
  mimeType: string;
}

export interface SearchRequest {
  query: string;
  search_type?: string;
  limit?: number;
  keyword_weight?: number;
  vector_weight?: number;
}

export interface SearchResponse {
  query: string;
  search_type: string;
  results: DocumentResponse[];
  total_found: number;
}

export interface UploadResponse {
  success: boolean;
  document_id: string;
  message: string;
  summary: string;
  tags: string[];
  category: string;
  name: string;
  file_size: number;
  content_length: number;
}

export interface ApiError {
  detail: string;
}

// API Client types
export type ApiResponse<T> = T | ApiError;

export interface PythonBackendClient {
  chat: (request: ChatRequest) => Promise<ApiResponse<ChatResponse>>;
  chatMessage: (message: string) => Promise<ApiResponse<ChatResponse>>;
  getDocuments: () => Promise<ApiResponse<DocumentResponse[]>>;
  searchDocuments: (query: string, type?: string) => Promise<ApiResponse<DocumentResponse[]>>;
  uploadDocument: (file: File) => Promise<ApiResponse<UploadResponse>>;
}
"""
    
    return typescript_types

def save_typescript_types(schema: Dict[str, Any], output_path: str = "python_api_types.ts"):
    """Save TypeScript types to file for frontend use"""
    types = generate_typescript_types(schema)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(types)
    
    print(f"TypeScript types exported to {output_path}")
    return types