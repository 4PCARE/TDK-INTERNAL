
import sqlite3
import aiosqlite
from typing import List, Dict, Any, Optional
import json
from datetime import datetime

class DatabaseService:
    def __init__(self):
        self.db_path = "../db.sqlite"
    
    async def get_user_documents(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all documents for a user"""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("""
                SELECT id, name, description, category, tags, summary, 
                       created_at, updated_at, file_size, file_type
                FROM documents 
                WHERE user_id = ? 
                ORDER BY created_at DESC
            """, (user_id,))
            
            rows = await cursor.fetchall()
            documents = []
            
            for row in rows:
                documents.append({
                    "id": row[0],
                    "name": row[1],
                    "description": row[2],
                    "category": row[3],
                    "tags": json.loads(row[4]) if row[4] else [],
                    "summary": row[5],
                    "created_at": row[6],
                    "updated_at": row[7],
                    "file_size": row[8],
                    "file_type": row[9]
                })
            
            return documents
    
    async def store_document(self, document_data: Dict[str, Any], user_id: str) -> int:
        """Store a new document"""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("""
                INSERT INTO documents (
                    name, description, content, category, tags, summary,
                    user_id, file_size, file_type, file_path, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                document_data["name"],
                document_data.get("description", ""),
                document_data["content"],
                document_data["category"],
                json.dumps(document_data["tags"]),
                document_data["summary"],
                user_id,
                document_data.get("file_size", 0),
                document_data.get("file_type", ""),
                document_data.get("file_path", ""),
                datetime.now().isoformat(),
                datetime.now().isoformat()
            ))
            
            await db.commit()
            return cursor.lastrowid
    
    async def get_document_content(self, document_id: int, user_id: str) -> Optional[str]:
        """Get document content by ID"""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("""
                SELECT content FROM documents 
                WHERE id = ? AND user_id = ?
            """, (document_id, user_id))
            
            row = await cursor.fetchone()
            return row[0] if row else None
