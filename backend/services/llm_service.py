
import os
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
import asyncio

# LangChain imports
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain.schema import Document

load_dotenv()

class LLMService:
    def __init__(self):
        self.enabled = False
        self.chat_model = None
        self.embeddings_model = None
        
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            try:
                # Initialize LangChain models
                self.chat_model = ChatOpenAI(
                    api_key=api_key,
                    model="gpt-4o",
                    temperature=0.7,
                    max_tokens=1000
                )
                
                self.embeddings_model = OpenAIEmbeddings(
                    api_key=api_key,
                    model="text-embedding-3-small"
                )
                
                self.enabled = True
                print("LLM Service initialized with LangChain (OpenAI)")
            except Exception as e:
                print(f"Failed to initialize LangChain LLM service: {e}")
                self.enabled = False
        else:
            print("No OpenAI API key found - LLM service disabled")

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding using LangChain OpenAI embeddings"""
        if not self.enabled or not self.embeddings_model:
            print("Embeddings not available")
            return []

        try:
            # LangChain embeddings are synchronous but we can run in executor for async
            loop = asyncio.get_event_loop()
            embedding = await loop.run_in_executor(
                None, 
                self.embeddings_model.embed_query, 
                text
            )
            return embedding
        except Exception as e:
            print(f"Error generating embedding with LangChain: {e}")
            return []

    async def generate_chat_response(
        self,
        messages: List[Dict[str, str]],
        context_documents: List[Dict[str, Any]] = None,
        system_prompt: str = None
    ) -> str:
        """Generate chat response using LangChain"""
        if not self.enabled or not self.chat_model:
            return "LLM service is not available."

        try:
            # Convert messages to LangChain message format
            langchain_messages = []
            
            # Add system message if provided
            if system_prompt:
                langchain_messages.append(SystemMessage(content=system_prompt))
            
            # Convert conversation messages
            for msg in messages:
                role = msg.get('role')
                content = msg.get('content', '')
                
                if role == 'user':
                    langchain_messages.append(HumanMessage(content=content))
                elif role == 'assistant':
                    langchain_messages.append(AIMessage(content=content))
                elif role == 'system':
                    langchain_messages.append(SystemMessage(content=content))

            # Add context from documents if available
            if context_documents:
                context_text = "\n\n".join([
                    f"Document: {doc.get('title', 'Unknown')}\nContent: {doc.get('content', '')[:500]}..."
                    for doc in context_documents[:5]
                ])
                
                if context_text:
                    context_message = f"\nRelevant context from documents:\n{context_text}"
                    langchain_messages.append(SystemMessage(content=context_message))

            # Generate response using LangChain
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                self.chat_model.invoke,
                langchain_messages
            )
            
            return response.content

        except Exception as e:
            print(f"Error generating chat response with LangChain: {e}")
            return f"I apologize, but I encountered an error while processing your request: {str(e)}"

    async def analyze_document(self, content: str) -> Dict[str, Any]:
        """Analyze document content using LangChain"""
        if not self.enabled or not self.chat_model:
            return {
                "summary": "Document analysis not available",
                "tags": [],
                "category": "Uncategorized"
            }

        try:
            # Create analysis prompt
            prompt = ChatPromptTemplate.from_messages([
                ("system", """You are a document analysis expert. Analyze the provided document and return:
1. A concise summary (2-3 sentences)
2. Relevant tags (3-5 keywords)
3. A category classification

Respond in JSON format:
{
  "summary": "Brief summary here",
  "tags": ["tag1", "tag2", "tag3"],
  "category": "Category Name"
}"""),
                ("human", f"Document content:\n\n{content[:3000]}...")
            ])

            # Generate analysis
            chain = prompt | self.chat_model
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, chain.invoke, {})
            
            # Try to parse JSON response
            import json
            try:
                result = json.loads(response.content)
                return {
                    "summary": result.get("summary", "Analysis completed"),
                    "tags": result.get("tags", []),
                    "category": result.get("category", "Document")
                }
            except json.JSONDecodeError:
                # Fallback if JSON parsing fails
                return {
                    "summary": response.content[:200] + "..." if len(response.content) > 200 else response.content,
                    "tags": ["document", "analysis"],
                    "category": "Document"
                }

        except Exception as e:
            print(f"Error analyzing document with LangChain: {e}")
            return {
                "summary": f"Analysis error: {str(e)}",
                "tags": ["error"],
                "category": "Error"
            }

    async def expand_query(self, query: str) -> List[str]:
        """Expand search query using LangChain"""
        if not self.enabled or not self.chat_model:
            return [query]

        try:
            prompt = ChatPromptTemplate.from_messages([
                ("system", """You are a search query expansion expert. Given a user query, generate 2-3 alternative phrasings that would help find relevant documents. Return them as a simple list, one per line, without numbers or bullets."""),
                ("human", f"Original query: {query}")
            ])

            chain = prompt | self.chat_model
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, chain.invoke, {})
            
            # Parse response into list
            expanded_queries = [query]  # Always include original
            
            lines = response.content.strip().split('\n')
            for line in lines:
                line = line.strip()
                if line and line != query:
                    expanded_queries.append(line)
            
            return expanded_queries[:4]  # Limit to 4 total queries

        except Exception as e:
            print(f"Error expanding query with LangChain: {e}")
            return [query]
