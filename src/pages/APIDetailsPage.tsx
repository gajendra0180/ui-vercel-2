import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ServerEntry, getServerBySlug, buildProxyUrl, getServerMetrics, ServerMetrics } from "../utils/api";
import { useX402Payment } from "../hooks/useX402Payment";
import "./APIDetailsPage.css";

export function APIDetailsPage() {
  const { serverSlug } = useParams<{ serverSlug: string }>();
  const navigate = useNavigate();
  const { callAPIWithPayment, isProcessing, isReady, account } = useX402Payment();

  const [server, setServer] = useState<ServerEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testingWithoutPayment, setTestingWithoutPayment] = useState(false);
  const [apiResult, setApiResult] = useState<any>(null);
  const [metadataResult, setMetadataResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedApiSlug, setSelectedApiSlug] = useState<string | null>(null);
  const [queryParams, setQueryParams] = useState<string>("");
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    if (serverSlug) {
      loadServerDetails();
      loadMetrics();
    }
  }, [serverSlug]);

  const loadMetrics = async () => {
    if (!serverSlug) return;
    try {
      setMetricsLoading(true);
      const metricsData = await getServerMetrics(serverSlug);
      setMetrics(metricsData);
    } catch (err: any) {
      console.error("Failed to load metrics:", err);
    } finally {
      setMetricsLoading(false);
    }
  };

  const loadServerDetails = async () => {
    if (!serverSlug) return;
    try {
      setLoading(true);
      const serverData = await getServerBySlug(serverSlug);
      if (!serverData) {
        setError("Server not found");
      } else {
        setServer(serverData);
        // Select first API by default
        if (serverData.apis && serverData.apis.length > 0) {
          setSelectedApiSlug(serverData.apis[0].slug);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to load server details");
    } finally {
      setLoading(false);
    }
  };

  const handleTestWithoutPayment = async () => {
    if (!serverSlug) {
      setError("No server slug provided");
      return;
    }

    setTestingWithoutPayment(true);
    setError(null);
    setMetadataResult(null);

    try {
      // Fetch server metadata (no payment required)
      const serverData = await getServerBySlug(serverSlug);
      if (serverData) {
        setMetadataResult({ server: serverData });
        setError(null);
      } else {
        throw new Error("Server not found");
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch server metadata");
      console.error("Server test error:", err);
    } finally {
      setTestingWithoutPayment(false);
    }
  };

  const handleTestAPI = async () => {
    if (!serverSlug || !server || !selectedApiSlug) {
      setError("Please select an API to test");
      return;
    }

    if (!isReady || !account) {
      setError("Please connect your wallet first");
      return;
    }

    setTesting(true);
    setError(null);
    setApiResult(null);

    try {
      // Build URL with server slug and API slug
      let url = buildProxyUrl(serverSlug, selectedApiSlug);
      
      // Append query parameters if provided
      if (queryParams.trim()) {
        const separator = url.includes("?") ? "&" : "?";
        url = `${url}${separator}${queryParams.trim()}`;
      }

      // Get the selected API's fee
      const api = server.apis?.find(a => a.slug === selectedApiSlug);
      if (!api) {
        throw new Error("Selected API not found");
      }
      const apiFee = BigInt(api.fee);
      
      // Call API with payment - user will be prompted to sign
      const data = await callAPIWithPayment(
        url,
        apiFee,
        server.id // receiver address (token address)
      );

      setApiResult(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to call API");
      console.error("API call error:", err);
    } finally {
      setTesting(false);
    }
  };

  // Get selected API details
  const selectedApi = server?.apis?.find(api => api.slug === selectedApiSlug) || null;

  const formatFee = (fee: string) => {
    const feeNum = BigInt(fee);
    const usdcAmount = Number(feeNum) / 1e6;
    return `$${usdcAmount.toFixed(2)}`;
  };

  // Format BigInt numbers for display with readable units (K, M, B, T, etc.)
  // Note: Token values are in wei (18 decimals), so we divide by 1e18 first
  const formatBigNumber = (value: string) => {
    try {
      const bigIntValue = BigInt(value);
      if (bigIntValue === 0n) return "0";
      
      // Convert from wei to tokens (divide by 1e18)
      const tokensBigInt = bigIntValue / BigInt(1e18);
      if (tokensBigInt === 0n) return "0";
      
      // Define units with readable suffixes (for token amounts after dividing by 1e18)
      const units = [
        { value: 1e12, suffix: 'T' },   // Trillion
        { value: 1e9, suffix: 'B' },    // Billion
        { value: 1e6, suffix: 'M' },    // Million
        { value: 1e3, suffix: 'K' },    // Thousand
      ];
      
      const numValue = Number(tokensBigInt);
      
      // If number is small enough, just format with commas
      if (numValue < 1000) {
        return numValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
      }
      
      // Find the appropriate unit
      for (const unit of units) {
        if (numValue >= unit.value) {
          const divided = numValue / unit.value;
          
          // Adjust decimal places based on magnitude for readability
          let decimals = 2;
          if (divided >= 1000) decimals = 0;
          else if (divided >= 100) decimals = 1;
          else if (divided >= 10) decimals = 2;
          else decimals = 3;
          
          const formatted = divided.toFixed(decimals);
          // Remove trailing zeros for cleaner display
          return `${parseFloat(formatted)}${unit.suffix}`;
        }
      }
      
      // Fallback: format with commas
      return numValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
    } catch {
      return value;
    }
  };

  // Format token amount for display
  const formatTokenAmount = (tokens: string | null) => {
    if (!tokens) return null;
    try {
      const tokensBigInt = BigInt(tokens);
      const tokensNum = Number(tokensBigInt) / 1e18; // Assuming 18 decimals for IAO tokens
      if (tokensNum < 0.01) {
        return tokensNum.toExponential(2);
      }
      return tokensNum.toLocaleString(undefined, { maximumFractionDigits: 4 });
    } catch {
      return tokens;
    }
  };

  if (loading) {
    return (
      <div className="api-details-page">
        <div className="loading-state">Loading server details...</div>
      </div>
    );
  }

  if (error && !server) {
    return (
      <div className="api-details-page">
        <div className="error-state">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate("/")}>
            Back to Launchpad
          </button>
        </div>
      </div>
    );
  }

  if (!server) {
    return null;
  }

  return (
    <div className="api-details-page">
      <button className="back-button" onClick={() => navigate("/")}>
        ← Back to Launchpad
      </button>

      <div className="api-header">
        <div className="api-title-section">
          <h1>🖥️ {server.name}</h1>
          <span className="api-symbol-badge">{server.symbol}</span>
        </div>
        {selectedApi && (
          <div className="api-pricing">
            <div className="price-badge">
              <span className="price-label">Selected API Price</span>
              <span className="price-value">{formatFee(selectedApi.fee)}</span>
            </div>
            {metrics?.apisWithTokenAmounts && (() => {
              const apiWithTokens = metrics.apisWithTokenAmounts.find(a => a.slug === selectedApi.slug);
              const tokenAmount = apiWithTokens?.tokensPerCall ? formatTokenAmount(apiWithTokens.tokensPerCall) : null;
              if (tokenAmount) {
                return (
                  <div className="price-badge" style={{ marginTop: '10px', backgroundColor: '#10b981', color: 'white' }}>
                    <span className="price-label">Incentive per call</span>
                    <span className="price-value" style={{ fontWeight: 'bold' }}>{tokenAmount} {server.symbol}</span>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        )}
      </div>

      <div className="api-info-section">
        {/* Metrics Section */}
        {metrics && (
          <div className="info-card metrics-card">
            <h3>📊 Metrics & Insights</h3>
            <p className="metrics-note">📈 Metrics calculated from last 100 API calls</p>
            {metrics.server && (
              <div className="metrics-grid">
                <div className="metric-item">
                  <span className="metric-label">Total API Calls</span>
                  <span className="metric-value">{parseInt(metrics.server.totalCalls || "0").toLocaleString()}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Total USDC Paid</span>
                  <span className="metric-value">${metrics.server.totalRevenueUSD.toFixed(2)}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Average Latency</span>
                  <span className="metric-value">{metrics.server.averageLatency.toFixed(0)}ms</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">P95 Latency</span>
                  <span className="metric-value">{metrics.server.p95Latency.toFixed(0)}ms</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Success Rate</span>
                  <span className="metric-value">{metrics.server.successRate.toFixed(1)}%</span>
                </div>
              </div>
            )}
            {metrics.contract && (
              <div className="contract-metrics">
                <h4>🎯 Token Bonding Progress</h4>
                {metrics.contract.error ? (
                  <div className="metrics-error">
                    <strong>⚠️ Error loading contract metrics:</strong>
                    <p>{metrics.contract.error}</p>
                    <p style={{ fontSize: '0.875rem', marginTop: '8px', opacity: 0.8 }}>
                      This usually means the contract address is invalid, the contract doesn't exist, or there's a connection issue.
                      Token address: <code>{metrics.contract.tokenAddress}</code>
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="bonding-progress">
                      <div className="progress-bar-container">
                        <div 
                          className="progress-bar" 
                          style={{ width: `${Math.min(metrics.contract.bondingProgress, 100)}%` }}
                        />
                      </div>
                  <div className="progress-info">
                    <span>
                      {metrics.contract.bondingProgress < 0.01 
                        ? metrics.contract.bondingProgress.toFixed(6) + '%' 
                        : metrics.contract.bondingProgress.toFixed(2) + '%'}
                    </span>
                    <span className="progress-details">
                      {formatBigNumber(metrics.contract.totalTokensDistributed)} / {formatBigNumber(metrics.contract.graduationThreshold)} tokens
                    </span>
                  </div>
                    </div>
                    {metrics.contract.isGraduated && metrics.contract.uniswapLink && (
                      <div className="uniswap-link">
                        <a 
                          href={metrics.contract.uniswapLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          title="View token pool on Uniswap (opens in new tab)"
                        >
                          🔗 View Pool on Uniswap
                        </a>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {metricsLoading && <div className="metrics-loading">Loading metrics...</div>}
          </div>
        )}

        <div className="info-card">
          <h3>📋 Server Information</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Server Slug:</span>
              <span className="info-value slug-value">{server.slug}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Token Address:</span>
              <span className="info-value">{server.id}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Builder Address:</span>
              <span className="info-value">{server.builder}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Payment Token:</span>
              <span className="info-value">{server.paymentToken}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Total Usage:</span>
              <span className="info-value">{server.subscriptionCount || "0"}</span>
            </div>
            <div className="info-item">
              <span className="info-label">APIs Available:</span>
              <span className="info-value">{server.apiCount || server.apis?.length || 0}</span>
            </div>
          </div>
        </div>

        {/* APIs List */}
        {server.apis && server.apis.length > 0 && (
          <div className="info-card">
            <h3>🔌 Available APIs</h3>
            <div className="apis-list">
              {server.apis.map((apiItem) => (
                <div 
                  key={apiItem.slug} 
                  className={`api-item ${selectedApiSlug === apiItem.slug ? 'selected' : ''}`}
                  onClick={() => setSelectedApiSlug(apiItem.slug)}
                >
                  <div className="api-item-header">
                    <span className="api-slug-badge">/{server.slug}/{apiItem.slug}</span>
                    <span className="api-name">{apiItem.name}</span>
                    <span className="api-fee">{formatFee(apiItem.fee)}</span>
                    {selectedApiSlug === apiItem.slug && <span className="selected-badge">✓ Selected</span>}
                  </div>
                  {metrics?.apisWithTokenAmounts && (() => {
                    const apiWithTokens = metrics.apisWithTokenAmounts.find(a => a.slug === apiItem.slug);
                    const tokenAmount = apiWithTokens?.tokensPerCall ? formatTokenAmount(apiWithTokens.tokensPerCall) : null;
                    if (tokenAmount) {
                      return (
                        <div style={{ marginTop: '8px', fontSize: '0.875rem', color: '#4ade80' }}>
                          <strong>Incentive:</strong> {tokenAmount} {server.symbol} per call
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {apiItem.description && (
                    <p className="api-description">{apiItem.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="api-test-section">
        <div className="test-card">
          <h3>🧪 Test API</h3>
          
          {/* Show selected API */}
          {selectedApi && (
            <div className="selected-api-info">
              <p><strong>Selected API:</strong> {selectedApi.name}</p>
              <p><strong>Price:</strong> {formatFee(selectedApi.fee)}</p>
              {metrics?.apisWithTokenAmounts && (() => {
                const apiWithTokens = metrics.apisWithTokenAmounts.find(a => a.slug === selectedApi.slug);
                const tokenAmount = apiWithTokens?.tokensPerCall ? formatTokenAmount(apiWithTokens.tokensPerCall) : null;
                if (tokenAmount) {
                  return <p><strong>Incentive:</strong> <span style={{ color: '#4ade80', fontWeight: 'bold' }}>{tokenAmount} {server.symbol} per call</span></p>;
                }
                return null;
              })()}
              <p className="api-url-preview"><code>/api/{server.slug}/{selectedApi.slug}{queryParams.trim() ? `?${queryParams.trim()}` : ''}</code></p>
              {selectedApi.description && <p className="api-desc">{selectedApi.description}</p>}
            </div>
          )}
          
          <div className="test-form">
            <div className="form-group">
              <label htmlFor="queryParams">Query Parameters (optional)</label>
              <input
                type="text"
                id="queryParams"
                placeholder="e.g., page=1&limit=10"
                value={queryParams}
                onChange={(e) => setQueryParams(e.target.value)}
              />
              <small className="form-hint">Add query string parameters to append to the API URL</small>
            </div>
            <div className="button-group" style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
              <button
                className="btn btn-secondary btn-large"
                onClick={handleTestWithoutPayment}
                disabled={testingWithoutPayment || testing}
              >
                {testingWithoutPayment ? "Loading..." : "🔍 Test Metadata (No Payment)"}
              </button>

              <button
                className="btn btn-primary btn-large"
                onClick={handleTestAPI}
                disabled={testing || isProcessing || !isReady || !selectedApiSlug}
              >
                {testing || isProcessing ? "Signing Transaction..." : `💳 Pay & Test: ${selectedApi?.name || 'Select API'}`}
              </button>
            </div>

            {!isReady && (
              <p className="warning-text">⚠️ Please connect your wallet to test APIs. You'll be prompted to sign the payment transaction.</p>
            )}
          </div>

          {error && (
            <div className="error-box">
              <strong>❌ Error:</strong> {error}
            </div>
          )}

          {metadataResult && (
            <div className="result-box">
              <h4>📋 Server Metadata (No Payment)</h4>
              <div className="result-data">
                <pre>{JSON.stringify(metadataResult, null, 2)}</pre>
              </div>
            </div>
          )}

          {apiResult && (
            <div className="result-box">
              <h4>✅ Paid API Response</h4>
              <div className="result-info">
                <p><strong>Payment Status:</strong> {apiResult.payment?.status || "paid"}</p>
                <p><strong>Fee Paid:</strong> {selectedApi ? formatFee(selectedApi.fee) : 'N/A'}</p>
                <p><strong>API Called:</strong> /{apiResult.proxy?.serverSlug || server.slug}/{apiResult.proxy?.apiSlug || selectedApiSlug}</p>
              </div>
              <div className="result-data">
                <strong>API Data:</strong>
                <pre>{JSON.stringify(apiResult.data, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
