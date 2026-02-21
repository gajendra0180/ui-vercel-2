import React, { useState, useMemo, useEffect } from 'react';
import { ServerEntry, ApiEntry } from '../utils/api';
import './ToolPickerModal.css';

interface ToolPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  servers: ServerEntry[];
  selectedTools: string[];  // ["serverSlug/apiSlug", ...]
  onToolAdd: (toolId: string) => void;
  onToolRemove?: (toolId: string) => void;
}

export const ToolPickerModal: React.FC<ToolPickerModalProps> = ({
  isOpen,
  onClose,
  servers,
  selectedTools,
  onToolAdd,
  onToolRemove,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

  // Reset search when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      // Expand all servers by default
      setExpandedServers(new Set(servers.map(s => s.slug)));
    }
  }, [isOpen, servers]);

  // Filter tools based on search query
  const filteredServers = useMemo(() => {
    if (!searchQuery.trim()) {
      return servers;
    }

    const query = searchQuery.toLowerCase();
    return servers
      .map((server) => {
        const matchingApis = server.apis?.filter(
          (api) =>
            api.name.toLowerCase().includes(query) ||
            api.description.toLowerCase().includes(query) ||
            server.name.toLowerCase().includes(query)
        );

        if (matchingApis && matchingApis.length > 0) {
          return { ...server, apis: matchingApis } as ServerEntry;
        }
        return null;
      })
      .filter((s): s is ServerEntry => s !== null);
  }, [servers, searchQuery]);

  const toggleServer = (serverSlug: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(serverSlug)) {
        next.delete(serverSlug);
      } else {
        next.add(serverSlug);
      }
      return next;
    });
  };

  const formatFee = (fee: string): string => {
    // Assuming fee is in smallest unit (e.g., 10000 = $0.01 for 6 decimal USDC)
    const feeNum = parseFloat(fee) / 1_000_000;
    if (feeNum < 0.01) {
      return `$${feeNum.toFixed(4)}`;
    }
    return `$${feeNum.toFixed(2)}`;
  };

  const handleToolClick = (serverSlug: string, api: ApiEntry) => {
    const toolId = `${serverSlug}/${api.slug}`;
    const isSelected = selectedTools.includes(toolId);

    if (isSelected && onToolRemove) {
      onToolRemove(toolId);
    } else if (!isSelected) {
      onToolAdd(toolId);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="tool-picker-modal__overlay" onClick={onClose}>
      <div className="tool-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tool-picker-modal__header">
          <h3 className="tool-picker-modal__title">Add Tools</h3>
          <button className="tool-picker-modal__close" onClick={onClose} type="button">
            x
          </button>
        </div>

        <div className="tool-picker-modal__search">
          <input
            type="text"
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="tool-picker-modal__search-input"
            autoFocus
          />
        </div>

        <div className="tool-picker-modal__content">
          {filteredServers.length === 0 ? (
            <div className="tool-picker-modal__empty">
              {searchQuery ? 'No tools match your search' : 'No tools available'}
            </div>
          ) : (
            filteredServers.map((server) => (
              <div key={server.slug} className="tool-picker-modal__server">
                <button
                  className="tool-picker-modal__server-header"
                  onClick={() => toggleServer(server.slug)}
                  type="button"
                >
                  <span className="tool-picker-modal__server-arrow">
                    {expandedServers.has(server.slug) ? '\u25BC' : '\u25B6'}
                  </span>
                  <span className="tool-picker-modal__server-name">{server.name}</span>
                  <span className="tool-picker-modal__server-count">
                    {server.apis?.length || 0} tools
                  </span>
                </button>

                {expandedServers.has(server.slug) && server.apis && (
                  <div className="tool-picker-modal__tools">
                    {server.apis.map((api) => {
                      const toolId = `${server.slug}/${api.slug}`;
                      const isSelected = selectedTools.includes(toolId);

                      return (
                        <button
                          key={api.slug}
                          className={`tool-picker-modal__tool ${
                            isSelected ? 'tool-picker-modal__tool--selected' : ''
                          }`}
                          onClick={() => handleToolClick(server.slug, api)}
                          type="button"
                        >
                          <div className="tool-picker-modal__tool-main">
                            <span className="tool-picker-modal__tool-name">{api.name}</span>
                            <span className="tool-picker-modal__tool-desc">{api.description}</span>
                          </div>
                          <div className="tool-picker-modal__tool-meta">
                            <span className="tool-picker-modal__tool-fee">{formatFee(api.fee)}</span>
                            {isSelected && (
                              <span className="tool-picker-modal__tool-check">check</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="tool-picker-modal__footer">
          <span className="tool-picker-modal__selected-count">
            {selectedTools.length} tool{selectedTools.length !== 1 ? 's' : ''} selected
          </span>
          <button className="tool-picker-modal__done-btn" onClick={onClose} type="button">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default ToolPickerModal;
