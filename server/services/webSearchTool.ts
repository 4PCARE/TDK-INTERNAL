
import { DynamicTool } from "@langchain/core/tools";
import { CheerioWebBaseLoader } from "langchain/document_loaders/web/cheerio";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface WebSearchConfig {
  whitelistedDomains: Array<{
    domain: string;
    description: string;
    searchKeywords: string[];
    priority: number;
  }>;
  maxResultsPerDomain: number;
  enableAutoTrigger: boolean;
}

export class WebSearchTool {
  private config: WebSearchConfig;
  private userId: string;

  constructor(userId: string, config: WebSearchConfig) {
    this.userId = userId;
    this.config = config;
  }

  createSearchTool(): DynamicTool {
    return new DynamicTool({
      name: "web_search",
      description: `Search the web for current information from whitelisted domains: ${this.config.whitelistedDomains.map(d => d.domain).join(', ')}. Use this when users ask about current events, latest information, or topics related to: ${this.config.whitelistedDomains.flatMap(d => d.searchKeywords).join(', ')}`,
      func: async (query: string) => {
        try {
          console.log(`🔍 Web Search Tool: Searching for "${query}"`);
          
          // Determine relevant domains based on query
          const relevantDomains = await this.selectRelevantDomains(query);
          
          if (relevantDomains.length === 0) {
            return "No relevant whitelisted domains found for this query.";
          }

          const searchResults = [];
          
          for (const domain of relevantDomains) {
            try {
              const results = await this.searchDomain(domain.domain, query);
              searchResults.push(...results.slice(0, this.config.maxResultsPerDomain));
            } catch (error) {
              console.warn(`Failed to search ${domain.domain}:`, error.message);
            }
          }

          if (searchResults.length === 0) {
            return "No search results found from whitelisted domains.";
          }

          // Format results for LLM consumption
          return this.formatSearchResults(searchResults);
        } catch (error) {
          console.error("Web search error:", error);
          return `Error searching the web: ${error.message}`;
        }
      }
    });
  }

  private async selectRelevantDomains(query: string): Promise<Array<{domain: string; description: string; searchKeywords: string[]}>> {
    const prompt = `
Analyze this search query and determine which domains are most relevant based on their descriptions and keywords.

Query: "${query}"

Available domains:
${this.config.whitelistedDomains.map(d => `
Domain: ${d.domain}
Description: ${d.description}
Keywords: ${d.searchKeywords.join(', ')}
Priority: ${d.priority}
`).join('\n')}

Return the top 3 most relevant domains as a JSON array of domain names only.
Consider:
1. Keyword matches
2. Domain description relevance
3. Priority scores
4. Query context

Example response: ["example.com", "news.com"]
`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      const selectedDomains = result.domains || [];

      return this.config.whitelistedDomains
        .filter(d => selectedDomains.includes(d.domain))
        .sort((a, b) => b.priority - a.priority);
    } catch (error) {
      console.warn("Failed to select relevant domains, using all:", error);
      return this.config.whitelistedDomains.slice(0, 3);
    }
  }

  private async searchDomain(domain: string, query: string): Promise<Array<{url: string; title: string; content: string; snippet: string}>> {
    try {
      // For this implementation, we'll use Google Custom Search API or similar
      // You'll need to implement the actual search logic based on your preferred search provider
      const searchUrl = await this.constructSearchUrl(domain, query);
      const searchResults = await this.performSearch(searchUrl, domain);
      
      const results = [];
      
      for (const result of searchResults.slice(0, this.config.maxResultsPerDomain)) {
        try {
          const content = await this.scrapeWebContent(result.url);
          results.push({
            url: result.url,
            title: result.title,
            content: content.content,
            snippet: content.snippet
          });
        } catch (error) {
          console.warn(`Failed to scrape ${result.url}:`, error.message);
        }
      }
      
      return results;
    } catch (error) {
      console.error(`Error searching domain ${domain}:`, error);
      return [];
    }
  }

  private async constructSearchUrl(domain: string, query: string): Promise<string> {
    // Simple site-specific search using Google
    const encodedQuery = encodeURIComponent(`site:${domain} ${query}`);
    return `https://www.google.com/search?q=${encodedQuery}`;
  }

  private async performSearch(searchUrl: string, domain: string): Promise<Array<{url: string; title: string}>> {
    // This is a simplified implementation
    // In production, you'd want to use proper search APIs like:
    // - Google Custom Search API
    // - Bing Search API
    // - SerpAPI
    
    // For now, return mock results that would come from actual search
    return [
      {
        url: `https://${domain}/article-1`,
        title: "Relevant Article 1"
      },
      {
        url: `https://${domain}/article-2`, 
        title: "Relevant Article 2"
      }
    ];
  }

  private async scrapeWebContent(url: string): Promise<{content: string; snippet: string}> {
    try {
      const loader = new CheerioWebBaseLoader(url);
      const docs = await loader.load();
      
      if (docs.length === 0) {
        throw new Error("No content found");
      }

      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 2000,
        chunkOverlap: 200,
      });

      const splits = await textSplitter.splitDocuments(docs);
      const content = splits.map(split => split.pageContent).join('\n');
      const snippet = content.substring(0, 300) + (content.length > 300 ? '...' : '');

      return {
        content: content.substring(0, 4000), // Limit content size
        snippet
      };
    } catch (error) {
      throw new Error(`Failed to scrape content: ${error.message}`);
    }
  }

  private formatSearchResults(results: Array<{url: string; title: string; content: string; snippet: string}>): string {
    return `Web Search Results:

${results.map((result, index) => `
${index + 1}. **${result.title}**
   URL: ${result.url}
   Content: ${result.snippet}
`).join('\n')}

Full content available for analysis: ${results.length} sources found.`;
  }

  static async shouldTriggerWebSearch(query: string, chatHistory: any[] = []): Promise<{shouldSearch: boolean; confidence: number; reason: string}> {
    const prompt = `
Analyze if this query requires web search for current/real-time information.

Query: "${query}"
Recent chat context: ${chatHistory.slice(-3).map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Consider if the query asks about:
- Current events, news, or recent developments
- Real-time data (weather, stocks, sports scores)
- Latest information that changes frequently
- Recent product releases or updates
- Current prices or availability
- Time-sensitive information

Respond with JSON:
{
  "shouldSearch": boolean,
  "confidence": 0.0-1.0,
  "reason": "explanation why search is/isn't needed"
}
`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      return {
        shouldSearch: result.shouldSearch || false,
        confidence: result.confidence || 0,
        reason: result.reason || "No reason provided"
      };
    } catch (error) {
      console.error("Error determining web search need:", error);
      return {
        shouldSearch: false,
        confidence: 0,
        reason: "Error analyzing query"
      };
    }
  }
}
