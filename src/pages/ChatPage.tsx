import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useActiveAccount } from "thirdweb/react";
import {
  getAgent,
  getAllAgents,
  createChatSession,
  sendChatMessage,
  getChatMessages,
  createChatStreamListener,
  buildProxyUrl,
  Agent,
  ChatSession,
  ChatMessage,
  SSEEvent,
} from "../utils/api";
import { useX402Payment } from "../hooks/useX402Payment";
import { Spinner } from "../components/Spinner";
import "./ChatPage.css";

interface DisplayMessage extends ChatMessage {
  id: string;
  paymentButton?: PaymentButton;
}

interface ToolCall {
  name: string;
  description: string;
}

interface ToolResult {
  toolName: string;
  success: boolean;
  result?: any;
  error?: string;
}

interface Payment {
  serverSlug: string;
  apiSlug: string;
  fee: string;
  displayFee: string;
}

interface PaymentButton {
  toolName: string;
  toolDisplayName: string;
  serverSlug: string;
  apiSlug: string;
  fee: string;
  displayFee: string;
  tokenAddress: string;
  description: string;
}

export function ChatPage() {
  const account = useActiveAccount();
  const [searchParams] = useSearchParams();
  const { callAPIWithPayment, isProcessing } = useX402Payment();

  // Agent selection state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [loadingAgents, setLoadingAgents] = useState(true);

  // Chat session state
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");

  // Streaming state
  const [streaming, setStreaming] = useState(false);
  const [currentToolCall, setCurrentToolCall] = useState<ToolCall | null>(null);
  const [totalCost, setTotalCost] = useState("0");
  const [toolCalls, setToolCalls] = useState<string[]>([]);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  // Load agents on mount
  useEffect(() => {
    loadAgents();
  }, []);

  // Auto-select agent from URL parameter if present
  useEffect(() => {
    const agentIdFromUrl = searchParams.get("agentId");
    if (agentIdFromUrl && agents.length > 0 && !selectedAgent) {
      const agent = agents.find((a) => a.id === agentIdFromUrl);
      if (agent) {
        startChatWithAgent(agent);
      }
    }
  }, [agents, searchParams, selectedAgent]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadAgents = async () => {
    try {
      setLoadingAgents(true);
      const agentsData = await getAllAgents();
      setAgents(agentsData);
    } catch (err) {
      console.error("Failed to load agents:", err);
      setError("Failed to load agents");
    } finally {
      setLoadingAgents(false);
    }
  };

  const startChatWithAgent = async (agent: Agent) => {
    if (!account) {
      setError("Wallet not connected");
      return;
    }

    try {
      setError(null);
      setSelectedAgent(agent);
      setMessages([]);
      setTotalCost("0");
      setToolCalls([]);

      // Create chat session
      const result = await createChatSession({
        agentId: agent.id,
        userAddress: account.address,
      });

      if (result.success && result.session) {
        setSession(result.session);

        // Load existing messages if any
        const existingMessages = await getChatMessages(result.session.id);
        const displayMessages = existingMessages.map((msg, idx) => ({
          ...msg,
          id: `${idx}-${Date.now()}`,
        }));
        setMessages(displayMessages);
      } else {
        setError(result.error || "Failed to create chat session");
      }
    } catch (err: unknown) {
      setError(err.message || "Failed to start chat");
    }
  };

  /**
   * Memoize message sending handler to prevent recreation on each render
   * Dependencies: session, streaming, messageInput, and functions needed in closure
   */
  const handleSendMessage = useCallback(async () => {
    if (!messageInput.trim() || !session || streaming) {
      return;
    }

    const userMessage = messageInput.trim();
    setMessageInput("");
    setError(null);

    try {
      // Add user message to display
      const userDisplayMessage: DisplayMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: userMessage,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userDisplayMessage]);

      // Send message to backend
      const sendResult = await sendChatMessage({
        sessionId: session.id,
        content: userMessage,
      });

      if (!sendResult.success) {
        setError(sendResult.error || "Failed to send message");
        return;
      }

      // Start streaming response
      setStreaming(true);
      let assistantContent = "";
      let currentPayments: Payment[] = [];

      // Create SSE listener with enhanced error handling
      const cleanup = await createChatStreamListener(
        session.id,
        (event: SSEEvent) => {
          switch (event.type) {
            case "token":
              // Add token to assistant message
              assistantContent += event.data.content;
              setMessages((prev) => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.role === "assistant" && !lastMsg.id.startsWith("tool-")) {
                  return [
                    ...prev.slice(0, -1),
                    {
                      ...lastMsg,
                      content: assistantContent,
                    },
                  ];
                }
                return [
                  ...prev,
                  {
                    id: `assistant-${Date.now()}`,
                    role: "assistant",
                    content: event.data.content,
                    timestamp: new Date().toISOString(),
                  },
                ];
              });
              break;

            case "tool_call":
              // Show tool being called
              setCurrentToolCall({
                name: event.data.name,
                description: event.data.description,
              });
              setToolCalls((prev) => [...prev, event.data.name]);
              setMessages((prev) => [
                ...prev,
                {
                  id: `tool-${Date.now()}`,
                  role: "assistant",
                  content: `🔧 Calling ${event.data.name}...`,
                  timestamp: new Date().toISOString(),
                },
              ]);
              break;

            case "tool_result":
              // Show tool result
              const toolResult: ToolResult = event.data;
              if (toolResult.success) {
                // Format result nicely - show full result if reasonable size, truncate only if very large
                const resultStr = JSON.stringify(toolResult.result, null, 2);
                const isTooLarge = resultStr.length > 1000;
                const displayResult = isTooLarge ? resultStr.substring(0, 1000) + '\n... (truncated)' : resultStr;

                setMessages((prev) => [
                  ...prev,
                  {
                    id: `result-${Date.now()}`,
                    role: "assistant",
                    content: `✅ ${toolResult.toolName}:\n${displayResult}`,
                    timestamp: new Date().toISOString(),
                  },
                ]);
              } else {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `error-${Date.now()}`,
                    role: "assistant",
                    content: `❌ ${toolResult.toolName} failed: ${toolResult.error}`,
                    timestamp: new Date().toISOString(),
                  },
                ]);
              }
              setCurrentToolCall(null);
              break;

            case "payment_option":
              // Payment option from agent - show payment button
              const paymentOption: PaymentButton = event.data;
              setMessages((prev) => [
                ...prev,
                {
                  id: `payment-option-${Date.now()}`,
                  role: "assistant",
                  content: ``, // Agent's text recommendation comes via 'token' events
                  timestamp: new Date().toISOString(),
                  paymentButton: paymentOption,
                },
              ]);
              setCurrentToolCall(null); // Clear tool call indicator
              break;

            case "payment_recorded":
              // Track payment
              const payment: Payment = event.data;
              currentPayments.push(payment);
              setTotalCost(payment.fee);
              setMessages((prev) => [
                ...prev,
                {
                  id: `payment-${Date.now()}`,
                  role: "assistant",
                  content: `💳 Cost: ${payment.displayFee} for ${payment.serverSlug}/${payment.apiSlug}`,
                  timestamp: new Date().toISOString(),
                },
              ]);
              break;

            case "error":
              setError(event.data.message || "Stream error");
              setMessages((prev) => [
                ...prev,
                {
                  id: `stream-error-${Date.now()}`,
                  role: "assistant",
                  content: `❌ Error: ${event.data.message}`,
                  timestamp: new Date().toISOString(),
                },
              ]);
              break;

            case "done":
              // Stream complete
              setStreaming(false);
              break;
          }
        },
        (streamError: Error) => {
          console.error("Stream error:", streamError);

          // Distinguish between network errors and API errors
          const isNetworkError = streamError.message.includes("network") ||
                                 streamError.message.includes("fetch") ||
                                 streamError.message.includes("abort");

          const errorMessage = isNetworkError
            ? "Connection lost. Please check your internet and try again."
            : streamError.message.includes("timeout")
            ? "Request timeout. The server took too long to respond. Please try again."
            : "An error occurred during streaming. Please try sending your message again.";

          setError(errorMessage);
          setStreaming(false);
          setCurrentToolCall(null);

          // Add error message to chat
          setMessages((prev) => [
            ...prev,
            {
              id: `connection-error-${Date.now()}`,
              role: "assistant",
              content: `⚠️ ${errorMessage}`,
              timestamp: new Date().toISOString(),
            },
          ]);
        },
        () => {
          // Stream completed successfully
          setStreaming(false);
          setCurrentToolCall(null);
        }
      );

      // Set up a timeout for stream connection (120 seconds)
      // Longer timeout needed for conversations with many messages in context
      const streamTimeoutId = setTimeout(() => {
        if (streaming && streamCleanupRef.current) {
          setError("Request timeout. The server took too long to respond.");
          setStreaming(false);
          streamCleanupRef.current();
        }
      }, 120000);

      // Store both cleanup function and timeout for proper cleanup
      streamCleanupRef.current = () => {
        clearTimeout(streamTimeoutId);
        cleanup();
      };
    } catch (err: unknown) {
      setError(err.message || "Failed to send message");
      setStreaming(false);
    }
  }, [messageInput, session, streaming, sendChatMessage, createChatStreamListener]);

  /**
   * Memoize handleKeyPress to prevent function recreation
   * Only recreates if handleSendMessage changes
   */
  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  /**
   * Handle payment button click - execute x402 payment and send result to agent
   */
  const handlePaymentButtonClick = useCallback(async (paymentBtn: PaymentButton) => {
    if (!session) return;

    try {
      setError(null);

      // Build proxy URL (same as APIDetailsPage)
      const url = buildProxyUrl(paymentBtn.serverSlug, paymentBtn.apiSlug);
      const fee = BigInt(paymentBtn.fee);

      // Show payment in progress
      setMessages((prev) => [
        ...prev,
        {
          id: `payment-processing-${Date.now()}`,
          role: "assistant",
          content: `💳 Processing payment of ${paymentBtn.displayFee}...`,
          timestamp: new Date().toISOString(),
        },
      ]);

      // Execute payment via x402 (same flow as APIDetailsPage)
      const result = await callAPIWithPayment(
        url,
        fee,
        paymentBtn.tokenAddress
      );

      // Send result back to agent as new user message
      const resultMessage = `Payment successful! I paid ${paymentBtn.displayFee} for ${paymentBtn.toolDisplayName}. Here's the result: ${JSON.stringify(result, null, 2)}`;

      // Add user message to display
      const userDisplayMessage: DisplayMessage = {
        id: `user-payment-result-${Date.now()}`,
        role: "user",
        content: resultMessage,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userDisplayMessage]);

      // Send message to backend
      const sendResult = await sendChatMessage({
        sessionId: session.id,
        content: resultMessage,
      });

      if (!sendResult.success) {
        setError(sendResult.error || "Failed to send payment result");
        return;
      }

      // Start streaming agent's response to the result
      setStreaming(true);
      let assistantContent = "";

      const cleanup = await createChatStreamListener(
        session.id,
        (event: SSEEvent) => {
          switch (event.type) {
            case "token":
              assistantContent += event.data.content;
              setMessages((prev) => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.role === "assistant" && !lastMsg.id.startsWith("tool-")) {
                  return [
                    ...prev.slice(0, -1),
                    {
                      ...lastMsg,
                      content: assistantContent,
                    },
                  ];
                }
                return [
                  ...prev,
                  {
                    id: `assistant-${Date.now()}`,
                    role: "assistant",
                    content: event.data.content,
                    timestamp: new Date().toISOString(),
                  },
                ];
              });
              break;

            case "done":
              setStreaming(false);
              break;

            case "error":
              setError(event.data.message || "Stream error");
              setStreaming(false);
              break;
          }
        },
        (streamError: Error) => {
          console.error("Stream error:", streamError);
          setError("Failed to get agent response");
          setStreaming(false);
        },
        () => {
          setStreaming(false);
        }
      );

      streamCleanupRef.current = cleanup;

    } catch (err: any) {
      setError(err.message || "Payment failed");
      setMessages((prev) => [
        ...prev,
        {
          id: `payment-error-${Date.now()}`,
          role: "assistant",
          content: `❌ Payment failed: ${err.message}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [session, callAPIWithPayment, sendChatMessage, createChatStreamListener]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (streamCleanupRef.current) {
        streamCleanupRef.current();
      }
    };
  }, []);

  if (!account) {
    return (
      <div className="chat-page">
        <div className="connect-prompt">
          <h2>👋 Connect Your Wallet</h2>
          <p>Please connect your wallet to chat with agents</p>
        </div>
      </div>
    );
  }

  // Agent selection view
  if (!selectedAgent) {
    return (
      <div className="chat-page">
        <div className="agent-selector">
          <div className="selector-header">
            <h1>🤖 Chat with Agents</h1>
            <p>Select an agent to start a conversation</p>
          </div>

          {error && <div className="error-box">❌ {error}</div>}

          {loadingAgents ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
              <Spinner size="large" label="Loading available agents..." />
            </div>
          ) : agents.length === 0 ? (
            <div className="empty-state">
              <p>No agents available yet. Create one in the Agent Composer!</p>
              <a href="/agents" className="btn btn-primary">
                Create Agent
              </a>
            </div>
          ) : (
            <div className="agents-grid">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="agent-card"
                  onClick={() => startChatWithAgent(agent)}
                >
                  <div className="agent-header">
                    <h3>{agent.name}</h3>
                    <span className="llm-badge">{agent.llmProvider}</span>
                  </div>
                  <p className="agent-description">{agent.description}</p>
                  <div className="agent-meta">
                    <span className="meta-item">
                      🔧 {agent.availableTools.length} APIs
                    </span>
                    <span className="meta-item">
                      💬 {agent.totalMessages} messages
                    </span>
                  </div>
                  <div className="agent-prompts">
                    <h4>Starter Prompts:</h4>
                    {agent.starterPrompts.length > 0 ? (
                      <ul>
                        {agent.starterPrompts.slice(0, 2).map((prompt, idx) => (
                          <li key={idx}>{prompt}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="no-prompts">No starter prompts</p>
                    )}
                  </div>
                  <button className="btn btn-primary btn-full">
                    Start Chat
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Chat view
  return (
    <div className="chat-page">
      <div className="chat-container">
        {/* Header */}
        <div className="chat-header">
          <div className="header-content">
            <button
              className="btn-back"
              onClick={() => {
                setSelectedAgent(null);
                setMessages([]);
                setSession(null);
              }}
            >
              ← Back to Agents
            </button>
            <div className="agent-info">
              <h2>{selectedAgent.name}</h2>
              <p>{selectedAgent.description}</p>
            </div>
          </div>
          <div className="header-stats">
            {totalCost !== "0" && (
              <div className="cost-display">
                <span className="label">Total Cost</span>
                <span className="cost">
                  ${(parseInt(totalCost) / 1000000).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <div className="messages-container">
          {messages.length === 0 && !error && (
            <div className="empty-chat">
              <div className="welcome-icon">🤖</div>
              <h3>Start a conversation with {selectedAgent.name}</h3>
              <p>Try one of these starter prompts:</p>
              <div className="starter-prompts">
                {selectedAgent.starterPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    className="prompt-button"
                    onClick={() => {
                      setMessageInput(prompt);
                    }}
                  >
                    "{prompt}"
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`message message-${msg.role}`}
            >
              <div className="message-avatar">
                {msg.role === "user" ? "👤" : "🤖"}
              </div>
              <div className="message-content">
                {msg.content && (
                  <div className="message-text">{msg.content}</div>
                )}

                {/* Render payment button if present */}
                {msg.paymentButton && (
                  <button
                    className="btn btn-primary payment-button"
                    onClick={() => handlePaymentButtonClick(msg.paymentButton!)}
                    disabled={streaming || isProcessing}
                    aria-label={`Pay ${msg.paymentButton.displayFee} to call ${msg.paymentButton.toolDisplayName}`}
                  >
                    💳 Pay {msg.paymentButton.displayFee} → {msg.paymentButton.toolDisplayName}
                  </button>
                )}

                <time className="message-time">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </time>
              </div>
            </div>
          ))}

          {currentToolCall && (
            <div className="tool-call-indicator">
              <div className="tool-loading">
                <div className="spinner"></div>
                <span>{currentToolCall.name}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="message message-error">
              <div className="message-avatar">⚠️</div>
              <div className="message-content">
                <div className="message-text">{error}</div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="chat-input-container">
          <div className="input-wrapper">
            <textarea
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message... (Shift+Enter for new line)"
              disabled={streaming}
              className="chat-input"
              aria-label="Message input - Type your message to the agent"
              aria-describedby="message-help"
            />
            <p id="message-help" className="sr-only">
              Press Enter to send, Shift+Enter for new line. Disabled while agent is thinking.
            </p>
            <button
              className="btn btn-primary btn-send"
              onClick={handleSendMessage}
              disabled={!messageInput.trim() || streaming}
              aria-label={streaming ? "Agent is processing your message" : "Send message"}
            >
              {streaming ? "⏳ Streaming..." : "Send"}
            </button>
          </div>
          {streaming && (
            <p className="input-help">Agent is thinking and calling APIs...</p>
          )}
        </div>
      </div>
    </div>
  );
}
