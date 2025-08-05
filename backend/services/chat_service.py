
from typing import List, Dict, Any, Optional
from .llm_service import LLMService
from .search_service import SearchService
from .document_processor import DocumentProcessor
import json

class ChatService:
    def __init__(self):
        self.llm_service = LLMService()
        self.search_service = SearchService()
        self.document_processor = DocumentProcessor()
        print("Chat service initialized")

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
                    search_results = await self.search_service.smart_search(
                        query=message,
                        user_id=user_id,
                        search_type="hybrid",
                        limit=max_context_docs
                    )
                    
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
        """Build system prompt based on available context"""
        
        base_prompt = """You are a helpful AI assistant for a knowledge management system. 
You help users find information from their documents and answer questions accurately."""

        if context_docs:
            base_prompt += f"""

You have access to {len(context_docs)} relevant documents from the user's knowledge base. 
Use this information to provide accurate, specific answers. If the information needed 
to answer a question is not in the provided documents, clearly state that.

When referencing information from documents, be specific about which document you're citing."""

        else:
            base_prompt += """

No specific documents were found for this query. Provide general helpful responses 
and suggest that the user might want to upload relevant documents to get more specific answers."""

        return base_prompt

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
