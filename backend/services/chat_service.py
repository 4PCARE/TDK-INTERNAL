from typing import List, Dict, Any, Optional
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferWindowMemory
from langchain.schema import BaseMessage, HumanMessage, AIMessage
from langchain_openai import ChatOpenAI
from .llm_service import LLMService
from .search_service import SearchService
from .document_processor import DocumentProcessor
from .thai_text_processor import ThaiTextProcessor
import json
import httpx
import os

class ChatService:
    def __init__(self):
        self.llm_service = LLMService()
        self.search_service = SearchService()
        self.document_processor = DocumentProcessor()
        self.thai_processor = ThaiTextProcessor()
        
        # Initialize LangChain components
        self.llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0.7,
            openai_api_key=os.getenv("OPENAI_API_KEY")
        )
        
        # Conversation memory per user
        self.user_memories = {}
        
        print("Chat service initialized with LangChain ConversationalRetrievalChain support")

    def _get_user_memory(self, user_id: str) -> ConversationBufferWindowMemory:
        """Get or create conversation memory for user"""
        if user_id not in self.user_memories:
            self.user_memories[user_id] = ConversationBufferWindowMemory(
                memory_key="chat_history",
                return_messages=True,
                k=10,  # Keep last 10 exchanges
                output_key="answer"
            )
        return self.user_memories[user_id]

    async def process_message(
        self,
        message: str,
        user_id: str,
        conversation_history: List[Dict[str, str]] = None,
        search_documents: bool = True,
        max_context_docs: int = 5
    ) -> Dict[str, Any]:
        """Process chat message with LangChain ConversationalRetrievalChain"""

        try:
            # Get user's conversation memory
            memory = self._get_user_memory(user_id)
            
            # Load conversation history into memory if provided
            if conversation_history:
                for msg in conversation_history[-10:]:  # Load last 10 messages
                    if msg.get('role') == 'user':
                        memory.chat_memory.add_user_message(msg.get('content', ''))
                    elif msg.get('role') == 'assistant':
                        memory.chat_memory.add_ai_message(msg.get('content', ''))

            # Search for relevant documents
            relevant_docs = []
            sources = []
            search_performed = False
            
            if search_documents:
                try:
                    search_results = await self.search_service.hybrid_search(
                        query=message,
                        user_id=user_id,
                        search_type="smart_hybrid", 
                        limit=max_context_docs
                    )
                    
                    if isinstance(search_results, list):
                        relevant_docs = search_results
                    elif isinstance(search_results, dict):
                        relevant_docs = search_results.get('results', [])
                    
                    # Format sources for frontend
                    sources = []
                    for doc in relevant_docs[:5]:  # Top 5 sources
                        sources.append({
                            'id': str(doc.get('id', '')),
                            'title': doc.get('name', doc.get('title', 'Unknown Document')),
                            'score': float(doc.get('score', 0.0)),
                            'content_preview': doc.get('content', '')[:200] + "..." if doc.get('content') else ""
                        })
                    
                    search_performed = True
                    print(f"Found {len(relevant_docs)} relevant documents for query: {message}")
                    
                except Exception as search_error:
                    print(f"Search error: {search_error}")
                    relevant_docs = []

            # Build context from relevant documents
            context_text = ""
            if relevant_docs:
                context_chunks = []
                for doc in relevant_docs[:3]:  # Use top 3 documents
                    content = doc.get('content', '')
                    if content:
                        chunk = f"Document: {doc.get('name', 'Unknown')}\nContent: {content[:500]}..."
                        context_chunks.append(chunk)
                context_text = "\n\n".join(context_chunks)

            # Create system prompt with context
            system_prompt = f"""You are an intelligent AI assistant for a knowledge management system. 
            You help users find information from their documents and provide accurate, contextual answers.

            Instructions:
            - Provide specific, helpful answers based on the available context
            - Reference source documents when citing information
            - If you don't have enough information, say so clearly
            - Be conversational but professional
            - Remember previous conversation context

            Available Context:
            {context_text if context_text else "No specific documents found for this query."}
            """

            # Generate response using LangChain
            try:
                # Simple direct chat with context
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message}
                ]
                
                # Add recent conversation history
                chat_history = memory.chat_memory.messages[-6:] if memory.chat_memory.messages else []
                for msg in chat_history:
                    if isinstance(msg, HumanMessage):
                        messages.insert(-1, {"role": "user", "content": msg.content})
                    elif isinstance(msg, AIMessage):
                        messages.insert(-1, {"role": "assistant", "content": msg.content})

                # Get response from LLM
                response = await self.llm.ainvoke(messages)
                ai_response = response.content if hasattr(response, 'content') else str(response)
                
                # Save to memory
                memory.chat_memory.add_user_message(message)
                memory.chat_memory.add_ai_message(ai_response)
                
            except Exception as llm_error:
                print(f"LLM generation error: {llm_error}")
                ai_response = "I apologize, but I'm having trouble processing your request right now. Please try again."

            # Return frontend-compatible response
            return {
                'message': ai_response,  # Frontend expects 'message' field
                'sources': sources,
                'search_performed': search_performed,
                'documents_found': len(relevant_docs)
            }

        except Exception as e:
            print(f"Error processing chat message: {e}")
            return {
                'message': f"I apologize, but I encountered an error processing your request. Please try again.",
                'sources': [],
                'search_performed': False,
                'documents_found': 0
            }

    def _build_system_prompt(self, context_docs: List[Dict[str, Any]]) -> str:
        """Build enhanced system prompt based on available context"""

        base_prompt = """You are an intelligent AI assistant for a knowledge management system. 
You help users find information from their documents and provide accurate, contextual answers.

Guidelines:
- Provide specific, actionable answers when possible
- Reference source documents when citing information
- If information is incomplete, clearly state what's missing
- Use Thai language naturally when responding to Thai queries
- Be concise but comprehensive"""

        if context_docs:
            # Build context summary
            doc_summaries = []
            for i, doc in enumerate(context_docs[:5]):  # Limit to top 5 for prompt efficiency
                title = doc.get('title', f"Document {i+1}")
                content_preview = doc.get('content', '')[:200] + "..." if len(doc.get('content', '')) > 200 else doc.get('content', '')
                score = doc.get('score', 0.0)

                doc_summaries.append(f"[Document {i+1}: {title} (relevance: {score:.2f})]")
                doc_summaries.append(f"Content preview: {content_preview}")
                doc_summaries.append("")

            base_prompt += f"""

AVAILABLE CONTEXT ({len(context_docs)} documents found):

{chr(10).join(doc_summaries)}

Instructions:
- Use the above context to answer the user's question
- Reference specific documents when citing information
- If the context doesn't contain enough information, state this clearly
- Provide document titles/numbers when referencing sources"""

        else:
            base_prompt += """

No relevant documents were found in the knowledge base for this query.
- Provide general guidance if possible
- Suggest uploading relevant documents for more specific answers
- Ask clarifying questions if the query is unclear"""

        return base_prompt

    async def _enhance_query(self, message: str) -> str:
        """Enhance user query for better search results"""
        # Simple query enhancement - can be expanded
        enhanced = message.strip()

        # Add common search terms for better matching
        if any(keyword in enhanced.lower() for keyword in ['ค้นหา', 'หา', 'search', 'find']):
            return enhanced

        return enhanced

    async def chat_with_documents(
        self,
        message: str,
        user_id: str,
        document_ids: List[str] = None,
        conversation_history: List[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """Chat specifically about provided documents"""

        try:
            # If specific document IDs provided, search within those
            search_results = []
            if document_ids:
                search_results = await self.search_service.semantic_search(
                    query=message,
                    user_id=user_id,
                    specific_document_ids=document_ids,
                    limit=10
                )

            return await self.process_message(
                message=message,
                user_id=user_id,
                conversation_history=conversation_history,
                search_documents=bool(search_results)
            )

        except Exception as e:
            print(f"Error in document chat: {e}")
            return {
                'response': f"Error processing document chat: {str(e)}",
                'sources': [],
                'search_performed': False,
                'documents_found': 0
            }

    async def get_document_summary(self, document_content: str) -> str:
        """Generate summary for a document"""
        try:
            analysis = await self.llm_service.analyze_document(document_content)
            return analysis.get('summary', 'No summary available')
        except Exception as e:
            print(f"Error generating document summary: {e}")
            return "Error generating summary"

    async def answer_about_documents(
        self,
        question: str,
        user_id: str,
        context: str = "general"
    ) -> Dict[str, Any]:
        """Answer questions about user's document collection"""

        # Common document-related queries
        if "how many documents" in question.lower():
            stats = self.search_service.vector_service.get_document_stats()
            return {
                'response': f"You have {stats['total_documents']} documents with {stats['total_chunks']} searchable chunks in your knowledge base.",
                'sources': [],
                'search_performed': False,
                'documents_found': 0
            }

        # Default to regular search-based response
        return await self.process_message(question, user_id)

    async def search_documents(self, query: str, user_id: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search for relevant documents based on query"""
        try:
            # Search through main system's documents using the search API
            
            async with httpx.AsyncClient() as client:
                # Try semantic search first
                search_params = {
                    "query": query,
                    "type": "semantic",
                    "fileName": "false",
                    "keyword": "false", 
                    "meaning": "true"
                }

                response = await client.get(
                    "http://localhost:5000/api/documents/search",
                    params=search_params,
                    headers={"Authorization": f"Bearer dummy-token-{user_id}"},
                    timeout=15.0
                )

                if response.status_code == 200:
                    search_results = response.json()

                    # Convert to chat service format
                    formatted_results = []
                    for doc in search_results[:limit]:
                        formatted_results.append({
                            "id": str(doc.get("id")),
                            "name": doc.get("name", "Unknown Document"),
                            "content": doc.get("content", ""),
                            "summary": doc.get("summary", ""),
                            "similarity": doc.get("similarity", 0.0),
                            "relevant_chunk": doc.get("content", "")[:500] + "..." if len(doc.get("content", "")) > 500 else doc.get("content", "")
                        })

                    print(f"Found {len(formatted_results)} documents for query: {query}")
                    return formatted_results
                else:
                    print(f"Search API returned status {response.status_code}")
                    return []

        except Exception as e:
            print(f"Error searching documents: {e}")
            return []