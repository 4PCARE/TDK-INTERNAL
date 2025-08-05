
import os
import openai
from typing import List, Dict, Any
from dotenv import load_dotenv

load_dotenv()

class LLMService:
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            try:
                self.openai_client = openai.OpenAI(api_key=api_key)
            except Exception as e:
                print(f"Error initializing OpenAI client: {e}")
                self.openai_client = None
        else:
            self.openai_client = None
            print("Warning: OPENAI_API_KEY not set. LLM service will be disabled.")

    async def generate_response(self, message: str, search_results: List[Dict[str, Any]]) -> str:
        """Generate AI response based on user message and search results"""
        if not self.openai_client:
            return "AI service is currently unavailable. Please check the OpenAI API key configuration."
        
        try:
            # Build context from search results
            context = ""
            if search_results:
                context = "\n\nRelevant documents:\n"
                for i, result in enumerate(search_results[:3], 1):
                    context += f"{i}. {result.get('content', '')[:500]}...\n"
            
            response = await self.openai_client.chat.completions.acreate(
                model="gpt-4",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a helpful AI assistant that answers questions based on the provided document context. If no relevant context is provided, give a general helpful response."
                    },
                    {
                        "role": "user",
                        "content": f"Question: {message}{context}"
                    }
                ]
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            return f"Error generating response: {str(e)}"
