
import axios from 'axios';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class WebSearchService {
  private static instance: WebSearchService;

  static getInstance(): WebSearchService {
    if (!WebSearchService.instance) {
      WebSearchService.instance = new WebSearchService();
    }
    return WebSearchService.instance;
  }

  async searchWeb(query: string, maxResults: number = 5): Promise<WebSearchResult[]> {
    try {
      // Check if we have Google Custom Search API credentials
      const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
      const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

      if (apiKey && searchEngineId) {
        return await this.googleCustomSearch(query, apiKey, searchEngineId, maxResults);
      }

      // Fallback to DuckDuckGo (free but limited)
      return await this.duckDuckGoSearch(query, maxResults);
    } catch (error) {
      console.error('Web search error:', error);
      throw new Error(`Web search failed: ${error.message}`);
    }
  }

  private async googleCustomSearch(
    query: string, 
    apiKey: string, 
    searchEngineId: string, 
    maxResults: number
  ): Promise<WebSearchResult[]> {
    const url = 'https://www.googleapis.com/customsearch/v1';
    const params = {
      key: apiKey,
      cx: searchEngineId,
      q: query,
      num: Math.min(maxResults, 10)
    };

    const response = await axios.get(url, { params });
    
    if (response.data.items) {
      return response.data.items.map((item: any) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet
      }));
    }

    return [];
  }

  private async duckDuckGoSearch(query: string, maxResults: number): Promise<WebSearchResult[]> {
    // DuckDuckGo Instant Answer API (limited but free)
    try {
      const url = 'https://api.duckduckgo.com/';
      const params = {
        q: query,
        format: 'json',
        no_html: '1',
        skip_disambig: '1'
      };

      const response = await axios.get(url, { params });
      const data = response.data;

      const results: WebSearchResult[] = [];

      // Add abstract if available
      if (data.Abstract) {
        results.push({
          title: data.Heading || 'DuckDuckGo Result',
          url: data.AbstractURL || 'https://duckduckgo.com',
          snippet: data.Abstract
        });
      }

      // Add related topics
      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        for (let i = 0; i < Math.min(data.RelatedTopics.length, maxResults - results.length); i++) {
          const topic = data.RelatedTopics[i];
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || 'Related Topic',
              url: topic.FirstURL,
              snippet: topic.Text
            });
          }
        }
      }

      return results.slice(0, maxResults);
    } catch (error) {
      console.error('DuckDuckGo search error:', error);
      return [{
        title: 'Search Information',
        url: 'https://duckduckgo.com',
        snippet: `I searched for "${query}" but couldn't retrieve specific results. You may want to search manually for the most current information.`
      }];
    }
  }

  formatSearchResults(results: WebSearchResult[]): string {
    if (results.length === 0) {
      return 'No search results found.';
    }

    return results.map((result, index) => {
      return `${index + 1}. **${result.title}**
   URL: ${result.url}
   ${result.snippet}`;
    }).join('\n\n');
  }
}
