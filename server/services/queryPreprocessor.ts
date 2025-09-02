import OpenAI from 'openai';
import { llmRouter } from "./llmRouter";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export class QueryPreprocessorService {
  async analyzeQuery(
    userQuery: string,
    chatHistory: ChatMessage[] = [],
    context?: string,
    additionalSearchDetail?: string
  ): Promise<QueryAnalysis> {
    try {
      console.log(`🧠 PRE-FEED: Analyzing query "${userQuery}"`);

      let systemPrompt = `You are a query analysis AI for a knowledge management system. ${additionalSearchDetail ? `Additional Context: ${additionalSearchDetail}` : ''} Your job is to:

1. **CRITICAL: Inject Historical Context**
   - ALWAYS examine the chat history for relevant context, especially:
     - Recent image analysis mentions (look for system messages containing entity names, topics, or subjects)
     - Previous topic or entity discussions
     - Specific names, terms, or concepts mentioned in recent conversation
   - If the user's query is vague (e.g., "อยู่ที่ไหน", "ราคาเท่าไหร่", "มีส่วนลดมั้ย", "ทำยังไง", "กี่วัน") but chat history contains specific context, YOU MUST inject that context into the enhanced query
   - Example: User says "อยู่ชั้นไหน" and history mentions "OPPO" → Enhanced query should be "OPPO อยู่ ชั้น"

2. Preprocess the user's query:
   - If the query is in Thai:
     - **PRIORITY** ALWAYS segment Thai text using PythaiNLP for proper word boundaries
     - Remove Thai stopwords such as: "ครับ", "ค่ะ", "เหรอ", "ไหน", "ยังไง", "ไหม", "อ่ะ", "ละ", etc.
     - Correct minor typos when possible (e.g., "บางกะปี" → "บางกะปิ")
     - Mark as vague any query that is too short UNLESS you can inject historical context
     - For specific names, add English name to it when relevant. For example "แมค โดนัลด์" add "McDonald's" to the prompt.
   - The returned query should be optimized for both keyword and semantic search. To optimize keyword search, ensure stopwords are removed and the query is segmented properly using PythaiNLP. For example,
     - Original: "ซื้อของ 6,000 ใช้บัตรเครดิตใบไหนดี"
     - After segmentation: "ซื้อ ของ 6,000 ใช้ บัตรเครดิต ใบ ไหน ดี"
     - Preferred: "ซื้อ ของ 6,000 บัตรเครดิต"
     - Not preferred: "บัตรเครดิตใบไหนดี สำหรับซื้อของ 6,000"
  - Increase the formality of the query because documents are typically written in formal language. For example, "ร้านหมอฟัน" should be "คลินิก ทันตกรรม"
  - **PRIORITY** If the query has English terms, keep it as is. For example, don't translate "Provident fund" to "กองทุนสำรองเลี้ยงชีพ"

3. Determine if the user's query requires a document search:
   - Mark \`needsSearch: false\` if the query is vague, purely conversational, AND lacks historical context. For example, common short words like "แก", "นาย", "เธอ", "ครับ", "ค่ะ", or openers like "สวัสดี", "ว่าไง", "คุณชื่ออะไร", "คุณทำอะไรได้บ้าง", or rhetorical/sarcastic lines like "แกไม่มีสิทธิ์มาเรียกฉันว่าพ่อ"
   - Mark \`needsSearch: true\` if:
     • The query contains specific nouns or named entities (e.g., names, places, concepts, technical terms, policies, procedures)
     • The query follows an information-seeking pattern (e.g., "มีไหม", "เปิดกี่โมง", "ต้องใช้เอกสารอะไรบ้าง", "ได้กี่วัน", "ทำยังไง", "ขั้นตอนคืออะไร", "วิธีการ", "กฎระเบียบ")
     • The query can be made meaningful using recent chat history (e.g., pronouns like "ที่นั่น", "ตรงนั้น", "อันนั้น", "มัน", "นี่" after a previous topic)
     • The query asks about facts, processes, policies, or any information that might be documented
     • **CRITICAL** even though the information is already provided, the user might want to confirm the result or the results could be updated. Mark needSearch as true anyway!!!.

4. If a search is needed:
   - **PRIORITY 1**: Inject specific context from chat history (names, entities, topics, locations)
   - **PRIORITY 2**: Enhance with relevant terms and category context based on the domain:
     - For HR/policies: add relevant terms like "นโยบาย", "ระเบียบ", "procedure"
     - For locations/services: add relevant location or service terms
     - For technical topics: add relevant technical terminology
   - Search anyway even though agent have answered in the history. The user might want to confirm the result.
     - For example, don't return false with this reason "Since the assistant has already provided a response indicating that information, the query does not require a new search", instead, return true because there might be an update in the data.

5. Set hybrid search weights:
   - Questions about **specific names, exact locations, contact details, or precise facts** → High keyword weight (0.85–0.95)
   - **General recommendations, conceptual questions, or abstract needs** → Higher semantic weight (0.8–0.9)
   - For example
     - "OPPO เดอะมอลล์ ท่าพระ" → Keyword: 0.95, Semantic: 0.05"
     - "วิธี การ ลา ที่ ดี ที่สุด" → Keyword: 0.1, Semantic: 0.9"

**CRITICAL: You MUST respond with ONLY valid JSON in this exact format:**
{
  "needsSearch": boolean,
  "enhancedQuery": "enhanced search phrase in Thai/English",
  "keywordWeight": 0.0-1.0,
  "vectorWeight": 0.0-1.0,
  "reasoning": "explanation of your decision"
}

IMPORTANT RULES:
- Respond ONLY with the JSON object, no other text
- Do NOT use markdown code blocks (\`\`\`json or \`\`\`)
- Do NOT include explanations before or after the JSON
- Do NOT use backticks, quotes, or any formatting around the JSON
- Start your response directly with { and end with }`;

      // Inject search configuration into system prompt if available
        if (additionalSearchDetail) {
          // Handle both direct search detail and context string formats
          let searchConfig = additionalSearchDetail;
          if (additionalSearchDetail.includes('Search Configuration:')) {
            const searchConfigMatch = additionalSearchDetail.match(/Search Configuration: (.+)/);
            if (searchConfigMatch) {
              searchConfig = searchConfigMatch[1];
            }
          }

          if (searchConfig && searchConfig.trim()) {
            systemPrompt += `

**SEARCH CONFIGURATION ENHANCEMENT:**
Additional search context: "${searchConfig}"
- CRITICAL: Incorporate this context when enhancing queries
- Use this to better understand the domain and purpose of the search
- Apply this context to make queries more specific and relevant
- When the user query is vague, use this context to provide better search terms`;
            console.log(`🧠 PRE-FEED: Applied search configuration: "${searchConfig}"`);
          }
        }

      const chatHistoryText = chatHistory
        .slice(-5) // Last 5 messages for context
        .map(msg => `${msg.messageType}: ${msg.content}`)
        .join('\n');

      const userPrompt = `User Query: "${userQuery}"

Recent Chat History (EXAMINE CAREFULLY for context clues):
${chatHistoryText}

${context ? `Additional Context: ${context}` : ''}

**INSTRUCTIONS:**
1. Look for entity names, topics, or concepts mentioned in the chat history. Make sure you use correct terminology.
2. If the user query is vague but history contains specific context, inject that context
3. Pay special attention to image analysis results that mention specific entities or topics
4. Examples of context injection:
   - Query: "อยู่ชั้นไหน" + History mentions "OPPO", "เดอะมอลล์ ท่าพระ" → Enhanced: "OPPO เดอะมอลล์ ท่าพระ"
   - Query: "ราคาเท่าไหร่" + History mentions "iPhone 15" → Enhanced: "iPhone 15 ราคา"

${additionalSearchDetail ? `\nAdditional search context: ${additionalSearchDetail}` : ''}

Analyze this query and provide your response.`;

      // Try to extract user ID from context or use a default
      // In production, this should come from the request context
      let userId = "43981095"; // Default fallback user ID

      // Try to extract from additionalSearchDetail if it contains user info
      if (context && context.includes('userId:')) {
        const userIdMatch = context.match(/userId:\s*(\w+)/);
        if (userIdMatch) {
          userId = userIdMatch[1];
        }
      }

      const config = await llmRouter.loadUserConfig(userId); // Load user config to get provider

      let result: any;

      if (config.provider === "Gemini") {
        // Use Gemini for preprocessing
        const messages = [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ];

        const response = await llmRouter.chat(messages, userId);

        // Parse JSON response from Gemini
        try {
          result = JSON.parse(response);
          console.log("✅ Successfully parsed Gemini JSON response directly");
        } catch (parseError) {
          console.error("❌ Error parsing Gemini JSON response:", parseError);
          console.log("📝 Raw Gemini response (first 1000 chars):", response.substring(0, 1000));
          console.log("📏 Full response length:", response.length);

          // Enhanced validation - check if response contains expected structure
          const hasRequiredFields = response.includes('needsSearch') &&
                                  response.includes('enhancedQuery') &&
                                  (response.includes('true') || response.includes('false'));

          if (!hasRequiredFields) {
            console.error("🚨 Gemini response missing required fields - using fallback");
            throw new Error("Gemini response does not contain required JSON structure");
          }

          // Try multiple extraction methods with better patterns
          let extractedJson = null;

          // Method 1: Extract from markdown code blocks (more flexible)
          const markdownPatterns = [
            /```json\s*(\{[\s\S]*?\})\s*```/gi,
            /```\s*(\{[\s\S]*?\})\s*```/gi,
            /`(\{[\s\S]*?\})`/gi
          ];

          for (const pattern of markdownPatterns) {
            const matches = [...response.matchAll(pattern)];
            for (const match of matches) {
              if (match[1] && match[1].includes('needsSearch')) {
                extractedJson = match[1];
                console.log("📦 Found JSON in markdown format");
                break;
              }
            }
            if (extractedJson) break;
          }

          // Method 2: Extract JSON object from anywhere in text (improved with proper brace matching)
          if (!extractedJson) {
            const jsonStart = response.indexOf('{');
            if (jsonStart !== -1) {
              let braceCount = 0;
              let jsonEnd = -1;
              let inString = false;
              let escapeNext = false;

              for (let i = jsonStart; i < response.length; i++) {
                const char = response[i];

                if (escapeNext) {
                  escapeNext = false;
                  continue;
                }

                if (char === '\\') {
                  escapeNext = true;
                  continue;
                }

                if (char === '"' && !escapeNext) {
                  inString = !inString;
                  continue;
                }

                if (!inString) {
                  if (char === '{') braceCount++;
                  if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                      jsonEnd = i;
                      break;
                    }
                  }
                }
              }

              if (jsonEnd !== -1) {
                extractedJson = response.substring(jsonStart, jsonEnd + 1);
                console.log("🔍 Extracted JSON using improved brace matching");
              }
            }
          }

          // Method 3: More sophisticated pattern matching for required fields
          if (!extractedJson) {
            // Try to construct JSON from individual field matches
            const needsSearchMatch = response.match(/"needsSearch"\s*:\s*(true|false)/i);
            const enhancedQueryMatch = response.match(/"enhancedQuery"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/i);
            const keywordWeightMatch = response.match(/"keywordWeight"\s*:\s*(0\.\d+|1\.0?|0)/);
            const vectorWeightMatch = response.match(/"vectorWeight"\s*:\s*(0\.\d+|1\.0?|0)/);
            const reasoningMatch = response.match(/"reasoning"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/i);

            if (needsSearchMatch && enhancedQueryMatch) {
              const reconstructedJson = {
                needsSearch: needsSearchMatch[1].toLowerCase() === 'true',
                enhancedQuery: enhancedQueryMatch[1],
                keywordWeight: keywordWeightMatch ? parseFloat(keywordWeightMatch[1]) : 0.5,
                vectorWeight: vectorWeightMatch ? parseFloat(vectorWeightMatch[1]) : 0.5,
                reasoning: reasoningMatch ? reasoningMatch[1] : 'Reconstructed from Gemini response fields'
              };

              console.log("🔧 Reconstructed JSON from individual fields:", JSON.stringify(reconstructedJson, null, 2));
              result = reconstructedJson;
            }
          }

          // Try parsing extracted JSON
          if (extractedJson && !result) {
            try {
              // Enhanced cleaning
              const cleanedJson = extractedJson
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
                .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
                .replace(/([{,]\s*)"?(\w+)"?\s*:/g, '$1"$2":') // Ensure property names are quoted
                .replace(/:\s*'([^']*)'/g, ': "$1"') // Convert single quotes to double quotes
                .trim();

              console.log("🧹 Cleaned JSON (first 300 chars):", cleanedJson.substring(0, 300));
              result = JSON.parse(cleanedJson);
              console.log("✅ Successfully extracted and parsed JSON from Gemini response");
            } catch (extractError) {
              console.error("❌ Failed to parse cleaned JSON:", extractError);
              console.log("🔧 Final JSON attempt failed, using emergency fallback");

              // Emergency fallback - create a minimal valid response
              result = {
                needsSearch: response.toLowerCase().includes('needssearch') && !response.toLowerCase().includes('needssearch": false'),
                enhancedQuery: userQuery, // Use original query as fallback
                keywordWeight: 0.5,
                vectorWeight: 0.5,
                reasoning: 'Emergency fallback due to Gemini JSON parsing failure'
              };
              console.log("🚑 Emergency response created:", JSON.stringify(result, null, 2));
            }
          }

          // Final validation
          if (!result) {
            console.error("❌ All Gemini JSON extraction methods failed");
            console.log("🔍 Response content analysis:");
            console.log("  - Contains '{' :", response.includes('{'));
            console.log("  - Contains '}' :", response.includes('}'));
            console.log("  - Contains 'needsSearch':", response.includes('needsSearch'));
            console.log("  - Contains quotes:", response.includes('"'));
            console.log("  - First 100 chars:", response.substring(0, 100));
            console.log("  - Last 100 chars:", response.substring(Math.max(0, response.length - 100)));
            throw new Error("Complete JSON extraction failure from Gemini response");
          }
        }
      } else {
        // Use OpenAI for preprocessing (default behavior)
        const completion = await openai.chat.completions.create({
          model: config.openAIConfig?.model || 'gpt-4o-mini', // Use model from config or default
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 300
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No response from AI');
        }

        try {
          result = JSON.parse(content);
        } catch (parseError) {
          console.warn('Failed to parse OpenAI response, attempting to clean and retry');

          // Try to clean the response and extract JSON
          let cleanedContent = content.trim();

          // Remove markdown code blocks
          cleanedContent = cleanedContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

          // Remove backticks
          cleanedContent = cleanedContent.replace(/`/g, '');

          // Extract JSON object if there's extra text
          const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            cleanedContent = jsonMatch[0];
          }

          try {
            result = JSON.parse(cleanedContent);
            console.log('✅ Successfully parsed cleaned OpenAI response');
          } catch (secondParseError) {
            console.warn('Failed to parse cleaned AI response, using fallback analysis');
            console.log('Raw response:', content.substring(0, 200) + '...');
            result = this.getFallbackAnalysis(userQuery);
          }
        }
      }


      let analysis: QueryAnalysis;
      // The result object is expected to have keys like enhancedQuery, keywordWeight, vectorWeight, reasoning
      // We need to map these to the QueryAnalysis interface.
      analysis = {
          needsSearch: result.needsSearch !== undefined ? result.needsSearch : this.determineNeedsSearch(result.enhancedQuery || userQuery, chatHistory, additionalSearchDetail), // Fallback to original logic if not provided
          enhancedQuery: result.enhancedQuery || userQuery,
          keywordWeight: result.keywordWeight !== undefined ? result.keywordWeight : (result.weights ? parseFloat(result.weights.split('V:')[0].replace('K:', '')) : 0.5), // Assuming weights are in K:X V:Y format if result.weights exists
          vectorWeight: result.vectorWeight !== undefined ? result.vectorWeight : (result.weights ? parseFloat(result.weights.split('V:')[1]) : 0.5),
          reasoning: result.reasoning || 'AI preprocessing successful'
      };


      // Normalize weights to sum to 1
      const totalWeight = analysis.keywordWeight + analysis.vectorWeight;
      if (totalWeight > 0) {
        analysis.keywordWeight = analysis.keywordWeight / totalWeight;
        analysis.vectorWeight = analysis.vectorWeight / totalWeight;
      } else {
        analysis.keywordWeight = 0.5;
        analysis.vectorWeight = 0.5;
      }

      console.log(`🧠 PRE-FEED RESULT:`, {
        provider: config.provider,
        needsSearch: analysis.needsSearch,
        original: userQuery,
        enhanced: analysis.enhancedQuery,
        weights: `K:${analysis.keywordWeight.toFixed(2)} V:${analysis.vectorWeight.toFixed(2)}`,
        reasoning: analysis.reasoning
      });

      return analysis;

    } catch (error) {
      console.error('Query preprocessing failed:', error);
      return this.getFallbackAnalysis(userQuery);
    }
  }

  // Helper to determine needsSearch, mirroring original logic if not directly provided by AI
  private determineNeedsSearch(enhancedQuery: string, chatHistory: ChatMessage[], additionalSearchDetail?: string): boolean {
      const lowerQuery = enhancedQuery.toLowerCase();

      // Check if it's a location or factual question
      const isFactualQuery = /อยู่ที่ไหน|ชั้นไหน|ที่ไหน|where|location|floor|ราคา|เท่าไหร่|ส่วนลด|discount|ขั้นตอน|process|วิธี|how|อะไร|what|ใคร|who|ทำไม|why|เมื่อไหร่|when|กี่|how many|กี่วัน|how many days/.test(lowerQuery);

      // Check for specific entities or concepts (can be expanded)
      const hasSpecificEntity = /oppo|xolo|kfc|starbucks|uniqlo|provident fund|กองทุนสำรองเลี้ยงชีพ|ลาหยุด|สวัสดิการ|เบิกเงิน|นโยบาย|ระเบียบ/.test(lowerQuery);

      // A query needs search if it's factual, has specific entities, or is not a short, purely conversational phrase.
      const needsSearch = isFactualQuery || hasSpecificEntity || lowerQuery.length > 5; // Heuristic for short, conversational phrases
      return needsSearch;
  }


  private getFallbackAnalysis(userQuery: string): QueryAnalysis {
    // Simple fallback logic
    const lowerQuery = userQuery.toLowerCase();

    // Check if it's a location or factual question
    const isFactualQuery = /อยู่ที่ไหน|ชั้นไหน|ที่ไหน|where|location|floor|ราคา|เท่าไหร่|ส่วนลด|discount|ขั้นตอน|process|วิธี|how|อะไร|what|ใคร|who|ทำไม|why|เมื่อไหร่|when|กี่|how many|กี่วัน|how many days/.test(lowerQuery);

    // Check for specific entities or concepts (can be expanded)
    const hasSpecificEntity = /oppo|xolo|kfc|starbucks|uniqlo|provident fund|กองทุนสำรองเลี้ยงชีพ|ลาหยุด|สวัสดิการ|เบิกเงิน|นโยบาย|ระเบียบ/.test(lowerQuery);

    // A query needs search if it's factual, has specific entities, or is not a short, purely conversational phrase.
    const needsSearch = isFactualQuery || hasSpecificEntity || lowerQuery.length > 5; // Heuristic for short, conversational phrases

    return {
      needsSearch,
      enhancedQuery: userQuery,
      keywordWeight: isFactualQuery || hasSpecificEntity ? 0.7 : 0.3,
      vectorWeight: isFactualQuery || hasSpecificEntity ? 0.3 : 0.7,
      reasoning: 'Fallback analysis due to AI preprocessing error or generic query detection'
    };
  }
}

export const queryPreprocessor = new QueryPreprocessorService();