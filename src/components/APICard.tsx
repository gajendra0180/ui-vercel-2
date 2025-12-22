import { ServerEntry } from "../utils/api";
import "./APICard.css";

interface APICardProps {
  server: ServerEntry;
  onViewDetails: () => void;
  onTryServer: () => void;
  variant?: "grid" | "list";
}

const formatFee = (fee: string) => {
  try {
    const feeNum = BigInt(fee);
    const usdcAmount = Number(feeNum) / 1e6;
    return {
      label: `$${usdcAmount.toFixed(2)}`,
      value: usdcAmount,
    };
  } catch {
    return { label: "$0.00", value: 0 };
  }
};

const tierLabels = (price: number) => {
  if (price < 0.05) return { label: "Starter", className: "starter" };
  if (price < 0.5) return { label: "Growth", className: "growth" };
  return { label: "Pro", className: "pro" };
};

export function APICard({ server, onViewDetails, onTryServer, variant = "grid" }: APICardProps) {
  const usageCount = server.subscriptionCount ? parseInt(server.subscriptionCount) : 0;
  const isTrending = usageCount > 10;
  const builderShort = `${server.builder.slice(0, 6)}...${server.builder.slice(-4)}`;
  const apiCount = server.apiCount || server.apis?.length || 0;
  
  // Calculate price range from APIs
  let priceDisplay = "$0.00";
  let tierInfo = { label: "Starter", className: "starter" };
  if (server.apis && server.apis.length > 0) {
    const fees = server.apis.map(api => {
      const fee = formatFee(api.fee);
      return fee.value;
    });
    const minFee = Math.min(...fees);
    const maxFee = Math.max(...fees);
    if (minFee === maxFee) {
      priceDisplay = `$${minFee.toFixed(2)}`;
    } else {
      priceDisplay = `$${minFee.toFixed(2)}-$${maxFee.toFixed(2)}`;
    }
    tierInfo = tierLabels(minFee);
  }

  return (
    <div className={`api-card ${isTrending ? "trending" : ""} ${variant}`}>
      {isTrending && <div className="trending-badge">🔥 Trending</div>}
      <div className="api-card-header">
        <div>
          <div className="api-meta">
            <span className={`tier-pill ${tierInfo.className}`}>{tierInfo.label}</span>
            <span className="builder-pill">by {builderShort}</span>
          </div>
          <h3>{server.name}</h3>
          <span className="server-slug">/{server.slug}</span>
        </div>
        <span className="api-symbol">{server.symbol}</span>
      </div>
      <div className="api-card-body">
        <div className="api-stats">
          <div className="stat">
            <span className="stat-label">Price</span>
            <span className="stat-value">{priceDisplay}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Usage</span>
            <span className="stat-value">{usageCount}</span>
          </div>
          <div className="stat">
            <span className="stat-label">APIs</span>
            <span className="stat-value">{apiCount}</span>
          </div>
        </div>
        {server.apis && server.apis.length > 0 && (
          <div className="api-endpoints-preview">
            {server.apis.slice(0, 2).map(api => (
              <code key={api.slug} className="endpoint-slug">/{server.slug}/{api.slug}</code>
            ))}
            {server.apis.length > 2 && (
              <span className="more-endpoints">+{server.apis.length - 2} more</span>
            )}
          </div>
        )}
      </div>
      <div className="api-card-actions">
        <button className="btn btn-secondary" onClick={onViewDetails}>
          View Details
        </button>
        <button className="btn btn-primary" onClick={onTryServer}>
          Try API
        </button>
      </div>
    </div>
  );
}
