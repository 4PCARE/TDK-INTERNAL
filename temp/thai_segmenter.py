
import sys
import json
import io
from pythainlp import word_tokenize, sent_tokenize
from pythainlp.corpus.common import thai_stopwords

# Ensure proper UTF-8 encoding for stdin
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')

def segment_thai_text(text):
    """
    Segment Thai text using PythaiNLP
    Returns segmented text with proper word boundaries
    """
    # Try different tokenizers in order of preference
    tokenizer_engines = ['newmm', 'longest', 'attacut', 'deepcut']
    
    selected_engine = 'newmm'  # default
    
    # Test which tokenizer is available
    for engine in tokenizer_engines:
        try:
            # Test tokenizer with a simple word
            word_tokenize("ทดสอบ", engine=engine)
            selected_engine = engine
            break
        except Exception as e:
            print(f"DEBUG: Tokenizer '{engine}' not available: {e}", file=sys.stderr)
            continue
    
    print(f"DEBUG: Using tokenizer engine: {selected_engine}", file=sys.stderr)
    
    # Tokenize into sentences first
    try:
        sentences = sent_tokenize(text, engine=selected_engine)
    except:
        # Fallback to basic sentence splitting if sentence tokenizer fails
        sentences = text.split('\n')

    segmented_sentences = []
    for sentence in sentences:
        # Tokenize each sentence into words
        try:
            words = word_tokenize(sentence, engine=selected_engine)
        except Exception as e:
            print(f"DEBUG: Word tokenization failed with {selected_engine}: {e}", file=sys.stderr)
            # Fallback to basic space-based tokenization for Thai
            words = sentence.split()

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
    result = '\n'.join(segmented_sentences)
    return result

if __name__ == "__main__":
    try:
        # Read input from stdin and strip whitespace
        input_text = sys.stdin.read().strip()

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
