import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ServerEntry, getServerBySlug, buildProxyUrl } from "../utils/api";
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

  useEffect(() => {
    if (serverSlug) {
      loadServerDetails();
    }
  }, [serverSlug]);

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

      // Convert subscription fee to bigint
      const subscriptionFee = BigInt(server.subscriptionFee);
      
      // Call API with payment - user will be prompted to sign
      const data = await callAPIWithPayment(
        url,
        subscriptionFee,
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
        <div className="api-pricing">
          <div className="price-badge">
            <span className="price-label">Price per call</span>
            <span className="price-value">{formatFee(server.subscriptionFee)}</span>
          </div>
        </div>
      </div>

      <div className="api-info-section">
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
                    {selectedApiSlug === apiItem.slug && <span className="selected-badge">✓ Selected</span>}
                  </div>
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
                <p><strong>Subscription Fee:</strong> {apiResult.payment?.subscriptionFee || server.subscriptionFee}</p>
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
