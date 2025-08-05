
# API Contract Alignment Test Report
Generated: 2025-08-05T08:45:05.239909

## Summary
- **Total Tests**: 7
- **Passed**: 5
- **Failed**: 2
- **Success Rate**: 71.4%

## Detailed Results


### ❌ GET /health
- **Status Code**: 200
- **Frontend Compatible**: False
- **Response Size**: 125 bytes
- **Response Structure**: {
  "status": "str",
  "timestamp": "str",
  "services": {
    "llm": "bool",
    "vector": "bool",
    "search": "bool",
    "chat": "bool"
  }
}

### ✅ GET /api/python/documents
- **Status Code**: 200
- **Frontend Compatible**: True
- **Response Size**: 109105 bytes
- **Response Structure**: [
  {
    "id": "int",
    "name": "str",
    "content": "str",
    "summary": "str",
    "createdAt": "str",
    "fileSize": "int",
    "tags": [
      "max_depth_reached"
    ],
    "aiCategory": "str",
    "mimeType": "str"
  }
]

### ✅ GET /api/python/documents/search
- **Status Code**: 200
- **Frontend Compatible**: True
- **Response Size**: 2 bytes

### ✅ POST /api/python/chat
- **Status Code**: 200
- **Frontend Compatible**: True
- **Response Size**: 230 bytes
- **Response Structure**: {
  "response": "str",
  "sources": [],
  "search_performed": "bool",
  "documents_found": "int",
  "search_stats": {
    "total_found": "int",
    "selected_count": "int",
    "final_count": "int"
  }
}

### ✅ POST /api/python/chat/message
- **Status Code**: 200
- **Frontend Compatible**: True
- **Response Size**: 386 bytes
- **Response Structure**: {
  "response": "str",
  "sources": [],
  "search_performed": "bool",
  "documents_found": "int",
  "search_stats": {
    "total_found": "int",
    "selected_count": "int",
    "final_count": "int"
  }
}

### ✅ POST /api/python/search
- **Status Code**: 200
- **Frontend Compatible**: True
- **Response Size**: 74 bytes
- **Response Structure**: {
  "query": "str",
  "search_type": "str",
  "results": [],
  "total_found": "int"
}

### ❌ GET /api/python/stats
- **Status Code**: 200
- **Frontend Compatible**: False
- **Response Size**: 180 bytes
- **Response Structure**: {
  "vectorService": {
    "total_documents": "int",
    "total_chunks": "int",
    "embeddings_enabled": "bool"
  },
  "servicesStatus": {
    "llmService": "bool",
    "vectorService": "bool",
    "searchService": "bool",
    "chatService": "bool"
  }
}

## Recommendations

