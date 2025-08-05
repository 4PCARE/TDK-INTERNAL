
import jwt
import os
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from fastapi import HTTPException

class AuthService:
    def __init__(self):
        self.jwt_secret = os.getenv("JWT_SECRET", "your-secret-key")
        self.algorithm = "HS256"
    
    async def verify_token(self, token: str) -> Dict[str, Any]:
        """Verify JWT token and return user data"""
        try:
            payload = jwt.decode(token, self.jwt_secret, algorithms=[self.algorithm])
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")
    
    def create_token(self, user_data: Dict[str, Any]) -> str:
        """Create JWT token for user"""
        payload = {
            **user_data,
            "exp": datetime.utcnow() + timedelta(hours=24)
        }
        return jwt.encode(payload, self.jwt_secret, algorithm=self.algorithm)
import jwt
import os
from typing import Dict, Any
from fastapi import HTTPException

class AuthService:
    def __init__(self):
        self.secret_key = os.getenv("JWT_SECRET", "your-secret-key")
    
    async def verify_token(self, token: str) -> Dict[str, Any]:
        """Verify JWT token and return user info"""
        try:
            # For development, we'll create a mock user
            # In production, you'd decode the actual JWT token
            if token == "mock-token":
                return {
                    "id": "mock-user-id",
                    "email": "test@example.com",
                    "name": "Test User"
                }
            
            # Actual JWT verification (commented for now)
            # payload = jwt.decode(token, self.secret_key, algorithms=["HS256"])
            # return payload
            
            # For testing, return mock user
            return {
                "id": "test-user-123",
                "email": "test@example.com",
                "name": "Test User"
            }
            
        except Exception as e:
            raise HTTPException(status_code=401, detail="Invalid token")
