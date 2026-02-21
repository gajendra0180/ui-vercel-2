import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import {
  ServerEntry,
  getAllServers,
  getServersByChain,
  buildProxyUrl,
} from '../utils/api';
import { useX402Payment } from '../hooks/useX402Payment';
import { useChainContext } from '../contexts/ChainContext';
import ChatSidebar from '../components/ChatSidebar';
import ChatMessage from '../components/ChatMessage';
import ModelSelector, { LLMModel } from '../components/ModelSelector';
import ToolPills, { ToolInfo } from '../components/ToolPills';
import ToolPickerModal from '../components/ToolPickerModal';
import { ToolCallEntry } from '../components/DebugPanel';
import './NewChatPlayground.css';

interface PaymentButton {
  toolName: string;
  toolDisplayName: string;
  serverSlug: string;
  apiSlug: string;
  fee: string;
  displayFee: string;
  tokenAddress: string;
  description?: string;
  input?: Record<string, unknown>;
}

interface PlaygroundMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolCall?: {
    name: string;
    loading?: boolean;
  };
  paymentButton?: PaymentButton;
}

export const NewChatPlayground: React.FC = () => {
  const account = useActiveAccount();
  const { callAPIWithPayment, isProcessing } = useX402Payment();
  const { selectedChainId } = useChainContext();

  // State
  const [messages, setMessages] = useState<PlaygroundMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [selectedModel, setSelectedModel] = useState<LLMModel>('claude');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [isToolPickerOpen, setIsToolPickerOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Track pending conversation state for after payment
  const [pendingConversation, setPendingConversation] = useState<Array<{ role: string; content: string }>>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load servers on mount and when chain changes
  useEffect(() => {
    loadServers();
  }, [selectedChainId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadServers = async () => {
    try {
      const allServers = selectedChainId
        ? await getServersByChain(selectedChainId)
        : await getAllServers();
      setServers(allServers);
    } catch (err) {
      console.error('Failed to load servers:', err);
    }
  };

  // Get tool info from selected tool IDs
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

  const handleNewChat = () => {
    setMessages([]);
    setToolCalls([]);
    setError(null);
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || isStreaming) return;

    // Require at least one tool to be selected
    if (selectedTools.length === 0) {
      setError('Please add at least one tool before sending a message. Click "+ Add Tool" to select APIs.');
      return;
    }

    const userMessage: PlaygroundMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageInput.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessageInput('');
    setIsStreaming(true);
    setError(null);

    // Create assistant message placeholder
    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage: PlaygroundMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      // Prepare conversation history for API
      const conversationHistory = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Call playground API
      const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
      const response = await fetch(
        `${apiBaseUrl}/api/chat/playground`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: userMessage.content,
            model: selectedModel,
            tools: selectedTools,
            conversationHistory,
            userAddress: account?.address || 'anonymous',
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response stream');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              handleStreamEvent(data, assistantId);
            } catch (e) {
              console.error('Failed to parse SSE event:', e);
            }
          }
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Remove empty assistant message on error
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsStreaming(false);
    }
  };

  const handleStreamEvent = (
    event: { type: string; data: Record<string, unknown> },
    assistantId: string
  ) => {
    switch (event.type) {
      case 'token':
        // Append token to assistant message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + (event.data.content as string) }
              : m
          )
        );
        break;

      case 'tool_call':
        // Add tool call to debug panel
        const toolCallId = `tool-${Date.now()}`;
        setToolCalls((prev) => [
          ...prev,
          {
            id: toolCallId,
            toolName: event.data.name as string,
            toolDisplayName: event.data.description as string,
            input: event.data.input,
            success: true,
            timestamp: new Date().toISOString(),
          },
        ]);
        break;

      case 'tool_result':
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

      case 'payment_option':
        // Handle payment option - show payment button in message
        const paymentOption: PaymentButton = event.data as PaymentButton;
        setMessages((prev) => [
          ...prev,
          {
            id: `payment-option-${Date.now()}`,
            role: 'assistant',
            content: `To use ${paymentOption.toolDisplayName}, you need to pay ${paymentOption.displayFee}. Click the button below to proceed.`,
            timestamp: new Date().toISOString(),
            paymentButton: paymentOption,
          },
        ]);
        break;

      case 'error':
        setError(event.data.message as string);
        break;

      case 'done':
        // Stream complete
        break;
    }
  };

  // Handle payment button click - make real x402 payment
  const handlePaymentButtonClick = useCallback(
    async (paymentBtn: PaymentButton) => {
      try {
        setError(null);
        const url = buildProxyUrl(paymentBtn.serverSlug, paymentBtn.apiSlug);
        const fee = BigInt(paymentBtn.fee);

        // Show processing message
        setMessages((prev) => [
          ...prev,
          {
            id: `payment-processing-${Date.now()}`,
            role: 'assistant',
            content: `Processing payment of ${paymentBtn.displayFee}...`,
            timestamp: new Date().toISOString(),
          },
        ]);

        // Make the API call with x402 payment
        const result = await callAPIWithPayment(url, fee, paymentBtn.tokenAddress);

        // Add success message with result
        const resultMessage = `Payment successful! I paid ${paymentBtn.displayFee} for ${paymentBtn.toolDisplayName}. Here's the result: ${JSON.stringify(result, null, 2)}`;

        setMessages((prev) => [
          ...prev,
          {
            id: `user-payment-result-${Date.now()}`,
            role: 'user',
            content: resultMessage,
            timestamp: new Date().toISOString(),
          },
        ]);

        // Continue the conversation with the tool result
        // Build current conversation history including the payment result
        const currentHistory = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        currentHistory.push({ role: 'user', content: resultMessage });

        // Send to playground API to continue conversation
        setIsStreaming(true);
        const assistantId = `assistant-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString(),
          },
        ]);

        const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
        const response = await fetch(`${apiBaseUrl}/api/chat/playground`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: resultMessage,
            model: selectedModel,
            tools: selectedTools,
            conversationHistory: currentHistory,
            userAddress: account?.address || 'anonymous',
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to continue conversation');
        }

        // Handle SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('No response stream');
        }

        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                handleStreamEvent(data, assistantId);
              } catch (e) {
                console.error('Failed to parse SSE event:', e);
              }
            }
          }
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Payment failed';
        setError(errorMessage);
      } finally {
        setIsStreaming(false);
      }
    },
    [messages, selectedModel, selectedTools, account, callAPIWithPayment]
  );

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="playground">
      {/* Sidebar */}
      <ChatSidebar
        mode="playground"
        onNewChat={handleNewChat}
        debugOpen={debugOpen}
        onDebugToggle={() => setDebugOpen(!debugOpen)}
        toolCalls={toolCalls}
      />

      {/* Main Chat Area */}
      <div className="playground__main">
        {/* Agent Identity (shown when no messages) */}
        {messages.length === 0 && (
          <div className="playground__identity">
            <div className="playground__identity-icon">🧪</div>
            <h2 className="playground__identity-name">Playground</h2>
            <p className="playground__identity-desc">
              Experiment with different models and tools without creating an agent.
              Your conversation won't be saved.
            </p>
            {selectedTools.length === 0 && (
              <div className="playground__identity-hint">
                <p style={{ marginTop: '20px', color: '#f59e0b', fontSize: '14px' }}>
                  ⚠️ Add at least one tool to start chatting
                </p>
                <button
                  className="playground__add-tool-btn"
                  onClick={() => setIsToolPickerOpen(true)}
                  style={{
                    marginTop: '12px',
                    padding: '10px 20px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    borderRadius: '8px',
                    color: '#c7d2fe',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  + Add Tool
                </button>
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="playground__messages">
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
              isStreaming={isStreaming && msg.role === 'assistant' && msg === messages[messages.length - 1]}
              toolCall={msg.toolCall}
              paymentButton={
                msg.paymentButton
                  ? {
                      label: `Pay ${msg.paymentButton.displayFee} for ${msg.paymentButton.toolDisplayName}`,
                      onClick: () => handlePaymentButtonClick(msg.paymentButton!),
                      disabled: isStreaming || isProcessing,
                    }
                  : undefined
              }
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Error display */}
        {error && (
          <div className="playground__error">
            <span className="playground__error-icon">!</span>
            <span>{error}</span>
            <button onClick={() => setError(null)} type="button">x</button>
          </div>
        )}

        {/* Input Area */}
        <div className="playground__input-area">
          {/* Tool Pills */}
          <div className="playground__tools">
            <ToolPills
              tools={getToolInfoList()}
              onRemove={handleToolRemove}
              onAddClick={() => setIsToolPickerOpen(true)}
              disabled={isStreaming}
            />
          </div>

          {/* Input Bar */}
          <div className="playground__input-bar">
            <textarea
              className="playground__input"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
              disabled={isStreaming}
              rows={1}
            />
            <div className="playground__input-actions">
              <ModelSelector
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                disabled={isStreaming}
              />
              <button
                className="playground__send-btn"
                onClick={handleSendMessage}
                disabled={isStreaming || !messageInput.trim()}
                type="button"
              >
                {isStreaming ? 'Sending...' : 'Send'}
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
};

export default NewChatPlayground;
