
import sqlite3
import asyncio
import aiosqlite
from typing import List, Dict, Any
import json

class DataMigrator:
    def __init__(self):
        self.source_db = "../db.sqlite"
        self.target_db = "python_db.sqlite"
    
    async def create_python_tables(self):
        """Create tables in Python database"""
        async with aiosqlite.connect(self.target_db) as db:
            # Create documents table
            await db.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    content TEXT,
                    category TEXT,
                    tags TEXT,
                    summary TEXT,
                    user_id TEXT NOT NULL,
                    file_size INTEGER,
                    file_type TEXT,
                    file_path TEXT,
                    created_at TEXT,
                    updated_at TEXT
                )
            """)
            
            # Create vector embeddings table
            await db.execute("""
                CREATE TABLE IF NOT EXISTS document_embeddings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id INTEGER,
                    chunk_index INTEGER,
                    content TEXT,
                    embedding TEXT,
                    created_at TEXT,
                    FOREIGN KEY (document_id) REFERENCES documents (id)
                )
            """)
            
            await db.commit()
    
    async def migrate_documents(self):
        """Migrate documents from Node.js database"""
        # Read from existing database
        conn = sqlite3.connect(self.source_db)
        cursor = conn.execute("""
            SELECT id, name, description, content, category, tags, summary,
                   user_id, file_size, file_type, file_path, created_at, updated_at
            FROM documents
        """)
        
        documents = cursor.fetchall()
        conn.close()
        
        # Write to Python database
        async with aiosqlite.connect(self.target_db) as db:
            for doc in documents:
                await db.execute("""
                    INSERT INTO documents (
                        id, name, description, content, category, tags, summary,
                        user_id, file_size, file_type, file_path, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, doc)
            
            await db.commit()
        
        print(f"Migrated {len(documents)} documents")

async def main():
    migrator = DataMigrator()
    await migrator.create_python_tables()
    await migrator.migrate_documents()
    print("Migration completed!")

if __name__ == "__main__":
    asyncio.run(main())
