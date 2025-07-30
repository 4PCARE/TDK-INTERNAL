
import sys
import json
from pythainlp import word_tokenize, sent_tokenize
from pythainlp.corpus.common import thai_stopwords

def segment_thai_text(text):
    """
    Segment Thai text using PythaiNLP
    Returns segmented text with proper word boundaries
    """
    try:
        # Tokenize into sentences first
        sentences = sent_tokenize(text, engine='newmm')
        
        segmented_sentences = []
        for sentence in sentences:
            # Tokenize each sentence into words
            words = word_tokenize(sentence, engine='newmm')
            
            # Process words - keep ALL words but add spaces between them
            processed_words = []
            for word in words:
                word = word.strip()
                # Keep all meaningful words (don't filter stopwords for better searchability)
                if len(word) > 0 and not word.isspace():
                    processed_words.append(word)
            
            # Join words with single spaces for proper segmentation
            segmented_sentence = ' '.join(processed_words)
            if segmented_sentence.strip():
                segmented_sentences.append(segmented_sentence)
        
        # Join sentences back together with newlines preserved
        result = '
'.join(segmented_sentences)
        return result
        
    except Exception as e:
        # If segmentation fails, return original text
        return text

if __name__ == "__main__":
    try:
        # Read input from stdin
        input_text = sys.stdin.read()
        
        # Process the text
        segmented_text = segment_thai_text(input_text)
        
        # Debug logging
        print(f"DEBUG SEGMENTED SAMPLE: {segmented_text[:300]}", file=sys.stderr)
        
        # Output as JSON
        result = {
            "success": True,
            "segmented_text": segmented_text,
            "original_length": len(input_text),
            "segmented_length": len(segmented_text)
        }
        
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e),
            "segmented_text": input_text if 'input_text' in locals() else ""
        }
        print(json.dumps(error_result, ensure_ascii=False))
