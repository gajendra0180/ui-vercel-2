import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveAccount, useActiveWalletChain, useSendTransaction } from "thirdweb/react";
import { getContract, prepareContractCall, readContract } from "thirdweb";
import { baseSepolia } from "thirdweb/chains";
import { parseUnits, parseEventLogs, createPublicClient, http } from "viem";
import { baseSepolia as baseSepoliaViem } from "viem/chains";
import { TOKEN_FACTORY_ADDRESS, TOKEN_FACTORY_ABI } from "../contracts/tokenFactory";
import { USDC_ADDRESS } from "../constants/addresses";
import { thirdwebClient } from "../lib/thirdwebClient";
import { getAllServers, ServerEntry, checkServerSlugExists } from "../utils/api";
import "./SubmitAPIForm.css";

// @ts-ignore - Vite env variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

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

export function SubmitAPIForm() {
  const navigate = useNavigate();
  const account = useActiveAccount();
  const chain = useActiveWalletChain();
  const { mutate: sendTransaction, isPending: isTransactionPending } = useSendTransaction();
  
  // Check if builder already has a server
  const [existingServer, setExistingServer] = useState<ServerEntry | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);
  
  // Check if builder already has a registered server
  useEffect(() => {
    const checkExistingServer = async () => {
      if (!account) {
        setCheckingExisting(false);
        return;
      }
      
      try {
        setCheckingExisting(true);
        const allServers = await getAllServers();
        const builderServer = allServers.find(
          (server) => server.builder.toLowerCase() === account.address.toLowerCase()
        );
        setExistingServer(builderServer || null);
      } catch (error) {
        console.error("Error checking existing server:", error);
      } finally {
        setCheckingExisting(false);
      }
    };
    
    checkExistingServer();
  }, [account]);

  // API entry for the form
  interface FormApiEntry {
    slug: string;
    name: string;
    apiUrl: string;
    description: string;
    slugManuallyEdited?: boolean; // Track if user manually edited the slug
  }

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    symbol: "",
    subscriptionFee: "",
  });

  // Support multiple APIs
  const [apis, setApis] = useState<FormApiEntry[]>([
    { slug: "", name: "", apiUrl: "", description: "", slugManuallyEdited: false }
  ]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [serverSlugManuallyEdited, setServerSlugManuallyEdited] = useState(false);

  // Auto-generate server slug from name (only if not manually edited)
  useEffect(() => {
    if (formData.name && !serverSlugManuallyEdited) {
      setFormData(prev => ({ ...prev, slug: generateSlugFromName(formData.name) }));
    }
  }, [formData.name, serverSlugManuallyEdited]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Handle slug field specially - lowercase and validate
    if (name === "slug") {
      const slugValue = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      setFormData((prev) => ({ ...prev, [name]: slugValue }));
      setServerSlugManuallyEdited(true); // User manually edited, stop auto-generating
      setSlugError(null);
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    setError(null);
  };

  const handleApiChange = (index: number, field: keyof FormApiEntry, value: string) => {
    const newApis = [...apis];
    
    // Handle slug field specially - lowercase and validate
    if (field === "slug") {
      const slugValue = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      newApis[index] = { ...newApis[index], slug: slugValue, slugManuallyEdited: true };
    } else if (field === "name") {
      newApis[index] = { ...newApis[index], name: value };
      // Auto-generate slug from name if user hasn't manually edited the slug
      if (!newApis[index].slugManuallyEdited) {
        newApis[index].slug = generateSlugFromName(value);
      }
    } else {
      newApis[index] = { ...newApis[index], [field]: value };
    }
    
    setApis(newApis);
    setError(null);
  };

  const addApi = () => {
    setApis([...apis, { slug: "", name: "", apiUrl: "", description: "", slugManuallyEdited: false }]);
  };

  const removeApi = (index: number) => {
    if (apis.length > 1) {
      setApis(apis.filter((_, i) => i !== index));
    }
  };

  const validateForm = async (): Promise<boolean> => {
    if (!formData.name.trim()) {
      setError("Server name is required");
      return false;
    }
    if (!formData.slug.trim()) {
      setError("Server slug is required");
      return false;
    }
    if (!isValidSlug(formData.slug)) {
      setError("Server slug must be 3-30 characters, lowercase alphanumeric with hyphens, starting and ending with alphanumeric");
      return false;
    }
    
    // Check if server slug already exists
    const slugExists = await checkServerSlugExists(formData.slug);
    if (slugExists) {
      setError(`Server slug "${formData.slug}" is already taken. Please choose a different slug.`);
      return false;
    }
    
    if (!formData.symbol.trim()) {
      setError("Server symbol is required");
      return false;
    }
    if (!formData.subscriptionFee || parseFloat(formData.subscriptionFee) <= 0) {
      setError("Subscription fee must be greater than 0");
      return false;
    }
    
    // Validate all APIs
    const apiSlugs = new Set<string>();
    for (let i = 0; i < apis.length; i++) {
      const api = apis[i];
      if (!api.slug.trim()) {
        setError(`API #${i + 1}: Slug is required`);
        return false;
      }
      if (!isValidSlug(api.slug)) {
        setError(`API #${i + 1}: Slug must be 3-30 characters, lowercase alphanumeric with hyphens`);
        return false;
      }
      if (apiSlugs.has(api.slug)) {
        setError(`API #${i + 1}: Duplicate slug "${api.slug}". Each API must have a unique slug.`);
        return false;
      }
      apiSlugs.add(api.slug);
      
      if (!api.name.trim()) {
        setError(`API #${i + 1}: Name is required`);
        return false;
      }
      if (!api.apiUrl.trim()) {
        setError(`API #${i + 1}: Endpoint URL is required`);
        return false;
      }
      try {
        new URL(api.apiUrl);
      } catch {
        setError(`API #${i + 1}: Invalid endpoint URL`);
        return false;
      }
      if (!api.description.trim()) {
        setError(`API #${i + 1}: Description is required`);
        return false;
      }
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!account) {
      setError("Please connect your wallet first");
      return;
    }

    const isValid = await validateForm();
    if (!isValid) {
      return;
    }

    if (!chain || chain.id !== baseSepolia.id) {
      setError("Please switch your wallet to Base Sepolia testnet before submitting.");
      return;
    }

    try {
      setError(null);
      setSuccess(false);

      // Convert subscription fee to smallest unit (USDC has 6 decimals)
      const subscriptionFeeWei = parseUnits(formData.subscriptionFee, 6);

      // Validate subscription fee is not zero
      if (subscriptionFeeWei === 0n) {
        setError("Subscription fee cannot be zero");
        return;
      }

      // Note: Contract only supports single apiURL, we use the first API's URL
      const primaryApiUrl = apis[0].apiUrl;
      
      console.log("📝 Preparing transaction with params:", {
        name: formData.name,
        slug: formData.slug,
        symbol: formData.symbol,
        apiURL: primaryApiUrl,
        builder: account.address,
        paymentToken: USDC_ADDRESS,
        subscriptionFee: subscriptionFeeWei.toString(),
        totalApis: apis.length,
      });

      const tokenFactoryContract = getContract({
        client: thirdwebClient,
        chain: baseSepolia,
        address: TOKEN_FACTORY_ADDRESS,
        abi: TOKEN_FACTORY_ABI,
      });

      // Pre-check: Verify contract is not paused and subscription fee is within limits
      try {
        console.log("🔍 Checking contract state...");
        const [isPaused, maxSubscriptionFee] = await Promise.all([
          readContract({
            contract: tokenFactoryContract,
            method: "paused",
            params: [],
          }),
          readContract({
            contract: tokenFactoryContract,
            method: "maxSubscriptionFee",
            params: [],
          }),
        ]);

        console.log("Contract state:", { isPaused, maxSubscriptionFee: maxSubscriptionFee.toString() });

        if (isPaused) {
          setError("Contract is currently paused. Token creation is disabled.");
          return;
        }

        if (subscriptionFeeWei > maxSubscriptionFee) {
          setError(
            `Subscription fee (${formData.subscriptionFee} USDC) exceeds maximum allowed (${Number(maxSubscriptionFee) / 1e6} USDC)`
          );
          return;
        }
      } catch (checkError: any) {
        console.warn("⚠️ Could not check contract state:", checkError);
      }

      // Prepare contract call
      const transaction = prepareContractCall({
        contract: tokenFactoryContract,
        method: "createToken",
        params: [
          {
            name: formData.name.trim(),
            symbol: formData.symbol.trim(),
            apiURL: primaryApiUrl.trim(),
            builder: account.address,
            paymentToken: USDC_ADDRESS,
            subscriptionFee: subscriptionFeeWei,
          },
        ],
      });

      console.log("✅ Transaction prepared, sending...");

      // Send transaction
      sendTransaction(transaction, {
        onSuccess: async (result) => {
          setTxHash(result.transactionHash);
          
          try {
            // Wait for transaction receipt to get the token address from the event
            const publicClient = createPublicClient({
              chain: baseSepoliaViem,
              transport: http(),
            });

            // Poll for transaction receipt
            let receipt = null;
            let attempts = 0;
            const maxAttempts = 30;
            
            while (!receipt && attempts < maxAttempts) {
              try {
                receipt = await publicClient.waitForTransactionReceipt({
                  hash: result.transactionHash as `0x${string}`,
                });
                break;
              } catch (error: any) {
                if (error?.message?.includes("not found") || error?.message?.includes("not yet")) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  attempts++;
                } else {
                  throw error;
                }
              }
            }

            if (!receipt) {
              throw new Error("Transaction receipt not found after waiting");
            }

            // Parse TokenCreated event to get the token address
            const tokenCreatedEvent = parseEventLogs({
              abi: TOKEN_FACTORY_ABI,
              eventName: "TokenCreated",
              logs: receipt.logs,
            });

            if (!tokenCreatedEvent || tokenCreatedEvent.length === 0) {
              throw new Error("TokenCreated event not found in transaction receipt");
            }

            const tokenAddress = tokenCreatedEvent[0].args.token as string;
            
            if (!tokenAddress) {
              throw new Error("Token address not found in TokenCreated event");
            }

            setSuccess(true);

            // Register the server with the backend API (with all APIs and slugs)
            try {
              const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
              
              // Format APIs for backend with slugs
              const formattedApis = apis.map(api => ({
                slug: api.slug.toLowerCase().trim(),
                name: api.name.trim(),
                apiUrl: api.apiUrl.trim(),
                description: api.description.trim(),
              }));
              
              // Build registration payload with slugs
              const registerPayload = {
                tokenAddress: tokenAddress.toLowerCase(),
                slug: formData.slug.toLowerCase().trim(),
                name: formData.name.trim(),
                symbol: formData.symbol.trim(),
                apis: formattedApis,
                builder: account.address.toLowerCase(),
                paymentToken: USDC_ADDRESS.toLowerCase(),
                subscriptionFee: subscriptionFeeWei.toString(),
              };
              
              console.log("📝 Registering server with backend:", registerPayload);
              
              const registerResponse = await fetch(`${baseUrl}/api/register`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(registerPayload),
              });

              if (registerResponse.ok) {
                const result = await registerResponse.json();
                console.log(`✅ Server registered successfully with backend (${formattedApis.length} APIs)`, result);
              } else {
                let errorMessage = "Unknown error";
                try {
                  const errorJson = await registerResponse.json();
                  errorMessage = errorJson.message || errorJson.error || JSON.stringify(errorJson);
                  console.error("⚠️ Failed to register server with backend:", errorJson);
                } catch {
                  errorMessage = await registerResponse.text();
                  console.error("⚠️ Failed to register server with backend:", errorMessage);
                }
                setError(`Transaction succeeded but registration failed: ${errorMessage}`);
              }
            } catch (registerError: any) {
              console.error("⚠️ Error registering server with backend:", registerError);
              setError(`Transaction succeeded but registration failed: ${registerError.message}`);
            }

            // Wait a bit then redirect to discover page
            setTimeout(() => {
              navigate("/");
            }, 3000);
          } catch (receiptError: any) {
            console.error("Error waiting for transaction receipt:", receiptError);
            setError(`Transaction sent but failed to get token address: ${receiptError.message}`);
          }
        },
        onError: (err: any) => {
          console.error("❌ Transaction error:", err);
          console.error("Error details:", JSON.stringify(err, null, 2));
          
          let errorMessage = err.message || "Transaction failed";
          
          if (err.data || err.reason) {
            const revertReason = err.data || err.reason;
            errorMessage = `Transaction reverted: ${revertReason}`;
          }
          
          if (err.message?.includes("execution reverted")) {
            errorMessage = "Transaction reverted. Possible reasons:\n" +
              "- Invalid API URL format\n" +
              "- Name or symbol is empty or invalid\n" +
              "- Subscription fee is too high\n" +
              "- Token with same name/symbol already exists\n" +
              "- Contract is paused\n" +
              "\nCheck console for more details.";
          }
          
          setError(errorMessage);
        },
      });
    } catch (err: any) {
      setError(err.message || "Failed to submit API");
      console.error("Submit error:", err);
    }
  };

  if (!account) {
    return (
      <div className="submit-page">
        <div className="connect-prompt">
          <h2>👋 Connect Your Wallet</h2>
          <p>Please connect your wallet to submit an API</p>
        </div>
      </div>
    );
  }

  // Show loading while checking for existing server
  if (checkingExisting) {
    return (
      <div className="submit-page">
        <div className="connect-prompt">
          <h2>🔍 Checking...</h2>
          <p>Verifying if you already have an active server...</p>
        </div>
      </div>
    );
  }

  // If builder already has a server, show message and redirect to dashboard
  if (existingServer) {
    return (
      <div className="submit-page">
        <div className="existing-token-notice">
          <h2>🖥️ You Already Have an Active Server</h2>
          <p>Each account can only register one server.</p>
          
          <div className="existing-token-info">
            <div className="token-info-row">
              <span className="label">Server Name:</span>
              <span className="value">{existingServer.name}</span>
            </div>
            <div className="token-info-row">
              <span className="label">Server Slug:</span>
              <span className="value">{existingServer.slug}</span>
            </div>
            <div className="token-info-row">
              <span className="label">Symbol:</span>
              <span className="value">{existingServer.symbol}</span>
            </div>
            <div className="token-info-row">
              <span className="label">APIs Registered:</span>
              <span className="value">{existingServer.apiCount || existingServer.apis?.length || 1}</span>
            </div>
          </div>
          
          <p className="info-text">
            Want to add more APIs? Go to your Dashboard to add APIs to your existing server.
          </p>
          
          <div className="action-buttons">
            <button 
              className="btn btn-primary"
              onClick={() => navigate("/dashboard")}
            >
              📊 Go to Dashboard
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => navigate(`/server/${existingServer.slug}`)}
            >
              🔍 View Server Details
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="submit-page">
      <div className="submit-header">
        <h1>🖥️ Register Your Server</h1>
        <p>Create your server and list your APIs on the IAO Launchpad</p>
        <div className="network-warning">
          ⚠️ Requires Base Sepolia. Switch networks in your wallet before submitting.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="submit-form">
        <div className="form-section">
          <h3>Server Information</h3>
          <p className="section-description">
            This creates your server. You can register multiple APIs under this server.
          </p>
          <div className="form-group">
            <label htmlFor="name">Server Name *</label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="My API Server"
              required
              className="input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="slug">Server Slug *</label>
            <input
              id="slug"
              name="slug"
              type="text"
              value={formData.slug}
              onChange={handleInputChange}
              placeholder="my-api-server"
              required
              className="input"
              maxLength={30}
            />
            <small>
              Used in URL: <code>/api/{formData.slug || "your-slug"}/api-name</code>
              <br />
              3-30 chars, lowercase alphanumeric with hyphens
            </small>
            {slugError && <span className="field-error">{slugError}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="symbol">Token Symbol *</label>
            <input
              id="symbol"
              name="symbol"
              type="text"
              value={formData.symbol}
              onChange={handleInputChange}
              placeholder="MYAPI"
              required
              maxLength={10}
              className="input"
            />
          </div>
        </div>

        <div className="form-section">
          <h3>API Endpoints</h3>
          <p className="section-description">
            Register one or more APIs under your server. All APIs share the same subscription fee.
          </p>
          
          {apis.map((api, index) => (
            <div key={index} className="api-entry">
              <div className="api-entry-header">
                <span className="api-number">API #{index + 1}</span>
                {apis.length > 1 && (
                  <button 
                    type="button" 
                    className="btn btn-danger btn-small"
                    onClick={() => removeApi(index)}
                  >
                    ✕ Remove
                  </button>
                )}
              </div>
              
              <div className="form-group">
                <label>API Name *</label>
                <input
                  type="text"
                  value={api.name}
                  onChange={(e) => handleApiChange(index, 'name', e.target.value)}
                  placeholder="Pool Snapshot API"
                  required
                  className="input"
                />
              </div>

              <div className="form-group">
                <label>API Slug *</label>
                <input
                  type="text"
                  value={api.slug}
                  onChange={(e) => handleApiChange(index, 'slug', e.target.value)}
                  placeholder="pool-snapshot"
                  required
                  className="input"
                  maxLength={30}
                />
                <small>
                  URL: <code>/api/{formData.slug || "server"}/{api.slug || "api-slug"}</code>
                </small>
              </div>

              <div className="form-group">
                <label>API Endpoint URL *</label>
                <input
                  type="url"
                  value={api.apiUrl}
                  onChange={(e) => handleApiChange(index, 'apiUrl', e.target.value)}
                  placeholder="https://api.example.com/endpoint"
                  required
                  className="input"
                />
                <small>Your backend endpoint (kept private, never exposed to users)</small>
              </div>

              <div className="form-group">
                <label>Description *</label>
                <textarea
                  value={api.description}
                  onChange={(e) => handleApiChange(index, 'description', e.target.value)}
                  placeholder="Describe what this API does..."
                  rows={2}
                  className="input textarea"
                  required
                />
              </div>
            </div>
          ))}
          
          <button 
            type="button" 
            className="btn btn-secondary"
            onClick={addApi}
          >
            ➕ Add Another API
          </button>
        </div>

        <div className="form-section">
          <h3>Pricing & Rewards</h3>
          <div className="form-group">
            <label htmlFor="subscriptionFee">Subscription Fee (USDC) *</label>
            <input
              id="subscriptionFee"
              name="subscriptionFee"
              type="number"
              step="0.01"
              min="0.01"
              value={formData.subscriptionFee}
              onChange={handleInputChange}
              placeholder="0.01"
              required
              className="input"
            />
            <small>Amount users pay per API call (in USDC)</small>
          </div>
        </div>

        {error && (
          <div className="error-box">
            <strong>❌ Error:</strong> {error}
          </div>
        )}

        {success && (
          <div className="success-box">
            <strong>✅ Success!</strong> Your server has been registered.
            {txHash && (
              <p>
                Transaction:{" "}
                <a
                  href={`https://sepolia.basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </a>
              </p>
            )}
            <p>Redirecting to launchpad...</p>
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-large"
          disabled={isTransactionPending || success}
        >
          {isTransactionPending
            ? "Submitting Transaction..."
            : success
            ? "Submitted!"
            : "🚀 Register Server"}
        </button>

        <div className="form-info">
          <p>
            <strong>Note:</strong> Registering a server will create a new token contract and register it
            on the IAO Launchpad. This requires a transaction on Base Sepolia.
          </p>
          <p>
            <strong>Payment Token:</strong> USDC on Base ({USDC_ADDRESS})
          </p>
        </div>
      </form>
    </div>
  );
}
