import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAgent, AgentWithStats } from "../utils/api";
import { Spinner } from "../components/Spinner";
import "./AgentDetailsPage.css";

export function AgentDetailsPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  const [agent, setAgent] = useState<AgentWithStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (agentId) {
      loadAgentDetails();
    }
  }, [agentId]);

  const loadAgentDetails = async () => {
    if (!agentId) return;
    try {
      setLoading(true);
      const agentData = await getAgent(agentId);
      if (!agentData) {
        setError("Agent not found");
      } else {
        setAgent(agentData);
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
              <span className="info-label">Creator:</span>
              <code className="info-value address-value">
                {truncateAddress(agent.creator)}
              </code>
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

      {/* Action Buttons */}
      <div className="agent-actions">
        <button className="btn btn-primary btn-large" onClick={handleStartChat}>
          💬 Start Chat
        </button>
      </div>
    </div>
  );
}
