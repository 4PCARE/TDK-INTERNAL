
import openai
import os
from typing import List, Dict, Any

class LLMService:
    def __init__(self):
        self.client = openai.OpenAI(
            api_key=os.getenv("OPENAI_API_KEY")
        )
    
    async def generate_response(self, message: str, search_results: List[Dict[str, Any]]) -> str:
        """Generate AI response using OpenAI"""
        try:
            # Build context from search results
            context = ""
            if search_results:
                context = "\n\n".join([
                    f"Document: {result.get('name', 'Unknown')}\nContent: {result.get('content', '')}"
                    for result in search_results[:5]  # Limit to top 5 results
                ])
            
            system_prompt = """You are an AI assistant helping users with their document management system. 
            You have access to the user's documents and can answer questions about them, help with searches, 
            provide summaries, and assist with document organization."""
            
            if context:
                system_prompt += f"\n\nAvailable documents:\n{context}"
            
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message}
                ],
                max_tokens=700
            )
            
            return response.choices[0].message.content or "I'm sorry, I couldn't generate a response."
            
        except Exception as e:
            return f"Error generating response: {str(e)}"
