
import re
import unicodedata
from typing import List, Dict, Any, Optional

class ThaiTextProcessor:
    def __init__(self):
        self.tone_marks = ['่', '้', '๊', '๋']
        self.vowels = ['า', 'ะ', 'ิ', 'ี', 'ึ', 'ื', 'ุ', 'ู', 'เ', 'แ', 'โ', 'ใ', 'ไ', 'ำ']
        print("Thai text processor initialized")
    
    def normalize_text(self, text: str) -> str:
        """Normalize Thai text for better processing"""
        if not text:
            return text
        
        # Unicode normalization
        text = unicodedata.normalize('NFC', text)
        
        # Optional: Remove tone marks for matching
        # text = self._remove_tone_marks(text)
        
        return text
    
    def _remove_tone_marks(self, text: str) -> str:
        """Remove Thai tone marks"""
        for mark in self.tone_marks:
            text = text.replace(mark, '')
        return text
    
    def segment_text(self, text: str) -> List[str]:
        """Simple Thai text segmentation"""
        if not text:
            return []
        
        # Basic segmentation - can be enhanced with pythainlp
        thai_pattern = r'[\u0E00-\u0E7F]+'
        english_pattern = r'[a-zA-Z]+'
        number_pattern = r'\d+'
        
        segments = []
        
        # Find all segments
        for match in re.finditer(f'({thai_pattern}|{english_pattern}|{number_pattern})', text):
            segment = match.group().strip()
            if len(segment) > 0:
                segments.append(segment)
        
        return segments
    
    def extract_keywords(self, text: str, min_length: int = 2) -> List[str]:
        """Extract Thai and English keywords"""
        segments = self.segment_text(text)
        keywords = []
        
        for segment in segments:
            if len(segment) >= min_length:
                # For Thai text, consider the whole segment as a keyword
                if re.search(r'[\u0E00-\u0E7F]', segment):
                    keywords.append(segment)
                # For English, split by common separators
                elif re.search(r'[a-zA-Z]', segment):
                    words = re.findall(r'\b\w+\b', segment)
                    keywords.extend([w for w in words if len(w) >= min_length])
        
        return list(set(keywords))  # Remove duplicates
    
    def calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate text similarity for Thai text"""
        if not text1 or not text2:
            return 0.0
        
        keywords1 = set(self.extract_keywords(text1.lower()))
        keywords2 = set(self.extract_keywords(text2.lower()))
        
        if not keywords1 and not keywords2:
            return 1.0
        if not keywords1 or not keywords2:
            return 0.0
        
        # Jaccard similarity
        intersection = len(keywords1.intersection(keywords2))
        union = len(keywords1.union(keywords2))
        
        return intersection / union if union > 0 else 0.0
    
    def enhance_query(self, query: str) -> str:
        """Enhance Thai query for better search"""
        if not query:
            return query
        
        normalized = self.normalize_text(query)
        
        # Add common variations or synonyms here
        # This is where you could add domain-specific enhancements
        
        return normalized
    
    def is_thai_text(self, text: str) -> bool:
        """Check if text contains Thai characters"""
        return bool(re.search(r'[\u0E00-\u0E7F]', text))
    
    def clean_text(self, text: str) -> str:
        """Clean and prepare Thai text for processing"""
        if not text:
            return text
        
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove problematic characters
        text = re.sub(r'[^\w\s\u0E00-\u0E7F.,!?;:()\-"\']+', ' ', text)
        
        # Normalize line breaks
        text = re.sub(r'\n\s*\n', '\n\n', text)
        
        return text.strip()
