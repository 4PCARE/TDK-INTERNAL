
# API Contract Alignment Test Report
Generated: 2025-08-05T08:56:50.737489

## Summary
- **Total Tests**: 7
- **Passed**: 5
- **Failed**: 2
- **Success Rate**: 71.4%

## Detailed Results


### ❌ GET /health
- **Status Code**: 200
- **Frontend Compatible**: False
- **Response Size**: 130 bytes
- **Response Structure**: {
  "status": "str",
  "timestamp": "str",
  "services": {
    "chat": "bool",
    "search": "bool",
    "vector": "bool",
    "database": "bool"
  }
}

### ✅ GET /api/python/documents
- **Status Code**: 200
- **Frontend Compatible**: True
- **Response Size**: 2 bytes

### ✅ GET /api/python/documents/search
- **Status Code**: 200
- **Frontend Compatible**: True
- **Response Size**: 2 bytes

### ✅ POST /api/python/chat
- **Status Code**: 200
- **Frontend Compatible**: True
- **Response Size**: 138 bytes
- **Response Structure**: {
  "response": "str",
  "sources": [],
  "search_performed": "bool",
  "documents_found": "int"
}

### ✅ POST /api/python/chat/message
- **Status Code**: 200
- **Frontend Compatible**: True
- **Response Size**: 247 bytes
- **Response Structure**: {
  "response": "str",
  "sources": [],
  "search_performed": "bool",
  "documents_found": "int"
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
- **Response Size**: 187 bytes
- **Response Structure**: {
  "vectorService": {
    "total_documents": "int",
    "total_chunks": "int",
    "embeddings_enabled": "bool"
  },
  "servicesStatus": {
    "chatService": "bool",
    "searchService": "bool",
    "vectorService": "bool",
    "documentProcessor": "bool"
  }
}

## Recommendations

