import React, { useState } from 'react';
import './DebugPanel.css';

export interface ToolCallEntry {
  id: string;
  toolName: string;
  toolDisplayName?: string;
  input?: unknown;
  output?: unknown;
  success: boolean;
  error?: string;
  latencyMs?: number;
  timestamp: string;
}

interface DebugPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  toolCalls: ToolCallEntry[];
  totalLatencyMs?: number;
  tokenCount?: number;
  estimatedCost?: string;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  isOpen,
  onToggle,
  toolCalls,
  totalLatencyMs,
  tokenCount,
  estimatedCost,
}) => {
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set());
  const [showRaw, setShowRaw] = useState(false);

  const toggleCallExpansion = (callId: string) => {
    setExpandedCalls((prev) => {
      const next = new Set(prev);
      if (next.has(callId)) {
        next.delete(callId);
      } else {
        next.add(callId);
      }
      return next;
    });
  };

  const formatJson = (data: unknown): string => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  return (
    <div className={`debug-panel ${isOpen ? 'debug-panel--open' : ''}`}>
      <button className="debug-panel__toggle" onClick={onToggle} type="button">
        <span className="debug-panel__toggle-icon">{isOpen ? '\u25BC' : '\u25B6'}</span>
        <span className="debug-panel__toggle-label">Debug</span>
        {toolCalls.length > 0 && (
          <span className="debug-panel__toggle-count">{toolCalls.length}</span>
        )}
      </button>

      {isOpen && (
        <div className="debug-panel__content">
          {/* Stats summary */}
          <div className="debug-panel__stats">
            {totalLatencyMs !== undefined && (
              <div className="debug-panel__stat">
                <span className="debug-panel__stat-label">Latency</span>
                <span className="debug-panel__stat-value">{totalLatencyMs}ms</span>
              </div>
            )}
            {tokenCount !== undefined && (
              <div className="debug-panel__stat">
                <span className="debug-panel__stat-label">Tokens</span>
                <span className="debug-panel__stat-value">{tokenCount.toLocaleString()}</span>
              </div>
            )}
            {estimatedCost && (
              <div className="debug-panel__stat">
                <span className="debug-panel__stat-label">Est. Cost</span>
                <span className="debug-panel__stat-value">{estimatedCost}</span>
              </div>
            )}
          </div>

          {/* Raw toggle */}
          <div className="debug-panel__options">
            <label className="debug-panel__option">
              <input
                type="checkbox"
                checked={showRaw}
                onChange={(e) => setShowRaw(e.target.checked)}
              />
              <span>Show raw data</span>
            </label>
          </div>

          {/* Tool calls list */}
          <div className="debug-panel__calls">
            {toolCalls.length === 0 ? (
              <div className="debug-panel__empty">No tool calls yet</div>
            ) : (
              toolCalls.map((call) => (
                <div
                  key={call.id}
                  className={`debug-panel__call ${
                    call.success ? 'debug-panel__call--success' : 'debug-panel__call--error'
                  }`}
                >
                  <button
                    className="debug-panel__call-header"
                    onClick={() => toggleCallExpansion(call.id)}
                    type="button"
                  >
                    <span className="debug-panel__call-status">
                      {call.success ? 'OK' : 'ERR'}
                    </span>
                    <span className="debug-panel__call-name">
                      {call.toolDisplayName || call.toolName}
                    </span>
                    {call.latencyMs !== undefined && (
                      <span className="debug-panel__call-latency">{call.latencyMs}ms</span>
                    )}
                    <span className="debug-panel__call-arrow">
                      {expandedCalls.has(call.id) ? '\u25BC' : '\u25B6'}
                    </span>
                  </button>

                  {expandedCalls.has(call.id) && (
                    <div className="debug-panel__call-details">
                      {call.input !== undefined && (
                        <div className="debug-panel__call-section">
                          <div className="debug-panel__call-section-label">Input</div>
                          <pre className="debug-panel__call-code">
                            {showRaw ? formatJson(call.input) : summarizeData(call.input)}
                          </pre>
                        </div>
                      )}
                      {call.output !== undefined && (
                        <div className="debug-panel__call-section">
                          <div className="debug-panel__call-section-label">Output</div>
                          <pre className="debug-panel__call-code">
                            {showRaw ? formatJson(call.output) : summarizeData(call.output)}
                          </pre>
                        </div>
                      )}
                      {call.error && (
                        <div className="debug-panel__call-section debug-panel__call-section--error">
                          <div className="debug-panel__call-section-label">Error</div>
                          <pre className="debug-panel__call-code">{call.error}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper to summarize large data objects
function summarizeData(data: unknown, maxLength: number = 200): string {
  const str = JSON.stringify(data, null, 2);
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength) + '\n... (truncated)';
}

export default DebugPanel;
