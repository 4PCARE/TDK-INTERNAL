
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ThaiNlpResult {
  original_tokens: string[];
  expanded_terms: string[];
}

class ThaiNlpService {
  private pythonScriptPath: string;

  constructor() {
    this.pythonScriptPath = path.join(__dirname, 'thaiNLP.py');
  }

  async processQuery(queryText: string): Promise<ThaiNlpResult> {
    try {
      const command = `python3 "${this.pythonScriptPath}" "${queryText.replace(/"/g, '\\"')}"`;
      const { stdout, stderr } = await execAsync(command);

      if (stderr) {
        console.warn('Thai NLP warning:', stderr);
      }

      const result = JSON.parse(stdout);
      
      if (result.error) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      console.error('Thai NLP processing failed:', error);
      // Fallback to simple splitting
      const tokens = queryText.toLowerCase().split(/\s+/).filter(Boolean);
      return {
        original_tokens: tokens,
        expanded_terms: tokens
      };
    }
  }

  async tokenizeText(text: string): Promise<string[]> {
    const result = await this.processQuery(text);
    return result.original_tokens;
  }

  async expandSearchTerms(terms: string[]): Promise<string[]> {
    const queryText = terms.join(' ');
    const result = await this.processQuery(queryText);
    return result.expanded_terms;
  }
}

export const thaiNlpService = new ThaiNlpService();
