
import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { isMicrosoftAuthenticated } from "../microsoftAuth";
import { storage } from "../storage";
import { db, pool } from "../db";
import { eq } from "drizzle-orm";
import { agentChatbots } from "@shared/schema";
import OpenAI from "openai";
import { semanticSearchServiceV2 } from "../services/semanticSearchV2";
import { GuardrailsService } from "../services/guardrails";

// Initialize OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export function registerAgentRoutes(app: Express) {
  // Agent Chatbot API routes
  app.get("/api/agent-chatbots", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agents = await storage.getAgentChatbots(userId);
      res.json(agents);
    } catch (error) {
      console.error("Error fetching agent chatbots:", error);
      res.status(500).json({ message: "Failed to fetch agent chatbots" });
    }
  });

  app.get("/api/agent-chatbots/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agent = await storage.getAgentChatbot(
        parseInt(req.params.id),
        userId,
      );
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }
      res.json(agent);
    } catch (error) {
      console.error("Error fetching agent chatbot:", error);
      res.status(500).json({ message: "Failed to fetch agent chatbot" });
    }
  });

  app.post("/api/agent-chatbots", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      console.log(
        "Creating agent chatbot with data:",
        JSON.stringify(req.body, null, 2),
      );
      console.log("User ID:", userId);

      // Extract documentIds from request body
      const { documentIds, lineOaChannelId, ...agentData } = req.body;

      // Handle LINE OA configuration
      let lineOaConfig = undefined;
      if (agentData.channels?.includes("lineoa") && lineOaChannelId) {
        // Find the LINE OA channel configuration
        const lineOaChannels = [
          {
            id: "U1234567890",
            name: "4urney HR",
            description: "HR Support Channel",
          },
          {
            id: "U0987654321",
            name: "Customer Support",
            description: "General Support",
          },
          {
            id: "U1122334455",
            name: "Sales Inquiry",
            description: "Sales Team Channel",
          },
        ];
        const selectedChannel = lineOaChannels.find(
          (ch) => ch.id === lineOaChannelId,
        );
        if (selectedChannel) {
          lineOaConfig = {
            lineOaId: selectedChannel.id,
            lineOaName: selectedChannel.name,
            accessToken: "mock_access_token", // In real implementation, this would be configured properly
          };
        }
      }

      // Ensure arrays are properly formatted for PostgreSQL JSONB
      const finalAgentData = {
        ...agentData,
        userId,
        lineOaConfig,
        // Default channels to empty array since we removed channel selection
        channels: [],
        specialSkills: Array.isArray(agentData.specialSkills)
          ? agentData.specialSkills
          : [],
        allowedTopics: Array.isArray(agentData.allowedTopics)
          ? agentData.allowedTopics
          : [],
        blockedTopics: Array.isArray(agentData.blockedTopics)
          ? agentData.blockedTopics
          : [],
      };
      console.log(
        "Final agent data before database insert:",
        JSON.stringify(finalAgentData, null, 2),
      );
      console.log(
        "Channels type:",
        typeof finalAgentData.channels,
        "Value:",
        finalAgentData.channels,
      );
      console.log(
        "Special skills type:",
        typeof finalAgentData.specialSkills,
        "Value:",
        finalAgentData.specialSkills,
      );

      const agent = await storage.createAgentChatbot(finalAgentData);
      console.log("Agent created successfully:", agent);

      // Associate documents with the agent if provided
      if (documentIds && documentIds.length > 0) {
        console.log("Adding documents to agent:", documentIds);
        for (const documentId of documentIds) {
          await storage.addDocumentToAgent(agent.id, documentId, userId);
        }
      }

      res.status(201).json(agent);
    } catch (error) {
      console.error("Error creating agent chatbot:", error);
      console.error("Error details:", error.message);
      console.error("Error stack:", error.stack);
      res.status(500).json({
        message: "Failed to create agent chatbot",
        error: error.message,
      });
    }
  });

  app.put("/api/agent-chatbots/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agentId = parseInt(req.params.id);

      // Extract documentIds from request body
      const { documentIds, ...agentData } = req.body;

      console.log("PUT /api/agent-chatbots/:id - Request body:", JSON.stringify(req.body, null, 2));
      console.log("Agent data to update:", JSON.stringify(agentData, null, 2));
      console.log("Guardrails config in request:", agentData.guardrailsConfig);

      const agent = await storage.updateAgentChatbot(
        agentId,
        agentData,
        userId,
      );

      // Update document associations if provided
      if (documentIds !== undefined) {
        console.log("Updating agent documents:", documentIds);

        // Remove all existing document associations
        await storage.removeAllDocumentsFromAgent(agentId, userId);

        // Add new document associations
        if (documentIds && documentIds.length > 0) {
          for (const documentId of documentIds) {
            await storage.addDocumentToAgent(agentId, documentId, userId);
          }
        }
      }

      res.json(agent);
    } catch (error) {
      console.error("Error updating agent chatbot:", error);
      res.status(500).json({ message: "Failed to update agent chatbot" });
    }
  });

  app.delete(
    "/api/agent-chatbots/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        await storage.deleteAgentChatbot(parseInt(req.params.id), userId);
        res.status(204).send();
      } catch (error) {
        console.error("Error deleting agent chatbot:", error);
        res.status(500).json({ message: "Failed to delete agent chatbot" });
      }
    },
  );

  app.get(
    "/api/agent-chatbots/:id/documents",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const documents = await storage.getAgentChatbotDocuments(
          parseInt(req.params.id),
          userId,
        );
        res.json(documents);
      } catch (error) {
        console.error("Error fetching agent documents:", error);
        res.status(500).json({ message: "Failed to fetch agent documents" });
      }
    },
  );

  app.post(
    "/api/agent-chatbots/:agentId/documents/:documentId",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const agentDocument = await storage.addDocumentToAgent(
          parseInt(req.params.agentId),
          parseInt(req.params.documentId),
          userId,
        );
        res.status(201).json(agentDocument);
      } catch (error) {
        console.error("Error adding document to agent:", error);
        res.status(500).json({ message: "Failed to add document to agent" });
      }
    },
  );

  app.delete(
    "/api/agent-chatbots/:agentId/documents/:documentId",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        await storage.removeDocumentFromAgent(
          parseInt(req.params.agentId),
          parseInt(req.params.documentId),
          userId,
        );
        res.status(204).send();
      } catch (error) {
        console.error("Error removing document from agent:", error);
        res
          .status(500)
          .json({ message: "Failed to remove document from agent" });
      }
    },
  );

  // Test Agent endpoint (single message)
  app.post(
    "/api/agent-chatbots/test",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { message, agentConfig, documentIds = [], chatHistory = [] } = req.body;

        if (!message || !agentConfig) {
          return res.status(400).json({ message: "Message and agent configuration are required" });
        }

        // Build system prompt from agent configuration
        const personality = agentConfig.personality ? `, with a ${agentConfig.personality} personality` : '';
        const profession = agentConfig.profession ? ` as a ${agentConfig.profession}` : '';
        const responseStyle = agentConfig.responseStyle ? ` in a ${agentConfig.responseStyle} style` : '';

        const systemPrompt = `${agentConfig.systemPrompt}

You are ${agentConfig.name || 'an AI assistant'}${profession}${personality}. Respond ${responseStyle}.

Additional skills: ${agentConfig.specialSkills?.join(', ') || 'General assistance'}

Response guidelines:
- Response length: ${agentConfig.responseLength || 'medium'}
- Content filtering: ${agentConfig.contentFiltering ? 'enabled' : 'disabled'}
- Toxicity prevention: ${agentConfig.toxicityPrevention ? 'enabled' : 'disabled'}
- Privacy protection: ${agentConfig.privacyProtection ? 'enabled' : 'disabled'}
- Factual accuracy: ${agentConfig.factualAccuracy ? 'prioritized' : 'standard'}

${agentConfig.allowedTopics?.length > 0 ? `Allowed topics: ${agentConfig.allowedTopics.join(', ')}` : ''}
${agentConfig.blockedTopics?.length > 0 ? `Blocked topics: ${agentConfig.blockedTopics.join(', ')}` : ''}`;

        // Get document context if documents are selected
        let documentContext = '';

        if (documentIds.length > 0) {
          console.log(`🔍 Performing search with ${documentIds.length} documents...`);

          try {
            // Extract search configuration from agent config
            const searchConfig = agentConfig.searchConfiguration || {};
            const chunkMaxType = searchConfig.chunkMaxType || 'number';
            const chunkMaxValue = searchConfig.chunkMaxValue || 8;
            const documentMass = searchConfig.documentMass || 0.3;

            console.log(`⚙️ Search config: ${chunkMaxType}=${chunkMaxValue}, mass=${Math.round(documentMass * 100)}%`);

            // Use smart hybrid search for testing with custom configuration
            const searchResults = await semanticSearchServiceV2.searchSmartHybridDebug(
              message,
              req.user.claims.sub,
              {
                specificDocumentIds: documentIds,
                massSelectionPercentage: documentMass,
                hybridAlpha: 0.2, // 20% keyword, 80% vector
                maxResults: chunkMaxType === 'number' ? chunkMaxValue : undefined
              }
            );

            console.log(`🎯 Smart search returned ${searchResults.results.length} results`);

            // Apply chunk maximum if using percentage
            let finalResults = searchResults.results;
            if (chunkMaxType === 'percentage' && chunkMaxValue > 0) {
              const maxChunks = Math.max(1, Math.ceil(searchResults.results.length * (chunkMaxValue / 100)));
              finalResults = searchResults.results.slice(0, maxChunks);
              console.log(`📊 Applied ${chunkMaxValue}% limit: ${searchResults.results.length} → ${finalResults.length} chunks`);
            }

            // Build document context
            const contextChunks = finalResults.map((result, index) => {
              return `Document ${result.documentId} (Chunk ${result.chunkIndex}) - Similarity: ${result.similarity?.toFixed(4) || 'N/A'}:\n${result.content}`;
            });

            documentContext = contextChunks.join('\n\n---\n\n');
            console.log(`📄 Built context with ${contextChunks.length} chunks (${documentContext.length} chars)`);

          } catch (searchError) {
            console.error('❌ Search error during agent testing:', searchError);
            documentContext = 'Error retrieving document context for testing.';
          }
        }

        const fullPrompt = systemPrompt + documentContext;

        // Apply guardrails to input message if configured
        let processedMessage = message;
        const guardrailsConfig = agentConfig.guardrailsConfig;

        if (guardrailsConfig && Object.keys(guardrailsConfig).length > 0) {
          console.log(`🛡️ Applying guardrails to test input: ${JSON.stringify(guardrailsConfig)}`);

          const guardrailsService = new GuardrailsService(guardrailsConfig);

          const inputValidation = await guardrailsService.evaluateInput(message);
          console.log(`📝 Input validation result: ${JSON.stringify(inputValidation)}`);

          if (!inputValidation.allowed) {
            console.log(`❌ Input blocked by guardrails: ${inputValidation.reason}`);
            return res.json({
              response: `ขออภัย ไม่สามารถประมวลผลคำถามนี้ได้ (${inputValidation.reason}) ${inputValidation.suggestions?.[0] || 'Please try rephrasing your message'}`
            });
          }

          // Use modified content if available
          if (inputValidation.modifiedContent) {
            processedMessage = inputValidation.modifiedContent;
            console.log(`🔄 Using modified input: ${processedMessage}`);
          }
        }

        // Call OpenAI to get response
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: fullPrompt },
            { role: "user", content: processedMessage }
          ],
          max_tokens: agentConfig.responseLength === 'short' ? 150 :
                     agentConfig.responseLength === 'long' ? 500 : 300,
          temperature: 0.7
        });

        let agentResponse = response.choices[0].message.content || "No response generated";

        // Apply guardrails to output response if configured
        if (guardrailsConfig && Object.keys(guardrailsConfig).length > 0) {

          const guardrailsService = new GuardrailsService(guardrailsConfig);

          const outputValidation = await guardrailsService.evaluateOutput(agentResponse);
          console.log(`📤 Output validation result: ${JSON.stringify(outputValidation)}`);

          if (!outputValidation.allowed) {
            console.log(`❌ Output blocked by guardrails: ${outputValidation.reason}`);
            agentResponse = `ขออภัย ไม่สามารถให้คำตอบนี้ได้ (${outputValidation.reason}) ${outputValidation.suggestions?.[0] || 'Please try asking in a different way'}`;
          } else if (outputValidation.modifiedContent) {
            agentResponse = outputValidation.modifiedContent;
            console.log(`🔄 Using modified output: ${agentResponse.substring(0, 100)}...`);
          }
        }

        res.json({ response: agentResponse });
      } catch (error) {
        console.error("Error testing agent:", error);
        res.status(500).json({ message: "Failed to test agent" });
      }
    },
  );

  // Test Agent Chat endpoint (with conversation history)
  app.post(
    "/api/agent-chatbots/test-chat",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { message, agentConfig, documentIds = [], chatHistory = [] } = req.body;

        if (!message || !agentConfig) {
          return res.status(400).json({ message: "Message and agent configuration are required" });
        }

        console.log(`💬 Test chat request - Memory limit: ${agentConfig.memoryLimit || 10}, History length: ${chatHistory.length}`);

        // Build comprehensive system prompt similar to deployed agents
        const personality = agentConfig.personality ? `, with a ${agentConfig.personality} personality` : '';
        const profession = agentConfig.profession ? ` as a ${agentConfig.profession}` : '';
        const responseStyle = agentConfig.responseStyle ? ` in a ${agentConfig.responseStyle} style` : '';

        let systemPrompt = `${agentConfig.systemPrompt}

You are ${agentConfig.name || 'an AI assistant'}${profession}${personality}. Respond ${responseStyle}.

Additional skills: ${agentConfig.specialSkills?.join(', ') || 'General assistance'}

Response guidelines:
- Response length: ${agentConfig.responseLength || 'medium'}
- Content filtering: ${agentConfig.contentFiltering ? 'enabled' : 'disabled'}
- Toxicity prevention: ${agentConfig.toxicityPrevention ? 'enabled' : 'disabled'}
- Privacy protection: ${agentConfig.privacyProtection ? 'enabled' : 'disabled'}
- Factual accuracy: ${agentConfig.factualAccuracy ? 'prioritized' : 'standard'}

${agentConfig.allowedTopics?.length > 0 ? `Allowed topics: ${agentConfig.allowedTopics.join(', ')}` : ''}
${agentConfig.blockedTopics?.length > 0 ? `Blocked topics: ${agentConfig.blockedTopics.join(', ')}` : ''}

Memory management: Keep track of conversation context within the last ${agentConfig.memoryLimit || 10} messages.`;

        // Get document context if documents are selected
        let documentContext = '';
        if (documentIds.length > 0) {
          console.log(`🔍 Performing search with ${documentIds.length} documents...`);

          try {
            // Extract search configuration from agent config
            const searchConfig = agentConfig.searchConfiguration || {};
            const chunkMaxType = searchConfig.chunkMaxType || 'number';
            const chunkMaxValue = searchConfig.chunkMaxValue || 8;
            const documentMass = searchConfig.documentMass || 0.3;

            console.log(`⚙️ Search config: ${chunkMaxType}=${chunkMaxValue}, mass=${Math.round(documentMass * 100)}%`);

            // Use smart hybrid search for testing with custom configuration
            const searchResults = await semanticSearchServiceV2.searchSmartHybridDebug(
              message,
              req.user.claims.sub,
              {
                specificDocumentIds: documentIds,
                massSelectionPercentage: documentMass,
                hybridAlpha: 0.2, // 20% keyword, 80% vector
                maxResults: chunkMaxType === 'number' ? chunkMaxValue : undefined
              }
            );

            console.log(`🎯 Smart search returned ${searchResults.results.length} results`);

            // Apply chunk maximum if using percentage
            let finalResults = searchResults.results;
            if (chunkMaxType === 'percentage' && chunkMaxValue > 0) {
              const maxChunks = Math.max(1, Math.ceil(searchResults.results.length * (chunkMaxValue / 100)));
              finalResults = searchResults.results.slice(0, maxChunks);
              console.log(`📊 Applied ${chunkMaxValue}% limit: ${searchResults.results.length} → ${finalResults.length} chunks`);
            }

            // Build document context
            const contextChunks = finalResults.map((result, index) => {
              return `Document ${result.documentId} (Chunk ${result.chunkIndex}) - Similarity: ${result.similarity?.toFixed(4) || 'N/A'}:\n${result.content}`;
            });

            documentContext = contextChunks.join('\n\n---\n\n');
            console.log(`📄 Built context with ${contextChunks.length} chunks (${documentContext.length} chars)`);

          } catch (searchError) {
            console.error("Error fetching documents for test:", searchError);
          }
        }

        systemPrompt += documentContext;

        // Prepare conversation messages respecting memory limit
        const memoryLimit = Math.min(agentConfig.memoryLimit || 10, 20); // Cap at 20 for API limits
        const recentHistory = chatHistory.slice(-memoryLimit);

        const messages = [
          { role: "system", content: systemPrompt },
          ...recentHistory,
          { role: "user", content: message }
        ];

        console.log(`🔍 Calling OpenAI with ${messages.length} messages (${recentHistory.length} history + system + current)`);

        // Apply guardrails to input message if configured
        let processedMessage = message;
        const guardrailsConfig = agentConfig.guardrailsConfig;

        if (guardrailsConfig && Object.keys(guardrailsConfig).length > 0) {
          console.log(`🛡️ Applying guardrails to test input: ${JSON.stringify(guardrailsConfig)}`);

          const guardrailsService = new GuardrailsService(guardrailsConfig);

          const inputValidation = await guardrailsService.evaluateInput(message);
          console.log(`📝 Input validation result: ${JSON.stringify(inputValidation)}`);

          if (!inputValidation.allowed) {
            console.log(`❌ Input blocked by guardrails: ${inputValidation.reason}`);
            return res.json({
              response: `ขออภัย ไม่สามารถประมวลผลคำถามนี้ได้ (${inputValidation.reason}) ${inputValidation.suggestions?.[0] || 'Please try rephrasing your message'}`
            });
          }

          // Use modified content if available
          if (inputValidation.modifiedContent) {
            processedMessage = inputValidation.modifiedContent;
            console.log(`🔄 Using modified input: ${processedMessage}`);
          }
        }

        // Update messages with processed message
        const finalMessages = [
          { role: "system", content: systemPrompt },
          ...recentHistory,
          { role: "user", content: processedMessage }
        ];

        // Call OpenAI to get response with conversation context
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: finalMessages,
          max_tokens: agentConfig.responseLength === 'short' ? 150 :
                     agentConfig.responseLength === 'long' ? 500 : 300,
          temperature: 0.7
        });

        let agentResponse = response.choices[0].message.content || "No response generated";
        console.log(`🤖 Generated response: ${agentResponse.substring(0, 100)}...`);

        // Apply guardrails to output response if configured
        if (guardrailsConfig && Object.keys(guardrailsConfig).length > 0) {

          const guardrailsService = new GuardrailsService(guardrailsConfig);

          const outputValidation = await guardrailsService.evaluateOutput(agentResponse);
          console.log(`📤 Output validation result: ${JSON.stringify(outputValidation)}`);

          if (!outputValidation.allowed) {
            console.log(`❌ Output blocked by guardrails: ${outputValidation.reason}`);
            agentResponse = `ขออภัย ไม่สามารถให้คำตอบนี้ได้ (${outputValidation.reason}) ${outputValidation.suggestions?.[0] || 'Please try asking in a different way'}`;
          } else if (outputValidation.modifiedContent) {
            agentResponse = outputValidation.modifiedContent;
            console.log(`🔄 Using modified output: ${agentResponse.substring(0, 100)}...`);
          }
        }

        res.json({ response: agentResponse });
      } catch (error) {
        console.error("Error testing agent chat:", error);
        res.status(500).json({ message: "Failed to test agent chat", error: error.message });
      }
    },
  );
}
