import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import OpenAI from "openai";
import { semanticSearchServiceV2 } from "../services/semanticSearchV2";
import { GuardrailsService } from "../services/guardrails";
import { upload } from "./shared";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export function registerAgentRoutes(app: Express) {

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
              userId,
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
              userId,
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

  // Social Integrations routes

  // Get webhook URL for a specific integration
  app.get(
    "/api/social-integrations/:id/webhook-url",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const integrationId = parseInt(req.params.id);

        if (isNaN(integrationId)) {
          return res.status(400).json({ error: "Invalid integration ID" });
        }

        // Verify the integration belongs to the user
        const integration = await storage.getSocialIntegration(integrationId, userId);
        if (!integration) {
          return res.status(404).json({ error: "Integration not found" });
        }

        // Generate webhook URL based on request domain
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-replit-domain'] || req.headers['host'];
        const baseUrl = `${protocol}://${host}`;

        let webhookUrl: string;

        if (integration.type === 'lineoa') {
          // Use the dynamic webhook endpoint for Line OA
          webhookUrl = `${baseUrl}/api/line/webhook/${integration.id}`;
        } else {
          // For other platforms, use generic webhook (to be implemented)
          webhookUrl = `${baseUrl}/api/webhook/${integration.type}/${integration.id}`;
        }

        res.json({
          integrationId: integrationId,
          type: integration.type,
          name: integration.name,
          webhookUrl: webhookUrl,
          legacyWebhookUrl: integration.type === 'lineoa' ? `${baseUrl}/api/line/webhook` : null
        });
      } catch (error) {
        console.error("Error generating webhook URL:", error);
        res.status(500).json({ error: "Failed to generate webhook URL" });
      }
    }
  );

  app.get(
    "/api/social-integrations",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const integrations = await storage.getSocialIntegrations(userId);
        res.json(integrations);
      } catch (error) {
        console.error("Error fetching social integrations:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch social integrations" });
      }
    },
  );

  app.get(
    "/api/social-integrations/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const integration = await storage.getSocialIntegration(
          parseInt(req.params.id),
          userId,
        );
        if (!integration) {
          return res.status(404).json({ message: "Integration not found" });
        }
        res.json(integration);
      } catch (error) {
        console.error("Error fetching social integration:", error);
        res.status(500).json({ message: "Failed to fetch social integration" });
      }
    },
  );

  app.post(
    "/api/social-integrations/lineoa",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const {
          name,
          description,
          channelId,
          channelSecret,
          channelAccessToken,
          agentId,
        } = req.body;

        if (
          !name ||
          !channelId ||
          !channelSecret ||
          !channelAccessToken ||
          !agentId
        ) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        const integrationData = {
          userId,
          name,
          description: description || null,
          type: "lineoa" as const,
          channelId,
          channelSecret,
          channelAccessToken,
          agentId: parseInt(agentId),
          isActive: true,
          isVerified: false,
        };

        const integration =
          await storage.createSocialIntegration(integrationData);
        res.status(201).json(integration);
      } catch (error) {
        console.error("Error creating Line OA integration:", error);
        res
          .status(500)
          .json({ message: "Failed to create Line OA integration" });
      }
    },
  );

  app.post(
    "/api/social-integrations/lineoa/verify",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { channelId, channelSecret, channelAccessToken, integrationId } = req.body;

        console.log("🔍 Debug: Line OA Verification Request");
        console.log(
          "📋 Channel ID:",
          channelId ? `${channelId.substring(0, 8)}...` : "Missing",
        );
        console.log(
          "🔑 Channel Secret:",
          channelSecret ? `${channelSecret.substring(0, 8)}...` : "Missing",
        );
        console.log(
          "🎫 Channel Access Token:",
          channelAccessToken ? `${channelAccessToken.substring(0, 8)}...` : "Missing",
        );
        console.log("🆔 Integration ID:", integrationId || "None (creation mode)");

        if (!channelId || !channelSecret) {
          console.log("❌ Missing required fields");
          return res.json({
            success: false,
            message: "กรุณากรอก Channel ID และ Channel Secret",
          });
        }

        // Enhanced validation for LINE Channel ID and Secret format
        const channelIdPattern = /^\d{10,}$/; // Channel ID should be numeric, at least 10 digits
        const isValidChannelId = channelIdPattern.test(channelId);
        const isValidChannelSecret = channelSecret.length >= 32; // Channel Secret should be at least 32 characters

        console.log("✅ Channel ID format valid:", isValidChannelId);
        console.log("✅ Channel Secret format valid:", isValidChannelSecret);

        if (!isValidChannelId) {
          console.log("❌ Invalid Channel ID format");
          return res.json({
            success: false,
            message: "Channel ID ไม่ถูกต้อง ต้องเป็นตัวเลขอย่างน้อย 10 หลัก",
          });
        }

        if (!isValidChannelSecret) {
          console.log("❌ Invalid Channel Secret format");
          return res.json({
            success: false,
            message: "Channel Secret ไม่ถูกต้อง ต้องมีอย่างน้อย 32 ตัวอักษร",
          });
        }

        // Simulate LINE API verification
        // In production, you would make actual API call to LINE:
        // const response = await fetch('https://api.line.me/v2/bot/info', {
        //   headers: { 'Authorization': `Bearer ${channelAccessToken}` }
        // });

        // If integrationId is provided, update the existing integration to mark as verified
        if (integrationId) {
          const userId = req.user.claims.sub;
          const updateResult = await db.execute(sql`
            UPDATE social_integrations
            SET is_verified = true, last_verified_at = NOW(), updated_at = NOW()
            WHERE id = ${integrationId} AND user_id = ${userId} AND type = 'lineoa'
          `);

          if (updateResult.rowCount === 0) {
            console.log("❌ No matching integration found to update");
            return res.json({
              success: false,
              message: "ไม่พบการเชื่อมต่อที่ตรงกัน กรุณาตรวจสอบข้อมูลอีกครั้ง",
            });
          }

          console.log("🎉 Line OA verification successful and database updated");
        } else {
          console.log("🎉 Line OA verification successful (creation mode)");
        }

        res.json({
          success: true,
          message: "การเชื่อมต่อ Line OA สำเร็จ! ระบบได้ตรวจสอบการตั้งค่าแล้ว",
        });
      } catch (error) {
        console.error("💥 Error verifying Line OA connection:", error);
        res.status(500).json({
          success: false,
          message: "เกิดข้อผิดพลาดในการตรวจสอบการเชื่อมต่อ",
        });
      }
    },
  );

  app.put(
    "/api/social-integrations/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const integrationId = parseInt(req.params.id);
        const updates = req.body;

        const integration = await storage.updateSocialIntegration(
          integrationId,
          updates,
          userId,
        );
        res.json(integration);
      } catch (error) {
        console.error("Error updating social integration:", error);
        res
          .status(500)
          .json({ message: "Failed to update social integration" });
      }
    },
  );

  app.delete(
    "/api/social-integrations/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const integrationId = parseInt(req.params.id);

        await storage.deleteSocialIntegration(integrationId, userId);
        res.status(204).send();
      } catch (error) {
        console.error("Error deleting social integration:", error);
        res
          .status(500)
          .json({ message: "Failed to delete social integration" });
      }
    },
  );

  // Update social integration with access token
  app.patch(
    "/api/social-integrations/:id/access-token",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const integrationId = parseInt(req.params.id);
        const { accessToken } = req.body;
        const userId = req.user.claims.sub;

        if (!accessToken) {
          return res.status(400).json({ message: "Access token is required" });
        }

        // Update integration in database with raw SQL
        const result = await db.execute(sql`
        UPDATE social_integrations
        SET channel_access_token = ${accessToken}, updated_at = NOW()
        WHERE id = ${integrationId} AND user_id = ${userId}
        RETURNING *
      `);

        if (result.rowCount === 0) {
          return res
            .status(404)
            .json({ message: "Integration not found or access denied" });
        }

        res.json({ message: "Access token updated successfully" });
      } catch (error) {
        console.error("Error updating access token:", error);
        res.status(500).json({ message: "Failed to update access token" });
      }
    },
  );

  // Agent Console API endpoints

  // Get channel integrations for hierarchical filtering
  app.get('/api/agent-console/channels', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      const query = `
        SELECT
          si.id,
          si.name,
          si.type as channel_type,
          si.channel_id,
          ac.name as agent_name,
          ac.id as agent_id
        FROM social_integrations si
        JOIN agent_chatbots ac ON si.agent_id = ac.id
        WHERE si.is_verified = true
        AND ac.user_id = $1
        ORDER BY si.type, si.name
      `;

      const result = await pool.query(query, [userId]);

      // Group by channel type
      const channelGroups = {
        lineoa: [],
        facebook: [],
        tiktok: [],
        web: []
      };

      result.rows.forEach(row => {
        if (channelGroups[row.channel_type]) {
          channelGroups[row.channel_type].push({
            id: row.id,
            name: row.name,
            channelId: row.channel_id,
            agentName: row.agent_name,
            agentId: row.agent_id
          });
        }
      });

      // Add web widgets
      const webWidgetsQuery = `
        SELECT
          cw.id,
          cw.name,
          cw.widget_key as channel_id,
          ac.name as agent_name,
          ac.id as agent_id
        FROM chat_widgets cw
        JOIN agent_chatbots ac ON cw.agent_id = ac.id
        WHERE cw.is_active = true
        AND cw.user_id = $1
        ORDER BY cw.name
      `;

      const webResult = await pool.query(webWidgetsQuery, [userId]);
      webResult.rows.forEach(row => {
        channelGroups.web.push({
          id: row.id,
          name: row.name,
          channelId: row.channel_id,
          agentName: row.agent_name,
          agentId: row.agent_id
        });
      });

      res.json(channelGroups);
    } catch (error) {
      console.error("Error fetching channel integrations:", error);
      res.status(500).json({ message: "Failed to fetch channels" });
    }
  });

  app.get('/api/agent-console/users', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const channelFilter = req.query.channelFilter || 'all';
      const subChannelFilter = req.query.subChannelFilter || 'all';

      // Build WHERE conditions for sub-channel filtering
      let whereConditions = 'ac.user_id = $1 AND (ch.channel_id LIKE \'U%\' OR ch.channel_type = \'web\')';
      const params = [userId];
      let paramIndex = 2;

      if (channelFilter !== 'all') {
        whereConditions += ` AND ch.channel_type = $${paramIndex}`;
        params.push(channelFilter);
        paramIndex++;
      }

      if (subChannelFilter !== 'all') {
        if (channelFilter === 'web') {
          // For web widgets, filter by widget_key
          whereConditions += ` AND ch.channel_id = $${paramIndex}`;
          params.push(subChannelFilter);
        } else if (channelFilter === 'lineoa') {
          // For Line OA, filter by specific channel integration
          whereConditions += ` AND EXISTS (
            SELECT 1 FROM social_integrations si
            WHERE si.channel_id = $${paramIndex}
            AND si.agent_id = ch.agent_id
          )`;
          params.push(subChannelFilter);
        }
      }

      // Get all unique users from chat history grouped by user, channel, and agent
      // Fixed query to properly sort by last message time
      const query = `
        WITH latest_messages AS (
          SELECT DISTINCT ON (ch.channel_id, ch.channel_type, ch.agent_id)
            ch.user_id,
            ch.channel_type,
            ch.channel_id,
            ch.agent_id,
            ac.name as agent_name,
            ch.content as last_message,
            ch.created_at as last_message_at,
            COUNT(*) OVER (PARTITION BY ch.channel_id, ch.channel_type, ch.agent_id) as message_count
          FROM chat_history ch
          JOIN agent_chatbots ac ON ch.agent_id = ac.id
          WHERE ${whereConditions}
          ORDER BY ch.channel_id, ch.channel_type, ch.agent_id, ch.created_at DESC
        )
        SELECT * FROM latest_messages
        ORDER BY last_message_at DESC
      `;

      const result = await pool.query(query, params);

      const chatUsers = result.rows.map(row => ({
        userId: row.user_id,
        channelType: row.channel_type,
        channelId: row.channel_id, // This is the Line user ID from database
        agentId: row.agent_id,
        agentName: row.agent_name,
        lastMessage: row.last_message,
        lastMessageAt: row.last_message_at,
        messageCount: parseInt(row.message_count),
        isOnline: Math.random() > 0.7, // Simplified online status
        userProfile: {
          name: row.channel_type === 'web' ?
            `Web User ${(row.user_id || 'unknown').slice(-4)}` :
            `User ${(row.channel_id || 'unknown').slice(-4)}`, // Use Line user ID for display with fallback
          // Add more profile fields as needed
        }
      }));

      console.log("🔍 Agent Console Users API: Raw DB results:", result.rows.length);
      console.log("🔍 Agent Console Users API: Raw DB sample:", result.rows[0]);
      console.log("🔍 Agent Console Users API: Found users:", chatUsers.length);
      if (chatUsers.length > 0) {
        console.log("🔍 Agent Console Users API: Sample user:", chatUsers[0]);
        console.log("🔍 Agent Console Users API: All channelIds:", chatUsers.map(u => u.channelId));
      }

      res.json(chatUsers);
    } catch (error) {
      console.error("Error fetching agent console users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get('/api/agent-console/conversation', isAuthenticated, async (req: any, res) => {
    try {
      const { userId: targetUserId, channelType, channelId, agentId } = req.query;

      if (!targetUserId || !channelType || !channelId || !agentId) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      console.log("🔍 Agent Console Conversation API: Query params:", {
        targetUserId,
        channelType,
        channelId,
        agentId
      });

      // Try to get messages with the provided channelId first
      let messages = await storage.getChatHistory(
        targetUserId,
        channelType,
        channelId,
        parseInt(agentId),
        50 // Get last 50 messages
      );

      // If no messages found and channelId looks like a Line OA channel ID,
      // try to find with actual Line user ID from the database
      if (messages.length === 0 && channelType === 'lineoa') {
        console.log("🔍 No messages found with channelId:", channelId, "- trying to find Line user ID");

        // Query to find actual Line user IDs for this user and agent
        const lineUserQuery = `
          SELECT DISTINCT channel_id, COUNT(*) as message_count
          FROM chat_history
          WHERE user_id = $1 AND channel_type = $2 AND agent_id = $3
          AND channel_id LIKE 'U%'
        `;
        const lineUserResult = await pool.query(lineUserQuery, [targetUserId, channelType]);

        if (lineUserResult.rows.length > 0) {
          const actualChannelId = lineUserResult.rows[0].channel_id;
          console.log("🔍 Found actual Line user ID:", actualChannelId);

          // Update the channel ID for both summary and CSAT
          actualChannelIdForCSAT = actualChannelId;

          // Re-query with the actual channel ID
          messages = await storage.getChatHistory(
            targetUserId,
            channelType,
            actualChannelId,
            parseInt(agentId),
            50
          );
        }
      }

      console.log("📨 Agent Console Conversation API: Found messages:", messages.length);
      if (messages.length > 0) {
        console.log("📨 Agent Console Conversation API: Sample message:", messages[0]);
      }

      res.json(messages);
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  app.get('/api/agent-console/summary', (req: any, res: any, next: any) => {
    console.log("🔐 Summary endpoint auth check for user:", req.user?.claims?.sub);
    isAuthenticated(req, res, next);
  }, async (req: any, res) => {
    try {
      console.log("🚀 SUMMARY ENDPOINT CALLED! 🚀");
      const { userId: targetUserId, channelType, channelId } = req.query;
      console.log("📊 Summary request params:", { targetUserId, channelType, channelId });

      if (!targetUserId || !channelType || !channelId) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      // Get conversation statistics - try both channelId variants for Line OA
      let query = `
        SELECT
          COUNT(*) as total_messages,
          MIN(created_at) as first_contact_at,
          MAX(created_at) as last_active_at
        FROM chat_history
        WHERE user_id = $1 AND channel_type = $2 AND channel_id = $3
      `;

      let result = await pool.query(query, [targetUserId, channelType, channelId]);
      let row = result.rows[0];

      console.log("📊 First query result for summary:", {
        targetUserId,
        channelType,
        channelId: channelId.substring(0, 8) + '...',
        totalMessages: row?.total_messages
      });

      // If no messages found and it's Line OA, try to find the actual Line user ID
      if (parseInt(row.total_messages) === 0 && channelType === 'lineoa') {
        console.log("🔍 No messages found, trying to find actual Line user ID");

        const lineUserQuery = `
          SELECT DISTINCT channel_id, COUNT(*) as message_count
          FROM chat_history
          WHERE user_id = $1 AND channel_type = $2
          GROUP BY channel_id
          ORDER BY message_count DESC
          LIMIT 1
        `;

        const lineUserResult = await pool.query(lineUserQuery, [targetUserId, channelType]);

        if (lineUserResult.rows.length > 0) {
          const actualChannelId = lineUserResult.rows[0].channel_id;
          console.log("🔍 Found actual channel ID:", actualChannelId.substring(0, 8) + '...');

          // Update the channel ID for both summary and CSAT
          actualChannelIdForCSAT = actualChannelId;

          // Re-query with the actual channel ID
          result = await pool.query(query, [targetUserId, channelType, actualChannelId]);
          row = result.rows[0];

          console.log("📊 Second query result with actual channel ID:", {
            actualChannelId: actualChannelId.substring(0, 8) + '...',
            totalMessages: row?.total_messages
          });
        }
      }

      // Get CSAT score using OpenAI analysis of actual conversation
      let csatScore = undefined;
      let actualChannelIdForCSAT = channelId;

      // If we have enough messages, calculate CSAT score using OpenAI
      if (parseInt(row.total_messages) >= 3) {
        try {
          console.log("🎯 Starting CSAT calculation for:", {
            targetUserId,
            channelType,
            originalChannelId: channelId.substring(0, 8) + '...',
            actualChannelId: actualChannelIdForCSAT.substring(0, 8) + '...',
            totalMessages: row.total_messages
          });

          // Get agent ID from first message to use correct memory limits
          let agentId = undefined;
          const firstMessageQuery = `
            SELECT agent_id
            FROM chat_history
            WHERE user_id = $1 AND channel_type = $2 AND channel_id = $3
            ORDER BY created_at ASC
            LIMIT 1
          `;
          const firstMessageResult = await pool.query(firstMessageQuery, [targetUserId, channelType, actualChannelIdForCSAT]);
          if (firstMessageResult.rows.length > 0) {
            agentId = firstMessageResult.rows[0].agent_id;
            console.log("📊 Found agent ID for CSAT:", agentId);
          }

          // Add timeout for CSAT calculation to prevent hanging
          const csatPromise = calculateCSATScore(targetUserId, channelType, actualChannelIdForCSAT, agentId);
          const timeoutPromise = new Promise<undefined>((_, reject) =>
            setTimeout(() => reject(new Error('CSAT calculation timeout')), 15000)
          );

          csatScore = await Promise.race([csatPromise, timeoutPromise]);

          console.log("🎯 CSAT calculation completed:", { csatScore });
        } catch (error) {
          console.error("❌ Error calculating CSAT score:", error);
          csatScore = undefined;
        }
      } else {
        console.log("⚠️ Not enough messages for CSAT calculation:", row.total_messages);
      }

      // Determine sentiment based on CSAT Score
      let sentiment = 'neutral';
      if (csatScore !== undefined) {
        if (csatScore < 40) {
          sentiment = 'bad';
        } else if (csatScore >= 41 && csatScore <= 60) {
          sentiment = 'neutral';
        } else if (csatScore >= 61 && csatScore <= 80) {
          sentiment = 'good';
        } else if (csatScore > 80) {
          sentiment = 'excellent';
        }
      }

      const summary = {
        totalMessages: parseInt(row.total_messages) || 0,
        firstContactAt: row.first_contact_at,
        lastActiveAt: row.last_active_at,
        sentiment: sentiment,
        mainTopics: ['General Inquiry', 'Support'], // Could be enhanced with AI topic extraction
        csatScore: csatScore
      };

      console.log("📊 Final summary response:", {
        totalMessages: summary.totalMessages,
        firstContactAt: summary.firstContactAt ? summary.firstContactAt.toISOString() : null,
        lastActiveAt: summary.lastActiveAt ? summary.lastActiveAt.toISOString() : null,
        csatScore: summary.csatScore
      });

      res.json(summary);
    } catch (error) {
      console.error("Error fetching conversation summary:", error);
      res.status(500).json({ message: "Failed to fetch conversation summary" });
    }
  });

  // Debug endpoint to test WebSocket broadcasting
  app.post('/api/debug/websocket-test', async (req: any, res) => {
    try {
      const { message, userId, channelId } = req.body;

      console.log('🧪 Debug WebSocket test initiated:', {
        message,
        userId,
        channelId,
        wsClientsCount: wsClients.size + 1
      });

      if (wsClients && wsClients.size > 0) {
        const testMessage = {
          type: 'human_agent_message',
          channelType: 'web',
          channelId: channelId,
          userId: userId,
          message: {
            messageType: 'agent',
            content: message || 'Test message from debug endpoint',
            timestamp: new Date().toISOString(),
            humanAgent: true,
            humanAgentName: 'Debug Agent'
          }
        };

        console.log('🧪 Broadcasting test message:', JSON.stringify(testMessage, null, 2));

        let sentCount = 0;
        wsClients.forEach((client, index) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(testMessage));
            sentCount++;
            console.log(`🧪 Test message sent to client ${index + 1}`);
          }
        });

        res.json({
          success: true,
          message: 'Test message broadcast',
          clientsCount: wsClients.size,
          sentCount: sentCount
        });
      } else {
        res.json({
          success: false,
          message: 'No WebSocket clients connected',
          clientsCount: 0
        });
      }
    } catch (error) {
      console.error('🧪 Debug WebSocket test error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/agent-console/send-message', isAuthenticated, async (req: any, res) => {
    try {
      let { userId: targetUserId, channelType, channelId, agentId, message, messageType } = req.body;

      console.log('📤 Agent Console send-message endpoint called:', {
        targetUserId,
        channelType,
        channelId,
        agentId,
        messageLength: message?.length || 0,
        messageType,
        humanAgent: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
      });

      if (!targetUserId || !channelType || !channelId || !agentId || !message) {
        console.log('❌ Missing required parameters:', { targetUserId, channelType, channelId, agentId, hasMessage: !!message });
        return res.status(400).json({ message: "Missing required parameters" });
      }

      // For web channel, always broadcast to all active sessions for this widget
      // This ensures messages reach the widget regardless of session ID mismatches

      // Store the human agent message in chat history
      console.log('💾 Storing human agent message in chat history...');
      const chatHistoryRecord = await storage.createChatHistory({
        userId: targetUserId,
        channelType,
        channelId,
        agentId: parseInt(agentId),
        messageType: messageType || 'agent',
        content: message,
        metadata: {
          sentBy: req.user.claims.sub,
          humanAgent: true,
          humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
        }
      });

      console.log('✅ Chat history stored with ID:', chatHistoryRecord.id);

      // Broadcast new message to Agent Console via WebSocket
      console.log('📡 Preparing to broadcast to Agent Console...');
      if (typeof (global as any).broadcastToAgentConsole === 'function') {
        const broadcastData = {
          type: 'new_message',
          data: {
            userId: targetUserId,
            channelType,
            channelId,
            agentId: parseInt(agentId),
            userMessage: '',
            aiResponse: message,
            messageType: messageType || 'agent',
            timestamp: new Date().toISOString(),
            humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
          }
        };

        console.log('📡 Broadcasting to Agent Console:', broadcastData);
        (global as any).broadcastToAgentConsole(broadcastData);
        console.log('✅ Broadcasted human agent message to Agent Console');
      } else {
        console.log('⚠️ broadcastToAgentConsole function not available');
      }

      // Send the message via the appropriate channel
      if (channelType === 'lineoa') {
        try {
          // Get Line channel access token from the specific social integration
          const integrationQuery = `
            SELECT si.channel_access_token, si.channel_id, si.name
            FROM social_integrations si
            WHERE si.agent_id = $1
            AND si.type = 'lineoa'
            AND si.is_verified = true
            ORDER BY si.created_at DESC
            LIMIT 1
          `;
          const integrationResult = await pool.query(integrationQuery, [parseInt(agentId)]);

          if (integrationResult.rows.length > 0) {
            const integration = integrationResult.rows[0];
            console.log('🔍 Found Line integration:', {
              name: integration.name,
              channelId: integration.channel_id?.substring(0, 8) + '...',
              hasToken: !!integration.channel_access_token
            });

            if (integration.channel_access_token) {
              const { sendLinePushMessage } = await import('./lineOaWebhook');
              await sendLinePushMessage(channelId, message, integration.channel_access_token);
              console.log('✅ Successfully sent Line message via integration:', integration.name);
            } else {
              console.log('⚠️ No Channel Access Token found in integration:', integration.name);
            }
          } else {
            console.log('⚠️ No verified Line integration found for agent:', agentId);
          }
        } catch (error) {
          console.error('❌ Error sending Line message:', error);
        }
      } else if (channelType === 'web') {
        // For web channel, we need to store the message in widget_chat_messages table too
        // because the widget reads from this table
        console.log('🌐 Processing web channel message:', {
          targetUserId,
          channelId,
          agentId: parseInt(agentId),
          wsClientsCount: wsClients.size,
          globalWsClientsExists: !!(global.wsClients),
          messageContent: message.substring(0, 50) + '...'
        });

        // CRITICAL: Also store human agent message in widget_chat_messages table
        // This is what the widget actually reads from!
        try {
          console.log('💾 Storing human agent message in widget_chat_messages table...');

          // Insert into widget_chat_messages table
          const widgetMessageQuery = `
            INSERT INTO widget_chat_messages (session_id, role, content, message_type, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING id
          `;

          const widgetMessageValues = [
            targetUserId, // session_id (this is the visitor session ID)
            'assistant', // role (must be 'assistant' to pass DB constraint, but message_type will be 'agent')
            message, // content
            'agent', // message_type (this distinguishes human agent from AI assistant)
            JSON.stringify({
              sentBy: req.user.claims.sub,
              humanAgent: true,
              humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
            }) // metadata
          ];

          const widgetMessageResult = await pool.query(widgetMessageQuery, widgetMessageValues);
          console.log('✅ Human agent message stored in widget_chat_messages with ID:', widgetMessageResult.rows[0].id);

        } catch (widgetStoreError) {
          console.error('❌ Error storing human agent message in widget_chat_messages:', widgetStoreError);
        }

        if (wsClients && wsClients.size > 0) {
          // Create two different message formats for broader compatibility
          const wsMessage = {
            type: 'human_agent_message',
            channelType: 'web',
            channelId: channelId, // This is the widget_key
            agentId: parseInt(agentId),
            userId: targetUserId, // This is the visitor session ID
            message: {
              messageType: 'agent',
              content: message,
              timestamp: new Date().toISOString(),
              humanAgent: true,
              humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
            }
          };

          // Also create a broadcast message that any widget with this channelId can receive
          const broadcastMessage = {
            type: 'human_agent_message',
            channelType: 'web',
            channelId: channelId, // Widget key - all widgets with this key should receive
            agentId: parseInt(agentId),
            userId: 'BROADCAST', // Special userId to indicate this is for any session
            message: {
              messageType: 'agent',
              content: message,
              timestamp: new Date().toISOString(),
              humanAgent: true,
              humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
            }
          };

          console.log('📡 Broadcasting web widget message (specific):', JSON.stringify(wsMessage, null, 2));
          console.log('📡 Broadcasting web widget message (broadcast):', JSON.stringify(broadcastMessage, null, 2));

          let sentCount = 0;
          let openConnections = 0;
          wsClients.forEach((client, index) => {
            console.log(`🔍 WebSocket client ${index + 1} readyState:`, client.readyState);
            if (client.readyState === WebSocket.OPEN) {
              openConnections++;
              try {
                // Send both specific and broadcast messages
                client.send(JSON.stringify(wsMessage));
                client.send(JSON.stringify(broadcastMessage));
                sentCount++;
                console.log(`✅ Sent messages to WebSocket client ${index + 1}`);
              } catch (error) {
                console.log(`❌ Error sending to WebSocket client ${index + 1}:`, error);
              }
            } else {
              wsClients.delete(client);
            }
          });

          console.log(`📊 WebSocket summary - Total clients: ${wsClients.size}, Open: ${openConnections}, Sent: ${sentCount}`);
        } else {
          console.log('⚠️ No WebSocket clients connected for web channel message');
          console.log('🔍 Global WebSocket debugging:', {
            globalWsClientsExists: !!(global.wsClients),
            wsClientsSize: global.wsClients ? global.wsClients.size : 'undefined'
          });
        }
      }

      res.json({
        success: true,
        messageId: chatHistoryRecord.id,
        message: "Message sent successfully"
      });
    } catch (error) {
      console.error("Error sending agent console message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Agent Console Image Upload and Send endpoint
  app.post('/api/agent-console/send-image', isAuthenticated, upload.single('image'), async (req: any, res) => {
    try {
      const { userId: targetUserId, channelType, channelId, agentId, message, messageType } = req.body;
      const imageFile = req.file;

      if (!targetUserId || !channelType || !channelId || !agentId) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      if (!imageFile) {
        return res.status(400).json({ message: "No image file provided" });
      }

      console.log('📸 Agent Console: Processing image upload:', {
        targetUserId,
        channelType,
        channelId,
        agentId,
        fileName: imageFile.filename,
        size: imageFile.size,
        mimetype: imageFile.mimetype
      });

      // Create image URL for serving
      const imageUrl = `/uploads/${imageFile.filename}`;

      // Store image message in chat history
      const chatHistoryRecord = await storage.createChatHistory({
        userId: targetUserId,
        channelType,
        channelId,
        agentId: parseInt(agentId),
        messageType: messageType || 'agent',
        content: message || 'รูปภาพ',
        metadata: {
          messageType: 'image',
          imageUrl: imageUrl,
          originalContentUrl: imageUrl,
          previewImageUrl: imageUrl,
          fileName: imageFile.originalname,
          fileSize: imageFile.size,
          mimeType: imageFile.mimetype,
          sentBy: req.user.claims.sub,
          humanAgent: true,
          humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
        }
      });

      // Broadcast new message to Agent Console via WebSocket
      if (typeof (global as any).broadcastToAgentConsole === 'function') {
        (global as any).broadcastToAgentConsole({
          type: 'new_message',
          data: {
            userId: targetUserId,
            channelType,
            channelId,
            agentId: parseInt(agentId),
            userMessage: '',
            aiResponse: message || 'รูปภาพ',
            messageType: messageType || 'agent',
            timestamp: new Date().toISOString(),
            humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent',
            imageUrl: imageUrl
          }
        });
        console.log('✅ Broadcasted human agent image message to Agent Console');
      }

      // Send the image via the appropriate channel
      if (channelType === 'lineoa') {
        try {
          // Get Line channel access token from agent using direct DB query
          const query = `SELECT lineoa_config FROM agent_chatbots WHERE id = $1`;
          const result = await pool.query(query, [parseInt(agentId)]);

          if (result.rows.length > 0) {
            const lineoaConfig = result.rows[0].lineoa_config;
            console.log('🔍 Agent lineoa_config for image:', lineoaConfig);

            if (lineoaConfig?.accessToken) {
              // Send image via Line Push Message API
              const imageResult = await sendLineImageMessage(channelId, imageUrl, lineoaConfig.accessToken);
              if (imageResult) {
                console.log('✅ Successfully sent Line image:', imageUrl);
              } else {
                console.log('❌ Failed to send Line image:', imageUrl);
              }
            } else {
              console.log('⚠️ No Line Channel Access Token found in lineoa_config for agent:', agentId);
            }
          } else {
            console.log('⚠️ Agent not found:', agentId);
          }
        } catch (error) {
          console.error('❌ Error sending Line image:', error);
        }
      }

      res.json({
        success: true,
        messageId: chatHistoryRecord.id,
        imageUrl: imageUrl,
        message: "Image sent successfully"
      });
    } catch (error) {
      console.error("Error sending agent console image:", error);
      res.status(500).json({ message: "Failed to send image" });
    }
  });

  app.post('/api/agent-console/takeover', isAuthenticated, async (req: any, res) => {
    try {
      const { targetUserId, channelType, channelId, agentId } = req.body;

      if (!targetUserId || !channelType || !channelId || !agentId) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      // Log the takeover action
      await storage.createAuditLog({
        userId: req.user.claims.sub,
        action: 'human_takeover',
        resourceType: 'conversation',
        resourceId: `${targetUserId}-${channelType}-${channelId}`,
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        details: {
          targetUserId,
          channelType,
          channelId,
          agentId: parseInt(agentId)
        }
      });

      // Store a system message indicating human takeover
      await storage.createChatHistory({
        userId: targetUserId,
        channelType,
        channelId,
        agentId: parseInt(agentId),
        messageType: 'assistant',
        content: '🔄 A human agent has joined the conversation.',
        metadata: {
          systemMessage: true,
          humanTakeover: true,
          agentId: req.user.claims.sub
        }
      });

      res.json({ success: true, message: "Conversation takeover successful" });
    } catch (error) {
      console.error("Error taking over conversation:", error);
      res.status(500).json({ message: "Failed to take over conversation" });
    }
  });

  // Line Message Template Routes

  // Get all Line message templates for user
  app.get("/api/line-templates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const integrationId = req.query.integrationId ? parseInt(req.query.integrationId) : undefined;

      console.log("🔍 Fetching Line templates for user:", userId, "integration:", integrationId);

      const templates = await storage.getLineMessageTemplates(userId, integrationId);
      console.log("📋 Found templates:", templates.length);

      // Get complete template data (with columns and actions) for each template
      const completeTemplates = await Promise.all(
        templates.map(async (template) => {
          const completeTemplate = await storage.getCompleteLineTemplate(template.id, userId);
          return completeTemplate;
        })
      );

      console.log("✅ Complete templates ready:", completeTemplates.length);
      res.json(completeTemplates.filter(t => t !== undefined));
    } catch (error) {
      console.error("Error fetching Line message templates:", error);
      res.status(500).json({ message: "Failed to fetch Line message templates" });
    }
  });

  // Get a specific Line message template with complete data
  app.get("/api/line-templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templateId = parseInt(req.params.id);

      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      const completeTemplate = await storage.getCompleteLineTemplate(templateId, userId);

      if (!completeTemplate) {
        return res.status(404).json({ message: "Template not found" });
      }

      res.json(completeTemplate);
    } catch (error) {
      console.error("Error fetching Line message template:", error);
      res.status(500).json({ message: "Failed to fetch Line message template" });
    }
  });

  // Create a new Line message template with OpenAI embedding
  app.post("/api/line-templates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, description, tags, type, integrationId, columns } = req.body;

      // Validate required fields
      if (!name || !type) {
        return res.status(400).json({ message: "Name and type are required" });
      }

      console.log("Creating Line message template:", { userId, name, description, tags, type, integrationId, columnsCount: columns?.length });

      // Generate embedding for description using OpenAI
      let descriptionEmbedding = null;
      if (description) {
        try {
          const openai = new (await import("openai")).default({
            apiKey: process.env.OPENAI_API_KEY,
          });

          const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: description,
          });
          descriptionEmbedding = JSON.stringify(response.data[0].embedding);
          console.log("Generated embedding for template description");
        } catch (error) {
          console.error("Failed to generate embedding:", error);
          // Continue without embedding if OpenAI fails
        }
      }

      // Create the template
      const template = await storage.createLineMessageTemplate({
        userId,
        name,
        description,
        tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
        descriptionEmbedding,
        templateType: type,
        integrationId: integrationId || null,
      });

      // Create columns if provided
      if (columns && Array.isArray(columns)) {
        for (let i = 0; i < columns.length; i++) {
          const column = columns[i];
          const createdColumn = await storage.createLineCarouselColumn({
            templateId: template.id,
            order: i + 1,
            thumbnailImageUrl: column.thumbnailImageUrl || null,
            title: column.title || '',
            text: column.text || '',
          });

          // Create actions for this column
          if (column.actions && Array.isArray(column.actions)) {
            for (let j = 0; j < column.actions.length; j++) {
              const action = column.actions[j];
              await storage.createLineTemplateAction({
                columnId: createdColumn.id,
                order: j + 1,
                type: action.type,
                label: action.label || '',
                uri: action.uri || null,
                data: action.data || null,
                text: action.text || null,
              });
            }
          }
        }
      }

      // Return the complete template
      const completeTemplate = await storage.getCompleteLineTemplate(template.id, userId);
      res.status(201).json(completeTemplate);
    } catch (error) {
      console.error("Error creating Line message template:", error);
      res.status(500).json({ message: "Failed to create Line message template" });
    }
  });

  // Update a Line message template
  app.put("/api/line-templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templateId = parseInt(req.params.id);
      const { name, description, tags, type, integrationId, columns } = req.body;

      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      console.log("🔍 BACKEND UPDATE - Received data:", { templateId, name, description, tags, type, integrationId, columnsCount: columns?.length });
      console.log("🔍 BACKEND UPDATE - Tags specifically:", tags);

      // Update the template basic info
      const updateData = {
        name,
        description,
        tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
        templateType: type,
        integrationId: integrationId || null,
      };

      console.log("🔍 BACKEND UPDATE - Sending to storage:", updateData);
      const updatedTemplate = await storage.updateLineMessageTemplate(templateId, updateData, userId);
      console.log("🔍 BACKEND UPDATE - Updated template result:", updatedTemplate);

      // Handle columns update if provided
      if (columns && Array.isArray(columns)) {
        // Get existing columns
        const existingColumns = await storage.getLineCarouselColumns(templateId);

        // Delete existing columns and actions
        for (const existingColumn of existingColumns) {
          const existingActions = await storage.getLineTemplateActions(existingColumn.id);
          for (const action of existingActions) {
            await storage.deleteLineTemplateAction(action.id);
          }
          await storage.deleteLineCarouselColumn(existingColumn.id);
        }

        // Create new columns
        for (let i = 0; i < columns.length; i++) {
          const column = columns[i];
          const createdColumn = await storage.createLineCarouselColumn({
            templateId: templateId,
            order: i + 1,
            thumbnailImageUrl: column.thumbnailImageUrl || null,
            title: column.title || '',
            text: column.text || '',
          });

          // Create actions for this column
          if (column.actions && Array.isArray(column.actions)) {
            for (let j = 0; j < column.actions.length; j++) {
              const action = column.actions[j];
              await storage.createLineTemplateAction({
                columnId: createdColumn.id,
                order: j + 1,
                type: action.type,
                label: action.label || '',
                uri: action.uri || null,
                data: action.data || null,
                text: action.text || null,
              });
            }
          }
        }
      }

      // Return the complete updated template
      const completeTemplate = await storage.getCompleteLineTemplate(templateId, userId);
      res.json(completeTemplate);
    } catch (error) {
      console.error("Error updating Line message template:", error);
      res.status(500).json({ message: "Failed to update Line message template" });
    }
  });

  // Delete a Line message template
  app.delete("/api/line-templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templateId = parseInt(req.params.id);

      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      // Get existing columns to clean up
      const existingColumns = await storage.getLineCarouselColumns(templateId);

      // Delete all actions and columns first
      for (const column of existingColumns) {
        const actions = await storage.getLineTemplateActions(column.id);
        for (const action of actions) {
          await storage.deleteLineTemplateAction(action.id);
        }
        await storage.deleteLineCarouselColumn(column.id);
      }

      // Delete the template
      await storage.deleteLineMessageTemplate(templateId, userId);

      res.json({ message: "Template deleted successfully" });
    } catch (error) {
      console.error("Error deleting Line message template:", error);
      res.status(500).json({ message: "Failed to delete Line message template" });
    }
  });

  // Line OA Webhook endpoint (no authentication required)
  app.post("/api/line/webhook", handleLineWebhook);

  // Dynamic Line OA Webhook with integration ID for multiple channels
  app.post("/api/line/webhook/:integrationId", async (req: Request, res: Response) => {
    try {
      const integrationId = parseInt(req.params.integrationId);
      if (isNaN(integrationId)) {
        return res.status(400).json({ error: "Invalid integration ID" });
      }

      // Get the specific Line OA integration
      const integration = await storage.getSocialIntegrationById(integrationId);
      if (!integration || integration.type !== "lineoa" || !integration.isActive) {
        console.log(`❌ Line OA integration ${integrationId} not found or inactive`);
        return res.status(404).json({ error: "Line OA integration not found or inactive" });
      }

      console.log(`🔔 Line webhook received for integration ${integrationId} (${integration.name})`);
      console.log(`🔍 Integration verified status: ${integration.isVerified}`);
      console.log(`📅 Last verified: ${integration.lastVerifiedAt || 'Never'}`);

      // Temporarily modify the request to include integration info for handleLineWebhook
      (req as any).lineIntegration = integration;

      // Call the existing webhook handler
      return await handleLineWebhook(req, res);
    } catch (error) {
      console.error("💥 Dynamic Line webhook error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin debug endpoint for Line OA integrations
  app.get("/api/admin/line-integrations/debug", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Get all Line OA integrations for this user
      const integrations = await db
        .select()
        .from(socialIntegrations)
        .where(
          and(
            eq(socialIntegrations.userId, userId),
            eq(socialIntegrations.type, "lineoa")
          )
        );

      const debugInfo = integrations.map(integration => ({
        id: integration.id,
        name: integration.name,
        channelId: integration.channelId,
        botUserId: integration.botUserId,
        isActive: integration.isActive,
        isVerified: integration.isVerified,
        lastVerifiedAt: integration.lastVerifiedAt,
        dynamicWebhookUrl: `/api/line/webhook/${integration.id}`,
        recommendedAction: !integration.isVerified
          ? "ต้อง verify Channel Secret ใหม่ผ่าน Social Integrations page"
          : "พร้อมใช้งาน",
        secretPreview: integration.channelSecret
          ? `${integration.channelSecret.substring(0, 8)}...`
          : "ไม่มี",
        agentId: integration.agentId,
        createdAt: integration.createdAt
      }));

      res.json({
        totalIntegrations: integrations.length,
        integrations: debugInfo,
        instructions: {
          verify: "ไปที่ Social Integrations page และกด 'Test Connection' เพื่อ verify Channel Secret",
          webhook: "ใช้ dynamic webhook URL ในการตั้งค่า Line Developer Console",
          troubleshoot: "หาก signature ไม่ถูกต้อง ให้ตรวจสอบ Channel Secret ว่าตรงกับ Line Developer Console หรือไม่"
        }
      });
    } catch (error) {
      console.error("Error in Line integrations debug:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}

// Keep the rest of the original code as is, except for the addition of registerAgentRoutes call if needed elsewhere.
// The original code block for httpServer creation and WebSocketServer setup is outside this function.
// The following lines are from the original code, kept here for context but not part of the registerAgentRoutes function.

/*
  const httpServer = createServer(app);

  // Create WebSocket server on /ws path to avoid conflicts with Vite HMR
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws'
  });
*/