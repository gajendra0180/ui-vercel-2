import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveAccount } from "thirdweb/react";
import {
  getPublicAgents,
  getTrendingAgents,
  searchAgents,
  filterAgentsByProvider,
  sortAgents,
  AgentWithStats,
  AgentSortBy,
} from "../utils/api";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";
import "./AgentMarketplace.css";

export function AgentMarketplace() {
  const navigate = useNavigate();
  const account = useActiveAccount();

  // Data state
  const [allAgents, setAllAgents] = useState<AgentWithStats[]>([]);
  const [trendingAgents, setTrendingAgents] = useState<AgentWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter/search state
  const [searchQuery, setSearchQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<AgentSortBy>("trending");

  // UI state
  const [showTrendingOnly, setShowTrendingOnly] = useState(true);

  // Load agents
  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const [trending, allPublic] = await Promise.all([
        getTrendingAgents(10),
        getPublicAgents(),
      ]);
      setTrendingAgents(trending);
      setAllAgents(allPublic);
    } catch (error) {
      console.error("Failed to load agents:", error);
    } finally {
      setLoading(false);
    }
  };

  // Compute filtered agents
  const filteredAgents = useMemo(() => {
    const source = showTrendingOnly ? trendingAgents : allAgents;

    let results = [...source];

    // Apply search
    results = searchAgents(results, searchQuery);

    // Apply provider filter
    results = filterAgentsByProvider(results, providerFilter);

    // Apply sorting
    results = sortAgents(results, sortBy);

    return results;
  }, [
    allAgents,
    trendingAgents,
    showTrendingOnly,
    searchQuery,
    providerFilter,
    sortBy,
  ]);

  const handleChatClick = (agentId: string) => {
    navigate(`/chat?agentId=${agentId}`);
  };

  const handleCreateClick = () => {
    navigate("/agents");
  };

  return (
    <div className="agent-marketplace">
      {/* Header */}
      <div className="marketplace-header">
        <div className="header-content">
          <h1>🤖 Agent Marketplace</h1>
          <p>Discover and chat with AI agents powered by decentralized APIs</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreateClick}>
          ➕ Create Your Agent
        </button>
      </div>

      {/* Search and Filters */}
      <div className="marketplace-controls">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search agents by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <span className="search-icon">🔍</span>
        </div>

        <div className="filters-row">
          <div className="filter-group">
            <label>Provider:</label>
            <select
              value={providerFilter || ""}
              onChange={(e) => setProviderFilter(e.target.value || null)}
              className="filter-select"
            >
              <option value="">All Providers</option>
              <option value="claude">Claude</option>
              <option value="gpt">GPT</option>
              <option value="gemini">Gemini</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Sort By:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as AgentSortBy)}
              className="filter-select"
            >
              <option value="trending">Trending</option>
              <option value="newest">Newest</option>
              <option value="messages">Most Messages</option>
              <option value="users">Most Users</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showTrendingOnly}
                onChange={(e) => setShowTrendingOnly(e.target.checked)}
              />
              <span>Trending Only</span>
            </label>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="marketplace-stats">
        <div className="stat-item">
          <span className="stat-label">Total Agents</span>
          <span className="stat-value">{allAgents.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Showing</span>
          <span className="stat-value">{filteredAgents.length}</span>
        </div>
      </div>

      {/* Agents Grid */}
      <div className="agents-container">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
            <Spinner size="large" label="Loading agents..." />
          </div>
        ) : filteredAgents.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="No Agents Found"
            description="No agents match your current search and filters. Try adjusting your criteria or create your own agent to share with the community!"
            actionButton={{
              label: "🔄 Clear Filters",
              variant: "secondary",
              onClick: () => {
                setSearchQuery("");
                setProviderFilter(null);
                setShowTrendingOnly(false);
              }
            }}
          />
        ) : (
          <div className="agents-grid">
            {filteredAgents.map((agent) => (
              <div key={agent.id} className="agent-market-card">
                {/* Card Header */}
                <div className="card-header">
                  <div className="title-section">
                    <h3>{agent.name}</h3>
                    <span className="provider-badge">
                      {agent.llmProvider.toUpperCase()}
                    </span>
                  </div>
                  {agent.usageScore > 0 && (
                    <div className="trending-badge">⭐ Trending</div>
                  )}
                </div>

                {/* Description */}
                <p className="agent-description">{agent.description}</p>

                {/* Creator Info */}
                <div className="creator-info">
                  <span className="creator-label">By</span>
                  <code className="creator-address">
                    {agent.creator.substring(0, 6)}...{agent.creator.substring(38)}
                  </code>
                </div>

                {/* Stats Grid */}
                <div className="stats-grid">
                  <div className="stat">
                    <span className="icon">💬</span>
                    <div className="stat-content">
                      <span className="stat-value">{agent.messageCount}</span>
                      <span className="stat-label">Messages</span>
                    </div>
                  </div>
                  <div className="stat">
                    <span className="icon">👥</span>
                    <div className="stat-content">
                      <span className="stat-value">{agent.userCount}</span>
                      <span className="stat-label">Users</span>
                    </div>
                  </div>
                  <div className="stat">
                    <span className="icon">🔧</span>
                    <div className="stat-content">
                      <span className="stat-value">{agent.toolCallCount}</span>
                      <span className="stat-label">Tool Calls</span>
                    </div>
                  </div>
                </div>

                {/* Tools */}
                {agent.availableTools && agent.availableTools.length > 0 && (
                  <div className="tools-section">
                    <h4>Tools ({agent.availableTools.length})</h4>
                    <div className="tools-list">
                      {agent.availableTools.slice(0, 3).map((tool) => (
                        <span key={tool} className="tool-tag">
                          {tool.split("/")[0]}
                        </span>
                      ))}
                      {agent.availableTools.length > 3 && (
                        <span className="tool-tag more">
                          +{agent.availableTools.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Starter Prompts */}
                {agent.starterPrompts && agent.starterPrompts.length > 0 && (
                  <div className="prompts-section">
                    <h4>Try This</h4>
                    <div className="prompt-list">
                      {agent.starterPrompts.slice(0, 2).map((prompt, idx) => (
                        <div key={idx} className="prompt-item">
                          "{prompt}"
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="card-actions">
                  <button
                    className="btn btn-primary btn-full"
                    onClick={() => handleChatClick(agent.id)}
                  >
                    💬 Chat Now
                  </button>
                  <button
                    className="btn btn-secondary btn-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/agent/${agent.id}`);
                    }}
                  >
                    ℹ️ Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Section */}
      {filteredAgents.length === 0 && !loading && (
        <div className="info-section">
          <h3>💡 Tips for Finding Great Agents</h3>
          <ul>
            <li>Check trending agents for popular choices</li>
            <li>Filter by LLM provider (Claude, GPT, Gemini)</li>
            <li>Look at message count and user count for popularity</li>
            <li>Read descriptions to find specialized agents</li>
            <li>Create your own agent to share with the community</li>
          </ul>
        </div>
      )}
    </div>
  );
}
