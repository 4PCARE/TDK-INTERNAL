
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

  async extractUrlDetails(url: string): Promise<{title: string, description: string, metadata: any}> {
    try {
      console.log(`🔍 Extracting details from URL: ${url}`);
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AI-KMS-Bot/1.0)',
        }
      });

      // Basic HTML parsing to extract title and meta description
      const html = response.data;
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      
      const title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;
      const description = descMatch ? descMatch[1].trim() : `Content from ${new URL(url).hostname}`;

      // Extract additional metadata
      const metadata = {
        domain: new URL(url).hostname,
        contentType: response.headers['content-type'] || 'text/html',
        lastModified: response.headers['last-modified'],
        extractedAt: new Date().toISOString()
      };

      console.log(`✅ Extracted details - Title: ${title}, Description: ${description.substring(0, 100)}...`);
      
      return { title, description, metadata };
    } catch (error) {
      console.error(`❌ Failed to extract details from ${url}:`, error.message);
      
      // Fallback details
      const domain = new URL(url).hostname;
      return {
        title: domain,
        description: `Web content from ${domain}`,
        metadata: {
          domain,
          extractedAt: new Date().toISOString(),
          error: error.message
        }
      };
    }
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

  async searchWhitelistedUrls(query: string, whitelistUrls: string[], maxResults: number = 5): Promise<WebSearchResult[]> {
    console.log(`🔍 Searching whitelisted URLs for query: "${query}"`);
    console.log(`📋 Whitelist: ${whitelistUrls.join(', ')}`);

    const results: WebSearchResult[] = [];

    for (const url of whitelistUrls) {
      try {
        console.log(`🌐 Searching content from: ${url}`);
        
        // Fetch content from the whitelisted URL
        const response = await axios.get(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AI-KMS-Bot/1.0)',
          }
        });

        const html = response.data;
        const textContent = this.extractTextFromHtml(html);
        
        // Simple text search within the content
        if (this.contentMatchesQuery(textContent, query)) {
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;
          
          // Extract relevant snippet around the query match
          const snippet = this.extractRelevantSnippet(textContent, query);
          
          results.push({
            title,
            url,
            snippet
          });

          console.log(`✅ Found relevant content at: ${url}`);
        }

        if (results.length >= maxResults) {
          break;
        }

      } catch (error) {
        console.error(`❌ Error searching ${url}:`, error.message);
        continue;
      }
    }

    console.log(`📊 Found ${results.length} results from whitelisted URLs`);
    return results;
  }

  private extractTextFromHtml(html: string): string {
    // Remove script and style elements
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Remove HTML tags
    text = text.replace(/<[^>]*>/g, ' ');
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  }

  private contentMatchesQuery(content: string, query: string): boolean {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    
    // Split query into words and check if any appear in content
    const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 2);
    
    return queryWords.some(word => lowerContent.includes(word));
  }

  private extractRelevantSnippet(content: string, query: string, snippetLength: number = 200): string {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    
    // Find the first occurrence of any query word
    const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 2);
    let matchIndex = -1;
    
    for (const word of queryWords) {
      const index = lowerContent.indexOf(word);
      if (index !== -1) {
        matchIndex = index;
        break;
      }
    }
    
    if (matchIndex === -1) {
      // No match found, return beginning of content
      return content.substring(0, snippetLength) + (content.length > snippetLength ? '...' : '');
    }
    
    // Extract snippet around the match
    const start = Math.max(0, matchIndex - snippetLength / 2);
    const end = Math.min(content.length, start + snippetLength);
    
    let snippet = content.substring(start, end);
    
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    
    return snippet;
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
