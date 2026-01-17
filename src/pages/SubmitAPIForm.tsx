import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveAccount, useActiveWalletChain, ConnectButton } from "thirdweb/react";
import { getContract, readContract } from "thirdweb";
import { baseSepolia } from "thirdweb/chains";
import { parseUnits, parseEventLogs, createPublicClient, createWalletClient, http, custom, encodeFunctionData } from "viem";
import { baseSepolia as baseSepoliaViem } from "viem/chains";
import { TOKEN_FACTORY_ADDRESS, TOKEN_FACTORY_ABI } from "../contracts/tokenFactory";
import { USDC_ADDRESS } from "../constants/addresses";
import { thirdwebClient } from "../lib/thirdwebClient";
import { checkServerSlugExists, getChains, ChainConfig } from "../utils/api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Tooltip } from "../components/Tooltip";
import { ChainSelector, ChainBadge } from "../components/ChainSelector";
import { useChainContext } from "../contexts/ChainContext";
import { useX402Payment } from "../hooks/useX402Payment";
import {
  createTokenTransaction,
  getConnection,
  getMintPDA,
} from "../contracts/solanaIaoFactory";
import { Connection, PublicKey } from "@solana/web3.js";
import "./SubmitAPIForm.css";

// @ts-ignore - Vite env variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// Validate slug format: lowercase alphanumeric with hyphens, 3-30 chars
function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug);
}

// Valid category tags
const VALID_CATEGORIES = [
  'crypto',
  'blockchain',
  'ai',
  'ml',
  'trading',
  'data',
  'analytics',
  'infrastructure',
  'social',
  'media',
  'finance',
  'gaming',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  crypto: 'Crypto',
  blockchain: 'Blockchain',
  ai: 'AI',
  ml: 'ML',
  trading: 'Trading',
  data: 'Data',
  analytics: 'Analytics',
  infrastructure: 'Infrastructure',
  social: 'Social',
  media: 'Media',
  finance: 'Finance',
  gaming: 'Gaming',
};

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
  const [isTransactionPending, setIsTransactionPending] = useState(false);

  // Solana wallet support
  const { isSolanaWalletAvailable, connectSolanaWallet, getSolanaAddress } = useX402Payment();
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
  const [solanaConnecting, setSolanaConnecting] = useState(false);
  const [solanaTransactionPending, setSolanaTransactionPending] = useState(false);
  
  // API entry for the form
  interface FormApiEntry {
    slug: string;
    name: string;
    apiUrl: string;
    description: string;
    fee: string;  // Fee in USDC (e.g., "0.01")
    slugManuallyEdited?: boolean; // Track if user manually edited the slug
  }

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    symbol: "",
    tags: [] as string[],
  });

  // Use global chain context from navbar
  const { selectedChainId, chains, loading: loadingChains } = useChainContext();

  // Check Solana wallet connection status
  useEffect(() => {
    const checkSolanaWallet = () => {
      const address = getSolanaAddress();
      setSolanaAddress(address);
    };
    checkSolanaWallet();
    // Check periodically for wallet connection changes
    const interval = setInterval(checkSolanaWallet, 1000);
    return () => clearInterval(interval);
  }, [getSolanaAddress]);

  // Handle Solana wallet connection
  const handleConnectSolana = async () => {
    console.log("handleConnectSolana called");
    try {
      setSolanaConnecting(true);
      setError(null);
      console.log("Calling connectSolanaWallet...");
      const address = await connectSolanaWallet();
      console.log("Got address:", address);
      if (address) {
        setSolanaAddress(address);
      } else {
        setError("Failed to get wallet address. Please try again.");
      }
    } catch (err: any) {
      console.error("handleConnectSolana error:", err);
      setError(err.message || "Failed to connect Solana wallet");
    } finally {
      setSolanaConnecting(false);
    }
  };

  // Get current chain config
  const currentChainConfig = chains.find(c => c.chainId === selectedChainId);

  // Determine if wallet is connected based on selected chain type
  const isWalletConnected = currentChainConfig?.chainType === "solana"
    ? !!solanaAddress
    : !!account;

  const connectedAddress = currentChainConfig?.chainType === "solana"
    ? solanaAddress
    : account?.address;

  // Support multiple APIs
  const [apis, setApis] = useState<FormApiEntry[]>([
    { slug: "", name: "", apiUrl: "", description: "", fee: "0.01", slugManuallyEdited: false }
  ]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [serverSlugManuallyEdited, setServerSlugManuallyEdited] = useState(false);

  // Confirmation dialog state
  const [showRegisterConfirm, setShowRegisterConfirm] = useState(false);

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

  const handleTagToggle = (tag: string) => {
    setFormData((prev) => {
      const currentTags = prev.tags || [];
      if (currentTags.includes(tag)) {
        return { ...prev, tags: currentTags.filter(t => t !== tag) };
      } else {
        return { ...prev, tags: [...currentTags, tag] };
      }
    });
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
    setApis([...apis, { slug: "", name: "", apiUrl: "", description: "", fee: "0.01", slugManuallyEdited: false }]);
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
    
    // Validate all APIs
    const apiSlugs = new Set<string>();
    for (let i = 0; i < apis.length; i++) {
      const api = apis[i];
      if (!api.slug.trim()) {
        setError(`API #${i + 1}: Slug is required`);
        return false;
      }
      if (!api.fee || parseFloat(api.fee) <= 0) {
        setError(`API #${i + 1}: Fee must be greater than 0`);
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

    if (!isWalletConnected) {
      setError("Please connect your wallet first");
      return;
    }

    const isValid = await validateForm();
    if (!isValid) {
      return;
    }

    // For EVM chains, verify wallet is on correct network
    if (currentChainConfig?.chainType === "evm") {
      if (!chain || chain.id.toString() !== selectedChainId) {
        setError(`Please switch your wallet to ${currentChainConfig?.name || "the correct network"} before submitting.`);
        return;
      }
    }

    // For Solana, check Solana wallet is connected
    if (currentChainConfig?.chainType === "solana") {
      if (!solanaAddress) {
        setError("Please connect your Phantom wallet first");
        return;
      }
    }

    // Show confirmation dialog before proceeding
    setShowRegisterConfirm(true);
  };

  // Handle Solana token creation
  const handleSolanaTokenCreation = async () => {
    if (!solanaAddress || !currentChainConfig) {
      setError("Solana wallet not connected");
      setShowRegisterConfirm(false);
      return;
    }

    try {
      setError(null);
      setSuccess(false);
      setSolanaTransactionPending(true);

      console.log("📝 Preparing Solana transaction with params:", {
        name: formData.name,
        slug: formData.slug,
        symbol: formData.symbol,
        builder: solanaAddress,
      });

      // Pre-check: Validate registration data BEFORE signing transaction
      const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

      const validationPayload = {
        serverSlug: formData.slug.trim(),
        builder: solanaAddress,
        chainId: selectedChainId,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        apis: apis.map(api => ({
          slug: api.slug.trim(),
          apiUrl: api.apiUrl.trim(),
          fee: parseUnits(api.fee, 6).toString(),
        })),
      };

      console.log("🔍 Validating registration data...");
      const validationResponse = await fetch(`${baseUrl}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validationPayload),
      });

      if (!validationResponse.ok) {
        const errorData = await validationResponse.json();
        setError(errorData.message || errorData.error || "Validation failed");
        setShowRegisterConfirm(false);
        return;
      }

      console.log("✅ Validation passed, creating Solana transaction...");

      // Get Solana connection
      const rpcUrl = currentChainConfig.rpcUrl || "https://api.devnet.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");

      // Create the transaction
      const builderPubkey = new PublicKey(solanaAddress);
      const { transaction, mintAddress, tokenStateAddress } = await createTokenTransaction(
        connection,
        builderPubkey,
        formData.slug.trim(),
        formData.name.trim(),
        formData.symbol.trim()
      );

      console.log("📤 Requesting Phantom to sign transaction...");
      console.log("Mint address will be:", mintAddress.toBase58());

      // Get Phantom wallet
      const solana = (window as any).solana || (window as any).phantom?.solana;
      if (!solana) {
        throw new Error("Phantom wallet not found");
      }

      // Close confirmation dialog
      setShowRegisterConfirm(false);

      // Sign and send transaction
      const { signature } = await solana.signAndSendTransaction(transaction);

      console.log("✅ Transaction sent:", signature);
      setTxHash(signature);

      // Wait for confirmation
      console.log("⏳ Waiting for confirmation...");
      const confirmation = await connection.confirmTransaction(signature, "confirmed");

      if (confirmation.value.err) {
        throw new Error("Transaction failed: " + JSON.stringify(confirmation.value.err));
      }

      console.log("✅ Transaction confirmed!");
      setSuccess(true);

      // Register with backend
      const registerPayload = {
        tokenAddress: mintAddress.toBase58(),
        serverSlug: formData.slug.toLowerCase().trim(),
        name: formData.name.trim(),
        symbol: formData.symbol.trim(),
        chainId: selectedChainId,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        apis: apis.map(api => ({
          slug: api.slug.toLowerCase().trim(),
          name: api.name.trim(),
          apiUrl: api.apiUrl.trim(),
          description: api.description.trim(),
          fee: parseUnits(api.fee, 6).toString(),
        })),
        builder: solanaAddress,
        paymentToken: currentChainConfig.paymentTokenAddress,
      };

      console.log("📝 Registering server with backend:", registerPayload);

      const registerResponse = await fetch(`${baseUrl}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerPayload),
      });

      if (registerResponse.ok) {
        console.log("✅ Server registered successfully with backend");
      } else {
        const errorJson = await registerResponse.json();
        console.error("⚠️ Backend registration failed:", errorJson);
        setError(`Transaction succeeded but registration failed: ${errorJson.message || errorJson.error}`);
      }

      // Redirect after success
      setTimeout(() => {
        navigate("/");
      }, 3000);

    } catch (err: any) {
      console.error("❌ Solana transaction error:", err);
      setError(err.message || "Failed to create token on Solana");
      setShowRegisterConfirm(false);
    } finally {
      setSolanaTransactionPending(false);
    }
  };

  const handleConfirmRegister = async () => {
    if (!account || !chain) {
      setError("Wallet not connected or wrong network");
      setShowRegisterConfirm(false);
      return;
    }

    try {
      setError(null);
      setSuccess(false);

      console.log("📝 Preparing transaction with params:", {
        name: formData.name,
        slug: formData.slug,
        symbol: formData.symbol,
        serverSlug: formData.slug,
        builder: account.address,
        paymentToken: USDC_ADDRESS,
        totalApis: apis.length,
        apis: apis.map(api => ({ name: api.name, slug: api.slug, fee: api.fee })),
      });

      const tokenFactoryContract = getContract({
        client: thirdwebClient,
        chain: baseSepolia,
        address: TOKEN_FACTORY_ADDRESS,
        abi: TOKEN_FACTORY_ABI,
      });

      // Pre-check: Verify contract is not paused
      try {
        console.log("🔍 Checking contract state...");
        const isPaused = await readContract({
          contract: tokenFactoryContract,
          method: "paused",
          params: [],
        });

        console.log("Contract state:", { isPaused });

        if (isPaused) {
          setError("Contract is currently paused. Token creation is disabled.");
          return;
        }
      } catch (checkError: unknown) {
        console.warn("⚠️ Could not check contract state:", checkError);
      }

      // Pre-check: Validate registration data BEFORE signing transaction
      // Call /api/register WITHOUT tokenAddress to validate before signing
      try {
        console.log("🔍 Validating registration data before transaction...");
        const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
        
        const validationPayload = {
          serverSlug: formData.slug.trim(),
          builder: account.address.toLowerCase(),
          chainId: selectedChainId,
          tags: formData.tags.length > 0 ? formData.tags : undefined,
          apis: apis.map(api => ({
            slug: api.slug.trim(),
            apiUrl: api.apiUrl.trim(),
            fee: parseUnits(api.fee, 6).toString(), // Convert to smallest unit
          })),
        };

        const validationResponse = await fetch(`${baseUrl}/api/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(validationPayload),
        });

        if (!validationResponse.ok) {
          const errorData = await validationResponse.json();
          setError(errorData.message || errorData.error || "Validation failed");
          return;
        }

        const validationResult = await validationResponse.json();
        console.log("✅ Validation passed:", validationResult);
      } catch (validationError: unknown) {
        console.error("❌ Validation error:", validationError);
        setError(`Validation failed: ${validationError.message || "Unable to validate registration data"}`);
        return;
      }

      // Close confirmation dialog and set pending state
      setShowRegisterConfirm(false);
      setIsTransactionPending(true);

      // Use viem directly to send transaction (bypasses Thirdweb popup)
      console.log("✅ Preparing transaction with viem...");

      // Get wallet from window (MetaMask or other injected wallet)
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        throw new Error("No wallet found. Please install MetaMask or another Web3 wallet.");
      }

      // Create wallet client using the browser wallet
      const walletClient = createWalletClient({
        chain: baseSepoliaViem,
        transport: custom(ethereum),
      });

      // Create public client for reading and waiting
      const publicClient = createPublicClient({
        chain: baseSepoliaViem,
        transport: http(),
      });

      // Encode the createToken function call
      const createTokenAbi = TOKEN_FACTORY_ABI.find(
        (item: any) => item.type === "function" && item.name === "createToken"
      );

      if (!createTokenAbi) {
        throw new Error("createToken ABI not found");
      }

      const data = encodeFunctionData({
        abi: [createTokenAbi],
        functionName: "createToken",
        args: [
          {
            name: formData.name.trim(),
            symbol: formData.symbol.trim(),
            serverSlug: formData.slug.trim(),
            builder: account.address,
            paymentToken: USDC_ADDRESS,
          },
        ],
      });

      console.log("📤 Sending transaction via wallet...");

      // Send transaction directly via wallet
      const txHash = await walletClient.sendTransaction({
        account: account.address as `0x${string}`,
        to: TOKEN_FACTORY_ADDRESS as `0x${string}`,
        data,
      });

      console.log("✅ Transaction sent:", txHash);
      setTxHash(txHash);

      // Wait for transaction receipt
      console.log("⏳ Waiting for confirmation...");
      let receipt = null;
      let attempts = 0;
      const maxAttempts = 30;

      while (!receipt && attempts < maxAttempts) {
        try {
          receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
          });
          break;
        } catch (error: unknown) {
          if ((error as any)?.message?.includes("not found") || (error as any)?.message?.includes("not yet")) {
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

      // Debug: Log receipt details
      console.log("📋 Receipt status:", receipt.status);
      console.log("📋 Receipt logs count:", receipt.logs?.length || 0);
      console.log("📋 Receipt hash:", receipt.transactionHash);

      if (receipt.status === "reverted") {
        console.error("❌ TRANSACTION REVERTED!");
        throw new Error("Transaction reverted. Check the browser console for details.");
      }

      if (!receipt.logs || receipt.logs.length === 0) {
        console.error("❌ NO LOGS IN RECEIPT - Transaction may have failed");
        console.error("Receipt:", receipt);
        throw new Error("No logs in transaction receipt - the transaction may have failed silently");
      }

      // Log all receipts logs for debugging
      console.log("📝 Logs in receipt:");
      receipt.logs.forEach((log, i) => {
        console.log(`  Log ${i}:`, {
          address: log.address,
          topics: log.topics,
          data: log.data,
        });
      });

      // Parse TokenCreated event to get the token address
      const tokenCreatedEvent = parseEventLogs({
        abi: TOKEN_FACTORY_ABI,
        eventName: "TokenCreated",
        logs: receipt.logs,
      });

      if (!tokenCreatedEvent || tokenCreatedEvent.length === 0) {
        console.error("❌ TokenCreated event not found!");
        console.error("Expected TokenFactory address:", TOKEN_FACTORY_ADDRESS);
        console.error("Received logs from:", receipt.logs.map(l => l.address));
        throw new Error("TokenCreated event not found in transaction receipt - check console for log details");
      }

      const tokenAddress = tokenCreatedEvent[0].args.token as string;

      if (!tokenAddress) {
        throw new Error("Token address not found in TokenCreated event");
      }

      console.log("✅ Token address retrieved:", tokenAddress);

      setSuccess(true);

      // Register the server with the backend API (with all APIs and slugs)
      const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

      // Format APIs for backend with slugs and fees
      const formattedApis = apis.map(api => ({
        slug: api.slug.toLowerCase().trim(),
        name: api.name.trim(),
        apiUrl: api.apiUrl.trim(),
        description: api.description.trim(),
        fee: parseUnits(api.fee, 6).toString(), // Convert to smallest unit
      }));

      // Build registration payload with slugs and chainId
      const registerPayload = {
        tokenAddress: tokenAddress.toLowerCase(),
        serverSlug: formData.slug.toLowerCase().trim(),
        name: formData.name.trim(),
        symbol: formData.symbol.trim(),
        chainId: selectedChainId,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        apis: formattedApis,
        builder: account.address.toLowerCase(),
        paymentToken: USDC_ADDRESS.toLowerCase(),
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

      // Wait a bit then redirect to discover page
      setTimeout(() => {
        navigate("/");
      }, 3000);

    } catch (err: unknown) {
      console.error("❌ Error:", err);
      const message = err instanceof Error ? err.message : "Failed to submit API";
      setError(message);
    } finally {
      setIsTransactionPending(false);
    }
  };

  if (!isWalletConnected) {
    return (
      <div className="submit-page">
        <div className="connect-prompt">
          <h2>👋 Connect Your Wallet</h2>
          <p>Please connect your wallet to register a server</p>

          {/* Chain Selection for wallet connection */}
          <div className="chain-select-connect" style={{ marginBottom: '20px' }}>
            <label style={{ marginBottom: '8px', display: 'block' }}>Select Chain:</label>
            <div className="chain-selector-form" style={{ justifyContent: 'center' }}>
              {chains.map((c) => (
                <button
                  key={c.chainId}
                  type="button"
                  className={`chain-option ${selectedChainId === c.chainId ? "chain-option--selected" : ""}`}
                  onClick={() => setSelectedChainId(c.chainId)}
                >
                  <span className="chain-option__icon">
                    {c.chainType === "solana" ? "◎" : "⬡"}
                  </span>
                  <span className="chain-option__name">{c.shortName || c.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="connect-button-container">
            {currentChainConfig?.chainType === "solana" ? (
              <button
                className="btn btn-primary btn-large"
                onClick={handleConnectSolana}
                disabled={solanaConnecting}
                style={{ minWidth: '200px' }}
              >
                {solanaConnecting ? "Connecting..." : "🟣 Connect Phantom"}
              </button>
            ) : (
              <ConnectButton client={thirdwebClient} chain={baseSepolia} />
            )}
          </div>
          <p className="connect-hint">
            {currentChainConfig?.chainType === "solana"
              ? "Connect your Phantom or Solflare wallet"
              : "Connect your MetaMask, Rabby, or other EVM wallet"}
          </p>
          {!isSolanaWalletAvailable() && currentChainConfig?.chainType === "solana" && (
            <p className="connect-hint" style={{ color: '#f59e0b' }}>
              ⚠️ Phantom wallet not detected. <a href="https://phantom.app/" target="_blank" rel="noopener noreferrer" style={{ color: '#8b5cf6' }}>Install Phantom</a>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="submit-page">
      {/* Build Options Header */}
      <div className="build-options">
        <h1>Build on APIX</h1>
        <p>Create APIs or AI agents for the decentralized marketplace</p>
        <div className="build-tabs">
          <button className="build-tab build-tab--active">
            Register Server
          </button>
          <button className="build-tab" onClick={() => navigate('/agents')}>
            Create Agent
          </button>
        </div>
      </div>

      <div className="submit-header">
        <h1>Create Server</h1>
      </div>

      <form onSubmit={handleSubmit} className="submit-form">
        <div className="form-section">
          <div className="form-group">
            <label htmlFor="name">Name</label>
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
            <label htmlFor="slug">Slug</label>
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
            {slugError && <span className="field-error">{slugError}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="symbol">Symbol</label>
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
            <label>Categories</label>
            <div className="tag-selection">
              {VALID_CATEGORIES.map((tag) => (
                <label key={tag} className="tag-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.tags.includes(tag)}
                    onChange={() => handleTagToggle(tag)}
                  />
                  <span className="tag-label">{CATEGORY_LABELS[tag]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="form-section">
          {apis.map((api, index) => (
            <div key={index} className="api-entry">
              {apis.length > 1 && (
                <div className="api-entry-header">
                  <button
                    type="button"
                    className="btn btn-danger btn-small"
                    onClick={() => removeApi(index)}
                  >
                    Remove
                  </button>
                </div>
              )}

              <div className="form-group">
                <label>API Name</label>
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
                <label>Slug</label>
                <input
                  type="text"
                  value={api.slug}
                  onChange={(e) => handleApiChange(index, 'slug', e.target.value)}
                  placeholder="pool-snapshot"
                  required
                  className="input"
                  maxLength={30}
                />
              </div>

              <div className="form-group">
                <label>Endpoint URL</label>
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
                <label>Description</label>
                <textarea
                  value={api.description}
                  onChange={(e) => handleApiChange(index, 'description', e.target.value)}
                  placeholder="Describe what this API does..."
                  rows={2}
                  className="input textarea"
                  required
                />
              </div>

              <div className="form-group">
                <label>Fee (USDC)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={api.fee}
                  onChange={(e) => handleApiChange(index, 'fee', e.target.value)}
                  placeholder="0.01"
                  required
                  className="input"
                />
              </div>
            </div>
          ))}
          
          <button
            type="button"
            className="btn btn-secondary"
            onClick={addApi}
          >
            Add API
          </button>
        </div>


        {error && (
          <div className="error-box">
            {error}
          </div>
        )}

        {success && (
          <div className="success-box">
            Server registered successfully.
            {txHash && (
              <p>
                Transaction:{" "}
                <a
                  href={currentChainConfig?.chainType === "solana"
                    ? `https://explorer.solana.com/tx/${txHash}?cluster=devnet`
                    : `https://sepolia.basescan.org/tx/${txHash}`
                  }
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
          disabled={isTransactionPending || solanaTransactionPending || success}
        >
          {isTransactionPending || solanaTransactionPending
            ? "Submitting Transaction..."
            : success
            ? "Submitted!"
            : "🚀 Register Server"}
        </button>

        <div className="form-info">
          <p>
            <strong>Note:</strong> Registering a server will create a new token contract and register it
            on APIX. This requires a transaction on {currentChainConfig?.name || "the selected blockchain"}.
          </p>
          <p>
            <strong>Payment Token:</strong> USDC on {currentChainConfig?.name || "selected chain"}{" "}
            ({currentChainConfig?.paymentTokenAddress || USDC_ADDRESS})
          </p>
        </div>
      </form>

      {/* Confirmation Dialog for Server Registration */}
      <ConfirmDialog
        isOpen={showRegisterConfirm}
        title="Register Server & Create Token?"
        message={
          <>
            <p>You are about to register a new server and create its APIX token:</p>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px', margin: '12px 0' }}>
              <p style={{ margin: '6px 0' }}>
                <strong>Server:</strong> {formData.name || "Unnamed"}
              </p>
              <p style={{ margin: '6px 0' }}>
                <strong>Slug:</strong> /{formData.slug || "server-slug"}
              </p>
              <p style={{ margin: '6px 0' }}>
                <strong>Chain:</strong> {currentChainConfig?.name || "Unknown"} ({currentChainConfig?.chainType?.toUpperCase() || "EVM"})
              </p>
              <p style={{ margin: '6px 0' }}>
                <strong>APIs:</strong> {apis.length}
              </p>
            </div>
            <p style={{ fontSize: '0.9em', opacity: 0.8, marginBottom: 0 }}>
              ⚠️ This will create a token contract and transaction on {currentChainConfig?.name || "the selected blockchain"}. You will need to sign the transaction with your wallet.
            </p>
          </>
        }
        variant="danger"
        confirmText="Yes, Register Server"
        cancelText="Cancel"
        onConfirm={currentChainConfig?.chainType === "solana" ? handleSolanaTokenCreation : handleConfirmRegister}
        onCancel={() => setShowRegisterConfirm(false)}
      />
    </div>
  );
}
