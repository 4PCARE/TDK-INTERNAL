import sqlite3
import aiosqlite
from typing import List, Dict, Any, Optional
import json
from datetime import datetime
import asyncio
import os
import asyncpg

class DatabaseService:
    def __init__(self):
        # Mock database - in production you'd connect to actual database
        self.documents = []
        self.users = {}

    async def get_user_documents(self, user_id: str) -> List[Dict[str, Any]]:
        """Get documents for a specific user"""
        try:
            DATABASE_URL = os.getenv("DATABASE_URL")
            if not DATABASE_URL:
                print("DATABASE_URL not found")
                return []

            conn = await asyncpg.connect(DATABASE_URL)

            query = """
                SELECT id, name, content, summary, "createdAt" as created_at, 
                       "fileSize" as file_size, tags, "aiCategory" as ai_category
                FROM documents 
                WHERE "userId" = $1 
                ORDER BY "createdAt" DESC
            """

            rows = await conn.fetch(query, user_id)
            await conn.close()

            documents = []
            for row in rows:
                doc = dict(row)
                # Convert tags from JSON string if needed
                if isinstance(doc.get('tags'), str):
                    import json
                    try:
                        doc['tags'] = json.loads(doc['tags'])
                    except:
                        doc['tags'] = []
                elif doc.get('tags') is None:
                    doc['tags'] = []

                documents.append(doc)

            return documents

        except Exception as e:
            print(f"Database error in get_user_documents: {e}")
            return []

    async def store_document(self, document_data: Dict[str, Any], user_id: str) -> str:
        """Store a document in the database"""
        # Mock implementation
        document_id = f"doc_{len(self.documents) + 1}"
        document_data["id"] = document_id
        document_data["user_id"] = user_id
        self.documents.append(document_data)
        return document_id