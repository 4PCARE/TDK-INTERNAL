from typing import List, Dict, Any, Optional
from langchain.memory import ConversationBufferWindowMemory
from langchain.schema import HumanMessage, AIMessage
from langchain_openai import ChatOpenAI
import os
import json

class FixedChatService:
    """
    LangChain-powered chat service with proper ConversationalRetrievalChain implementation
    """
    
    def __init__(self):
        # Initialize OpenAI LLM
        self.llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0.7,
            openai_api_key=os.getenv("OPENAI_API_KEY")
        )
        
        # Per-user conversation memory
        self.user_memories = {}
        
        print("✅ Fixed Chat Service initialized with LangChain")

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
        """
        Process chat message with proper LangChain ConversationalRetrievalChain logic
        Returns frontend-compatible response format
        """
        
        try:
            print(f"🔄 Processing message for user {user_id}: {message[:100]}...")
            
            # Get user's conversation memory
            memory = self._get_user_memory(user_id)
            
            # Load conversation history into memory if provided
            if conversation_history:
                for msg in conversation_history[-10:]:  # Load last 10 messages
                    if msg.get('role') == 'user':
                        memory.chat_memory.add_user_message(msg.get('content', ''))
                    elif msg.get('role') == 'assistant':
                        memory.chat_memory.add_ai_message(msg.get('content', ''))

            # Search for relevant documents if enabled
            relevant_docs = []
            sources = []
            search_performed = False
            
            if search_documents:
                try:
                    # Import here to avoid circular dependency
                    from .fixed_search_service import FixedSearchService
                    search_service = FixedSearchService()
                    
                    search_results = await search_service.hybrid_search(
                        query=message,
                        user_id=user_id,
                        search_type="hybrid",
                        limit=max_context_docs
                    )
                    
                    if isinstance(search_results, list):
                        relevant_docs = search_results
                    elif isinstance(search_results, dict):
                        relevant_docs = search_results.get('results', [])
                    
                    # Format sources for frontend compatibility
                    sources = []
                    for doc in relevant_docs[:5]:  # Top 5 sources
                        sources.append({
                            'id': str(doc.get('id', '')),
                            'title': doc.get('name', doc.get('title', 'Unknown Document')),
                            'score': float(doc.get('score', 0.0)),
                            'content_preview': doc.get('content', '')[:200] + "..." if doc.get('content') else ""
                        })
                    
                    search_performed = True
                    print(f"📚 Found {len(relevant_docs)} relevant documents")
                    
                except Exception as search_error:
                    print(f"❌ Search error: {search_error}")
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
                # Prepare messages with system prompt and conversation history
                messages = [
                    {"role": "system", "content": system_prompt}
                ]
                
                # Add recent conversation history
                chat_history = memory.chat_memory.messages[-6:] if memory.chat_memory.messages else []
                for msg in chat_history:
                    if isinstance(msg, HumanMessage):
                        messages.append({"role": "user", "content": msg.content})
                    elif isinstance(msg, AIMessage):
                        messages.append({"role": "assistant", "content": msg.content})
                
                # Add current message
                messages.append({"role": "user", "content": message})

                # Get response from LLM
                response = await self.llm.ainvoke(messages)
                ai_response = response.content if hasattr(response, 'content') else str(response)
                
                # Save to memory
                memory.chat_memory.add_user_message(message)
                memory.chat_memory.add_ai_message(ai_response)
                
                print(f"✅ Generated response: {ai_response[:100]}...")
                
            except Exception as llm_error:
                print(f"❌ LLM generation error: {llm_error}")
                ai_response = "I apologize, but I'm having trouble processing your request right now. Please try again."

            # Return frontend-compatible response
            return {
                'message': ai_response,  # Frontend expects 'message' field
                'sources': sources,
                'search_performed': search_performed,
                'documents_found': len(relevant_docs)
            }

        except Exception as e:
            print(f"❌ Error processing chat message: {e}")
            import traceback
            traceback.print_exc()
            return {
                'message': f"I apologize, but I encountered an error processing your request. Please try again.",
                'sources': [],
                'search_performed': False,
                'documents_found': 0
            }

    def clear_user_memory(self, user_id: str):
        """Clear conversation memory for a user"""
        if user_id in self.user_memories:
            del self.user_memories[user_id]
            print(f"🧹 Cleared memory for user {user_id}")