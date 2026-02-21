import React from 'react';
import './ToolPills.css';

export interface ToolInfo {
  id: string;          // "serverSlug/apiSlug"
  name: string;        // API name
  serverName: string;  // Server name
  fee?: string;        // Fee display (e.g., "0.01 USDC")
}

interface ToolPillsProps {
  tools: ToolInfo[];
  onRemove: (toolId: string) => void;
  onAddClick: () => void;
  disabled?: boolean;
  maxVisible?: number;
}

export const ToolPills: React.FC<ToolPillsProps> = ({
  tools,
  onRemove,
  onAddClick,
  disabled = false,
  maxVisible,
}) => {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const visibleTools = maxVisible ? tools.slice(0, maxVisible) : tools;
  const hiddenCount = maxVisible ? Math.max(0, tools.length - maxVisible) : 0;

  return (
    <div className={`tool-pills ${disabled ? 'tool-pills--disabled' : ''}`}>
      <div className="tool-pills__scroll-container" ref={scrollContainerRef}>
        {visibleTools.map((tool) => (
          <div key={tool.id} className="tool-pill" title={`${tool.serverName} / ${tool.name}`}>
            <span className="tool-pill__name">{tool.name}</span>
            {tool.fee && <span className="tool-pill__fee">{tool.fee}</span>}
            {!disabled && (
              <button
                className="tool-pill__remove"
                onClick={() => onRemove(tool.id)}
                type="button"
                aria-label={`Remove ${tool.name}`}
              >
                x
              </button>
            )}
          </div>
        ))}

        {hiddenCount > 0 && (
          <div className="tool-pill tool-pill--more">
            +{hiddenCount} more
          </div>
        )}

        {!disabled && (
          <button
            className="tool-pills__add-btn"
            onClick={onAddClick}
            type="button"
          >
            + Add Tool
          </button>
        )}
      </div>
    </div>
  );
};

export default ToolPills;
