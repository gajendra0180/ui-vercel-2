import { useState, useEffect } from "react";
import { useActiveAccount } from "thirdweb/react";
import { getAllAPIs, addApiToToken, IAOTokenEntry, ApiEntry } from "../utils/api";
import "./Dashboard.css";

// @ts-ignore - Vite env variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export function Dashboard() {
  const account = useActiveAccount();
  const [myToken, setMyToken] = useState<IAOTokenEntry | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Add API form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newApiName, setNewApiName] = useState("");
  const [newApiUrl, setNewApiUrl] = useState("");
  const [newApiDescription, setNewApiDescription] = useState("");
  const [addingApi, setAddingApi] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);

  useEffect(() => {
    if (account) {
      loadMyToken();
    }
  }, [account]);

  const loadMyToken = async () => {
    try {
      setLoading(true);
      const allAPIs = await getAllAPIs();
      // Find the token created by current user (1 builder = 1 token)
      if (account) {
        const userToken = allAPIs.find(
          (api) => api.builder.toLowerCase() === account.address.toLowerCase()
        );
        setMyToken(userToken || null);
      }
    } catch (error) {
      console.error("Failed to load token:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatFee = (fee: string) => {
    const feeNum = BigInt(fee);
    const usdcAmount = Number(feeNum) / 1e6;
    return `$${usdcAmount.toFixed(2)}`;
  };

  const handleAddApi = async () => {
    if (!myToken || !account) return;
    
    // Validate
    if (!newApiName.trim()) {
      setAddError("API name is required");
      return;
    }
    if (!newApiUrl.trim()) {
      setAddError("API URL is required");
      return;
    }
    try {
      new URL(newApiUrl);
    } catch {
      setAddError("Invalid API URL");
      return;
    }
    if (!newApiDescription.trim()) {
      setAddError("Description is required");
      return;
    }

    setAddingApi(true);
    setAddError(null);
    setAddSuccess(false);

    try {
      const result = await addApiToToken({
        tokenAddress: myToken.id,
        name: newApiName.trim(),
        apiUrl: newApiUrl.trim(),
        description: newApiDescription.trim(),
        builder: account.address,
      });

      if (result.success) {
        setAddSuccess(true);
        setNewApiName("");
        setNewApiUrl("");
        setNewApiDescription("");
        setShowAddForm(false);
        // Reload token data
        await loadMyToken();
      } else {
        setAddError(result.error || "Failed to add API");
      }
    } catch (error: any) {
      setAddError(error.message || "Failed to add API");
    } finally {
      setAddingApi(false);
    }
  };

  if (!account) {
    return (
      <div className="dashboard-page">
        <div className="connect-prompt">
          <h2>👋 Connect Your Wallet</h2>
          <p>Please connect your wallet to view your dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>🖥️ Server Dashboard</h1>
        <p>Manage your server and APIs</p>
      </div>

      <div className="dashboard-content">
        {/* Server Section */}
        <div className="dashboard-section">
          <h2>🖥️ My Server</h2>
          {loading ? (
            <div className="loading-state">Loading your server...</div>
          ) : !myToken ? (
            <div className="empty-state">
              <p>You haven't registered a server yet.</p>
              <a href="/submit" className="btn btn-primary">
                Register Your Server
              </a>
            </div>
          ) : (
            <div className="token-card">
              <div className="token-header">
                <div className="token-title">
                  <h3>{myToken.name}</h3>
                  <span className="token-symbol">{myToken.symbol}</span>
                </div>
                <div className="token-stats">
                  <div className="stat">
                    <span className="stat-value">{formatFee(myToken.subscriptionFee)}</span>
                    <span className="stat-label">per call</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{myToken.subscriptionCount || "0"}</span>
                    <span className="stat-label">total usage</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{myToken.apiCount || myToken.apis?.length || 1}</span>
                    <span className="stat-label">APIs</span>
                  </div>
                </div>
              </div>
              <div className="token-address">
                <span className="label">Server Address:</span>
                <code>{myToken.id}</code>
              </div>
            </div>
          )}
        </div>

        {/* APIs Section */}
        {myToken && (
          <div className="dashboard-section">
            <div className="section-header">
              <h2>🔌 My APIs</h2>
              <button 
                className="btn btn-primary"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                {showAddForm ? "✕ Cancel" : "➕ Add API"}
              </button>
            </div>

            {/* Add API Form */}
            {showAddForm && (
              <div className="add-api-form">
                <h3>Add New API</h3>
                <div className="form-group">
                  <label>API Name *</label>
                  <input
                    type="text"
                    value={newApiName}
                    onChange={(e) => setNewApiName(e.target.value)}
                    placeholder="Pool Snapshot API"
                    className="input"
                  />
                </div>
                <div className="form-group">
                  <label>API Endpoint URL *</label>
                  <input
                    type="url"
                    value={newApiUrl}
                    onChange={(e) => setNewApiUrl(e.target.value)}
                    placeholder="https://api.example.com/endpoint"
                    className="input"
                  />
                </div>
                <div className="form-group">
                  <label>Description *</label>
                  <textarea
                    value={newApiDescription}
                    onChange={(e) => setNewApiDescription(e.target.value)}
                    placeholder="Describe what this API does..."
                    rows={2}
                    className="input textarea"
                  />
                </div>
                {addError && <div className="error-box">❌ {addError}</div>}
                {addSuccess && <div className="success-box">✅ API added successfully!</div>}
                <button 
                  className="btn btn-primary"
                  onClick={handleAddApi}
                  disabled={addingApi}
                >
                  {addingApi ? "Adding..." : "Add API"}
                </button>
              </div>
            )}

            {/* APIs List */}
            <div className="apis-list">
              {myToken.apis && myToken.apis.length > 0 ? (
                myToken.apis.map((api) => (
                  <div key={api.index} className="api-card">
                    <div className="api-card-header">
                      <span className="api-index">#{api.index}</span>
                      <h4>{api.name}</h4>
                    </div>
                    {api.description && (
                      <p className="api-description">{api.description}</p>
                    )}
                    <div className="api-meta">
                      <span>Added: {new Date(api.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="no-apis">No APIs registered yet. Click "Add API" to get started.</p>
              )}
            </div>
          </div>
        )}

        {/* Wallet Info */}
        <div className="dashboard-section">
          <h2>💰 Wallet Info</h2>
          <div className="wallet-info-card">
            <div className="info-row">
              <span className="info-label">Address:</span>
              <span className="info-value">{account.address}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Network:</span>
              <span className="info-value">Base Sepolia</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

