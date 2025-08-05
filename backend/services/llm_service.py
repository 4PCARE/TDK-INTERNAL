import os
import openai
from typing import List, Dict, Any, Optional
import json
from dotenv import load_dotenv

load_dotenv()

class LLMService:
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            try:
                self.openai_client = openai.AsyncOpenAI(api_key=api_key)
                self.enabled = True
                print("LLM Service initialized with OpenAI")
            except Exception as e:
                print(f"Error initializing OpenAI client: {e}")
                self.openai_client = None
                self.enabled = False
        else:
            self.openai_client = None
            self.enabled = False
            print("Warning: OPENAI_API_KEY not set. LLM services will be disabled.")

    async def generate_chat_response(
        self,
        messages: List[Dict[str, str]],
        context_documents: List[Dict[str, Any]] = None,
        system_prompt: str = None
    ) -> str:
        """Generate chat response with optional document context"""
        if not self.enabled:
            return "LLM service is not available. Please configure OPENAI_API_KEY."

        try:
            # Build context from documents if provided
            context_text = ""
            if context_documents:
                context_text = "\n\nRelevant documents:\n"
                for i, doc in enumerate(context_documents[:5]):  # Limit to top 5
                    content = doc.get('content', '')[:500]  # Limit content length
                    context_text += f"\nDocument {i+1}: {content}...\n"

            # Build messages for OpenAI
            openai_messages = []

            # System prompt
            if system_prompt:
                openai_messages.append({"role": "system", "content": system_prompt})
            elif context_documents:
                openai_messages.append({
                    "role": "system",
                    "content": "You are a helpful AI assistant. Use the provided documents to answer questions accurately. If the information is not in the documents, say so."
                })

            # Add conversation history
            for message in messages:
                role = message.get('role', 'user')
                content = message.get('content', '')

                # Add context to the last user message
                if role == 'user' and message == messages[-1] and context_text:
                    content += context_text

                openai_messages.append({"role": role, "content": content})

            response = await self.openai_client.chat.completions.create(
                model="gpt-4o",
                messages=openai_messages,
                max_tokens=1000,
                temperature=0.7
            )

            return response.choices[0].message.content

        except Exception as e:
            print(f"Error generating chat response: {e}")
            return f"Sorry, I encountered an error: {str(e)}"

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for text"""
        if not self.enabled:
            return []

        try:
            response = await self.openai_client.embeddings.create(
                model="text-embedding-3-small",
                input=text.strip()
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"Error generating embedding: {e}")
            return []

    async def analyze_document(self, content: str) -> Dict[str, Any]:
        """Analyze document content for summary, tags, and category"""
        if not self.enabled:
            return {
                "summary": "Document processed (AI analysis disabled)",
                "tags": ["document"],
                "category": "Uncategorized"
            }

        try:
            response = await self.openai_client.chat.completions.create(
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
            print(f"Error analyzing document: {e}")
            return {
                "summary": "Document processed successfully",
                "tags": ["document"],
                "category": "Uncategorized"
            }

    async def expand_query(self, query: str) -> List[str]:
        """Expand query with synonyms and related terms"""
        if not self.enabled:
            return [query]

        try:
            response = await self.openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": """Generate 3-5 alternative search terms for the given query.
Include synonyms, related terms, and different ways to express the same concept.
Respond with a JSON array of strings.
Example: ["original term", "synonym1", "related term", "alternative phrase"]"""
                    },
                    {
                        "role": "user",
                        "content": f"Query: {query}"
                    }
                ],
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)
            expanded_terms = result.get('terms', [query])
            return expanded_terms if expanded_terms else [query]

        except Exception as e:
            print(f"Error expanding query: {e}")
            return [query]