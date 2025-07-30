
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export class ThaiTextProcessor {
  private pythonScript: string;

  constructor() {
    // Create the Python script content
    this.pythonScript = `
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
        # Get Thai stopwords
        stopwords = list(thai_stopwords())
        
        # Tokenize into sentences first
        sentences = sent_tokenize(text, engine='crfcut')
        
        segmented_sentences = []
        for sentence in sentences:
            # Tokenize each sentence into words
            words = word_tokenize(sentence, engine='newmm')
            
            # Filter out stopwords and empty strings
            filtered_words = [word.strip() for word in words if word.strip() and word.strip() not in stopwords]
            
            # Join words with spaces for better searchability
            segmented_sentence = ' '.join(filtered_words)
            if segmented_sentence.strip():
                segmented_sentences.append(segmented_sentence)
        
        # Join sentences back together
        result = ' '.join(segmented_sentences)
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
`;
  }

  /**
   * Check if text contains significant Thai content
   */
  private containsThaiText(text: string): boolean {
    const thaiRegex = /[\u0E00-\u0E7F]/g;
    const thaiMatches = text.match(thaiRegex);
    
    if (!thaiMatches) return false;
    
    // Consider it Thai text if more than 10% of characters are Thai
    const thaiRatio = thaiMatches.length / text.length;
    return thaiRatio > 0.1;
  }

  /**
   * Segment Thai text using PythaiNLP
   */
  async segmentThaiText(text: string): Promise<string> {
    if (!text || text.trim().length === 0) {
      return text;
    }

    // Only process if text contains significant Thai content
    if (!this.containsThaiText(text)) {
      console.log('📝 Text does not contain significant Thai content, skipping segmentation');
      return text;
    }

    try {
      console.log(`🇹🇭 Processing Thai text segmentation (${text.length} characters)...`);

      // Write Python script to temporary file
      const tempDir = path.join(process.cwd(), 'temp');
      await fs.promises.mkdir(tempDir, { recursive: true });
      
      const scriptPath = path.join(tempDir, 'thai_segmenter.py');
      await fs.promises.writeFile(scriptPath, this.pythonScript);

      // Execute Python script with input text
      const { stdout, stderr } = await execAsync(`echo '${text.replace(/'/g, "\\'")}' | python3 "${scriptPath}"`, {
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      if (stderr) {
        console.warn('⚠️ PythaiNLP warning:', stderr);
      }

      // Parse the JSON response
      const result = JSON.parse(stdout);

      if (result.success) {
        const segmentedText = result.segmented_text;
        console.log(`✅ Thai segmentation completed:`);
        console.log(`   - Original: ${result.original_length} characters`);
        console.log(`   - Segmented: ${result.segmented_length} characters`);
        console.log(`   - Sample: "${segmentedText.substring(0, 200)}..."`);
        
        // Clean up temp file
        try {
          await fs.promises.unlink(scriptPath);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }

        return segmentedText || text;
      } else {
        console.error('❌ Thai segmentation failed:', result.error);
        return text; // Return original text on failure
      }

    } catch (error) {
      console.error('❌ Thai text processing error:', error);
      return text; // Return original text on error
    }
  }

  /**
   * Process text for optimal search indexing
   * - Segments Thai text
   * - Preserves English and other languages
   * - Removes excessive whitespace
   */
  async processForSearch(text: string): Promise<string> {
    if (!text || text.trim().length === 0) {
      return text;
    }

    try {
      // First, segment Thai text
      let processedText = await this.segmentThaiText(text);

      // Clean up whitespace
      processedText = processedText
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/\n\s*\n/g, '\n') // Replace multiple newlines with single newline
        .trim();

      return processedText;

    } catch (error) {
      console.error('❌ Text processing error:', error);
      return text; // Return original text on error
    }
  }
}

export const thaiTextProcessor = new ThaiTextProcessor();
