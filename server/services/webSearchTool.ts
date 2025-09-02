
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
    console.log(`🔍 Checking if web search should trigger for: "${message}"`);
    console.log(`🔧 Web search config:`, config);

    if (!config.enabled) {
      console.log(`⏭️ Web search disabled in config`);
      return false;
    }

    // Check if message contains trigger keywords
    const lowerMessage = message.toLowerCase();
    const defaultTriggerKeywords = [
      'search', 'find', 'lookup', 'web', 'online', 'internet',
      'latest', 'current', 'news', 'update', 'recent',
      'ค้นหา', 'หา', 'ข้อมูล', 'เว็บ', 'อินเทอร์เน็ต', 'ล่าสุด'
    ];
    
    const triggerKeywords = config.triggerKeywords && config.triggerKeywords.length > 0 
      ? config.triggerKeywords 
      : defaultTriggerKeywords;

    console.log(`🔤 Checking trigger keywords:`, triggerKeywords);

    const hasKeyword = triggerKeywords.some(keyword => 
      lowerMessage.includes(keyword.toLowerCase())
    );

    // Also trigger for question-like patterns
    const questionPatterns = [
      /what.*is/i, /where.*is/i, /how.*to/i, /when.*does/i,
      /.*คือ.*อะไร/i, /.*อยู่.*ที่ไหน/i, /.*ทำ.*ยังไง/i,
      /.*อย่างไร/i, /.*เป็น.*อย่างไร/i, /.*มี.*อะไร/i
    ];

    const hasQuestionPattern = questionPatterns.some(pattern => 
      pattern.test(message)
    );

    // If no specific keywords configured, trigger for any general question
    const shouldTrigger = hasKeyword || hasQuestionPattern || (config.triggerKeywords && config.triggerKeywords.length === 0);

    console.log(`📊 Web search trigger analysis:`, {
      hasKeyword,
      hasQuestionPattern,
      shouldTrigger,
      message: message.substring(0, 50) + '...'
    });

    return shouldTrigger;
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
        console.log(`🔒 Web search requires whitelist - checking agent ${agentId} whitelist URLs`);
        
        // Use widget-compatible method if needed
        let whitelistEntries;
        try {
          whitelistEntries = await storage.getAgentWhitelistUrls(agentId, userId);
        } catch (error) {
          console.error(`❌ Error getting whitelist URLs:`, error);
          return { results: [], source: 'whitelist' };
        }
        
        const urls = whitelistEntries.map(entry => entry.url);

        if (urls.length === 0) {
          console.log(`⚠️ No whitelisted URLs found for agent ${agentId}`);
          return { results: [], source: 'whitelist' };
        }

        console.log(`🔍 Searching ${urls.length} whitelisted URLs: ${urls.join(', ')}`);
        
        try {
          const results = await this.webSearchService.searchWhitelistedUrls(
            query, 
            urls, 
            config.maxResults || 5
          );

          console.log(`📊 Web search returned ${results.length} results from whitelisted URLs`);
          return { results, source: 'whitelist' };
        } catch (searchError) {
          console.error(`❌ Error searching whitelisted URLs:`, searchError);
          return { results: [], source: 'whitelist' };
        }
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
      return { results: [], source: 'error' };
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
