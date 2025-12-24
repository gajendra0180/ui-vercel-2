import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getAllServers, ServerEntry } from "../utils/api";
import { APICard } from "../components/APICard";
import "./DiscoverPage.css";

type SortOption = "trending" | "newest" | "price-low" | "price-high";
type PriceTier = "all" | "starter" | "growth" | "pro";
type ViewMode = "grid" | "list";

// Valid category tags
const VALID_CATEGORIES = [
  'crypto',
  'blockchain',
  'ai',
  'ml',
  'trading',
  'data',
  'analytics',
  'infrastructure',
  'social',
  'media',
  'finance',
  'gaming',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  crypto: 'Crypto',
  blockchain: 'Blockchain',
  ai: 'AI',
  ml: 'ML',
  trading: 'Trading',
  data: 'Data',
  analytics: 'Analytics',
  infrastructure: 'Infrastructure',
  social: 'Social',
  media: 'Media',
  finance: 'Finance',
  gaming: 'Gaming',
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  crypto: 'Servers that provide resources for crypto operations',
  blockchain: 'Servers that provide blockchain and on-chain data',
  ai: 'Servers that provide AI resources',
  ml: 'Servers that provide machine learning capabilities',
  trading: 'Servers that provide resources for trading information',
  data: 'Servers that provide data aggregation and processing',
  analytics: 'Servers that provide analytics and insights',
  infrastructure: 'Servers that provide infrastructure services',
  social: 'Servers that provide social media and networking APIs',
  media: 'Servers that provide media processing and content APIs',
  finance: 'Servers that provide financial data and services',
  gaming: 'Servers that provide gaming-related APIs',
};

const CATEGORY_ICONS: Record<string, string> = {
  crypto: '⛓️',
  blockchain: '🔗',
  ai: '🧠',
  ml: '🤖',
  trading: '📈',
  data: '📊',
  analytics: '📉',
  infrastructure: '⚙️',
  social: '👥',
  media: '🎬',
  finance: '💰',
  gaming: '🎮',
};

const PRICE_TIER_META: Record<Exclude<PriceTier, "all">, { label: string; description: string; min: number; max: number }> = {
  starter: {
    label: "Starter",
    description: "< $0.05",
    min: 0,
    max: 0.05,
  },
  growth: {
    label: "Growth",
    description: "$0.05 - $0.5",
    min: 0.05,
    max: 0.5,
  },
  pro: {
    label: "Pro",
    description: ">$0.5",
    min: 0.5,
    max: Number.POSITIVE_INFINITY,
  },
};

const formatUSDC = (fee: string) => {
  try {
    const feeBig = BigInt(fee);
    return Number(feeBig) / 1e6;
  } catch {
    return 0;
  }
};

const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

const formatCurrencyDisplay = (value: number) =>
  `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DiscoverPage() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [filteredServers, setFilteredServers] = useState<ServerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("trending");
  const [priceFilter, setPriceFilter] = useState<PriceTier>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  useEffect(() => {
    loadServers();
  }, []);

  useEffect(() => {
    filterAndSortServers();
  }, [servers, searchQuery, sortBy, priceFilter, selectedCategory]);

  const heroStats = useMemo(() => {
    if (!servers.length) {
      return {
        totalServers: 0,
        totalSubscriptions: 0,
        totalVolume: 0,
        avgPrice: 0,
      };
    }

    const totals = servers.reduce(
      (acc, server) => {
        const subscriptions = Number(server.subscriptionCount || "0");
        // Calculate average price from all APIs
        let avgServerPrice = 0;
        if (server.apis && server.apis.length > 0) {
          const totalPrice = server.apis.reduce((sum, api) => sum + formatUSDC(api.fee), 0);
          avgServerPrice = totalPrice / server.apis.length;
        }
        acc.totalSubscriptions += subscriptions;
        acc.totalVolume += subscriptions * avgServerPrice;
        acc.totalPrice += avgServerPrice;
        return acc;
      },
      { totalSubscriptions: 0, totalVolume: 0, totalPrice: 0 }
    );

    return {
      totalServers: servers.length,
      totalSubscriptions: totals.totalSubscriptions,
      totalVolume: totals.totalVolume,
      avgPrice: servers.length > 0 ? totals.totalPrice / servers.length : 0,
    };
  }, [servers]);

  const featuredServer = filteredServers[0] || null;
  const remainingServers = featuredServer ? filteredServers.slice(1) : filteredServers;

  // Group servers by category for "All Categories" view
  const serversByCategory = useMemo(() => {
    if (selectedCategory !== "all") return {};
    
    const grouped: Record<string, ServerEntry[]> = {};
    VALID_CATEGORIES.forEach(category => {
      grouped[category] = servers.filter(server => 
        (server.tags || []).includes(category)
      );
    });
    return grouped;
  }, [servers, selectedCategory]);

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

  const filterAndSortServers = () => {
    let filtered = [...servers];

    // Filter by search query (include slug in search)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (server) =>
          server.name.toLowerCase().includes(query) ||
          server.symbol.toLowerCase().includes(query) ||
          server.slug?.toLowerCase().includes(query) ||
          server.id.toLowerCase().includes(query)
      );
    }

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter((server) => {
        return (server.tags || []).includes(selectedCategory);
      });
    }

    if (priceFilter !== "all") {
      const tier = PRICE_TIER_META[priceFilter];
      filtered = filtered.filter((server) => {
        if (!server.apis || server.apis.length === 0) return false;
        // Check if any API falls within the price range
        return server.apis.some(api => {
          const price = formatUSDC(api.fee);
          return price >= tier.min && price <= tier.max;
        });
      });
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "trending":
          const aCount = parseInt(a.subscriptionCount || "0");
          const bCount = parseInt(b.subscriptionCount || "0");
          return bCount - aCount;
        case "newest":
          // Sort by createdAt if available, otherwise by ID
          if (a.createdAt && b.createdAt) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          return b.id.localeCompare(a.id);
        case "price-low":
          // Sort by minimum API price
          const aMinPrice = a.apis && a.apis.length > 0 
            ? Math.min(...a.apis.map(api => formatUSDC(api.fee))) 
            : 0;
          const bMinPrice = b.apis && b.apis.length > 0 
            ? Math.min(...b.apis.map(api => formatUSDC(api.fee))) 
            : 0;
          return aMinPrice - bMinPrice;
        case "price-high":
          // Sort by maximum API price
          const aMaxPrice = a.apis && a.apis.length > 0 
            ? Math.max(...a.apis.map(api => formatUSDC(api.fee))) 
            : 0;
          const bMaxPrice = b.apis && b.apis.length > 0 
            ? Math.max(...b.apis.map(api => formatUSDC(api.fee))) 
            : 0;
          return bMaxPrice - aMaxPrice;
        default:
          return 0;
      }
    });

    setFilteredServers(filtered);
  };

  const handleViewDetails = (serverSlug: string) => {
    navigate(`/server/${serverSlug}`);
  };

  const handleTryServer = (serverSlug: string) => {
    navigate(`/server/${serverSlug}?try=true`);
  };

  if (loading) {
    return (
      <div className="discover-page">
        <div className="discover-loading">
          <div className="loading-hero shimmer" />
          <div className="loading-stats">
            {[...Array(4)].map((_, idx) => (
              <div key={idx} className="stat-skeleton shimmer" />
            ))}
          </div>
          <div className="loading-grid">
            {[...Array(6)].map((_, idx) => (
              <div key={idx} className="card-skeleton shimmer" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="discover-page">
      <section className="discover-hero">
        <div className="hero-content">
          <p className="eyebrow">API Marketplace · Pay-per-call</p>
          <h1>Monetize your APIs with crypto payments.</h1>
          <p className="hero-subtitle">
            Register your server, list your APIs, and get paid instantly in USDC for every call. No middleman, no delays.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary hero-btn" onClick={() => navigate("/submit")}>
              🖥️ Register Server
            </button>
            {featuredServer && (
              <button
                className="btn btn-secondary hero-btn"
                onClick={() => navigate(`/server/${featuredServer.slug}`)}
              >
                Try Demo
              </button>
            )}
          </div>
        </div>
        <div className="hero-panel">
          <div className="hero-panel-content">
            <p className="panel-label">How it works</p>
            <h3>Simple pay-per-call model</h3>
            <ul>
              <li>🖥️ Register your server & list APIs</li>
              <li>💰 Set your price per API call</li>
              <li>⚡ Get paid instantly in USDC</li>
            </ul>
            <p className="panel-footnote">Secure wallet-based payments. No signup required.</p>
          </div>
        </div>
      </section>

      <section className="stats-section">
        <div className="stat-card">
          <p className="stat-label">Servers</p>
          <h3>{heroStats.totalServers}</h3>
          <span className="stat-hint">Active servers</span>
        </div>
        <div className="stat-card">
          <p className="stat-label">API Calls</p>
          <h3>{formatCompactNumber(heroStats.totalSubscriptions)}</h3>
          <span className="stat-hint">Total paid calls</span>
        </div>
        <div className="stat-card">
          <p className="stat-label">Volume</p>
          <h3>{formatCurrencyDisplay(heroStats.totalVolume)}</h3>
          <span className="stat-hint">USDC transacted</span>
        </div>
        <div className="stat-card">
          <p className="stat-label">Avg Price</p>
          <h3>{formatCurrencyDisplay(heroStats.avgPrice)}</h3>
          <span className="stat-hint">Per API call</span>
        </div>
      </section>

      <section className="discover-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="🔍 Search by name, symbol, or slug..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="toolbar-actions">
          <div className="sort-controls">
            <label>Sort by:</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="sort-select">
              <option value="trending">🔥 Trending</option>
              <option value="newest">🆕 Newest</option>
              <option value="price-low">💰 Price: Low to High</option>
              <option value="price-high">💰 Price: High to Low</option>
            </select>
          </div>

          <div className="view-toggle">
            <button
              className={viewMode === "grid" ? "active" : ""}
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
            >
              ⬚
            </button>
            <button
              className={viewMode === "list" ? "active" : ""}
              onClick={() => setViewMode("list")}
              aria-label="List view"
            >
              ☰
            </button>
          </div>
        </div>
      </section>

      <div className="filter-section">
        <div className="category-filters">
          <h4>Categories</h4>
          <div className="category-pills">
            <button
              className={`pill ${selectedCategory === "all" ? "active" : ""}`}
              onClick={() => setSelectedCategory("all")}
            >
              All Categories
            </button>
            {VALID_CATEGORIES.map((category) => (
              <button
                key={category}
                className={`pill ${selectedCategory === category ? "active" : ""}`}
                onClick={() => setSelectedCategory(category)}
              >
                {CATEGORY_LABELS[category]}
              </button>
            ))}
          </div>
        </div>
        <div className="price-pills">
          <h4>Price Tiers</h4>
          <div className="pills-row">
            {(["all", "starter", "growth", "pro"] as PriceTier[]).map((tier) => (
              <button
                key={tier}
                className={`pill ${priceFilter === tier ? "active" : ""}`}
                onClick={() => setPriceFilter(tier)}
              >
                {tier === "all"
                  ? "All tiers"
                  : `${PRICE_TIER_META[tier].label} · ${PRICE_TIER_META[tier].description}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {featuredServer && (
        <section className="featured-section">
          <div className="featured-card">
            <div className="featured-content">
              <p className="eyebrow">🔥 Featured Server</p>
              <h2>{featuredServer.name}</h2>
              <p className="featured-symbol">
                <span className="slug-badge">/{featuredServer.slug}</span>
                <span>{featuredServer.symbol}</span>
              </p>
              <div className="featured-stats">
                <div>
                  <span>Price Range</span>
                  <strong>
                    {featuredServer.apis && featuredServer.apis.length > 0 ? (() => {
                      const fees = featuredServer.apis.map(api => formatUSDC(api.fee));
                      const minFee = Math.min(...fees);
                      const maxFee = Math.max(...fees);
                      if (minFee === maxFee) {
                        return formatCurrencyDisplay(minFee);
                      }
                      return `${formatCurrencyDisplay(minFee)}-${formatCurrencyDisplay(maxFee)}`;
                    })() : '$0.00'}
                  </strong>
                </div>
                <div>
                  <span>Calls</span>
                  <strong>{featuredServer.subscriptionCount || "0"}</strong>
                </div>
                <div>
                  <span>APIs</span>
                  <strong>{featuredServer.apiCount || featuredServer.apis?.length || 0}</strong>
                </div>
              </div>
              <div className="featured-actions">
                <button className="btn btn-primary" onClick={() => handleTryServer(featuredServer.slug)}>
                  ⚡ Try Now
                </button>
                <button className="btn ghost" onClick={() => handleViewDetails(featuredServer.slug)}>
                  View Details
                </button>
              </div>
            </div>
            <div className="featured-meta">
              <p><strong>Owner:</strong> {featuredServer.builder.slice(0, 6)}...{featuredServer.builder.slice(-4)}</p>
              {featuredServer.apis && featuredServer.apis.length > 0 && (
                <div className="featured-apis">
                  <strong>Endpoints:</strong>
                  <ul>
                    {featuredServer.apis.map(api => (
                      <li key={api.slug}>
                        <code>/{featuredServer.slug}/{api.slug}</code> — {api.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Show categorical sections when "All Categories" is selected */}
      {selectedCategory === "all" && !searchQuery && priceFilter === "all" ? (
        <div className="category-sections">
          {VALID_CATEGORIES.map((category) => {
            const categoryServers = serversByCategory[category] || [];
            if (categoryServers.length === 0) return null;
            
            return (
              <CategorySection
                key={category}
                category={category}
                servers={categoryServers}
                onViewDetails={handleViewDetails}
                onTryServer={handleTryServer}
              />
            );
          })}
        </div>
      ) : filteredServers.length === 0 ? (
        <div className="empty-state">
          <p>
            {searchQuery || priceFilter !== "all" || selectedCategory !== "all"
              ? "No servers match your current search & filters."
              : "No servers available yet. Be the first to register!"}
          </p>
          <div className="empty-actions">
            <button className="btn btn-primary" onClick={() => navigate("/submit")}>
              Register Server
            </button>
            {(searchQuery || priceFilter !== "all" || selectedCategory !== "all") && (
              <button
                className="btn ghost"
                onClick={() => {
                  setSearchQuery("");
                  setPriceFilter("all");
                  setSelectedCategory("all");
                }}
              >
                Reset filters
              </button>
            )}
          </div>
        </div>
      ) : remainingServers.length === 0 ? null : (
        <section className={`api-section ${viewMode === "list" ? "list-mode" : ""}`}>
          <div className={viewMode === "list" ? "api-list" : "api-grid"}>
            {remainingServers.map((server) => (
              <APICard
                key={server.id}
                server={server}
                onViewDetails={() => handleViewDetails(server.slug)}
                onTryServer={() => handleTryServer(server.slug)}
                variant={viewMode}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// Category Section Component with horizontal scrolling
function CategorySection({
  category,
  servers,
  onViewDetails,
  onTryServer,
}: {
  category: string;
  servers: ServerEntry[];
  onViewDetails: (slug: string) => void;
  onTryServer: (slug: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 400;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <section className="category-section">
      <div className="category-section-header">
        <div className="category-title-group">
          <span className="category-icon">{CATEGORY_ICONS[category]}</span>
          <div>
            <h2 className="category-title">{CATEGORY_LABELS[category]} Servers</h2>
            <p className="category-description">{CATEGORY_DESCRIPTIONS[category]}</p>
          </div>
        </div>
        <div className="category-count">{servers.length}</div>
      </div>
      
      <div className="category-scroll-container">
        <button
          className="scroll-button scroll-left"
          onClick={() => scroll('left')}
          aria-label="Scroll left"
        >
          ‹
        </button>
        <div className="category-cards-scroll" ref={scrollRef}>
          {servers.map((server) => (
            <div key={server.id} className="category-card-wrapper">
              <APICard
                server={server}
                onViewDetails={() => onViewDetails(server.slug)}
                onTryServer={() => onTryServer(server.slug)}
                variant="grid"
              />
            </div>
          ))}
        </div>
        <button
          className="scroll-button scroll-right"
          onClick={() => scroll('right')}
          aria-label="Scroll right"
        >
          ›
        </button>
      </div>
    </section>
  );
}
