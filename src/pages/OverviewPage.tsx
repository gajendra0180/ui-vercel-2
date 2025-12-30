import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getAllServers, ServerEntry } from "../utils/api";
import "./OverviewPage.css";

interface LeaderboardEntry {
  server: ServerEntry;
  volume: number;
  buyers: number;
  transactions: number;
  latestTransaction: string | null;
}

const formatCurrency = (value: number) =>
  `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

const formatRelativeTime = (timestamp: string | null) => {
  if (!timestamp) return "Never";
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return "Unknown";
  }
};

export function OverviewPage() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderboardMode, setLeaderboardMode] = useState<"volume" | "buyers" | "transactions">("volume");

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    try {
      setLoading(true);
      const allServers = await getAllServers();
      setServers(allServers);
    } catch (error) {
      console.error("Failed to load servers:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate global statistics
  const globalStats = useMemo(() => {
    if (!servers.length) {
      return {
        totalVolume: 0,
        totalTransactions: 0,
        activeServers: 0,
        avgTransactionValue: 0,
        totalAPIs: 0,
      };
    }

    const stats = servers.reduce(
      (acc, server) => {
        const transactions = Number(server.subscriptionCount || "0");
        // Calculate average price from all APIs
        let avgServerPrice = 0;
        if (server.apis && server.apis.length > 0) {
          const totalPrice = server.apis.reduce((sum, api) => {
            try {
              const feeBig = BigInt(api.fee);
              return sum + Number(feeBig) / 1e6;
            } catch {
              return sum;
            }
          }, 0);
          avgServerPrice = totalPrice / server.apis.length;
        }
        const volume = transactions * avgServerPrice;
        
        acc.totalVolume += volume;
        acc.totalTransactions += transactions;
        acc.activeServers += transactions > 0 ? 1 : 0;
        acc.totalAPIs += server.apis?.length || 0;
        return acc;
      },
      { totalVolume: 0, totalTransactions: 0, activeServers: 0, totalAPIs: 0 }
    );

    return {
      ...stats,
      avgTransactionValue: stats.totalTransactions > 0 ? stats.totalVolume / stats.totalTransactions : 0,
    };
  }, [servers]);

  // Generate leaderboard data
  const leaderboard = useMemo(() => {
    const entries: LeaderboardEntry[] = servers.map((server) => {
      const transactions = Number(server.subscriptionCount || "0");
      
      // Calculate volume
      let avgServerPrice = 0;
      if (server.apis && server.apis.length > 0) {
        const totalPrice = server.apis.reduce((sum, api) => {
          try {
            const feeBig = BigInt(api.fee);
            return sum + Number(feeBig) / 1e6;
          } catch {
            return sum;
          }
        }, 0);
        avgServerPrice = totalPrice / server.apis.length;
      }
      const volume = transactions * avgServerPrice;

      return {
        server,
        volume,
        buyers: transactions, // For now, using transactions as proxy for unique buyers
        transactions,
        latestTransaction: server.updatedAt || server.createdAt || null,
      };
    });

    // Sort based on selected mode
    entries.sort((a, b) => {
      switch (leaderboardMode) {
        case "volume":
          return b.volume - a.volume;
        case "buyers":
          return b.buyers - a.buyers;
        case "transactions":
          return b.transactions - a.transactions;
        default:
          return 0;
      }
    });

    return entries.slice(0, 10); // Top 10
  }, [servers, leaderboardMode]);

  if (loading) {
    return (
      <div className="overview-page">
        <div className="overview-loading">
          <div className="loading-hero shimmer" />
          <div className="loading-stats">
            {[...Array(5)].map((_, idx) => (
              <div key={idx} className="stat-skeleton shimmer" />
            ))}
          </div>
          <div className="loading-leaderboard shimmer" />
        </div>
      </div>
    );
  }

  return (
    <div className="overview-page">
      {/* Hero Section */}
      <section className="overview-hero">
        <div className="hero-content">
          <p className="eyebrow">x402 Protocol · Ecosystem Overview</p>
          <h1>Global API Marketplace Statistics</h1>
          <p className="hero-subtitle">
            Real-time insights into the x402 ecosystem. Track volume, transactions, and top-performing API servers.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={() => navigate("/marketplace")}>
              🛍️ Browse Marketplace
            </button>
            <button className="btn btn-secondary" onClick={() => navigate("/submit")}>
              🖥️ Register Your Server
            </button>
          </div>
        </div>
      </section>

      {/* Global Stats Section */}
      <section className="global-stats-section">
        <h2 className="section-title">🌍 Global Ecosystem Health</h2>
        <div className="stats-grid">
          <div className="stat-card highlight">
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <p className="stat-label">Total Volume</p>
              <h3 className="stat-value">{formatCurrency(globalStats.totalVolume)}</h3>
              <span className="stat-hint">USDC transacted</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">⚡</div>
            <div className="stat-content">
              <p className="stat-label">Total Transactions</p>
              <h3 className="stat-value">{formatCompactNumber(globalStats.totalTransactions)}</h3>
              <span className="stat-hint">API calls made</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">🖥️</div>
            <div className="stat-content">
              <p className="stat-label">Active Servers</p>
              <h3 className="stat-value">{globalStats.activeServers}</h3>
              <span className="stat-hint">of {servers.length} registered</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <p className="stat-label">Avg Transaction</p>
              <h3 className="stat-value">{formatCurrency(globalStats.avgTransactionValue)}</h3>
              <span className="stat-hint">per API call</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">🔌</div>
            <div className="stat-content">
              <p className="stat-label">Total APIs</p>
              <h3 className="stat-value">{globalStats.totalAPIs}</h3>
              <span className="stat-hint">available endpoints</span>
            </div>
          </div>
        </div>
      </section>

      {/* Leaderboard Section */}
      <section className="leaderboard-section">
        <div className="leaderboard-header">
          <h2 className="section-title">🏆 Top Servers Leaderboard</h2>
          <div className="leaderboard-tabs">
            <button
              className={`tab ${leaderboardMode === "volume" ? "active" : ""}`}
              onClick={() => setLeaderboardMode("volume")}
            >
              💰 Volume
            </button>
            <button
              className={`tab ${leaderboardMode === "buyers" ? "active" : ""}`}
              onClick={() => setLeaderboardMode("buyers")}
            >
              👥 Buyers
            </button>
            <button
              className={`tab ${leaderboardMode === "transactions" ? "active" : ""}`}
              onClick={() => setLeaderboardMode("transactions")}
            >
              ⚡ Transactions
            </button>
          </div>
        </div>

        {leaderboard.length === 0 ? (
          <div className="empty-leaderboard">
            <p>No servers with activity yet. Be the first!</p>
            <button className="btn btn-primary" onClick={() => navigate("/submit")}>
              Register Your Server
            </button>
          </div>
        ) : (
          <div className="leaderboard-table">
            <div className="table-header">
              <div className="col-rank">Rank</div>
              <div className="col-server">Server</div>
              <div className="col-stat">
                {leaderboardMode === "volume" && "Volume"}
                {leaderboardMode === "buyers" && "Buyers"}
                {leaderboardMode === "transactions" && "Transactions"}
              </div>
              <div className="col-apis">APIs</div>
              <div className="col-last">Latest Activity</div>
              <div className="col-actions"></div>
            </div>
            
            {leaderboard.map((entry, index) => (
              <div
                key={entry.server.id}
                className={`table-row ${index < 3 ? `top-${index + 1}` : ""}`}
              >
                <div className="col-rank">
                  <div className="rank-badge">
                    {index === 0 && "🥇"}
                    {index === 1 && "🥈"}
                    {index === 2 && "🥉"}
                    {index > 2 && `#${index + 1}`}
                  </div>
                </div>
                
                <div className="col-server">
                  <div className="server-info">
                    <h4>{entry.server.name}</h4>
                    <span className="server-slug">/{entry.server.slug}</span>
                    {entry.server.tags && entry.server.tags.length > 0 && (
                      <div className="server-tags">
                        {entry.server.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="tag-mini">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="col-stat">
                  <strong>
                    {leaderboardMode === "volume" && formatCurrency(entry.volume)}
                    {leaderboardMode === "buyers" && formatCompactNumber(entry.buyers)}
                    {leaderboardMode === "transactions" && formatCompactNumber(entry.transactions)}
                  </strong>
                </div>
                
                <div className="col-apis">
                  <span className="api-count">{entry.server.apis?.length || 0}</span>
                </div>
                
                <div className="col-last">
                  <span className="time-ago">{formatRelativeTime(entry.latestTransaction)}</span>
                </div>
                
                <div className="col-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => navigate(`/server/${entry.server.slug}`)}
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Call to Action */}
      <section className="cta-section">
        <div className="cta-card">
          <h2>Ready to monetize your APIs?</h2>
          <p>Join the x402 ecosystem and start earning USDC for every API call.</p>
          <div className="cta-actions">
            <button className="btn btn-primary btn-large" onClick={() => navigate("/submit")}>
              🖥️ Register Your Server
            </button>
            <button className="btn btn-secondary btn-large" onClick={() => navigate("/marketplace")}>
              🛍️ Explore Marketplace
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

