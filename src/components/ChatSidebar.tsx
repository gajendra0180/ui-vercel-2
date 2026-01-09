import React from 'react';
import { Agent } from '../utils/api';
import DebugPanel, { ToolCallEntry } from './DebugPanel';
import './ChatSidebar.css';

interface ChatHistoryItem {
  id: string;
  title: string;
  timestamp: string;
  isActive: boolean;
}

interface ChatSidebarProps {
  // Agent/Playground mode
  mode: 'agent' | 'playground';

  // Agent selector
  agents?: Agent[];
  selectedAgent?: Agent | null;
  onAgentChange?: (agent: Agent | null) => void;

  // New chat
  onNewChat: () => void;

  // Chat history (for agent mode)
  chatHistory?: ChatHistoryItem[];
  onChatSelect?: (chatId: string) => void;

  // Debug panel
  debugOpen: boolean;
  onDebugToggle: () => void;
  toolCalls: ToolCallEntry[];
  totalLatencyMs?: number;
  tokenCount?: number;
  estimatedCost?: string;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  mode,
  agents = [],
  selectedAgent,
  onAgentChange,
  onNewChat,
  chatHistory = [],
  onChatSelect,
  debugOpen,
  onDebugToggle,
  toolCalls,
  totalLatencyMs,
  tokenCount,
  estimatedCost,
}) => {
  const [agentDropdownOpen, setAgentDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setAgentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="chat-sidebar">
      {/* Agent/Playground Selector */}
      <div className="chat-sidebar__selector" ref={dropdownRef}>
        <button
          className="chat-sidebar__selector-btn"
          onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
          type="button"
        >
          <span className="chat-sidebar__selector-icon">
            {mode === 'playground' ? '🧪' : '🤖'}
          </span>
          <span className="chat-sidebar__selector-name">
            {mode === 'playground'
              ? 'Playground'
              : selectedAgent?.name || 'Select Agent'}
          </span>
          <span className="chat-sidebar__selector-arrow">
            {agentDropdownOpen ? '▲' : '▼'}
          </span>
        </button>

        {agentDropdownOpen && mode === 'agent' && onAgentChange && (
          <div className="chat-sidebar__dropdown">
            {agents.map((agent) => (
              <button
                key={agent.id}
                className={`chat-sidebar__dropdown-item ${
                  selectedAgent?.id === agent.id ? 'chat-sidebar__dropdown-item--active' : ''
                }`}
                onClick={() => {
                  onAgentChange(agent);
                  setAgentDropdownOpen(false);
                }}
                type="button"
              >
                <span className="chat-sidebar__dropdown-icon">🤖</span>
                <span className="chat-sidebar__dropdown-name">{agent.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* New Chat Button */}
      <button className="chat-sidebar__new-chat" onClick={onNewChat} type="button">
        <span className="chat-sidebar__new-chat-icon">+</span>
        <span>New Chat</span>
      </button>

      {/* Chat History (agent mode only) */}
      {mode === 'agent' && chatHistory.length > 0 && (
        <div className="chat-sidebar__history">
          <div className="chat-sidebar__history-label">Chats</div>
          <div className="chat-sidebar__history-list">
            {chatHistory.map((chat) => (
              <button
                key={chat.id}
                className={`chat-sidebar__history-item ${
                  chat.isActive ? 'chat-sidebar__history-item--active' : ''
                }`}
                onClick={() => onChatSelect?.(chat.id)}
                type="button"
              >
                <span className="chat-sidebar__history-title">{chat.title}</span>
                <span className="chat-sidebar__history-time">
                  {formatTimeAgo(chat.timestamp)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Spacer */}
      <div className="chat-sidebar__spacer" />

      {/* Debug Panel - only show in playground mode */}
      {mode === 'playground' && (
        <DebugPanel
          isOpen={debugOpen}
          onToggle={onDebugToggle}
          toolCalls={toolCalls}
          totalLatencyMs={totalLatencyMs}
          tokenCount={tokenCount}
          estimatedCost={estimatedCost}
        />
      )}
    </div>
  );
};

// Helper to format time ago
function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default ChatSidebar;
