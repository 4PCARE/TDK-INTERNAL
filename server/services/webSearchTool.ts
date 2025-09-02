
import { WebSearchService } from './webSearchService';
import { storage } from '../storage';

export interface WebSearchToolConfig {
  enabled: boolean;
  triggerKeywords: string[];
  maxResults: number;
  requireWhitelist: boolean;
}

export class WebSearchTool {
  private webSearchService: WebSearchService;

  constructor() {
    this.webSearchService = WebSearchService.getInstance();
  }

  async shouldTriggerWebSearch(message: string, config: WebSearchToolConfig): Promise<boolean> {
    if (!config.enabled) {
      return false;
    }

    // Check if message contains trigger keywords
    const lowerMessage = message.toLowerCase();
    const triggerKeywords = config.triggerKeywords || [
      'search', 'find', 'lookup', 'web', 'online', 'internet',
      'latest', 'current', 'news', 'update', 'recent',
      'ค้นหา', 'หา', 'ข้อมูล', 'เว็บ', 'อินเทอร์เน็ต', 'ล่าสุด'
    ];

    const hasKeyword = triggerKeywords.some(keyword => 
      lowerMessage.includes(keyword.toLowerCase())
    );

    // Also trigger for question-like patterns
    const questionPatterns = [
      /what.*is/i, /where.*is/i, /how.*to/i, /when.*does/i,
      /.*คือ.*อะไร/i, /.*อยู่.*ที่ไหน/i, /.*ทำ.*ยังไง/i
    ];

    const hasQuestionPattern = questionPatterns.some(pattern => 
      pattern.test(message)
    );

    return hasKeyword || hasQuestionPattern;
  }

  async performWebSearch(
    query: string, 
    agentId: number, 
    userId: string, 
    config: WebSearchToolConfig
  ): Promise<{results: any[], source: string}> {
    console.log(`🌐 Performing web search for agent ${agentId}: "${query}"`);

    try {
      // Get whitelisted URLs if whitelist is required
      if (config.requireWhitelist) {
        const whitelistEntries = await storage.getAgentWhitelistUrls(agentId, userId);
        const urls = whitelistEntries.map(entry => entry.url);

        if (urls.length === 0) {
          console.log(`⚠️ No whitelisted URLs found for agent ${agentId}`);
          return { results: [], source: 'whitelist' };
        }

        console.log(`🔍 Searching whitelisted URLs: ${urls.join(', ')}`);
        const results = await this.webSearchService.searchWhitelistedUrls(
          query, 
          urls, 
          config.maxResults || 5
        );

        return { results, source: 'whitelist' };
      } else {
        // Fallback to general web search
        console.log(`🌍 Performing general web search`);
        const results = await this.webSearchService.searchWeb(
          query, 
          config.maxResults || 5
        );

        return { results, source: 'general' };
      }
    } catch (error) {
      console.error(`❌ Web search failed:`, error);
      throw error;
    }
  }

  formatWebSearchResults(results: any[], source: string): string {
    if (results.length === 0) {
      return source === 'whitelist' 
        ? 'No relevant information found in the configured trusted sources.'
        : 'No web search results found.';
    }

    const sourceLabel = source === 'whitelist' 
      ? 'trusted sources' 
      : 'web search';

    const formattedResults = results.map((result, index) => {
      return `${index + 1}. **${result.title}**
   🔗 ${result.url}
   📄 ${result.snippet}`;
    }).join('\n\n');

    return `📊 **Search Results from ${sourceLabel}:**\n\n${formattedResults}`;
  }
}

export const webSearchTool = new WebSearchTool();
