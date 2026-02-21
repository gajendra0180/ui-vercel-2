import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveAccount } from "thirdweb/react";
import { parseUnits } from "viem";
import { getAllServers, getServersByChain, addApiToServer, ServerEntry } from "../utils/api";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";
import { useChainContext } from "../contexts/ChainContext";
import { useX402Payment } from "../hooks/useX402Payment";
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
  const navigate = useNavigate();
  const account = useActiveAccount();
  const { selectedChainId, getChainConfig } = useChainContext();
  const { getSolanaAddress } = useX402Payment();

  // Multi-server state
  const [myServers, setMyServers] = useState<ServerEntry[]>([]);
  const [selectedServerIndex, setSelectedServerIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Derived: currently selected server
  const selectedServer = myServers[selectedServerIndex] || null;

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
    const solanaAddr = getSolanaAddress();
    if (account || solanaAddr) {
      loadMyServers();
    }
  }, [account, selectedChainId]);

  // Auto-generate slug from name (only if not manually edited)
  useEffect(() => {
    if (newApiName && !slugManuallyEdited) {
      setNewApiSlug(generateSlugFromName(newApiName));
    }
  }, [newApiName, slugManuallyEdited]);

  const loadMyServers = async () => {
    try {
      setLoading(true);
      // Use chain-filtered endpoint if a chain is selected
      const allServers = selectedChainId
        ? await getServersByChain(selectedChainId)
        : await getAllServers();

      console.log(`[Dashboard] Chain: ${selectedChainId}, Total servers fetched: ${allServers.length}`);
      console.log(`[Dashboard] Servers:`, allServers);

      // Determine the current chain config to check if it's Solana
      const currentChainConfig = selectedChainId ? getChainConfig(selectedChainId) : null;
      const isSolanaChain = currentChainConfig?.chainType === 'solana';

      // Get the appropriate user address based on chain type
      const userAddress = isSolanaChain ? getSolanaAddress() : account?.address;

      console.log(`[Dashboard] Chain type: ${currentChainConfig?.chainType}, User address: ${userAddress}`);

      // Filter all servers created by current user
      if (userAddress) {
        console.log(`[Dashboard] Filtering for user: ${userAddress}`);
        const userServers = allServers.filter(
          (server) => {
            // For EVM addresses, compare case-insensitively
            // For Solana addresses, compare case-sensitively (base58 is case-sensitive)
            const isEvmAddress = server.builder.startsWith('0x');
            const match = isEvmAddress
              ? server.builder.toLowerCase() === userAddress.toLowerCase()
              : server.builder === userAddress;
            console.log(`[Dashboard] Server ${server.slug} builder: ${server.builder}, userAddress: ${userAddress}, isEvm: ${isEvmAddress}, match: ${match}`);
            return match;
          }
        );
        console.log(`[Dashboard] User servers found: ${userServers.length}`);
        setMyServers(userServers);
        // Reset selection if current index is out of bounds
        if (selectedServerIndex >= userServers.length) {
          setSelectedServerIndex(0);
        }
      } else {
        // No wallet connected for this chain
        console.log(`[Dashboard] No wallet address available for chain ${selectedChainId}`);
        setMyServers([]);
      }
    } catch (error) {
      console.error("Failed to load servers:", error);
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
    if (!selectedServer || !account) return;

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
    if (selectedServer.apis?.some(api => api.slug === newApiSlug)) {
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
        serverSlug: selectedServer.slug,
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
        await loadMyServers();
      } else {
        setAddError(result.error || "Failed to add API");
      }
    } catch (error: unknown) {
      setAddError(error.message || "Failed to add API");
    } finally {
      setAddingApi(false);
    }
  };

  // Check if user has appropriate wallet connected for selected chain
  const currentChainConfig = selectedChainId ? getChainConfig(selectedChainId) : null;
  const isSolanaChain = currentChainConfig?.chainType === 'solana';
  const userAddress = isSolanaChain ? getSolanaAddress() : account?.address;

  if (!userAddress) {
    return (
      <div className="dashboard-page">
        <div className="connect-prompt">
          <h2>👋 Connect Your Wallet</h2>
          <p>Please connect your {isSolanaChain ? 'Solana' : 'EVM'} wallet to view your dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>🖥️ Server Dashboard</h1>
        <p>Manage your servers and APIs</p>
      </div>

      <div className="dashboard-content">
        {/* Server Section */}
        <div className="dashboard-section">
          <h2>🖥️ My Servers</h2>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
              <Spinner size="large" label="Loading your servers..." />
            </div>
          ) : myServers.length === 0 ? (
            <EmptyState
              icon="🖥️"
              title="No Servers Registered"
              description="Create your API marketplace presence by registering a server. This will enable you to monetize your APIs through pay-per-call endpoints."
              actionButton={{
                label: "🚀 Register Server",
                variant: "primary",
                onClick: () => navigate("/submit")
              }}
            />
          ) : (
            <>
              {/* Server Selector Tabs */}
              <div className="server-selector">
                {myServers.map((server, index) => (
                  <button
                    key={server.id}
                    className={`server-tab ${index === selectedServerIndex ? 'server-tab--active' : ''}`}
                    onClick={() => {
                      setSelectedServerIndex(index);
                      setShowAddForm(false); // Close form when switching servers
                    }}
                  >
                    <span className="server-tab__name">{server.name}</span>
                    <span className="server-tab__slug">/{server.slug}</span>
                  </button>
                ))}
                <button
                  className="server-tab server-tab--add"
                  onClick={() => navigate("/submit")}
                >
                  + New Server
                </button>
              </div>

              {/* Selected Server Card */}
              {selectedServer && (
                <div className="token-card">
                  <div className="token-header">
                    <div className="token-title">
                      <h3>{selectedServer.name}</h3>
                      <span className="token-symbol">{selectedServer.symbol}</span>
                    </div>
                    <div className="server-slug-display">/{selectedServer.slug}</div>
                    <div className="token-stats">
                      <div className="stat">
                        <span className="stat-value">{selectedServer.subscriptionCount || "0"}</span>
                        <span className="stat-label">total usage</span>
                      </div>
                      <div className="stat">
                        <span className="stat-value">{selectedServer.apiCount || selectedServer.apis?.length || 0}</span>
                        <span className="stat-label">APIs</span>
                      </div>
                    </div>
                  </div>
                  <div className="token-address">
                    <span className="label">Token Address:</span>
                    <code>{selectedServer.id}</code>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* APIs Section */}
        {selectedServer && (
          <div className="dashboard-section">
            <div className="section-header">
              <h2>🔌 APIs for {selectedServer.name}</h2>
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
                <h3>Add New API to {selectedServer.name}</h3>
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
                    URL: <code>/api/{selectedServer.slug}/{newApiSlug || "api-slug"}</code>
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
              {selectedServer.apis && selectedServer.apis.length > 0 ? (
                selectedServer.apis.map((api) => (
                  <div key={api.slug} className="api-card">
                    <div className="api-card-header">
                      <code className="api-slug-badge">/{selectedServer.slug}/{api.slug}</code>
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
                <EmptyState
                  icon="🔌"
                  title="No APIs Added Yet"
                  description="Start monetizing your services by adding APIs to this server. Each API will receive a unique pay-per-call endpoint."
                  actionButton={{
                    label: "➕ Add Your First API",
                    variant: "primary",
                    onClick: () => setShowAddForm(true)
                  }}
                />
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
              <span className="info-value">{userAddress}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Network:</span>
              <span className="info-value">
                {selectedChainId ? (getChainConfig(selectedChainId)?.name || selectedChainId) : "Not selected"}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Servers:</span>
              <span className="info-value">{myServers.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
