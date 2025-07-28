
#!/usr/bin/env python3
import sys
import json
from pythainlp import word_tokenize, util
from pythainlp.corpus import thai_stopwords

def normalize_thai_text(text):
    """Normalize Thai text by removing tone marks and simplifying vowels"""
    # Remove tone marks
    text = util.normalize(text)
    # Additional normalization can be added here
    return text.strip()

def tokenize_thai_text(text):
    """Tokenize Thai text using pythaiNLP"""
    # Use newmm engine which is good for general purpose
    tokens = word_tokenize(text, engine='newmm')
    
    # Filter out empty tokens and whitespace
    tokens = [token.strip() for token in tokens if token.strip()]
    
    # Remove common Thai stopwords
    stopwords = thai_stopwords()
    tokens = [token for token in tokens if token not in stopwords]
    
    return tokens

def expand_search_terms(terms):
    """Expand search terms with normalized variants"""
    expanded_terms = []
    
    for term in terms:
        # Add original term
        expanded_terms.append(term)
        
        # Add normalized variant if different
        normalized = normalize_thai_text(term)
        if normalized != term and normalized:
            expanded_terms.append(normalized)
    
    # Remove duplicates while preserving order
    seen = set()
    result = []
    for term in expanded_terms:
        if term not in seen:
            seen.add(term)
            result.append(term)
    
    return result

def process_query(query_text):
    """Process a query and return tokenized and expanded terms"""
    # Tokenize the query
    tokens = tokenize_thai_text(query_text)
    
    # Expand terms with variants
    expanded = expand_search_terms(tokens)
    
    return {
        'original_tokens': tokens,
        'expanded_terms': expanded
    }

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python thaiNLP.py '<query_text>'"}))
        sys.exit(1)
    
    query = sys.argv[1]
    result = process_query(query)
    print(json.dumps(result, ensure_ascii=False))
