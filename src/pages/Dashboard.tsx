import { useState, useEffect } from "react";
import { useActiveAccount } from "thirdweb/react";
import { parseUnits } from "viem";
import { getAllServers, addApiToServer, ServerEntry } from "../utils/api";
import "./Dashboard.css";

// Validate slug format: lowercase alphanumeric with hyphens, 3-30 chars
function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug);
}

// Generate slug suggestion from name
function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30);
}

export function Dashboard() {
  const account = useActiveAccount();
  const [myServer, setMyServer] = useState<ServerEntry | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Add API form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newApiSlug, setNewApiSlug] = useState("");
  const [newApiName, setNewApiName] = useState("");
  const [newApiUrl, setNewApiUrl] = useState("");
  const [newApiDescription, setNewApiDescription] = useState("");
  const [newApiFee, setNewApiFee] = useState("0.01");
  const [addingApi, setAddingApi] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  useEffect(() => {
    if (account) {
      loadMyServer();
    }
  }, [account]);

  // Auto-generate slug from name (only if not manually edited)
  useEffect(() => {
    if (newApiName && !slugManuallyEdited) {
      setNewApiSlug(generateSlugFromName(newApiName));
    }
  }, [newApiName, slugManuallyEdited]);

  const loadMyServer = async () => {
    try {
      setLoading(true);
      const allServers = await getAllServers();
      // Find the server created by current user (1 builder = 1 server)
      if (account) {
        const userServer = allServers.find(
          (server) => server.builder.toLowerCase() === account.address.toLowerCase()
        );
        setMyServer(userServer || null);
      }
    } catch (error) {
      console.error("Failed to load server:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatFee = (fee: string) => {
    const feeNum = BigInt(fee);
    const usdcAmount = Number(feeNum) / 1e6;
    return `$${usdcAmount.toFixed(2)}`;
  };

  const handleSlugChange = (value: string) => {
    // Force lowercase and remove invalid characters
    const slugValue = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setNewApiSlug(slugValue);
    setSlugManuallyEdited(true); // User manually edited, stop auto-generating
  };

  const handleAddApi = async () => {
    if (!myServer || !account) return;
    
    // Validate slug
    if (!newApiSlug.trim()) {
      setAddError("API slug is required");
      return;
    }
    if (!isValidSlug(newApiSlug)) {
      setAddError("API slug must be 3-30 characters, lowercase alphanumeric with hyphens");
      return;
    }
    // Check for duplicate slug
    if (myServer.apis?.some(api => api.slug === newApiSlug)) {
      setAddError(`API slug "${newApiSlug}" already exists. Choose a different slug.`);
      return;
    }
    
    // Validate name
    if (!newApiName.trim()) {
      setAddError("API name is required");
      return;
    }
    // Validate URL
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
    // Validate description
    if (!newApiDescription.trim()) {
      setAddError("Description is required");
      return;
    }
    // Validate fee
    const feeNum = parseFloat(newApiFee);
    if (isNaN(feeNum) || feeNum <= 0) {
      setAddError("Fee must be a positive number");
      return;
    }

    setAddingApi(true);
    setAddError(null);
    setAddSuccess(false);

    try {
      const result = await addApiToServer({
        serverSlug: myServer.slug,
        slug: newApiSlug.toLowerCase().trim(),
        name: newApiName.trim(),
        apiUrl: newApiUrl.trim(),
        description: newApiDescription.trim(),
        fee: parseUnits(newApiFee, 6).toString(), // Convert to smallest unit (6 decimals for USDC)
        builder: account.address,
      });

      if (result.success) {
        setAddSuccess(true);
        setNewApiSlug("");
        setNewApiName("");
        setNewApiUrl("");
        setNewApiDescription("");
        setNewApiFee("0.01"); // Reset to default
        setSlugManuallyEdited(false); // Reset for next API
        setShowAddForm(false);
        // Reload server data
        await loadMyServer();
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
          ) : !myServer ? (
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
                  <h3>{myServer.name}</h3>
                  <span className="token-symbol">{myServer.symbol}</span>
                </div>
                <div className="server-slug-display">/{myServer.slug}</div>
                <div className="token-stats">
                  <div className="stat">
                    <span className="stat-value">{myServer.subscriptionCount || "0"}</span>
                    <span className="stat-label">total usage</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{myServer.apiCount || myServer.apis?.length || 0}</span>
                    <span className="stat-label">APIs</span>
                  </div>
                </div>
              </div>
              <div className="token-address">
                <span className="label">Token Address:</span>
                <code>{myServer.id}</code>
              </div>
            </div>
          )}
        </div>

        {/* APIs Section */}
        {myServer && (
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
                  <label>API Slug *</label>
                  <input
                    type="text"
                    value={newApiSlug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="pool-snapshot"
                    className="input"
                    maxLength={30}
                  />
                  <small>
                    URL: <code>/api/{myServer.slug}/{newApiSlug || "api-slug"}</code>
                  </small>
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
                  <small>Your backend endpoint (kept private)</small>
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
                <div className="form-group">
                  <label>Fee (USDC) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={newApiFee}
                    onChange={(e) => setNewApiFee(e.target.value)}
                    placeholder="0.01"
                    className="input"
                    required
                  />
                  <small>Amount users pay per call to this API (in USDC)</small>
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
              {myServer.apis && myServer.apis.length > 0 ? (
                myServer.apis.map((api) => (
                  <div key={api.slug} className="api-card">
                    <div className="api-card-header">
                      <code className="api-slug-badge">/{myServer.slug}/{api.slug}</code>
                      <h4>{api.name}</h4>
                      <span className="api-fee-badge">{formatFee(api.fee)}</span>
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
