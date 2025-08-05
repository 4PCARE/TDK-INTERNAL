import os
import tempfile
from typing import Dict, Any
from fastapi import UploadFile
import openai
from pathlib import Path
import PyPDF2
import docx
import pandas as pd
import json

class DocumentProcessor:
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            self.openai_client = openai.OpenAI(api_key=api_key)
        else:
            self.openai_client = None
            print("Warning: OPENAI_API_KEY not set. AI analysis will be disabled.")

    async def process_file(self, file: UploadFile, user_id: str) -> Dict[str, Any]:
        """Process uploaded file and extract content"""
        try:
            # Save file temporarily
            with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as temp_file:
                content = await file.read()
                temp_file.write(content)
                temp_path = temp_file.name

            # Extract content based on file type
            extracted_content = await self._extract_content(temp_path, file.content_type)

            # Analyze with AI
            analysis = await self._analyze_content(extracted_content)

            return {
                "name": file.filename,
                "content": extracted_content,
                "file_size": len(content),
                "file_type": file.content_type,
                "file_path": temp_path,
                **analysis
            }

        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.unlink(temp_path)

    async def _extract_content(self, file_path: str, mime_type: str) -> str:
        """Extract text content from file"""

        if mime_type == "application/pdf":
            return self._extract_pdf(file_path)
        elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            return self._extract_docx(file_path)
        elif mime_type in ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]:
            return self._extract_excel(file_path)
        elif mime_type == "text/plain":
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        elif mime_type == "application/json":
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return json.dumps(data, indent=2, ensure_ascii=False)
        else:
            return f"File type {mime_type} not supported for content extraction"

    def _extract_pdf(self, file_path: str) -> str:
        """Extract text from PDF"""
        try:
            with open(file_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)
                text = ""
                for page in reader.pages:
                    text += page.extract_text()
                return text
        except Exception as e:
            return f"Error extracting PDF: {str(e)}"

    def _extract_docx(self, file_path: str) -> str:
        """Extract text from DOCX"""
        try:
            doc = docx.Document(file_path)
            text = ""
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
            return text
        except Exception as e:
            return f"Error extracting DOCX: {str(e)}"

    def _extract_excel(self, file_path: str) -> str:
        """Extract text from Excel"""
        try:
            df = pd.read_excel(file_path)
            return df.to_string()
        except Exception as e:
            return f"Error extracting Excel: {str(e)}"

    async def _analyze_content(self, content: str) -> Dict[str, Any]:
        """Analyze content with OpenAI"""
        if not self.openai_client:
            return {
                "summary": "Document processed successfully (AI analysis disabled - no API key)",
                "tags": ["document"],
                "category": "Uncategorized"
            }
        
        try:
            response = await self.openai_client.chat.completions.acreate(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": """Analyze this document and provide:
1. A concise summary (2-3 sentences)
2. 3-5 relevant tags
3. Category classification (HR, Finance, Legal, Marketing, Technical, Operations, Research, Personal, Administrative, Data, Uncategorized)

Respond in JSON format:
{
  "summary": "document summary",
  "tags": ["tag1", "tag2", "tag3"],
  "category": "category_name"
}"""
                    },
                    {
                        "role": "user",
                        "content": content[:8000]  # Limit content length
                    }
                ],
                response_format={"type": "json_object"}
            )

            analysis = json.loads(response.choices[0].message.content)
            return analysis

        except Exception as e:
            return {
                "summary": "Document processed successfully",
                "tags": ["document"],
                "category": "Uncategorized"
            }