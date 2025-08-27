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
  let ws = null; // WebSocket instance

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
      } else {
        console.error("Failed to load widget config:", response.status, response.statusText);
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
    const chatInputContainer = document.createElement("div");
    chatInputContainer.style.cssText = `
      padding: 16px;
      border-top: 1px solid #e5e7eb;
      background: white;
    `;

    chatInputContainer.innerHTML = `
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
    chatWindow.appendChild(chatInputContainer);

    widgetContainer.appendChild(chatButton);
    widgetContainer.appendChild(chatWindow);

    document.body.appendChild(widgetContainer);

    // Get references to dynamically created elements
    const closeButton = document.getElementById("ai-kms-close-btn");
    const messageInput = document.getElementById("ai-kms-message-input");
    const sendButton = document.getElementById("ai-kms-send-btn");

    // Add event listeners with error handling
    if (chatButton) {
      chatButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        console.log("💬 Chat button clicked");

        try {
          const chatContainer = document.getElementById('ai-kms-chat-window');
          if (chatContainer) {
            if (chatContainer.style.display === 'none' || chatContainer.style.display === '') {
              chatContainer.style.display = 'flex';
              chatButton.style.display = 'none';

              // Focus on input field when chat opens
              setTimeout(() => {
                if (messageInput) {
                  messageInput.focus();
                }
              }, 100);
            }
          } else {
            console.error("❌ Chat container not found");
          }
        } catch (error) {
          console.error("❌ Error opening chat:", error);
        }
      });
    }

    if (closeButton) {
      closeButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        try {
          const chatContainer = document.getElementById('ai-kms-chat-window');
          const chatButton = document.getElementById('ai-kms-chat-button');

          if (chatContainer) {
            chatContainer.style.display = 'none';
          }
          if (chatButton) {
            chatButton.style.display = 'flex';
          }
        } catch (error) {
          console.error("❌ Error closing chat:", error);
        }
      });
    }

    if (messageInput && sendButton) {
      messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();

          const message = messageInput.value.trim();
          if (message) {
            sendMessage(message);
            messageInput.value = '';
          }
        }
      });

      sendButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const message = messageInput.value.trim();
        if (message) {
          sendMessage(message);
          messageInput.value = '';
        }
      });
    }
  }

  // Toggles the chat window visibility
  function toggleChat() {
    const chatWindow = document.getElementById("ai-kms-chat-window");
    const chatButton = document.getElementById("ai-kms-chat-button");
    isWidgetOpen = !isWidgetOpen;
    if (chatWindow) {
      chatWindow.style.display = isWidgetOpen ? "flex" : "none";
    }
    if (chatButton) {
      chatButton.style.display = isWidgetOpen ? "none" : "flex";
    }
  }

  // Adds a message to the chat display
  function addMessage(role, content, metadata = {}) {
    const isTyping = metadata.isTyping || false;
    const messagesContainer = document.getElementById("ai-kms-chat-messages");

    if (!messagesContainer) {
      console.error("Messages container not found.");
      return;
    }

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

        messageBubble.innerHTML = messageContent;

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

  // Shows typing indicator
  function showTypingIndicator() {
    addMessage("assistant", "", { isTyping: true });
  }

  // Hides typing indicator
  function hideTypingIndicator() {
    const messagesContainer = document.getElementById("ai-kms-chat-messages");
    if (messagesContainer && messagesContainer.lastChild && messagesContainer.lastChild.querySelector('div[style*="animation: pulse"]')) {
      messagesContainer.removeChild(messagesContainer.lastChild);
    }
  }

  // Send message to backend
  async function sendMessage(message) {
    if (!message.trim()) return;

    try {
      // Add user message to chat
      addMessage('user', message);

      // Show typing indicator
      showTypingIndicator();

      console.log("📤 Sending message to backend:", message);
      console.log("🆔 Session ID:", sessionId);

      const response = await fetch(`${baseUrl}/api/widget/${widgetKey}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionId,
          message: message,
          visitorInfo: {
            name: null,
            email: null,
            phone: null
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ HTTP Error:", response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("📨 Received response:", data);

      // Hide typing indicator
      hideTypingIndicator();

      // Add AI response to chat
      if (data.response) {
        addMessage('assistant', data.response, data.metadata);
      } else {
        addMessage('assistant', 'ขออภัย ไม่สามารถสร้างคำตอบได้ในขณะนี้');
      }

    } catch (error) {
      console.error("❌ Error sending message:", error);

      // Hide typing indicator
      hideTypingIndicator();

      // Show error message
      addMessage('assistant', 'ขออภัย เกิดข้อผิดพลาดในการส่งข้อความ กรุณาลองใหม่อีกครั้ง');
    }
  }

  // Connect to WebSocket for real-time updates
  function connectWebSocket() {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      // In production, don't include port for standard ports
      const port = window.location.port;
      const wsUrl = port && port !== '80' && port !== '443' ?
        `${protocol}//${host}:${port}/ws` :
        `${protocol}//${host}/ws`;

      console.log("🔗 Connecting to WebSocket:", wsUrl);

      ws = new WebSocket(wsUrl);

      ws.onopen = function() {
        console.log("🔗 Widget WebSocket connected");
      };

      ws.onmessage = function(event) {
        try {
          const data = JSON.parse(event.data);

          // Handle real-time messages for this widget's session
          if (data.type === 'new_message' &&
              data.channelType === 'web' &&
              data.message &&
              data.message.sessionId === sessionId) {

            if (data.message.messageType === 'agent') {
              // Human agent message
              addMessage('agent', data.message.content, {
                isHumanAgent: true,
                humanAgentName: data.message.humanAgentName || 'Human Agent'
              });
            }
          }
        } catch (error) {
          console.error("❌ WebSocket message parse error:", error);
        }
      };

      ws.onclose = function(event) {
        console.log("🔗 Widget WebSocket disconnected:", event.code, event.reason);

        // Only attempt to reconnect if it wasn't a normal closure
        if (event.code !== 1000 && event.code !== 1001) {
          console.log("🔄 Attempting to reconnect WebSocket...");
          setTimeout(connectWebSocket, 3000);
        }
      };

      ws.onerror = function(error) {
        console.error("❌ Widget WebSocket error:", error);
      };

    } catch (error) {
      console.error('❌ Failed to initialize WebSocket:', error);
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
          const messagesContainer = document.getElementById("ai-kms-chat-messages");
          if (messagesContainer) {
            messagesContainer.innerHTML = '';
          }

          data.messages.forEach(message => {
            let role, metadata = {};

            if (message.role === 'user') {
              role = 'user';
            } else if (message.message_type === 'agent') {
              role = 'agent';
              const messageMetadata = message.metadata ? JSON.parse(message.metadata) : {};
              metadata = {
                isHumanAgent: true,
                humanAgentName: messageMetadata.humanAgentName || 'Human Agent'
              };
            } else {
              role = 'assistant';
            }
            addMessage(role, message.content, metadata);
          });

          console.log(`✅ Loaded ${data.messages.length} messages from chat history`);
        } else {
          if (widgetConfig && widgetConfig.welcomeMessage) {
            addMessage("assistant", widgetConfig.welcomeMessage);
          } else {
            addMessage("assistant", "สวัสดีค่ะ! มีอะไรให้ช่วยเหลือไหมคะ?");
          }
        }
      } else {
        console.log("⚠️ Failed to load chat history, adding welcome message");
        if (widgetConfig && widgetConfig.welcomeMessage) {
          addMessage("assistant", widgetConfig.welcomeMessage);
        } else {
          addMessage("assistant", "สวัสดีค่ะ! มีอะไรให้ช่วยเหลือไหมคะ?");
        }
      }
    } catch (error) {
      console.error("❌ Error loading chat history:", error);
      if (widgetConfig && widgetConfig.welcomeMessage) {
        addMessage("assistant", widgetConfig.welcomeMessage);
      } else {
        addMessage("assistant", "สวัสดีค่ะ! มีอะไรให้ช่วยเหลือไหมคะ?");
      }
    }
  }

  // Initialize widget with config loading
  async function initWidget() {
    // Prevent duplicate initialization
    if (window.aiKmsWidgetInitialized) {
      console.log("⚠️ Widget already initialized, skipping...");
      return;
    }

    console.log("🚀 Starting widget initialization...");
    console.log("🔑 Widget Key:", widgetKey);
    console.log("🌐 Base URL:", baseUrl);

    // Mark as initialized
    window.aiKmsWidgetInitialized = true;

    // Generate session ID
    sessionId = localStorage.getItem(`ai-kms-session-${widgetKey}`) || generateVisitorId();
    localStorage.setItem(`ai-kms-session-${widgetKey}`, sessionId);

    console.log("🆔 Generated sessionId:", sessionId);

    try {
      await loadWidgetConfig(); // Await config loading before proceeding

      // Check if widget is active and exists
      if (!widgetConfig.isActive) {
        console.warn('AI-KMS Widget: Widget is inactive');
        return;
      }

      // Check if platform live chat is enabled (for platform widgets)
      if (widgetConfig.isPlatformWidget) {
        try {
          const settingsResponse = await fetch(`${baseUrl}/api/system/live-chat-status`);
          const settingsData = await settingsResponse.json();
          if (!settingsData.enabled) {
            console.warn('AI-KMS Widget: Platform live chat is disabled');
            return;
          }
        } catch (error) {
          console.warn('AI-KMS Widget: Could not check platform live chat status, proceeding anyway');
        }
      }

      createWidget();
      await loadChatHistory(); // Await chat history loading
      connectWebSocket();
    } catch (error) {
      console.error("❌ Widget initialization error:", error);
      window.aiKmsWidgetInitialized = false;
    }
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

  // Initialize when DOM is ready
  function safeInit() {
    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWidget);
      } else {
        // Small delay to ensure everything is loaded
        setTimeout(initWidget, 100);
      }
    } catch (error) {
      console.error("❌ Widget script initialization error:", error);
    }
  }

  safeInit();

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