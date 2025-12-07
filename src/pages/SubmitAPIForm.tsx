import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveAccount, useActiveWalletChain, useSendTransaction } from "thirdweb/react";
import { getContract, prepareContractCall, readContract } from "thirdweb";
import { base } from "thirdweb/chains";
import { parseUnits, parseEventLogs, createPublicClient, http } from "viem";
import { base as baseViem } from "viem/chains";
import { TOKEN_FACTORY_ADDRESS, TOKEN_FACTORY_ABI } from "../contracts/tokenFactory";
import { USDC_ADDRESS } from "../constants/addresses";
import { thirdwebClient } from "../lib/thirdwebClient";
import "./SubmitAPIForm.css";

// @ts-ignore - Vite env variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export function SubmitAPIForm() {
  const navigate = useNavigate();
  const account = useActiveAccount();
  const chain = useActiveWalletChain();
  const { mutate: sendTransaction, isPending: isTransactionPending } = useSendTransaction();

  const [formData, setFormData] = useState({
    name: "",
    symbol: "",
    apiUrl: "",
    subscriptionFee: "",
    subscriptionTokenAmount: "",
    maxSubscriptionCount: "1000000", // Default value
    description: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError("API name is required");
      return false;
    }
    if (!formData.symbol.trim()) {
      setError("API symbol is required");
      return false;
    }
    if (!formData.apiUrl.trim()) {
      setError("API endpoint URL is required");
      return false;
    }
    try {
      new URL(formData.apiUrl);
    } catch {
      setError("Invalid API endpoint URL");
      return false;
    }
    if (!formData.subscriptionFee || parseFloat(formData.subscriptionFee) <= 0) {
      setError("Subscription fee must be greater than 0");
      return false;
    }
    // Note: subscriptionTokenAmount is calculated by the contract internally
    // We don't need to validate it here, but we can keep the field for display purposes
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

    if (!chain || chain.id !== base.id) {
      setError("Please switch your wallet to Base mainnet before submitting.");
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
      console.log("📝 Preparing transaction with params:", {
        name: formData.name,
        symbol: formData.symbol,
        apiURL: formData.apiUrl,
        builder: account.address,
        paymentToken: USDC_ADDRESS,
        subscriptionFee: subscriptionFeeWei.toString(),
        // subscriptionTokenAmount is calculated by contract internally
      });

      const tokenFactoryContract = getContract({
        client: thirdwebClient,
        chain: base,
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
      const transaction = prepareContractCall({
        contract: tokenFactoryContract,
        method: "createToken",
        params: [
          {
            name: formData.name.trim(),
            symbol: formData.symbol.trim(),
            apiURL: formData.apiUrl.trim(),
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
              chain: baseViem,
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

            // Register the token with the backend API
            try {
              const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
              const maxSubscriptionCount = formData.maxSubscriptionCount || "1000000";
              
              const registerResponse = await fetch(`${baseUrl}/api/register`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  tokenAddress: tokenAddress,
                  name: formData.name,
                  symbol: formData.symbol,
                  apiUrl: formData.apiUrl,
                  builder: account.address,
                  paymentToken: USDC_ADDRESS,
                  subscriptionFee: subscriptionFeeWei.toString(),
                  // subscriptionTokenAmount will be fetched from the contract or calculated
                  // For now, we'll set it to 0 and let the backend fetch it from the contract if needed
                  subscriptionTokenAmount: "0",
                  maxSubscriptionCount: maxSubscriptionCount,
                }),
              });

              if (registerResponse.ok) {
                console.log("✅ Token registered successfully with backend");
              } else {
                const errorText = await registerResponse.text();
                console.error("⚠️ Failed to register token with backend:", errorText);
                setError(`Transaction succeeded but registration failed: ${errorText}`);
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

  return (
    <div className="submit-page">
      <div className="submit-header">
        <h1>➕ Submit Your API</h1>
        <p>Create your API token and list it on the IAO Launchpad</p>
        <div className="network-warning">
          ⚠️ Requires Base mainnet. Switch networks in your wallet before submitting.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="submit-form">
        <div className="form-section">
          <h3>Basic Information</h3>
          <div className="form-group">
            <label htmlFor="name">API Name *</label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="My Awesome API"
              required
              className="input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="symbol">API Symbol *</label>
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

          <div className="form-group">
            <label htmlFor="apiUrl">API Endpoint URL *</label>
            <input
              id="apiUrl"
              name="apiUrl"
              type="url"
              value={formData.apiUrl}
              onChange={handleInputChange}
              placeholder="https://api.example.com/endpoint"
              required
              className="input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description (optional)</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Describe what your API does..."
              rows={4}
              className="input textarea"
            />
          </div>
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

          <div className="form-group">
            <label htmlFor="subscriptionTokenAmount">Tokens Per Subscription *</label>
            <input
              id="subscriptionTokenAmount"
              name="subscriptionTokenAmount"
              type="number"
              step="1"
              min="1"
              value={formData.subscriptionTokenAmount}
              onChange={handleInputChange}
              placeholder="1000"
              required
              className="input"
            />
            <small>Number of API tokens users earn per subscription</small>
          </div>

          <div className="form-group">
            <label htmlFor="maxSubscriptionCount">Max Subscription Count (optional)</label>
            <input
              id="maxSubscriptionCount"
              name="maxSubscriptionCount"
              type="number"
              step="1"
              min="1"
              value={formData.maxSubscriptionCount}
              onChange={handleInputChange}
              placeholder="1000000"
              className="input"
            />
            <small>Maximum number of subscriptions allowed for this API (default: 1,000,000)</small>
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
                  href={`https://basescan.org/tx/${txHash}`}
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

