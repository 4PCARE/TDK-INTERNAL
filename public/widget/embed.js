(function () {
  "use strict";

  // Extract widget key from script URL
  const scriptTag =
    document.currentScript ||
    (function () {
      const scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  const scriptSrc = scriptTag.src;
  const widgetKeyMatch = scriptSrc.match(/\/widget\/([^\/]+)\/embed\.js/);

  if (!widgetKeyMatch) {
    console.error("AI-KMS Widget: Invalid embed script URL");
    return;
  }

  const widgetKey = widgetKeyMatch[1];
  const baseUrl = scriptSrc.replace(/\/widget\/.*$/, "");

  let isWidgetOpen = false;
  let sessionId = null;
  let widgetConfig = null;

  // Generate unique visitor ID
  function generateVisitorId() {
    return (
      "visitor_" +
      Math.random().toString(36).substr(2, 9) +
      Date.now().toString(36)
    );
  }

  // Load widget configuration
  async function loadWidgetConfig() {
    try {
      const response = await fetch(`${baseUrl}/api/widget/${widgetKey}/config`);
      if (response.ok) {
        widgetConfig = await response.json();
        console.log("Widget config loaded:", widgetConfig);
      }
    } catch (error) {
      console.error("Failed to load widget config:", error);
    }
  }

  // Comprehensive markdown parser specifically for Thai chat messages
  function parseMarkdown(text) {
    if (!text || typeof text !== 'string') return text || '';
    
    console.log("🔍 Input text:", text);
    
    // Escape HTML entities to prevent XSS
    let escapedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    console.log("🔒 Escaped text:", escapedText);
    
    // Step 1: Process bold text **text** first 
    let processed = escapedText.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 600; color: #1f2937;">$1</strong>');
    console.log("💪 After bold processing:", processed);
    
    // Step 2: Process numbered lists
    processed = processed.replace(/^(\d+)\.\s+(.+)$/gm, function(match, num, content) {
      console.log("📝 Found numbered list:", num, content);
      return `<div style="margin: 8px 0; padding-left: 28px; position: relative; line-height: 1.6;"><span style="position: absolute; left: 0; font-weight: 600; color: #2563eb;">${num}.</span> ${content}</div>`;
    });
    console.log("📋 After numbered lists:", processed);
    
    // Step 3: Process bullet points
    processed = processed.replace(/^[-*]\s+(.+)$/gm, function(match, content) {
      console.log("🔸 Found bullet point:", content);
      return `<div style="margin: 6px 0; padding-left: 24px; position: relative; line-height: 1.6;"><span style="position: absolute; left: 0; color: #2563eb; font-weight: 600;">•</span> ${content}</div>`;
    });
    console.log("🔹 After bullet points:", processed);
    
    // Step 4: Convert line breaks
    processed = processed.replace(/\n\n+/g, '</p><p style="margin: 12px 0;">').replace(/\n/g, '<br>');
    
    // Step 5: Wrap in paragraph if not already wrapped
    if (!processed.includes('<div') && !processed.includes('<p>')) {
      processed = `<p style="margin: 0; line-height: 1.6;">${processed}</p>`;
    } else if (processed.includes('<div')) {
      // Already has div structure, just wrap in container
      processed = `<div style="line-height: 1.6;">${processed}</div>`;
    } else {
      processed = `<p style="margin: 0; line-height: 1.6;">${processed}</p>`;
    }
    
    console.log("✨ Final result:", processed);
    return processed;
  }

  // Create widget HTML
  function createWidget() {
    const widgetContainer = document.createElement("div");
    widgetContainer.id = "ai-kms-widget-container";
    widgetContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Chat button
    const chatButton = document.createElement("div");
    chatButton.id = "ai-kms-chat-button";
    chatButton.style.cssText = `
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #2563eb;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: all 0.3s ease;
    `;

    chatButton.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    `;

    // Chat window
    const chatWindow = document.createElement("div");
    chatWindow.id = "ai-kms-chat-window";
    chatWindow.style.cssText = `
      position: absolute;
      bottom: 70px;
      right: 0;
      width: 350px;
      height: 500px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
      display: none;
      flex-direction: column;
      overflow: hidden;
    `;

    // Chat header
    const chatHeader = document.createElement("div");
    const headerBg = (widgetConfig && widgetConfig.primaryColor) ? widgetConfig.primaryColor : '#2563eb';
    const headerText = (widgetConfig && widgetConfig.textColor) ? widgetConfig.textColor : 'white';
    chatHeader.style.cssText = `
      background: ${headerBg};
      color: ${headerText};
      padding: 16px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    const widgetTitle = (widgetConfig && widgetConfig.name) ? widgetConfig.name : 'AI Assistant';
    chatHeader.innerHTML = `
      <div>
        <div style="font-size: 16px;">${widgetTitle}</div>
        <div style="font-size: 12px; opacity: 0.8;">We're online</div>
      </div>
      <div id="ai-kms-close-btn" style="cursor: pointer; padding: 4px;">✕</div>
    `;

    // Chat messages
    const chatMessages = document.createElement("div");
    chatMessages.id = "ai-kms-chat-messages";
    chatMessages.style.cssText = `
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      background: #f9fafb;
    `;

    // Chat input
    const chatInput = document.createElement("div");
    chatInput.style.cssText = `
      padding: 16px;
      border-top: 1px solid #e5e7eb;
      background: white;
    `;

    chatInput.innerHTML = `
      <div style="display: flex; gap: 8px;">
        <input 
          type="text" 
          id="ai-kms-message-input" 
          placeholder="Type your message or Thai Citizen ID..."
          style="flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; outline: none;"
        />
        <button 
          id="ai-kms-send-btn"
          style="padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer;"
        >
          Send
        </button>
      </div>
    `;

    // Assemble widget
    chatWindow.appendChild(chatHeader);
    chatWindow.appendChild(chatMessages);
    chatWindow.appendChild(chatInput);

    widgetContainer.appendChild(chatButton);
    widgetContainer.appendChild(chatWindow);

    document.body.appendChild(widgetContainer);

    // Event listeners
    chatButton.addEventListener("click", toggleChat);
    document
      .getElementById("ai-kms-close-btn")
      .addEventListener("click", toggleChat);
    document
      .getElementById("ai-kms-send-btn")
      .addEventListener("click", sendMessage);

    const messageInput = document.getElementById("ai-kms-message-input");
    messageInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        sendMessage();
      }
    });
  }

  function toggleChat() {
    const chatWindow = document.getElementById("ai-kms-chat-window");
    isWidgetOpen = !isWidgetOpen;
    chatWindow.style.display = isWidgetOpen ? "flex" : "none";
  }

  function addMessage(role, content, metadata = {}) {
    const isTyping = metadata.isTyping || false;
    const messagesContainer = document.getElementById("ai-kms-chat-messages");
    const messageDiv = document.createElement("div");

    messageDiv.style.cssText = `
      margin-bottom: 12px;
      display: flex;
      ${role === "user" ? "justify-content: flex-end;" : "justify-content: flex-start;"}
    `;

    const messageBubble = document.createElement("div");
    
    // Special styling for human agent messages
    let bubbleStyles = "";
    if (role === "user") {
      bubbleStyles = "background: #2563eb; color: white; margin-left: auto;";
    } else if (metadata.isHumanAgent) {
      bubbleStyles = "background: #10b981; color: white; border: 1px solid #10b981;";
    } else {
      bubbleStyles = "background: white; color: #374151; border: 1px solid #e5e7eb;";
    }
    
    messageBubble.style.cssText = `
      max-width: 80%;
      padding: 8px 12px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.4;
      ${bubbleStyles}
    `;

    if (isTyping) {
      messageBubble.innerHTML = `
        <div style="display: flex; align-items: center; gap: 4px;">
          <div style="width: 6px; height: 6px; border-radius: 50%; background: #9ca3af; animation: pulse 1.4s ease-in-out infinite;"></div>
          <div style="width: 6px; height: 6px; border-radius: 50%; background: #9ca3af; animation: pulse 1.4s ease-in-out 0.2s infinite;"></div>
          <div style="width: 6px; height: 6px; border-radius: 50%; background: #9ca3af; animation: pulse 1.4s ease-in-out 0.4s infinite;"></div>
        </div>
      `;
    } else {
      if (role === "assistant" || role === "agent") {
        // Parse markdown for assistant and agent messages
        console.log("🔄 Processing AI/Agent message:", content);
        
        let messageContent = '';
        
        // Add human agent name if provided
        if (metadata.isHumanAgent && metadata.humanAgentName) {
          messageContent = `<div style="font-size: 12px; opacity: 0.8; margin-bottom: 4px;">👤 ${metadata.humanAgentName}</div>`;
        }
        
        // Direct markdown processing
        const parsed = parseMarkdown(content);
        messageContent += parsed;
        
        console.log("✅ Final parsed result:", messageContent);
        
        // Set both innerHTML AND add visual debugging
        messageBubble.innerHTML = messageContent;
        
        // Optional: Add debug indicator in development
        if (window.location.hostname === 'localhost' && content.includes('**') && !parsed.includes('**')) {
          console.log("✅ Markdown parsing successful - bold text converted");
        }
        
      } else {
        // Use plain text for user messages
        messageBubble.textContent = content;
      }
    }

    messageDiv.appendChild(messageBubble);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return messageDiv;
  }

  async function sendMessage() {
    const messageInput = document.getElementById("ai-kms-message-input");
    const message = messageInput.value.trim();

    if (!message) return;

    // Add user message
    addMessage("user", message);
    messageInput.value = "";

    // Show typing indicator
    const typingDiv = addMessage("assistant", "", { isTyping: true });

    try {
      const response = await fetch(`${baseUrl}/api/widget/${widgetKey}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessionId,
          message: message,
          visitorInfo: {
            name: null,
            email: null,
            phone: null,
          },
        }),
      });

      const data = await response.json();

      // Remove typing indicator
      typingDiv.remove();

      if (response.ok) {
        sessionId = data.sessionId;
        const messageType = data.messageType;
        const reply = data.response?.trim();

        if (messageType && data.metadata?.found === true) {
          addMessage("assistant", reply);
        } else if (messageType && data.metadata?.found === false) {
          addMessage(
            "assistant",
            "Sorry, we couldn’t find any employee with that Citizen ID. Please double-check and try again.",
          );
        } else if (
          messageType === "text" &&
          reply ===
            "Hi! How can I help you today? You can also check employee status by providing a Thai Citizen ID (13 digits)."
        ) {
          addMessage(
            "assistant",
            "Sorry, we couldn’t find any employee with that Citizen ID. Please double-check and try again.",
          );
        } else {
          addMessage("assistant", reply || "Not Found");
        }
        // addMessage("assistant", data.response);
      } else {
        addMessage(
          "assistant",
          "Sorry, I encountered an error. Please try again.",
        );
      }
    } catch (error) {
      // Remove typing indicator
      typingDiv.remove();
      addMessage(
        "assistant",
        "Sorry, I'm having trouble connecting. Please try again later.",
      );
    }
  }

  // WebSocket connection for human agent messages
  let ws = null;
  
  function initWebSocket() {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = window.location.port || (protocol === 'wss:' ? '443' : '80');
      const wsUrl = `${protocol}//${host}:${port}/ws`;
      
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('🔗 Widget WebSocket connected');
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle human agent messages for this widget
          if (data.type === 'human_agent_message' && 
              data.channelType === 'web') {
            
            // Check both conditions with detailed logging
            const userIdMatch = data.userId === sessionId;
            const channelIdMatch = data.channelId === widgetKey;
            const isBroadcast = data.userId === 'BROADCAST'; // Special broadcast message
            
            console.log('🔍 Detailed ID matching:', {
              userIdMatch,
              channelIdMatch,
              isBroadcast,
              dataUserIdType: typeof data.userId,
              sessionIdType: typeof sessionId,
              dataChannelIdType: typeof data.channelId,
              widgetKeyType: typeof widgetKey,
              dataUserIdValue: data.userId,
              sessionIdValue: sessionId,
              dataChannelIdValue: data.channelId,
              widgetKeyValue: widgetKey
            });
            
            // Accept message if widget key matches - this ensures messages reach the widget
            // regardless of session ID differences
            if (channelIdMatch) {
              const message = data.message;
              
              console.log('✅ Message accepted for widget (channel match):', {
                widgetKey: widgetKey,
                dataChannelId: data.channelId,
                sessionId: sessionId,
                dataUserId: data.userId,
                messageContent: message?.content?.substring(0, 50) + '...'
              });
              
              if (message && message.humanAgent) {
                // Add human agent message with special styling
                addMessage("agent", message.content, {
                  isHumanAgent: true,
                  humanAgentName: message.humanAgentName
                });
              }
            } else {
              console.log('❌ Message rejected - widget key mismatch:', {
                expectedWidgetKey: widgetKey,
                receivedChannelId: data.channelId
              });
            }
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      };
      
      ws.onclose = () => {
        console.log('🔌 Widget WebSocket disconnected');
        // Try to reconnect after 5 seconds
        setTimeout(initWebSocket, 5000);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
    }
  }

  // Load chat history from database
  async function loadChatHistory() {
    try {
      console.log("📚 Loading chat history for session:", sessionId);
      
      const response = await fetch(`${baseUrl}/api/widget/${widgetKey}/chat-history?sessionId=${sessionId}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log("📚 Retrieved chat history:", data);
        
        if (data.messages && data.messages.length > 0) {
          // Clear any existing welcome message first
          const messagesContainer = document.getElementById("ai-kms-chat-messages");
          if (messagesContainer) {
            messagesContainer.innerHTML = '';
          }
          
          // Add all historical messages
          data.messages.forEach(message => {
            let role, metadata = {};
            
            if (message.role === 'user') {
              role = 'user';
            } else if (message.message_type === 'agent') {
              // This is a human agent message
              role = 'agent';
              const messageMetadata = message.metadata ? JSON.parse(message.metadata) : {};
              metadata = {
                isHumanAgent: true,
                humanAgentName: messageMetadata.humanAgentName || 'Human Agent'
              };
            } else {
              // This is an AI assistant message
              role = 'assistant';
            }
            
            addMessage(role, message.content, metadata);
          });
          
          console.log(`✅ Loaded ${data.messages.length} messages from chat history`);
        } else {
          // Add welcome message if no history exists
          if (widgetConfig && widgetConfig.welcomeMessage) {
            addMessage("assistant", widgetConfig.welcomeMessage);
          } else {
            addMessage("assistant", "สวัสดีค่ะ! มีอะไรให้ช่วยเหลือไหมคะ?");
          }
        }
      } else {
        console.log("⚠️ Failed to load chat history, adding welcome message");
        // Add welcome message as fallback
        if (widgetConfig && widgetConfig.welcomeMessage) {
          addMessage("assistant", widgetConfig.welcomeMessage);
        } else {
          addMessage("assistant", "สวัสดีค่ะ! มีอะไรให้ช่วยเหลือไหมคะ?");
        }
      }
    } catch (error) {
      console.error("❌ Error loading chat history:", error);
      // Add welcome message as fallback
      if (widgetConfig && widgetConfig.welcomeMessage) {
        addMessage("assistant", widgetConfig.welcomeMessage);
      } else {
        addMessage("assistant", "สวัสดีค่ะ! มีอะไรให้ช่วยเหลือไหมคะ?");
      }
    }
  }

  // Initialize widget with config loading
  async function initWidget() {
    console.log("🚀 Starting widget initialization...");
    console.log("🔑 Widget Key:", widgetKey);
    console.log("🌐 Base URL:", baseUrl);

    // Generate session ID
    sessionId = localStorage.getItem(`ai-kms-session-${widgetKey}`) || generateVisitorId();
    localStorage.setItem(`ai-kms-session-${widgetKey}`, sessionId);
    
    console.log("🆔 Generated sessionId:", sessionId);
    
    await loadWidgetConfig();
    createWidget();
    await loadChatHistory();
    initWebSocket();
  }

  // Debug function to expose widget variables
  window.aiKmsWidgetDebug = function() {
    return {
      sessionId: sessionId,
      widgetKey: widgetKey,
      baseUrl: baseUrl,
      widgetConfig: widgetConfig
    };
  };

  // Initialize widget when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWidget);
  } else {
    initWidget();
  }

  // Add CSS animation keyframes
  const style = document.createElement("style");
  style.textContent = `
    @keyframes pulse {
      0%, 80%, 100% { opacity: 0.4; }
      40% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
})();
