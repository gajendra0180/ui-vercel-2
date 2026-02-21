import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useActiveAccount } from "thirdweb/react";
import { getServersWithFilters, ServerEntry, ServerListParams, ServerListResponse } from "../utils/api";
import { Pagination } from "../components/Pagination";
import { APICard } from "../components/APICard";
import { Spinner } from "../components/Spinner";
import { SkeletonCard } from "../components/Skeleton";
import { ChainSelector, ChainBadge } from "../components/ChainSelector";
import { useDebounce } from "../hooks/useDebounce";
import { useFavorites } from "../hooks/useFavorites";
import { useChainContext } from "../contexts/ChainContext";
import "./MarketplacePage.css";

type SortOption = "trending" | "newest" | "price-low" | "price-high";
type PriceTier = "all" | "starter" | "growth" | "pro";
type ViewMode = "grid" | "list";

// Valid category tags (same as backend)
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
  crypto: 'Crypto operations and protocols',
  blockchain: 'Blockchain and on-chain data',
  ai: 'Artificial intelligence services',
  ml: 'Machine learning capabilities',
  trading: 'Trading information and signals',
  data: 'Data aggregation and processing',
  analytics: 'Analytics and insights',
  infrastructure: 'Infrastructure services',
  social: 'Social media and networking',
  media: 'Media processing and content',
  finance: 'Financial data and services',
  gaming: 'Gaming-related APIs',
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
    description: "> $0.5",
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

// Constants for pagination
const PAGE_SIZE = 20;

export function MarketplacePage() {
  const navigate = useNavigate();
  const account = useActiveAccount();
  const [searchParams, setSearchParams] = useSearchParams();
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [filteredServers, setFilteredServers] = useState<ServerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [sortBy, setSortBy] = useState<SortOption>("trending");
  const [priceFilter, setPriceFilter] = useState<PriceTier>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>(
    searchParams.get("category") || "all"
  );
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const { favorites, isFavorite, toggleFavorite } = useFavorites(account?.address);

  // Pagination state
  const [pagination, setPagination] = useState({
    total: 0,
    limit: PAGE_SIZE,
    offset: 0,
    count: 0,
    hasMore: false,
  });
  const [currentPage, setCurrentPage] = useState(0);

  // Use global chain context from navbar
  const { selectedChainId } = useChainContext();

  // Load servers with server-side filtering
  const loadServers = useCallback(async (offset: number = 0) => {
    try {
      setLoading(true);

      // Build filter params for server-side filtering
      const params: ServerListParams = {
        limit: PAGE_SIZE,
        offset,
        sortBy: sortBy,
      };

      if (selectedChainId) {
        params.chainId = selectedChainId;
      }

      if (debouncedSearchQuery) {
        params.search = debouncedSearchQuery;
      }

      if (selectedCategory !== "all") {
        params.category = selectedCategory;
      }

      if (priceFilter !== "all") {
        const tier = PRICE_TIER_META[priceFilter];
        params.minPrice = tier.min;
        params.maxPrice = tier.max === Number.POSITIVE_INFINITY ? undefined : tier.max;
      }

      const response = await getServersWithFilters(params);
      setServers(response.servers);
      setPagination(response.pagination);
    } catch (error) {
      console.error("Failed to load servers:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedChainId, debouncedSearchQuery, selectedCategory, priceFilter, sortBy]);

  // Load servers when filters change
  useEffect(() => {
    setCurrentPage(0);
    loadServers(0);
  }, [selectedChainId, debouncedSearchQuery, selectedCategory, priceFilter, sortBy]);

  // Reset filters when chain changes
  useEffect(() => {
    setSelectedCategory("all");
    setPriceFilter("all");
    setSearchQuery("");
    setCurrentPage(0);
  }, [selectedChainId]);

  useEffect(() => {
    // Update URL when category changes
    if (selectedCategory === "all") {
      searchParams.delete("category");
    } else {
      searchParams.set("category", selectedCategory);
    }
    setSearchParams(searchParams, { replace: true });
  }, [selectedCategory]);

  // Handle page change
  const handlePageChange = (newOffset: number) => {
    setCurrentPage(newOffset);
    loadServers(newOffset);
    // Scroll to top of results
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Group servers by category (memoized)
  const serversByCategory = useMemo(() => {
    const grouped: Record<string, ServerEntry[]> = {};
    VALID_CATEGORIES.forEach((category) => {
      grouped[category] = servers.filter((server) =>
        (server.tags || []).includes(category)
      );
    });
    return grouped;
  }, [servers]);

  /**
   * Apply client-side favorites filter only
   * Server-side handles search, category, price, and sort
   * Favorites must be filtered client-side since it uses local data
   */
  const filteredAndSortedServers = useMemo(() => {
    let filtered = [...servers];

    // Filter by favorites (client-side only - uses local storage data)
    if (showFavoritesOnly) {
      filtered = filtered.filter((server) => isFavorite(server.id));
    }

    return filtered;
  }, [servers, showFavoritesOnly, isFavorite]);

  // Update filtered servers when memoized results change
  useEffect(() => {
    setFilteredServers(filteredAndSortedServers);
  }, [filteredAndSortedServers]);

  const handleViewDetails = (serverSlug: string) => {
    navigate(`/server/${serverSlug}`);
  };

  const handleTryServer = (serverSlug: string) => {
    navigate(`/server/${serverSlug}?try=true`);
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setSearchQuery(""); // Clear search when selecting category
  };

  if (loading) {
    return (
      <div className="marketplace-page">
        <div className="marketplace-header">
          <h1 className="hero-title">API Marketplace</h1>
          <p className="hero-subtitle">Discover and connect to monetized APIs</p>
        </div>
        <div className="card-grid">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="marketplace-page">
      {/* Hero Section */}
      <section className="marketplace-hero">
        <div className="hero-content">
          <p className="eyebrow">x402 Marketplace · Pay-per-call</p>
          <h1>Discover & Connect to API Servers</h1>
          <p className="hero-subtitle">
            Browse servers by category, compare prices, and start calling APIs instantly with crypto payments.
          </p>
          <div className="search-box-hero">
            <input
              type="text"
              placeholder="🔍 Search servers, APIs, or categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input-hero"
              aria-label="Search API servers by name, symbol, or category"
              aria-describedby="search-help"
            />
            <p id="search-help" className="sr-only">
              Type to search for API servers. Results update as you type.
            </p>
          </div>
        </div>
      </section>

      {/* Categories Navigation */}
      <section className="categories-nav">
        <div className="categories-scroll">
          <button
            className={`category-nav-item ${selectedCategory === "all" ? "active" : ""}`}
            onClick={() => handleCategorySelect("all")}
            aria-label="Show all API servers"
            aria-current={selectedCategory === "all" ? "page" : undefined}
          >
            <span className="category-nav-icon">🏠</span>
            <span className="category-nav-label">All Servers</span>
            <span className="category-nav-count">{servers.length}</span>
          </button>
          {VALID_CATEGORIES.map((category) => {
            const count = serversByCategory[category]?.length || 0;
            if (count === 0) return null;
            return (
              <button
                key={category}
                className={`category-nav-item ${selectedCategory === category ? "active" : ""}`}
                onClick={() => handleCategorySelect(category)}
                aria-label={`Show ${CATEGORY_LABELS[category]} servers (${count})`}
                aria-current={selectedCategory === category ? "page" : undefined}
              >
                <span className="category-nav-icon">{CATEGORY_ICONS[category]}</span>
                <span className="category-nav-label">{CATEGORY_LABELS[category]}</span>
                <span className="category-nav-count">{count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Filters & Controls */}
      <section className="marketplace-controls">
        <div className="controls-left">
          <h2 className="results-heading">
            {selectedCategory === "all" ? (
              <>All Servers</>
            ) : (
              <>
                {CATEGORY_ICONS[selectedCategory]} {CATEGORY_LABELS[selectedCategory]}
              </>
            )}
            <span className="results-count">({filteredServers.length})</span>
          </h2>
          {selectedCategory !== "all" && (
            <p className="category-desc">{CATEGORY_DESCRIPTIONS[selectedCategory]}</p>
          )}
        </div>
        <div className="controls-right">
          <div className="filter-group">
            <label htmlFor="price-filter">Price:</label>
            <select
              id="price-filter"
              value={priceFilter}
              onChange={(e) => setPriceFilter(e.target.value as PriceTier)}
              className="filter-select"
              aria-label="Filter servers by price tier"
            >
              <option value="all">All Prices</option>
              <option value="starter">Starter {PRICE_TIER_META.starter.description}</option>
              <option value="growth">Growth {PRICE_TIER_META.growth.description}</option>
              <option value="pro">Pro {PRICE_TIER_META.pro.description}</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="sort-select">Sort:</label>
            <select
              id="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="filter-select"
              aria-label="Sort servers by trending, newest, or price"
            >
              <option value="trending">🔥 Trending</option>
              <option value="newest">🆕 Newest</option>
              <option value="price-low">💰 Price: Low → High</option>
              <option value="price-high">💰 Price: High → Low</option>
            </select>
          </div>

          {account && favorites.size > 0 && (
            <button
              className={`favorites-filter-btn ${showFavoritesOnly ? 'active' : ''}`}
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              aria-label={showFavoritesOnly ? 'Show all servers' : 'Show favorites only'}
              title={showFavoritesOnly ? 'Show all servers' : 'Show favorites only'}
            >
              {showFavoritesOnly ? '❤️' : '🤍'} Favorites {showFavoritesOnly && `(${favorites.size})`}
            </button>
          )}

          <div className="view-toggle">
            <button
              className={viewMode === "grid" ? "active" : ""}
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              title="Grid view"
            >
              ⬚
            </button>
            <button
              className={viewMode === "list" ? "active" : ""}
              onClick={() => setViewMode("list")}
              aria-label="List view"
              title="List view"
            >
              ☰
            </button>
          </div>
        </div>
      </section>

      {/* Servers Grid/List */}
      {filteredServers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-content">
            <div className="empty-icon">🔍</div>
            <h3>No servers found</h3>
            <p>
              {searchQuery
                ? `No servers match "${searchQuery}"`
                : selectedCategory !== "all"
                ? `No servers in ${CATEGORY_LABELS[selectedCategory]} category yet`
                : "No servers available yet. Be the first to register!"}
            </p>
            <div className="empty-actions">
              {(searchQuery || selectedCategory !== "all" || priceFilter !== "all") && (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("all");
                    setPriceFilter("all");
                  }}
                >
                  Clear Filters
                </button>
              )}
              <button className="btn btn-primary" onClick={() => navigate("/submit")}>
                🖥️ Register Server
              </button>
            </div>
          </div>
        </div>
      ) : (
        <section className={`servers-section ${viewMode === "list" ? "list-mode" : ""}`}>
          <div className={viewMode === "list" ? "servers-list" : "servers-grid"}>
            {filteredServers.map((server) => (
              <APICard
                key={server.id}
                server={server}
                onViewDetails={() => handleViewDetails(server.slug)}
                onTryServer={() => handleTryServer(server.slug)}
                variant={viewMode}
                isFavorite={isFavorite(server.id)}
                onToggleFavorite={() => toggleFavorite(server.id)}
              />
            ))}
          </div>

          {/* Pagination - only show when not filtering by favorites (server-side pagination) */}
          {!showFavoritesOnly && pagination.total > PAGE_SIZE && (
            <Pagination
              total={pagination.total}
              limit={pagination.limit}
              offset={pagination.offset}
              onPageChange={handlePageChange}
              loading={loading}
            />
          )}
        </section>
      )}

      {/* Featured Categories Section (when viewing "All") */}
      {selectedCategory === "all" && !searchQuery && priceFilter === "all" && servers.length > 0 && (
        <section className="featured-categories">
          <h2 className="section-title">Browse by Category</h2>
          <div className="featured-categories-grid">
            {VALID_CATEGORIES.map((category) => {
              const count = serversByCategory[category]?.length || 0;
              if (count === 0) return null;
              return (
                <button
                  key={category}
                  className="featured-category-card"
                  onClick={() => handleCategorySelect(category)}
                >
                  <div className="featured-category-icon">{CATEGORY_ICONS[category]}</div>
                  <h3>{CATEGORY_LABELS[category]}</h3>
                  <p>{CATEGORY_DESCRIPTIONS[category]}</p>
                  <span className="featured-category-count">{count} {count === 1 ? 'server' : 'servers'}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

