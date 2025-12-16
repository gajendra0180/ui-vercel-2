import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { IAOTokenEntry, getAPIByAddress } from "../utils/api";
import { useX402Payment } from "../hooks/useX402Payment";
// @ts-ignore - Vite env variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
import "./APIDetailsPage.css";

export function APIDetailsPage() {
  const { address } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const { callAPIWithPayment, isProcessing, isReady, account } = useX402Payment();

  const [api, setApi] = useState<IAOTokenEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testingWithoutPayment, setTestingWithoutPayment] = useState(false);
  const [apiResult, setApiResult] = useState<any>(null);
  const [metadataResult, setMetadataResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [queryParams, setQueryParams] = useState("");
  const [selectedApiIndex, setSelectedApiIndex] = useState<number>(0); // Selected API index

  useEffect(() => {
    if (address) {
      loadAPIDetails();
    }
  }, [address]);

  const loadAPIDetails = async () => {
    if (!address) return;
    try {
      setLoading(true);
      const apiData = await getAPIByAddress(address);
      if (!apiData) {
        setError("API not found");
      } else {
        setApi(apiData);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load API details");
    } finally {
      setLoading(false);
    }
  };

  const handleTestWithoutPayment = async () => {
    if (!address) {
      setError("No address provided");
      return;
    }

    setTestingWithoutPayment(true);
    setError(null);
    setMetadataResult(null);

    try {
      // Use getAPIByAddress to fetch token metadata (no payment required)
      const apiData = await getAPIByAddress(address);
      if (apiData) {
        setMetadataResult({ token: apiData });
        setError(null);
      } else {
        throw new Error("API not found");
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch API metadata");
      console.error("API test error:", err);
    } finally {
      setTestingWithoutPayment(false);
    }
  };

  const handleTestAPI = async () => {
    if (!address || !api) {
      setError("API not loaded");
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
      // Build URL with query parameters and API index
      const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
      // Use /api/:address/:index format to specify which API to call
      let url = `${baseUrl}/api/${address}/${selectedApiIndex}`;

      // Add query parameters if provided
      if (queryParams.trim()) {
        // Parse query params string (e.g., "key=value&key2=value2")
        const params = new URLSearchParams(queryParams);
        url += `?${params.toString()}`;
      }

      // Convert subscription fee to bigint
      const subscriptionFee = BigInt(api.subscriptionFee);
      
      // Call API with payment - user will be prompted to sign
      const data = await callAPIWithPayment(
        url,
        subscriptionFee,
        api.id // receiver address (token address)
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
  const selectedApi = api?.apis?.[selectedApiIndex] || null;

  const formatFee = (fee: string) => {
    const feeNum = BigInt(fee);
    const usdcAmount = Number(feeNum) / 1e6;
    return `$${usdcAmount.toFixed(2)}`;
  };


  if (loading) {
    return (
      <div className="api-details-page">
        <div className="loading-state">Loading API details...</div>
      </div>
    );
  }

  if (error && !api) {
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

  if (!api) {
    return null;
  }

  return (
    <div className="api-details-page">
      <button className="back-button" onClick={() => navigate("/")}>
        ← Back to Launchpad
      </button>

      <div className="api-header">
        <div className="api-title-section">
          <h1>🌐 {api.name}</h1>
          <span className="api-symbol-badge">{api.symbol}</span>
        </div>
        <div className="api-pricing">
          <div className="price-badge">
            <span className="price-label">Price</span>
            <span className="price-value">{formatFee(api.subscriptionFee)}</span>
          </div>
        </div>
      </div>

      <div className="api-info-section">
        <div className="info-card">
          <h3>📋 Builder Information</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Token Address:</span>
              <span className="info-value">{api.id}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Builder Address:</span>
              <span className="info-value">{api.builder}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Payment Token:</span>
              <span className="info-value">{api.paymentToken}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Total Usage:</span>
              <span className="info-value">{api.subscriptionCount || "0"}</span>
            </div>
            <div className="info-item">
              <span className="info-label">APIs Available:</span>
              <span className="info-value">{api.apiCount || api.apis?.length || 1}</span>
            </div>
          </div>
        </div>

        {/* APIs List */}
        {api.apis && api.apis.length > 0 && (
          <div className="info-card">
            <h3>🔌 Available APIs</h3>
            <div className="apis-list">
              {api.apis.map((apiItem) => (
                <div 
                  key={apiItem.index} 
                  className={`api-item ${selectedApiIndex === apiItem.index ? 'selected' : ''}`}
                  onClick={() => setSelectedApiIndex(apiItem.index)}
                >
                  <div className="api-item-header">
                    <span className="api-index">#{apiItem.index}</span>
                    <span className="api-name">{apiItem.name}</span>
                    {selectedApiIndex === apiItem.index && <span className="selected-badge">✓ Selected</span>}
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
              <p><strong>Selected API:</strong> #{selectedApi.index} - {selectedApi.name}</p>
              {selectedApi.description && <p className="api-desc">{selectedApi.description}</p>}
            </div>
          )}
          
          <p className="test-description">
            Enter query parameters (e.g., "key=value&key2=value2") or leave empty for default request
          </p>

          <div className="test-form">
            <div className="form-group">
              <label htmlFor="queryParams">Query Parameters (optional):</label>
              <input
                id="queryParams"
                type="text"
                value={queryParams}
                onChange={(e) => setQueryParams(e.target.value)}
                placeholder="key=value&key2=value2"
                className="input"
                disabled={testing || testingWithoutPayment}
              />
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
                disabled={testing || isProcessing || !isReady}
              >
                {testing || isProcessing ? "Signing Transaction..." : `💳 Pay & Test API #${selectedApiIndex}`}
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
              <h4>📋 Token Metadata (No Payment)</h4>
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
                <p><strong>Subscription Fee:</strong> {apiResult.payment?.subscriptionFee || api.subscriptionFee}</p>
                <p><strong>API Called:</strong> #{apiResult.proxy?.apiIndex ?? selectedApiIndex} - {apiResult.proxy?.apiName || selectedApi?.name || "API"}</p>
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

