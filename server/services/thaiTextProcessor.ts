import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export class ThaiTextProcessor {
  private scriptPath: string;

  constructor() {
    // Use the persistent Python file
    this.scriptPath = path.join(process.cwd(), 'temp', 'thai_segmenter.py');
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

      // Write input to temporary file
      const tempDir = path.join(process.cwd(), 'temp');
      await fs.promises.mkdir(tempDir, { recursive: true });

      const inputPath = path.join(tempDir, 'input.txt');
      await fs.promises.writeFile(inputPath, text, 'utf8');

      // Execute Python script with input file
      const { stdout, stderr } = await execAsync(`python3 "${this.scriptPath}" < "${inputPath}"`, {
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

        // Clean up temp input file
        try {
          await fs.promises.unlink(inputPath);
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

      // Clean up whitespace while preserving Thai word boundaries from segmentation
      processedText = processedText
        .replace(/\n\s*\n/g, '\n') // Replace multiple newlines with single newline
        .replace(/^\s+|\s+$/g, '') // Trim leading and trailing whitespace
        .trim();
      
      // DO NOT collapse multiple spaces - they are Thai word boundaries!

      return processedText;

    } catch (error) {
      console.error('❌ Text processing error:', error);
      return text; // Return original text on error
    }
  }
}

export const thaiTextProcessor = new ThaiTextProcessor();