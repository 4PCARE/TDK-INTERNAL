import sqlite3
import aiosqlite
from typing import List, Dict, Any, Optional
import json
from datetime import datetime

class DatabaseService:
    def __init__(self):
        # Initialize database connection
        # For now, using mock data
        self.mock_documents = []

    async def get_user_documents(self, user_id: str):
        """Get all documents for a user"""
        # Mock implementation - return sample documents
        return [
            {
                "id": 1,
                "name": "Sample Document 1",
                "content": "This is sample content for document 1",
                "user_id": user_id,
                "created_at": "2025-01-01T00:00:00Z"
            },
            {
                "id": 2,
                "name": "Sample Document 2", 
                "content": "This is sample content for document 2",
                "user_id": user_id,
                "created_at": "2025-01-01T00:00:00Z"
            }
        ]

    async def store_document(self, document_data: Dict[str, Any], user_id: str) -> int:
        """Store document in database"""
        # Mock implementation - simulate storing document
        document_id = len(self.mock_documents) + 1
        document = {
            "id": document_id,
            "user_id": user_id,
            **document_data
        }
        self.mock_documents.append(document)
        return document_id

    async def get_document_content(self, document_id: int, user_id: str) -> Optional[str]:
        """Get document content by ID"""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("""
                SELECT content FROM documents 
                WHERE id = ? AND user_id = ?
            """, (document_id, user_id))

            row = await cursor.fetchone()
            return row[0] if row else None