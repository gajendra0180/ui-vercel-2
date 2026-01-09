import React, { useState, useCallback } from 'react';
import './ChatMessage.css';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  isStreaming?: boolean;
  paymentButton?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  toolCall?: {
    name: string;
    loading?: boolean;
  };
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  role,
  content,
  timestamp,
  isStreaming,
  paymentButton,
  toolCall,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = useCallback(async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  // Parse markdown content
  const renderContent = useCallback(() => {
    if (!content) return null;

    // Split by code blocks first
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let codeBlockIndex = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        const textPart = content.slice(lastIndex, match.index);
        parts.push(
          <span key={`text-${lastIndex}`}>{renderInlineMarkdown(textPart)}</span>
        );
      }

      // Add code block
      const language = match[1] || 'text';
      const code = match[2].trim();
      const currentIndex = codeBlockIndex++;

      parts.push(
        <div key={`code-${match.index}`} className="chat-message__code-block">
          <div className="chat-message__code-header">
            <span className="chat-message__code-lang">{language}</span>
            <button
              className="chat-message__code-copy"
              onClick={() => copyToClipboard(code, currentIndex)}
              type="button"
            >
              {copiedIndex === currentIndex ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="chat-message__code-content">
            <code>{code}</code>
          </pre>
        </div>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {renderInlineMarkdown(content.slice(lastIndex))}
        </span>
      );
    }

    return parts.length > 0 ? parts : renderInlineMarkdown(content);
  }, [content, copiedIndex, copyToClipboard]);

  return (
    <div className={`chat-message chat-message--${role}`}>
      <div className="chat-message__avatar">
        {role === 'user' ? '\uD83D\uDC64' : '\uD83E\uDD16'}
      </div>
      <div className="chat-message__body">
        {toolCall && (
          <div className="chat-message__tool-call">
            {toolCall.loading && <span className="chat-message__tool-spinner" />}
            <span className="chat-message__tool-name">
              Calling {toolCall.name}...
            </span>
          </div>
        )}
        <div className="chat-message__content">
          {renderContent()}
          {isStreaming && <span className="chat-message__cursor" />}
        </div>
        {paymentButton && (
          <button
            className="chat-message__payment-btn"
            onClick={paymentButton.onClick}
            disabled={paymentButton.disabled}
            type="button"
          >
            {paymentButton.label}
          </button>
        )}
        {timestamp && (
          <time className="chat-message__time">
            {new Date(timestamp).toLocaleTimeString()}
          </time>
        )}
      </div>
    </div>
  );
};

// Helper function for inline markdown
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];

  // Simple line-by-line processing
  const lines = text.split('\n');

  lines.forEach((line, lineIndex) => {
    let processedLine: React.ReactNode = line;

    // Check for list items
    if (line.match(/^\s*[-*]\s/)) {
      const listContent = line.replace(/^\s*[-*]\s/, '');
      processedLine = (
        <div key={`list-${lineIndex}`} className="chat-message__list-item">
          <span className="chat-message__list-bullet">&#8226;</span>
          {processInline(listContent)}
        </div>
      );
    } else if (line.match(/^\s*\d+\.\s/)) {
      const match = line.match(/^\s*(\d+)\.\s(.*)$/);
      if (match) {
        processedLine = (
          <div key={`list-${lineIndex}`} className="chat-message__list-item">
            <span className="chat-message__list-number">{match[1]}.</span>
            {processInline(match[2])}
          </div>
        );
      }
    } else {
      processedLine = processInline(line);
    }

    result.push(processedLine);
    if (lineIndex < lines.length - 1) {
      result.push(<br key={`br-${lineIndex}`} />);
    }
  });

  return result;
}

// Process inline formatting (bold, italic, code)
function processInline(text: string): React.ReactNode {
  // Simple regex-based processing for inline code, bold, italic
  const parts: React.ReactNode[] = [];
  let keyIndex = 0;

  // Process inline code first
  const codeRegex = /`([^`]+)`/g;
  let match;
  let lastIndex = 0;

  while ((match = codeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(processBoldItalic(text.slice(lastIndex, match.index), keyIndex++));
    }
    parts.push(
      <code key={`code-${keyIndex++}`} className="chat-message__inline-code">
        {match[1]}
      </code>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(processBoldItalic(text.slice(lastIndex), keyIndex++));
  }

  return parts.length > 0 ? parts : text;
}

// Process bold and italic
function processBoldItalic(text: string, baseKey: number): React.ReactNode {
  // Bold: **text**
  const boldRegex = /\*\*([^*]+)\*\*/g;
  const parts: React.ReactNode[] = [];
  let match;
  let lastIndex = 0;
  let keyIndex = 0;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={`bold-${baseKey}-${keyIndex++}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export default ChatMessage;
