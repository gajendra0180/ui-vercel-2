import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useActiveAccount } from "thirdweb/react";
import {
  getAllAgents,
  getAllServers,
  createChatSession,
  getUserChatSessions,
  sendChatMessage,
  getChatMessages,
  createChatStreamListener,
  buildProxyUrl,
  Agent,
  ChatSession,
  ChatMessage as APIChatMessage,
  SSEEvent,
  ServerEntry,
} from "../utils/api";
import { useX402Payment } from "../hooks/useX402Payment";
import { Spinner } from "../components/Spinner";
import ChatMessage from "../components/ChatMessage";
import ChatSidebar from "../components/ChatSidebar";
import { ToolCallEntry } from "../components/DebugPanel";
import ModelSelector, { LLMModel } from "../components/ModelSelector";
import ToolPills, { ToolInfo } from "../components/ToolPills";
import ToolPickerModal from "../components/ToolPickerModal";
import "./ChatPage.css";

interface DisplayMessage extends APIChatMessage {
  id: string;
  paymentButton?: PaymentButton;
  toolCall?: { name: string; loading?: boolean };
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
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");

  // Tool and model override state
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<LLMModel>("claude");
  const [isToolPickerOpen, setIsToolPickerOpen] = useState(false);

  // Streaming state
  const [streaming, setStreaming] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_totalCost, setTotalCost] = useState("0");

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  // Load agents and servers on mount
  useEffect(() => {
    loadAgents();
    loadServers();
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

  const loadServers = async () => {
    try {
      const serversData = await getAllServers();
      setServers(serversData);
    } catch (err) {
      console.error("Failed to load servers:", err);
    }
  };

  const loadChatHistory = async (agentId: string) => {
    if (!account) return;
    try {
      const sessions = await getUserChatSessions(account.address, agentId);
      setChatHistory(sessions);
    } catch (err) {
      console.error("Failed to load chat history:", err);
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

      // Set model and tools from agent defaults
      setSelectedModel(agent.llmProvider === "gpt" ? "gpt-4" : agent.llmProvider as LLMModel);
      setSelectedTools(agent.availableTools);

      // Load chat history for this agent
      await loadChatHistory(agent.id);

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
    } catch (err: any) {
      setError(err.message || "Failed to start chat");
    }
  };

  const switchToChat = async (chatId: string) => {
    if (!selectedAgent) return;

    try {
      setError(null);
      setMessages([]);

      // Find the session in history
      const targetSession = chatHistory.find(s => s.id === chatId);
      if (!targetSession) {
        setError("Chat session not found");
        return;
      }

      setSession(targetSession);

      // Load messages for this session
      const existingMessages = await getChatMessages(chatId);
      const displayMessages = existingMessages.map((msg, idx) => ({
        ...msg,
        id: `${idx}-${Date.now()}`,
      }));
      setMessages(displayMessages);
    } catch (err: any) {
      setError(err.message || "Failed to switch chat");
    }
  };

  // Get tool info list for pills
  const getToolInfoList = useCallback((): ToolInfo[] => {
    const toolList: ToolInfo[] = [];
    for (const toolId of selectedTools) {
      const [serverSlug, apiSlug] = toolId.split('/');
      const server = servers.find((s) => s.slug === serverSlug);
      const api = server?.apis?.find((a) => a.slug === apiSlug);
      if (server && api) {
        toolList.push({
          id: toolId,
          name: api.name,
          serverName: server.name,
          fee: formatFee(api.fee),
        });
      }
    }
    return toolList;
  }, [selectedTools, servers]);

  const formatFee = (fee: string): string => {
    const feeNum = parseFloat(fee) / 1_000_000;
    return feeNum < 0.01 ? `$${feeNum.toFixed(4)}` : `$${feeNum.toFixed(2)}`;
  };

  const handleToolAdd = (toolId: string) => {
    if (!selectedTools.includes(toolId)) {
      setSelectedTools([...selectedTools, toolId]);
    }
  };

  const handleToolRemove = (toolId: string) => {
    setSelectedTools(selectedTools.filter((t) => t !== toolId));
  };

  const handleNewChat = async () => {
    if (!selectedAgent || !account) return;

    try {
      // Reset local state
      setSession(null);
      setMessages([]);
      setTotalCost("0");
      setToolCalls([]);
      setError(null);

      // Force create a new session
      const result = await createChatSession({
        agentId: selectedAgent.id,
        userAddress: account.address,
        forceNew: true,
      });

      if (result.success && result.session) {
        setSession(result.session);
        // Refresh chat history to include the new session
        await loadChatHistory(selectedAgent.id);
      } else {
        setError(result.error || "Failed to create new chat session");
      }
    } catch (err: any) {
      setError(err.message || "Failed to start new chat");
    }
  };

  const handleAgentChange = (agent: Agent | null) => {
    if (agent) {
      setSession(null);
      setMessages([]);
      setTotalCost("0");
      setToolCalls([]);
      startChatWithAgent(agent);
    } else {
      setSelectedAgent(null);
    }
  };

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

      const cleanup = await createChatStreamListener(
        session.id,
        (event: SSEEvent) => {
          switch (event.type) {
            case "token":
              assistantContent += event.data.content;
              setMessages((prev) => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.role === "assistant" && !lastMsg.toolCall) {
                  return [
                    ...prev.slice(0, -1),
                    { ...lastMsg, content: assistantContent },
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
              // Track tool call in debug panel
              const toolCallId = `tool-${Date.now()}`;
              setToolCalls((prev) => [
                ...prev,
                {
                  id: toolCallId,
                  toolName: event.data.name as string,
                  toolDisplayName: event.data.description as string || event.data.name as string,
                  input: event.data.input,
                  success: true,
                  timestamp: new Date().toISOString(),
                },
              ]);
              break;

            case "tool_result":
              // Update tool call with result
              setToolCalls((prev) =>
                prev.map((tc) =>
                  tc.toolName === (event.data.toolName as string)
                    ? {
                        ...tc,
                        output: event.data.result,
                        success: event.data.success as boolean,
                        error: event.data.error as string | undefined,
                        latencyMs: event.data.latencyMs as number | undefined,
                      }
                    : tc
                )
              );
              break;

            case "payment_option":
              const paymentOption: PaymentButton = event.data as PaymentButton;
              setMessages((prev) => [
                ...prev,
                {
                  id: `payment-option-${Date.now()}`,
                  role: "assistant",
                  content: "",
                  timestamp: new Date().toISOString(),
                  paymentButton: paymentOption,
                },
              ]);
              break;

            case "payment_recorded":
              setTotalCost(event.data.fee as string);
              break;

            case "error":
              setError(event.data.message as string);
              break;

            case "done":
              setStreaming(false);
              break;
          }
        },
        (streamError: Error) => {
          console.error("Stream error:", streamError);
          setError("Connection lost. Please try again.");
          setStreaming(false);
        },
        () => {
          setStreaming(false);
        }
      );

      streamCleanupRef.current = cleanup;
    } catch (err: any) {
      setError(err.message || "Failed to send message");
      setStreaming(false);
    }
  }, [messageInput, session, streaming]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  const handlePaymentButtonClick = useCallback(
    async (paymentBtn: PaymentButton) => {
      if (!session) return;

      try {
        setError(null);
        const url = buildProxyUrl(paymentBtn.serverSlug, paymentBtn.apiSlug);
        const fee = BigInt(paymentBtn.fee);

        setMessages((prev) => [
          ...prev,
          {
            id: `payment-processing-${Date.now()}`,
            role: "assistant",
            content: `Processing payment of ${paymentBtn.displayFee}...`,
            timestamp: new Date().toISOString(),
          },
        ]);

        const result = await callAPIWithPayment(url, fee, paymentBtn.tokenAddress);

        const resultMessage = `Payment successful! I paid ${paymentBtn.displayFee} for ${paymentBtn.toolDisplayName}. Here's the result: ${JSON.stringify(result, null, 2)}`;

        setMessages((prev) => [
          ...prev,
          {
            id: `user-payment-result-${Date.now()}`,
            role: "user",
            content: resultMessage,
            timestamp: new Date().toISOString(),
          },
        ]);

        const sendResult = await sendChatMessage({
          sessionId: session.id,
          content: resultMessage,
        });

        if (!sendResult.success) {
          setError(sendResult.error || "Failed to send payment result");
          return;
        }

        // Stream agent's response
        setStreaming(true);
        let assistantContent = "";

        const cleanup = await createChatStreamListener(
          session.id,
          (event: SSEEvent) => {
            if (event.type === "token") {
              assistantContent += event.data.content;
              setMessages((prev) => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.role === "assistant") {
                  return [...prev.slice(0, -1), { ...lastMsg, content: assistantContent }];
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
            } else if (event.type === "done" || event.type === "error") {
              setStreaming(false);
              if (event.type === "error") setError(event.data.message as string);
            }
          },
          () => setStreaming(false),
          () => setStreaming(false)
        );

        streamCleanupRef.current = cleanup;
      } catch (err: any) {
        setError(err.message || "Payment failed");
      }
    },
    [session, callAPIWithPayment]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamCleanupRef.current) streamCleanupRef.current();
    };
  }, []);

  if (!account) {
    return (
      <div className="chat-page">
        <div className="connect-prompt">
          <h2>Connect Your Wallet</h2>
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
            <h1>Chat with Agents</h1>
            <p>Select an agent to start a conversation</p>
          </div>

          {error && <div className="error-box">{error}</div>}

          {loadingAgents ? (
            <div className="loading-container">
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
                    <span className="meta-item">{agent.availableTools.length} APIs</span>
                    <span className="meta-item">{agent.totalMessages || 0} messages</span>
                  </div>
                  <button className="btn btn-primary btn-full">Start Chat</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Transform chat history to sidebar format
  // chatHistory is sorted newest first, so reverse index for numbering
  const sidebarChatHistory = chatHistory.map((chat, index) => ({
    id: chat.id,
    title: `Chat ${chatHistory.length - index}`,
    timestamp: chat.createdAt, // Use createdAt for consistent timestamps
    isActive: session?.id === chat.id,
  }));

  // Chat view - full height layout with sidebar
  return (
    <div className="chat-page chat-page--active chat-page--with-sidebar">
      {/* Sidebar */}
      <ChatSidebar
        mode="agent"
        agents={agents}
        selectedAgent={selectedAgent}
        onAgentChange={handleAgentChange}
        onNewChat={handleNewChat}
        chatHistory={sidebarChatHistory}
        onChatSelect={switchToChat}
        debugOpen={false}
        onDebugToggle={() => {}}
        toolCalls={[]}
      />

      {/* Main Chat Area */}
      <div className="chat-main">
        {/* Agent Identity (when no messages) */}
        {messages.length === 0 && (
          <div className="chat-identity">
            <div className="chat-identity__icon">🤖</div>
            <h2 className="chat-identity__name">{selectedAgent.name}</h2>
            <p className="chat-identity__desc">{selectedAgent.description}</p>
            {selectedAgent.starterPrompts && selectedAgent.starterPrompts.length > 0 && (
              <div className="chat-identity__prompts">
                {selectedAgent.starterPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    className="starter-prompt-btn"
                    onClick={() => setMessageInput(prompt)}
                  >
                    "{prompt}"
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        {messages.length > 0 && (
          <div className="chat-messages">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
                isStreaming={streaming && msg.role === "assistant" && msg === messages[messages.length - 1]}
                toolCall={msg.toolCall}
                paymentButton={
                  msg.paymentButton
                    ? {
                        label: `${msg.paymentButton.toolDisplayName} - ${msg.paymentButton.displayFee}`,
                        onClick: () => handlePaymentButtonClick(msg.paymentButton!),
                        disabled: streaming || isProcessing,
                      }
                    : undefined
                }
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="chat-error">
            <span>{error}</span>
            <button onClick={() => setError(null)}>x</button>
          </div>
        )}

        {/* Input Area - fixed at bottom */}
        <div className="chat-input-area">
          {/* Tool Pills */}
          <div className="chat-tools">
            <ToolPills
              tools={getToolInfoList()}
              onRemove={handleToolRemove}
              onAddClick={() => setIsToolPickerOpen(true)}
              disabled={streaming}
            />
          </div>

          {/* Input Bar */}
          <div className="chat-input-bar">
            <textarea
              className="chat-input"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
              disabled={streaming}
              rows={1}
            />
            <div className="chat-input-actions">
              <ModelSelector
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                disabled={streaming}
              />
              <button
                className="chat-send-btn"
                onClick={handleSendMessage}
                disabled={streaming || !messageInput.trim()}
              >
                {streaming ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tool Picker Modal */}
      <ToolPickerModal
        isOpen={isToolPickerOpen}
        onClose={() => setIsToolPickerOpen(false)}
        servers={servers}
        selectedTools={selectedTools}
        onToolAdd={handleToolAdd}
        onToolRemove={handleToolRemove}
      />
    </div>
  );
}
