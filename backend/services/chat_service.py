
from typing import List, Dict, Any, Optional
from .llm_service import LLMService
from .search_service import SearchService
from .document_processor import DocumentProcessor
from .thai_text_processor import ThaiTextProcessor
import json

class ChatService:
    def __init__(self):
        self.llm_service = LLMService()
        self.search_service = SearchService()
        self.document_processor = DocumentProcessor()
        self.thai_processor = ThaiTextProcessor()
        print("Chat service initialized with Thai text support")

    async def process_message(
        self,
        message: str,
        user_id: str,
        conversation_history: List[Dict[str, str]] = None,
        search_documents: bool = True,
        max_context_docs: int = 5
    ) -> Dict[str, Any]:
        """Process chat message with optional document search"""
        
        try:
            # Initialize response
            response_data = {
                'response': '',
                'sources': [],
                'search_performed': False,
                'documents_found': 0
            }

            # Search for relevant documents if enabled
            relevant_docs = []
            if search_documents:
                try:
                    # Enhanced query preprocessing
                    enhanced_query = self.thai_processor.enhance_query(message)
                    
                    search_results = await self.search_service.new_search(
                        query=enhanced_query,
                        user_id=user_id,
                        search_type="smart_hybrid",
                        limit=max_context_docs
                    )
                    
                    # Handle enhanced search results
                    if isinstance(search_results, dict):
                        relevant_docs = search_results.get('results', [])
                        response_data['search_stats'] = {
                            'total_found': search_results.get('total_found', 0),
                            'selected_count': search_results.get('selected_count', 0),
                            'final_count': search_results.get('final_count', 0)
                        }
                    else:
                        relevant_docs = search_results
                    
                    response_data['search_performed'] = True
                    response_data['documents_found'] = len(relevant_docs)
                    response_data['sources'] = [
                        {
                            'id': doc.get('id', ''),
                            'title': doc.get('title', 'Unknown Document'),
                            'score': doc.get('score', 0.0),
                            'match_type': doc.get('match_type', 'unknown')
                        }
                        for doc in relevant_docs
                    ]
                    
                except Exception as search_error:
                    print(f"Search error: {search_error}")
                    # Continue without search results

            # Prepare conversation messages
            messages = []
            if conversation_history:
                messages.extend(conversation_history)
            
            messages.append({
                'role': 'user',
                'content': message
            })

            # Generate AI response
            system_prompt = self._build_system_prompt(relevant_docs)
            ai_response = await self.llm_service.generate_chat_response(
                messages=messages,
                context_documents=relevant_docs,
                system_prompt=system_prompt
            )

            response_data['response'] = ai_response
            return response_data

        except Exception as e:
            print(f"Error processing chat message: {e}")
            return {
                'response': f"I apologize, but I encountered an error: {str(e)}",
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
