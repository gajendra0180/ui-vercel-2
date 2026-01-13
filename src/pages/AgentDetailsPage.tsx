import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAgent, AgentWithStats, getAllServers, ServerEntry } from "../utils/api";
import { useChainContext } from "../contexts/ChainContext";
import { Spinner } from "../components/Spinner";
import { Breadcrumb } from "../components/Breadcrumb";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import "./AgentDetailsPage.css";

export function AgentDetailsPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { copy, copied } = useCopyToClipboard();
  const { selectedChainId, setSelectedChain } = useChainContext();

  const [agent, setAgent] = useState<AgentWithStats | null>(null);
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chainMismatch, setChainMismatch] = useState(false);

  useEffect(() => {
    if (agentId) {
      loadAgentDetails();
    }
  }, [agentId]);

  // Check if agent belongs to currently selected chain
  useEffect(() => {
    if (!agent || !servers.length) return;

    const agentBelongsToCurrentChain = () => {
      if (!selectedChainId || !agent.availableTools || agent.availableTools.length === 0) {
        return false;
      }

      // Check if all agent's tools belong to servers on the selected chain
      return agent.availableTools.every((toolId) => {
        const [serverSlug] = toolId.split('/');
        const server = servers.find(s => s.slug === serverSlug);
        return server && server.chainId === selectedChainId;
      });
    };

    const belongsToChain = agentBelongsToCurrentChain();
    setChainMismatch(!belongsToChain);
  }, [selectedChainId, agent, servers]);

  const loadAgentDetails = async () => {
    if (!agentId) return;
    try {
      setLoading(true);
      const [agentData, serversData] = await Promise.all([
        getAgent(agentId),
        getAllServers()
      ]);

      if (!agentData) {
        setError("Agent not found");
      } else {
        setAgent(agentData);
        setServers(serversData);

        // Auto-switch chain if agent belongs to a different chain
        if (agentData.availableTools && agentData.availableTools.length > 0) {
          // Determine agent's chain by checking first tool
          const [serverSlug] = agentData.availableTools[0].split('/');
          const server = serversData.find(s => s.slug === serverSlug);

          if (server && server.chainId && server.chainId !== selectedChainId) {
            console.log(`Auto-switching chain from ${selectedChainId} to ${server.chainId} for agent ${agentData.name}`);
            setSelectedChain(server.chainId);
          }
        }
      }
    } catch (err: unknown) {
      setError(err.message || "Failed to load agent details");
      console.error("Failed to load agent:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartChat = () => {
    if (agent) {
      navigate(`/chat?agentId=${agent.id}`);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const truncateAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(38)}`;
  };

  if (loading) {
    return (
      <div className="agent-details-page">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '500px' }}>
          <Spinner size="large" label="Loading agent details..." />
        </div>
      </div>
    );
  }

  if (error && !agent) {
    return (
      <div className="agent-details-page">
        <div className="error-state">
          <p>{error}</p>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/agent-marketplace")}
          >
            Back to Agent Marketplace
          </button>
        </div>
      </div>
    );
  }

  if (!agent) {
    return null;
  }

  const usageScore = agent.usageScore || 0;
  const isTrending = usageScore > 0;

  return (
    <div className="agent-details-page">
      <button className="back-button" onClick={() => navigate("/agent-marketplace")}>
        ← Back to Marketplace
      </button>

      <Breadcrumb
        items={[
          { label: 'Agent Marketplace', path: '/agent-marketplace' },
          { label: agent.name }
        ]}
      />

      <div className="agent-header">
        <div className="agent-title-section">
          <h1>🤖 {agent.name}</h1>
          <span className="llm-provider-badge">
            {agent.llmProvider.toUpperCase()}
          </span>
          {isTrending && <span className="trending-badge">⭐ Trending</span>}
        </div>
      </div>

      <div className="agent-info-section">
        {/* Description */}
        <div className="info-card">
          <h3>📝 About</h3>
          <p className="agent-description">{agent.description}</p>
        </div>

        {/* Agent Information */}
        <div className="info-card">
          <h3>ℹ️ Agent Information</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Agent ID:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <code className="info-value">{agent.id}</code>
                <button
                  className="btn btn-secondary"
                  onClick={() => copy(agent.id)}
                  style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                >
                  {copied ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="info-item">
              <span className="info-label">Creator:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <code className="info-value address-value">
                  {truncateAddress(agent.creator)}
                </code>
                <button
                  className="btn btn-secondary"
                  onClick={() => copy(agent.creator)}
                  style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                >
                  {copied ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="info-item">
              <span className="info-label">LLM Provider:</span>
              <span className="info-value">{agent.llmProvider}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Status:</span>
              <span className="info-value">
                {agent.isPublic ? "🔓 Public" : "🔒 Private"}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Created:</span>
              <span className="info-value">{formatDate(agent.createdAt)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Updated:</span>
              <span className="info-value">{formatDate(agent.updatedAt)}</span>
            </div>
          </div>
        </div>

        {/* Usage Statistics */}
        <div className="info-card metrics-card">
          <h3>📊 Usage Statistics</h3>
          <div className="metrics-grid">
            <div className="metric-item">
              <span className="metric-label">💬 Total Messages</span>
              <span className="metric-value">{agent.messageCount}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">👥 Unique Users</span>
              <span className="metric-value">{agent.userCount}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">🔧 Tool Calls</span>
              <span className="metric-value">{agent.toolCallCount}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">⭐ Trending Score</span>
              <span className="metric-value">
                {usageScore > 0 ? usageScore.toFixed(1) : "0"}
              </span>
            </div>
          </div>
        </div>

        {/* Available Tools */}
        {agent.availableTools && agent.availableTools.length > 0 && (
          <div className="info-card">
            <h3>
              🔌 Available APIs ({agent.availableTools.length})
            </h3>
            <div className="tools-list">
              {agent.availableTools.map((tool, idx) => {
                const [server, api] = tool.split("/");
                return (
                  <div key={idx} className="tool-item">
                    <div className="tool-header">
                      <span className="tool-name">/{server}/{api}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Starter Prompts */}
        {agent.starterPrompts && agent.starterPrompts.length > 0 && (
          <div className="info-card">
            <h3>💡 Try These Prompts</h3>
            <div className="prompts-list">
              {agent.starterPrompts.map((prompt, idx) => (
                <div key={idx} className="prompt-item">
                  <span className="prompt-icon">→</span>
                  <span className="prompt-text">"{prompt}"</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chain Mismatch Warning */}
      {chainMismatch && (
        <div className="info-card" style={{ backgroundColor: '#fff3cd', borderColor: '#ffc107' }}>
          <h3>⚠️ Wrong Chain Selected</h3>
          <p style={{ marginBottom: '1rem' }}>
            This agent's APIs are not available on the currently selected blockchain.
            Please switch to the correct chain to interact with this agent.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="agent-actions">
        <button
          className="btn btn-primary btn-large"
          onClick={handleStartChat}
          disabled={chainMismatch}
          style={chainMismatch ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
        >
          💬 Start Chat
        </button>
      </div>
    </div>
  );
}
