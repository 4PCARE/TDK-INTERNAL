import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface GuardrailConfig {
  contentFiltering?: {
    enabled: boolean;
    blockProfanity?: boolean;
    blockHateSpeech?: boolean;
    blockSexualContent?: boolean;
    blockViolence?: boolean;
    customBlockedWords?: string[];
  };
  topicControl?: {
    enabled: boolean;
    allowedTopics?: string[];
    blockedTopics?: string[];
    strictMode?: boolean;
  };
  privacyProtection?: {
    enabled: boolean;
    blockPersonalInfo?: boolean;
    blockFinancialInfo?: boolean;
    blockHealthInfo?: boolean;
    maskPhoneNumbers?: boolean;
    maskEmails?: boolean;
  };
  responseQuality?: {
    enabled: boolean;
    maxResponseLength?: number;
    minResponseLength?: number;
    requireSourceCitation?: boolean;
    preventHallucination?: boolean;
  };
  toxicityPrevention?: {
    enabled: boolean;
    toxicityThreshold?: number; // 0-1 scale
    blockSarcasm?: boolean;
    blockInsults?: boolean;
  };
  businessContext?: {
    enabled: boolean;
    stayOnBrand?: boolean;
    requireProfessionalTone?: boolean;
    blockCompetitorMentions?: boolean;
    companyName?: string;
    brandGuidelines?: string;
  };
}

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
  modifiedContent?: string;
  confidence: number;
  triggeredRules: string[];
  suggestions?: string[];
}

export class GuardrailsService {
  private config: GuardrailConfig;
  private guardrailsApiKey?: string;

  constructor(config: GuardrailConfig, guardrailsApiKey?: string) {
    this.config = config;
    this.guardrailsApiKey = guardrailsApiKey;
  }

  // Helper function to extract JSON from markdown-wrapped responses
  private extractJsonFromResponse(content: string): any {
    try {
      // First try direct JSON parsing
      return JSON.parse(content);
    } catch (error) {
      // If that fails, try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch (innerError) {
          console.error('Failed to parse JSON from markdown:', innerError);
          throw innerError;
        }
      }
      
      // If no markdown blocks found, try to find JSON-like content
      const cleanContent = content.replace(/```json\s*\n?|\n?\s*```/g, '').trim();
      try {
        return JSON.parse(cleanContent);
      } catch (finalError) {
        console.error('Failed to parse JSON after cleaning:', finalError);
        throw finalError;
      }
    }
  }

  async evaluateInput(userInput: string, context?: any): Promise<GuardrailResult> {
    console.log("\n🛡️ === GUARDRAILS INPUT EVALUATION ===");
    console.log("📝 User Input:", userInput.substring(0, 100) + (userInput.length > 100 ? "..." : ""));
    console.log("⚙️ Guardrails Config:", JSON.stringify(this.config, null, 2));
    
    const results: GuardrailResult[] = [];

    // Content filtering
    if (this.config.contentFiltering?.enabled) {
      console.log("🔍 Checking Content Filtering...");
      const contentResult = await this.checkContentFiltering(userInput);
      console.log("📊 Content Filtering Result:", JSON.stringify(contentResult, null, 2));
      results.push(contentResult);
    } else {
      console.log("⏭️ Content Filtering: DISABLED");
    }

    // Topic control
    if (this.config.topicControl?.enabled) {
      console.log("🎯 Checking Topic Control...");
      const topicResult = await this.checkTopicControl(userInput, context);
      console.log("📊 Topic Control Result:", JSON.stringify(topicResult, null, 2));
      results.push(topicResult);
    } else {
      console.log("⏭️ Topic Control: DISABLED");
    }

    // Privacy protection
    if (this.config.privacyProtection?.enabled) {
      console.log("🔒 Checking Privacy Protection...");
      const privacyResult = await this.checkPrivacyProtection(userInput);
      console.log("📊 Privacy Protection Result:", JSON.stringify(privacyResult, null, 2));
      results.push(privacyResult);
    } else {
      console.log("⏭️ Privacy Protection: DISABLED");
    }

    // Toxicity prevention
    if (this.config.toxicityPrevention?.enabled) {
      console.log("☢️ Checking Toxicity Prevention...");
      const toxicityResult = await this.checkToxicity(userInput);
      console.log("📊 Toxicity Prevention Result:", JSON.stringify(toxicityResult, null, 2));
      results.push(toxicityResult);
    } else {
      console.log("⏭️ Toxicity Prevention: DISABLED");
    }

    const finalResult = this.combineResults(results);
    console.log("🏁 Final Guardrails Result:", JSON.stringify(finalResult, null, 2));
    console.log("🛡️ === END GUARDRAILS INPUT EVALUATION ===\n");
    
    return finalResult;
  }

  async evaluateOutput(aiResponse: string, context?: any): Promise<GuardrailResult> {
    console.log("\n🛡️ === GUARDRAILS OUTPUT EVALUATION ===");
    console.log("🤖 AI Response:", aiResponse.substring(0, 150) + (aiResponse.length > 150 ? "..." : ""));
    console.log("⚙️ Output Guardrails Config:", JSON.stringify({
      responseQuality: this.config.responseQuality,
      businessContext: this.config.businessContext,
      contentFiltering: this.config.contentFiltering
    }, null, 2));
    
    const results: GuardrailResult[] = [];

    // Response quality
    if (this.config.responseQuality?.enabled) {
      console.log("📏 Checking Response Quality...");
      const qualityResult = await this.checkResponseQuality(aiResponse, context);
      console.log("📊 Response Quality Result:", JSON.stringify(qualityResult, null, 2));
      results.push(qualityResult);
    } else {
      console.log("⏭️ Response Quality: DISABLED");
    }

    // Business context
    if (this.config.businessContext?.enabled) {
      console.log("🏢 Checking Business Context...");
      const businessResult = await this.checkBusinessContext(aiResponse, context);
      console.log("📊 Business Context Result:", JSON.stringify(businessResult, null, 2));
      results.push(businessResult);
    } else {
      console.log("⏭️ Business Context: DISABLED");
    }

    // Content filtering for output
    if (this.config.contentFiltering?.enabled) {
      console.log("🔍 Checking Output Content Filtering...");
      const contentResult = await this.checkContentFiltering(aiResponse);
      console.log("📊 Output Content Filtering Result:", JSON.stringify(contentResult, null, 2));
      results.push(contentResult);
    } else {
      console.log("⏭️ Output Content Filtering: DISABLED");
    }

    const finalResult = this.combineResults(results);
    console.log("🏁 Final Output Guardrails Result:", JSON.stringify(finalResult, null, 2));
    console.log("🛡️ === END GUARDRAILS OUTPUT EVALUATION ===\n");
    
    return finalResult;
  }

  private async checkContentFiltering(text: string): Promise<GuardrailResult> {
    const triggeredRules: string[] = [];
    let blocked = false;

    // Check profanity
    if (this.config.contentFiltering?.blockProfanity) {
      const profanityWords = [
        'fuck', 'shit', 'damn', 'bitch', 'asshole', 'bastard',
        // Thai profanity
        'เหี้ย', 'ควาย', 'ไอ้สัส', 'แม่ง', 'กูเก่า', 'มึงควาย'
      ];
      
      const containsProfanity = profanityWords.some(word => 
        text.toLowerCase().includes(word.toLowerCase())
      );
      
      if (containsProfanity) {
        triggeredRules.push('profanity_detected');
        blocked = true;
      }
    }

    // Check custom blocked words
    if (this.config.contentFiltering?.customBlockedWords) {
      const hasBlockedWord = this.config.contentFiltering.customBlockedWords.some(word =>
        text.toLowerCase().includes(word.toLowerCase())
      );
      
      if (hasBlockedWord) {
        triggeredRules.push('custom_blocked_word');
        blocked = true;
      }
    }

    // Use OpenAI for advanced content filtering
    if (this.config.contentFiltering?.blockHateSpeech || 
        this.config.contentFiltering?.blockSexualContent || 
        this.config.contentFiltering?.blockViolence) {
      
      const filteringResult = await this.checkContentWithOpenAI(text);
      if (!filteringResult.allowed) {
        triggeredRules.push(...filteringResult.triggeredRules);
        blocked = true;
      }
    }

    return {
      allowed: !blocked,
      reason: blocked ? 'Content filtering violation' : undefined,
      confidence: blocked ? 0.9 : 0.8,
      triggeredRules,
      suggestions: blocked ? ['Please rephrase your message more appropriately'] : undefined
    };
  }

  private async checkContentWithOpenAI(text: string): Promise<GuardrailResult> {
    try {
      const prompt = `
        Analyze the following text for inappropriate content and categorize it:
        
        Text: "${text}"
        
        Check for:
        1. Hate speech or discrimination
        2. Sexual content
        3. Violence or threats
        4. Harassment or bullying
        5. Misinformation or harmful advice
        
        Respond with JSON format:
        {
          "allowed": boolean,
          "categories": ["category1", "category2"],
          "severity": "low|medium|high",
          "explanation": "brief explanation"
        }
      `;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.1
      });

      const result = this.extractJsonFromResponse(response.choices[0].message.content || '{}');
      
      return {
        allowed: result.allowed,
        reason: result.explanation,
        confidence: result.severity === 'high' ? 0.95 : result.severity === 'medium' ? 0.8 : 0.6,
        triggeredRules: result.categories || [],
        suggestions: result.allowed ? undefined : ['Please rephrase your message appropriately']
      };
    } catch (error) {
      console.error('OpenAI content filtering error:', error);
      return {
        allowed: true,
        confidence: 0.5,
        triggeredRules: [],
        reason: 'Content filtering service unavailable'
      };
    }
  }

  private async checkTopicControl(text: string, context?: any): Promise<GuardrailResult> {
    const triggeredRules: string[] = [];
    let blocked = false;

    // Check blocked topics
    if (this.config.topicControl?.blockedTopics) {
      const hasBlockedTopic = this.config.topicControl.blockedTopics.some(topic =>
        text.toLowerCase().includes(topic.toLowerCase())
      );
      
      if (hasBlockedTopic) {
        triggeredRules.push('blocked_topic');
        blocked = true;
      }
    }

    // Check allowed topics (if strict mode)
    if (this.config.topicControl?.strictMode && this.config.topicControl?.allowedTopics) {
      const hasAllowedTopic = this.config.topicControl.allowedTopics.some(topic =>
        text.toLowerCase().includes(topic.toLowerCase())
      );
      
      if (!hasAllowedTopic) {
        triggeredRules.push('off_topic');
        blocked = true;
      }
    }

    return {
      allowed: !blocked,
      reason: blocked ? 'Topic control violation' : undefined,
      confidence: 0.8,
      triggeredRules,
      suggestions: blocked ? ['Please keep the conversation focused on allowed topics'] : undefined
    };
  }

  private async checkPrivacyProtection(text: string): Promise<GuardrailResult> {
    const triggeredRules: string[] = [];
    let modifiedContent = text;

    // Check for phone numbers
    if (this.config.privacyProtection?.maskPhoneNumbers) {
      const phoneRegex = /(\+?[0-9]{1,3}[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g;
      if (phoneRegex.test(text)) {
        triggeredRules.push('phone_number_detected');
        modifiedContent = modifiedContent.replace(phoneRegex, '[PHONE_MASKED]');
      }
    }

    // Check for email addresses
    if (this.config.privacyProtection?.maskEmails) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      if (emailRegex.test(text)) {
        triggeredRules.push('email_detected');
        modifiedContent = modifiedContent.replace(emailRegex, '[EMAIL_MASKED]');
      }
    }

    // Check for Thai ID numbers
    const thaiIdRegex = /[0-9]{1}-[0-9]{4}-[0-9]{5}-[0-9]{2}-[0-9]{1}|[0-9]{13}/g;
    if (this.config.privacyProtection?.blockPersonalInfo && thaiIdRegex.test(text)) {
      triggeredRules.push('thai_id_detected');
      modifiedContent = modifiedContent.replace(thaiIdRegex, '[ID_MASKED]');
    }

    const hasPrivacyIssue = triggeredRules.length > 0;

    return {
      allowed: true, // We mask rather than block
      modifiedContent: hasPrivacyIssue ? modifiedContent : undefined,
      confidence: 0.9,
      triggeredRules,
      suggestions: hasPrivacyIssue ? ['Personal information has been masked for privacy'] : undefined
    };
  }

  private async checkToxicity(text: string): Promise<GuardrailResult> {
    try {
      const prompt = `
        Analyze the following text for toxicity and emotional tone:
        
        Text: "${text}"
        
        Rate the toxicity level (0-1 scale) and identify:
        1. Hostile or aggressive language
        2. Sarcasm or mockery
        3. Insults or personal attacks
        4. Passive-aggressive behavior
        5. Overall emotional tone
        
        Respond with JSON format:
        {
          "toxicity_score": number,
          "is_toxic": boolean,
          "categories": ["category1", "category2"],
          "tone": "positive|neutral|negative|aggressive",
          "explanation": "brief explanation"
        }
      `;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.1
      });

      const result = this.extractJsonFromResponse(response.choices[0].message.content || '{}');
      const threshold = this.config.toxicityPrevention?.toxicityThreshold || 0.6;
      const isToxic = result.toxicity_score > threshold;

      return {
        allowed: !isToxic,
        reason: isToxic ? `Toxicity detected (score: ${result.toxicity_score})` : undefined,
        confidence: 0.85,
        triggeredRules: isToxic ? result.categories || ['high_toxicity'] : [],
        suggestions: isToxic ? ['Please communicate in a more respectful manner'] : undefined
      };
    } catch (error) {
      console.error('Toxicity check error:', error);
      return {
        allowed: true,
        confidence: 0.5,
        triggeredRules: [],
        reason: 'Toxicity checking service unavailable'
      };
    }
  }

  private async checkResponseQuality(response: string, context?: any): Promise<GuardrailResult> {
    const triggeredRules: string[] = [];
    let blocked = false;

    // Check response length
    if (this.config.responseQuality?.maxResponseLength) {
      if (response.length > this.config.responseQuality.maxResponseLength) {
        triggeredRules.push('response_too_long');
        blocked = true;
      }
    }

    if (this.config.responseQuality?.minResponseLength) {
      if (response.length < this.config.responseQuality.minResponseLength) {
        triggeredRules.push('response_too_short');
        blocked = true;
      }
    }

    // Check for hallucination prevention
    if (this.config.responseQuality?.preventHallucination && context?.documents) {
      const hallucinationResult = await this.checkHallucination(response, context.documents);
      if (!hallucinationResult.allowed) {
        triggeredRules.push(...hallucinationResult.triggeredRules);
        blocked = true;
      }
    }

    return {
      allowed: !blocked,
      reason: blocked ? 'Response quality standards not met' : undefined,
      confidence: 0.8,
      triggeredRules,
      suggestions: blocked ? ['Please provide a more appropriate response'] : undefined
    };
  }

  private async checkBusinessContext(response: string, context?: any): Promise<GuardrailResult> {
    const triggeredRules: string[] = [];
    let blocked = false;

    // Check competitor mentions
    if (this.config.businessContext?.blockCompetitorMentions) {
      const competitors = ['competitor1', 'competitor2']; // This would be configured
      const hasCompetitorMention = competitors.some(competitor =>
        response.toLowerCase().includes(competitor.toLowerCase())
      );
      
      if (hasCompetitorMention) {
        triggeredRules.push('competitor_mention');
        blocked = true;
      }
    }

    // Check professional tone
    if (this.config.businessContext?.requireProfessionalTone) {
      const professionalResult = await this.checkProfessionalTone(response);
      if (!professionalResult.allowed) {
        triggeredRules.push(...professionalResult.triggeredRules);
        blocked = true;
      }
    }

    return {
      allowed: !blocked,
      reason: blocked ? 'Business context violation' : undefined,
      confidence: 0.8,
      triggeredRules,
      suggestions: blocked ? ['Please maintain professional communication standards'] : undefined
    };
  }

  private async checkHallucination(response: string, documents: string[]): Promise<GuardrailResult> {
    try {
      const prompt = `
        Check if the following response is supported by the provided documents:
        
        Response: "${response}"
        
        Documents: ${documents.join('\n---\n')}
        
        Analyze if the response contains:
        1. Information not found in the documents
        2. Fabricated details or facts
        3. Misleading interpretations
        4. Unsupported claims
        
        Respond with JSON format:
        {
          "is_supported": boolean,
          "unsupported_claims": ["claim1", "claim2"],
          "confidence": number,
          "explanation": "brief explanation"
        }
      `;

      const response_analysis = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.1
      });

      const result = this.extractJsonFromResponse(response_analysis.choices[0].message.content || '{}');

      return {
        allowed: result.is_supported,
        reason: result.is_supported ? undefined : 'Response contains unsupported information',
        confidence: result.confidence || 0.8,
        triggeredRules: result.is_supported ? [] : ['hallucination_detected'],
        suggestions: result.is_supported ? undefined : ['Please base your response on the provided documents only']
      };
    } catch (error) {
      console.error('Hallucination check error:', error);
      return {
        allowed: true,
        confidence: 0.5,
        triggeredRules: [],
        reason: 'Hallucination checking service unavailable'
      };
    }
  }

  private async checkProfessionalTone(text: string): Promise<GuardrailResult> {
    try {
      const prompt = `
        Analyze the following text for professional tone:
        
        Text: "${text}"
        
        Check for:
        1. Appropriate business language
        2. Respectful and courteous tone
        3. Clear and concise communication
        4. Avoidance of slang or casual expressions
        5. Proper grammar and structure
        
        Respond with JSON format:
        {
          "is_professional": boolean,
          "tone_score": number,
          "issues": ["issue1", "issue2"],
          "suggestions": ["suggestion1", "suggestion2"]
        }
      `;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.1
      });

      const result = this.extractJsonFromResponse(response.choices[0].message.content || '{}');

      return {
        allowed: result.is_professional,
        reason: result.is_professional ? undefined : 'Non-professional tone detected',
        confidence: result.tone_score || 0.8,
        triggeredRules: result.is_professional ? [] : result.issues || ['unprofessional_tone'],
        suggestions: result.suggestions || undefined
      };
    } catch (error) {
      console.error('Professional tone check error:', error);
      return {
        allowed: true,
        confidence: 0.5,
        triggeredRules: [],
        reason: 'Professional tone checking service unavailable'
      };
    }
  }

  private combineResults(results: GuardrailResult[]): GuardrailResult {
    const allAllowed = results.every(r => r.allowed);
    const allTriggeredRules = results.flatMap(r => r.triggeredRules);
    const allSuggestions = results.flatMap(r => r.suggestions || []);
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    
    // Get the most restrictive result
    const blockedResults = results.filter(r => !r.allowed);
    const primaryReason = blockedResults.length > 0 ? blockedResults[0].reason : undefined;
    
    // Get modified content if any
    const modifiedResults = results.filter(r => r.modifiedContent);
    const modifiedContent = modifiedResults.length > 0 ? modifiedResults[0].modifiedContent : undefined;

    return {
      allowed: allAllowed,
      reason: primaryReason,
      modifiedContent,
      confidence: avgConfidence,
      triggeredRules: allTriggeredRules,
      suggestions: allSuggestions.length > 0 ? allSuggestions : undefined
    };
  }

  // Method to update guardrails configuration
  updateConfig(newConfig: Partial<GuardrailConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Method to get current configuration
  getConfig(): GuardrailConfig {
    return this.config;
  }
}