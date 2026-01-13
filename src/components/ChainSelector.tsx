import { useState, useEffect } from "react";
import "./ChainSelector.css";

// @ts-ignore - Vite env variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/**
 * Chain configuration from backend
 */
export interface ChainConfig {
  chainId: string;
  chainType: "evm" | "solana";
  name: string;
  factoryAddress: string;
  paymentTokenAddress: string;
  rpcUrl: string;
  explorerUrl: string;
  enabled: boolean;
}

/**
 * Chain icons and colors
 */
const CHAIN_META: Record<string, { icon: string; color: string; bgColor: string }> = {
  "84532": {
    icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMiIgZmlsbD0iIzAwNTJGRiIvPjxwYXRoIGQ9Ik0xMiA2QzguNjg2MjkgNiA2IDguNjg2MjkgNiAxMkM2IDE1LjMxMzcgOC42ODYyOSAxOCAxMiAxOEMxNS4zMTM3IDE4IDE4IDE1LjMxMzcgMTggMTJDMTggOC42ODYyOSAxNS4zMTM3IDYgMTIgNloiIGZpbGw9IndoaXRlIi8+PC9zdmc+",
    color: "#0052FF",
    bgColor: "rgba(0, 82, 255, 0.1)",
  },
  "devnet": {
    icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMiIgZmlsbD0iIzlCNDVFQSIvPjxwYXRoIGQ9Ik04IDEyTDEyIDhMMTYgMTJMMTIgMTZMOCAxMloiIGZpbGw9IndoaXRlIi8+PC9zdmc+",
    color: "#9B45EA",
    bgColor: "rgba(155, 69, 234, 0.1)",
  },
};

interface ChainSelectorProps {
  selectedChainId: string | null;
  onSelectChain: (chainId: string | null) => void;
  variant?: "pills" | "dropdown";
  showAllOption?: boolean;
  disabled?: boolean;
}

/**
 * ChainSelector - Filter/select blockchain networks
 *
 * Features:
 * - Fetches available chains from /api/chains endpoint
 * - Pills variant for category-style navigation
 * - Dropdown variant for compact UI
 * - "All Chains" option to show servers from all networks
 */
export function ChainSelector({
  selectedChainId,
  onSelectChain,
  variant = "pills",
  showAllOption = true,
  disabled = false,
}: ChainSelectorProps) {
  const [chains, setChains] = useState<ChainConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchChains();
  }, []);

  const fetchChains = async () => {
    try {
      setLoading(true);
      const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
      const response = await fetch(`${baseUrl}/api/chains`);

      if (!response.ok) {
        throw new Error(`Failed to fetch chains: ${response.status}`);
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.chains)) {
        // Only show enabled chains
        setChains(data.chains.filter((chain: ChainConfig) => chain.enabled));
      }
    } catch (err: any) {
      console.error("Failed to fetch chains:", err);
      setError(err.message);
      // Fallback to default chains
      setChains([
        {
          chainId: "84532",
          chainType: "evm",
          name: "Base Sepolia",
          factoryAddress: "",
          paymentTokenAddress: "",
          rpcUrl: "",
          explorerUrl: "",
          enabled: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getChainMeta = (chainId: string) => {
    return CHAIN_META[chainId] || {
      icon: "",
      color: "#666",
      bgColor: "rgba(102, 102, 102, 0.1)",
    };
  };

  if (loading) {
    return (
      <div className={`chain-selector chain-selector--${variant} chain-selector--loading`}>
        <div className="chain-selector__loading">Loading chains...</div>
      </div>
    );
  }

  if (variant === "dropdown") {
    const selectedChain = chains.find((c) => c.chainId === selectedChainId);
    const selectedMeta = selectedChain ? getChainMeta(selectedChain.chainId) : null;

    return (
      <div className={`chain-selector chain-selector--dropdown ${disabled ? "chain-selector--disabled" : ""}`}>
        <button
          className="chain-dropdown__trigger"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          aria-label="Select blockchain network"
          aria-expanded={isOpen}
        >
          {selectedChain ? (
            <>
              {selectedMeta?.icon ? (
                <img
                  src={selectedMeta.icon}
                  alt=""
                  className="chain-dropdown__icon"
                  width={20}
                  height={20}
                />
              ) : (
                <span className="chain-dropdown__icon-text">
                  {selectedChain.chainType === "evm" ? "⬡" : "◎"}
                </span>
              )}
              <span className="chain-dropdown__name">{selectedChain.name}</span>
            </>
          ) : (
            <>
              <span className="chain-dropdown__icon-text">🌐</span>
              <span className="chain-dropdown__name">All Chains</span>
            </>
          )}
          <svg
            className={`chain-dropdown__arrow ${isOpen ? "chain-dropdown__arrow--open" : ""}`}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {isOpen && (
          <>
            <div className="chain-dropdown__backdrop" onClick={() => setIsOpen(false)} />
            <div className="chain-dropdown__menu">
              {showAllOption && (
                <button
                  className={`chain-dropdown__item ${selectedChainId === null ? "chain-dropdown__item--active" : ""}`}
                  onClick={() => {
                    onSelectChain(null);
                    setIsOpen(false);
                  }}
                >
                  <span className="chain-dropdown__item-icon">🌐</span>
                  <span className="chain-dropdown__item-name">All Chains</span>
                </button>
              )}
              {chains.map((chain) => {
                const meta = getChainMeta(chain.chainId);
                const isActive = selectedChainId === chain.chainId;

                return (
                  <button
                    key={chain.chainId}
                    className={`chain-dropdown__item ${isActive ? "chain-dropdown__item--active" : ""}`}
                    onClick={() => {
                      onSelectChain(chain.chainId);
                      setIsOpen(false);
                    }}
                    style={{
                      "--chain-color": meta.color,
                    } as React.CSSProperties}
                  >
                    {meta.icon ? (
                      <img
                        src={meta.icon}
                        alt=""
                        className="chain-dropdown__item-icon"
                        width={20}
                        height={20}
                      />
                    ) : (
                      <span className="chain-dropdown__item-icon">
                        {chain.chainType === "evm" ? "⬡" : "◎"}
                      </span>
                    )}
                    <span className="chain-dropdown__item-name">{chain.name}</span>
                    <span className="chain-dropdown__item-type">{chain.chainType.toUpperCase()}</span>
                    {isActive && (
                      <svg
                        className="chain-dropdown__item-check"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M13.3333 4L6 11.3333L2.66667 8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // Pills variant (default)
  return (
    <div className={`chain-selector chain-selector--pills ${disabled ? "chain-selector--disabled" : ""}`}>
      {showAllOption && (
        <button
          className={`chain-pill ${selectedChainId === null ? "chain-pill--active" : ""}`}
          onClick={() => onSelectChain(null)}
          disabled={disabled}
          aria-label="Show all chains"
          aria-current={selectedChainId === null ? "page" : undefined}
        >
          <span className="chain-pill__icon">🌐</span>
          <span className="chain-pill__name">All Chains</span>
        </button>
      )}
      {chains.map((chain) => {
        const meta = getChainMeta(chain.chainId);
        const isActive = selectedChainId === chain.chainId;

        return (
          <button
            key={chain.chainId}
            className={`chain-pill ${isActive ? "chain-pill--active" : ""}`}
            onClick={() => onSelectChain(chain.chainId)}
            disabled={disabled}
            style={{
              "--chain-color": meta.color,
              "--chain-bg-color": isActive ? meta.bgColor : undefined,
            } as React.CSSProperties}
            aria-label={`Filter by ${chain.name}`}
            aria-current={isActive ? "page" : undefined}
          >
            {meta.icon ? (
              <img
                src={meta.icon}
                alt=""
                className="chain-pill__icon-img"
                width={16}
                height={16}
              />
            ) : (
              <span className="chain-pill__icon">
                {chain.chainType === "evm" ? "⬡" : "◎"}
              </span>
            )}
            <span className="chain-pill__name">{chain.name}</span>
            <span className="chain-pill__type">
              {chain.chainType.toUpperCase()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * ChainBadge - Display chain info inline
 */
interface ChainBadgeProps {
  chainId?: string;
  chainType?: "evm" | "solana";
  chainName?: string;
  size?: "small" | "medium";
}

export function ChainBadge({
  chainId,
  chainType,
  chainName,
  size = "small",
}: ChainBadgeProps) {
  const meta = chainId ? CHAIN_META[chainId] : null;

  return (
    <span
      className={`chain-badge chain-badge--${size}`}
      style={{
        "--chain-color": meta?.color || "#666",
        "--chain-bg-color": meta?.bgColor || "rgba(102, 102, 102, 0.1)",
      } as React.CSSProperties}
    >
      {meta?.icon ? (
        <img
          src={meta.icon}
          alt=""
          className="chain-badge__icon"
          width={size === "small" ? 12 : 16}
          height={size === "small" ? 12 : 16}
        />
      ) : (
        <span className="chain-badge__icon-text">
          {chainType === "solana" ? "◎" : "⬡"}
        </span>
      )}
      <span className="chain-badge__name">
        {chainName || (chainType === "solana" ? "Solana" : "Base")}
      </span>
    </span>
  );
}

export { CHAIN_META };
