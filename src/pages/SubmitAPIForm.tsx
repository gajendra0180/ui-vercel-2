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
import { getAllAPIs, IAOTokenEntry } from "../utils/api";
import "./SubmitAPIForm.css";

// @ts-ignore - Vite env variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export function SubmitAPIForm() {
  const navigate = useNavigate();
  const account = useActiveAccount();
  const chain = useActiveWalletChain();
  const { mutate: sendTransaction, isPending: isTransactionPending } = useSendTransaction();
  
  // Check if builder already has a token
  const [existingToken, setExistingToken] = useState<IAOTokenEntry | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);
  
  // Check if builder already has a registered token
  useEffect(() => {
    const checkExistingToken = async () => {
      if (!account) {
        setCheckingExisting(false);
        return;
      }
      
      try {
        setCheckingExisting(true);
        const allAPIs = await getAllAPIs();
        const builderToken = allAPIs.find(
          (api) => api.builder.toLowerCase() === account.address.toLowerCase()
        );
        setExistingToken(builderToken || null);
      } catch (error) {
        console.error("Error checking existing token:", error);
      } finally {
        setCheckingExisting(false);
      }
    };
    
    checkExistingToken();
  }, [account]);

  // API entry for the form
  interface FormApiEntry {
    name: string;
    apiUrl: string;
    description: string;
  }

  const [formData, setFormData] = useState({
    name: "",
    symbol: "",
    subscriptionFee: "",
  });

  // Support multiple APIs
  const [apis, setApis] = useState<FormApiEntry[]>([
    { name: "", apiUrl: "", description: "" }
  ]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleApiChange = (index: number, field: keyof FormApiEntry, value: string) => {
    const newApis = [...apis];
    newApis[index] = { ...newApis[index], [field]: value };
    setApis(newApis);
    setError(null);
  };

  const addApi = () => {
    setApis([...apis, { name: "", apiUrl: "", description: "" }]);
  };

  const removeApi = (index: number) => {
    if (apis.length > 1) {
      setApis(apis.filter((_, i) => i !== index));
    }
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError("Token name is required");
      return false;
    }
    if (!formData.symbol.trim()) {
      setError("Token symbol is required");
      return false;
    }
    if (!formData.subscriptionFee || parseFloat(formData.subscriptionFee) <= 0) {
      setError("Subscription fee must be greater than 0");
      return false;
    }
    
    // Validate all APIs
    for (let i = 0; i < apis.length; i++) {
      const api = apis[i];
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

    if (!validateForm()) {
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

      // Note: subscriptionTokenAmount is calculated by the contract internally
      // based on: subscriptionFee * paymentTokenInfo[paymentToken].price / 10^decimals
      // We don't need to send it in the transaction

      // Log parameters for debugging
      // Note: Contract only supports single apiURL, we use the first API's URL
      // Additional APIs are registered via backend after token creation
      const primaryApiUrl = apis[0].apiUrl;
      
      console.log("📝 Preparing transaction with params:", {
        name: formData.name,
        symbol: formData.symbol,
        apiURL: primaryApiUrl,
        builder: account.address,
        paymentToken: USDC_ADDRESS,
        subscriptionFee: subscriptionFeeWei.toString(),
        totalApis: apis.length,
        // subscriptionTokenAmount is calculated by contract internally
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
        // Continue anyway, the transaction will fail if there's an issue
      }

      // Prepare contract call with tuple parameter
      // The contract only takes 6 parameters - subscriptionTokenAmount is calculated internally
      // Note: Contract only supports single apiURL, we use the first API's URL
      const transaction = prepareContractCall({
        contract: tokenFactoryContract,
        method: "createToken",
        params: [
          {
            name: formData.name.trim(),
            symbol: formData.symbol.trim(),
            apiURL: primaryApiUrl.trim(), // Use first API's URL for contract
            builder: account.address, // Builder is the user submitting the API
            paymentToken: USDC_ADDRESS,
            subscriptionFee: subscriptionFeeWei,
            // Note: subscriptionTokenAmount is calculated by the contract internally
            // based on: subscriptionFee * paymentTokenInfo[paymentToken].price / 10^decimals
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
            const maxAttempts = 30; // 30 seconds max wait
            
            while (!receipt && attempts < maxAttempts) {
              try {
                receipt = await publicClient.waitForTransactionReceipt({
                  hash: result.transactionHash as `0x${string}`,
                });
                break; // Success, exit loop
              } catch (error: any) {
                // If it's a "Transaction not found" error, wait and retry
                if (error?.message?.includes("not found") || error?.message?.includes("not yet")) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  attempts++;
                } else {
                  // Other error, throw it
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

            // Register the token with the backend API (with all APIs)
            try {
              const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
              
              // Format APIs for backend - all fields are required and trimmed
              const formattedApis = apis.map(api => ({
                name: api.name.trim(),
                apiUrl: api.apiUrl.trim(),
                description: api.description.trim(),
              }));
              
              // Build registration payload with all required fields trimmed
              const registerPayload = {
                tokenAddress: tokenAddress.toLowerCase(),
                name: formData.name.trim(),
                symbol: formData.symbol.trim(),
                apis: formattedApis,
                builder: account.address.toLowerCase(),
                paymentToken: USDC_ADDRESS.toLowerCase(),
                subscriptionFee: subscriptionFeeWei.toString(),
              };
              
              console.log("📝 Registering token with backend:", registerPayload);
              
              const registerResponse = await fetch(`${baseUrl}/api/register`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(registerPayload),
              });

              if (registerResponse.ok) {
                const result = await registerResponse.json();
                console.log(`✅ Token registered successfully with backend (${formattedApis.length} APIs)`, result);
              } else {
                let errorMessage = "Unknown error";
                try {
                  const errorJson = await registerResponse.json();
                  errorMessage = errorJson.message || errorJson.error || JSON.stringify(errorJson);
                  console.error("⚠️ Failed to register token with backend:", errorJson);
                } catch {
                  errorMessage = await registerResponse.text();
                  console.error("⚠️ Failed to register token with backend:", errorMessage);
                }
                setError(`Transaction succeeded but registration failed: ${errorMessage}`);
              }
            } catch (registerError: any) {
              console.error("⚠️ Error registering token with backend:", registerError);
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
          
          // Try to extract more detailed error message
          let errorMessage = err.message || "Transaction failed";
          
          // Check for specific revert reasons
          if (err.data || err.reason) {
            const revertReason = err.data || err.reason;
            errorMessage = `Transaction reverted: ${revertReason}`;
          }
          
          // Check for common contract errors
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

  // If builder already has a server (token), show message and redirect to dashboard
  if (existingToken) {
    return (
      <div className="submit-page">
        <div className="existing-token-notice">
          <h2>🖥️ You Already Have an Active Server</h2>
          <p>Each account can only register one server.</p>
          
          <div className="existing-token-info">
            <div className="token-info-row">
              <span className="label">Server Name:</span>
              <span className="value">{existingToken.name}</span>
            </div>
            <div className="token-info-row">
              <span className="label">Symbol:</span>
              <span className="value">{existingToken.symbol}</span>
            </div>
            <div className="token-info-row">
              <span className="label">Server Address:</span>
              <span className="value">{existingToken.id}</span>
            </div>
            <div className="token-info-row">
              <span className="label">APIs Registered:</span>
              <span className="value">{existingToken.apiCount || existingToken.apis?.length || 1}</span>
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
              onClick={() => navigate(`/api/${existingToken.id}`)}
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
            <label htmlFor="symbol">Server Symbol *</label>
            <input
              id="symbol"
              name="symbol"
              type="text"
              value={formData.symbol}
              onChange={handleInputChange}
              placeholder="MYSERVER"
              required
              maxLength={10}
              className="input"
            />
          </div>
        </div>

        <div className="form-section">
          <h3>API Endpoints</h3>
          <p className="section-description">
            Register one or more APIs under your token. All APIs share the same subscription fee.
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
                <label>API Endpoint URL *</label>
                <input
                  type="url"
                  value={api.apiUrl}
                  onChange={(e) => handleApiChange(index, 'apiUrl', e.target.value)}
                  placeholder="https://api.example.com/endpoint"
                  required
                  className="input"
                />
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
            <strong>✅ Success!</strong> Your API has been submitted.
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
            : "🚀 Submit API"}
        </button>

        <div className="form-info">
          <p>
            <strong>Note:</strong> Submitting an API will create a new token contract and register it
            on the IAO Launchpad. This requires a transaction on Base mainnet.
          </p>
          <p>
            <strong>Payment Token:</strong> USDC on Base ({USDC_ADDRESS})
          </p>
        </div>
      </form>
    </div>
  );
}

