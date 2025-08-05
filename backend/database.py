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
                print("DATABASE_URL not found, using environment variable")
                return []

            print(f"Connecting to database for user: {user_id}")
            conn = await asyncpg.connect(DATABASE_URL)

            # First, let's check what tables exist
            check_query = """
                SELECT table_name FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = 'documents'
            """
            table_check = await conn.fetch(check_query)
            print(f"Documents table exists: {len(table_check) > 0}")

            if len(table_check) == 0:
                print("Documents table not found")
                await conn.close()
                return []

            # Check table structure
            column_query = """
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'documents' AND table_schema = 'public'
                ORDER BY ordinal_position
            """
            columns = await conn.fetch(column_query)
            column_names = [col['column_name'] for col in columns]
            print(f"Available columns: {column_names}")

            # Build query based on available columns
            base_columns = ['id', 'name']
            optional_columns = {
                'content': 'content',
                'summary': 'summary', 
                'createdAt': '"createdAt"',
                'created_at': 'created_at',
                'fileSize': '"fileSize"',
                'file_size': 'file_size',
                'tags': 'tags',
                'aiCategory': '"aiCategory"',
                'ai_category': 'ai_category',
                'userId': '"userId"',
                'user_id': 'user_id'
            }

            select_columns = base_columns[:]
            for col_key, col_name in optional_columns.items():
                if col_key in column_names or col_name.strip('"') in column_names:
                    select_columns.append(col_name)

            # Determine user column name
            user_column = None
            if 'userId' in column_names:
                user_column = '"userId"'
            elif 'user_id' in column_names:
                user_column = 'user_id'
            
            if not user_column:
                print("No user column found (userId or user_id)")
                await conn.close()
                return []

            query = f"""
                SELECT {', '.join(select_columns)}
                FROM documents 
                WHERE {user_column} = $1 
                ORDER BY {'"createdAt"' if 'createdAt' in column_names else 'created_at' if 'created_at' in column_names else 'id'} DESC
            """

            print(f"Executing query: {query}")
            print(f"With user_id: {user_id}")

            rows = await conn.fetch(query, user_id)
            print(f"Found {len(rows)} documents")
            await conn.close()

            documents = []
            for row in rows:
                doc = dict(row)
                print(f"Processing document: {doc.get('id', 'unknown')} - {doc.get('name', 'no name')}")
                
                # Handle tags
                if isinstance(doc.get('tags'), str):
                    try:
                        doc['tags'] = json.loads(doc['tags']) if doc['tags'] else []
                    except:
                        doc['tags'] = []
                elif doc.get('tags') is None:
                    doc['tags'] = []
                
                # Normalize column names for consistency
                if 'createdAt' in doc:
                    doc['created_at'] = doc['createdAt']
                if 'fileSize' in doc:
                    doc['file_size'] = doc['fileSize']
                if 'aiCategory' in doc:
                    doc['ai_category'] = doc['aiCategory']
                if 'userId' in doc:
                    doc['user_id'] = doc['userId']

                documents.append(doc)

            print(f"Returning {len(documents)} processed documents")
            return documents

        except Exception as e:
            print(f"Database error in get_user_documents: {e}")
            import traceback
            traceback.print_exc()
            return []

    async def store_document(self, document_data: Dict[str, Any], user_id: str) -> str:
        """Store a document in the database"""
        # Mock implementation
        document_id = f"doc_{len(self.documents) + 1}"
        document_data["id"] = document_id
        document_data["user_id"] = user_id
        self.documents.append(document_data)
        return document_id