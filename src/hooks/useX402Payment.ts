// x402 payment hook supporting both EVM (Base Sepolia) and Solana payments
import { useState } from "react";
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import { baseSepolia } from "thirdweb/chains";
import { USDC_ADDRESS } from "../constants/addresses";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

// Solana devnet USDC (devnet faucet USDC)
const SOLANA_USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";

/**
 * Payment authorization for EIP-3009 transfers (EVM)
 */
export interface PaymentAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

/**
 * Result of an API call with payment
 */
export interface ApiCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Payment processing state
 */
export interface PaymentState {
  isProcessing: boolean;
  error: string | null;
}

/**
 * Chain type for payment routing
 */
export type ChainType = "evm" | "solana";

export function useX402Payment() {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Sign EVM payment authorization (EIP-3009/EIP-712)
   */
  const signEVMPayment = async (
    payTo: string,
    paymentAsset: string,
    amountValue: string,
    x402Version: number
  ) => {
    if (!account || !wallet) {
      throw new Error("EVM wallet not connected");
    }

    // Generate EIP-3009 authorization parameters
    const validAfter = Math.floor(Date.now() / 1000) - 60;
    const validBefore = validAfter + 3600;
    const nonceArray = new Uint8Array(32);
    crypto.getRandomValues(nonceArray);
    const nonceBytes32 = `0x${Array.from(nonceArray).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;

    // EIP-712 domain for USDC on Base Sepolia
    const domain = {
      name: "USDC",
      version: "2",
      chainId: baseSepolia.id,
      verifyingContract: paymentAsset as `0x${string}`,
    };

    const types = {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };

    const message = {
      from: account.address as `0x${string}`,
      to: payTo as `0x${string}`,
      value: amountValue,
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce: nonceBytes32,
    };

    // Get wallet provider
    let provider: any = null;
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      provider = (window as any).ethereum;
    } else if (wallet) {
      try {
        if ((wallet as any).getAccount) {
          provider = await (wallet as any).getAccount();
        } else if ((wallet as any).provider) {
          provider = (wallet as any).provider;
        } else if ((wallet as any).getProvider) {
          provider = await (wallet as any).getProvider();
        }
      } catch (err) {
        console.error("Error getting wallet provider:", err);
      }
    }

    if (!provider || typeof provider.request !== 'function') {
      throw new Error("Unable to access EVM wallet provider for signing");
    }

    // Sign typed data
    const typedData = {
      domain,
      types,
      primaryType: "TransferWithAuthorization",
      message,
    };

    const signature = await provider.request({
      method: "eth_signTypedData_v4",
      params: [
        account.address,
        JSON.stringify(typedData),
      ],
    }) as string;

    // Create payment proof
    return {
      x402Version,
      scheme: "exact",
      network: `eip155:${baseSepolia.id}`,
      payload: {
        signature,
        authorization: {
          from: account.address,
          to: payTo,
          value: amountValue,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce: nonceBytes32,
        },
      },
    };
  };

  /**
   * Sign Solana payment transaction
   * Creates and signs a real SPL token transfer transaction
   */
  const signSolanaPayment = async (
    payTo: string,
    amountValue: string,
    x402Version: number
  ) => {
    // Check for Solana wallet (Phantom, Solflare, etc.)
    const solana = (window as any).solana || (window as any).phantom?.solana;

    if (!solana || !solana.isConnected) {
      throw new Error("Solana wallet not connected. Please connect Phantom or another Solana wallet.");
    }

    const fromPubkey = solana.publicKey;
    const toPubkey = new PublicKey(payTo);

    // Parse amount (USDC has 6 decimals)
    const amount = BigInt(amountValue);

    console.log("Creating Solana SPL token transfer transaction...");
    console.log(`  From: ${fromPubkey.toString()}`);
    console.log(`  To: ${toPubkey.toString()}`);
    console.log(`  Amount: ${amount.toString()} (raw)`);

    // Connect to Solana devnet
    const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");

    // Get associated token accounts
    // allowOwnerOffCurve = true to support PDAs and program-owned addresses
    const fromATA = await getAssociatedTokenAddress(
      SOLANA_USDC_MINT,
      fromPubkey,
      true, // allowOwnerOffCurve
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const toATA = await getAssociatedTokenAddress(
      SOLANA_USDC_MINT,
      toPubkey,
      true, // allowOwnerOffCurve - recipient may be a PDA
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    console.log(`  From ATA: ${fromATA.toString()}`);
    console.log(`  To ATA: ${toATA.toString()}`);

    // Create transaction
    const transaction = new Transaction();

    // Check if recipient's ATA exists, if not create it
    const toATAInfo = await connection.getAccountInfo(toATA);
    if (!toATAInfo) {
      console.log("  Creating recipient ATA...");
      transaction.add(
        createAssociatedTokenAccountInstruction(
          fromPubkey, // payer
          toATA, // ata
          toPubkey, // owner
          SOLANA_USDC_MINT, // mint
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        fromATA, // source
        toATA, // destination
        fromPubkey, // owner
        amount, // amount
        [], // signers (empty for single signer)
        TOKEN_PROGRAM_ID
      )
    );

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    console.log("Requesting Solana wallet to sign transaction...");

    // Sign transaction with Phantom (returns a signed transaction)
    const signedTransaction = await solana.signTransaction(transaction);

    // Serialize the signed transaction
    const serializedTransaction = signedTransaction.serialize();
    const transactionBase64 = Buffer.from(serializedTransaction).toString("base64");

    console.log("✅ Solana transaction signed successfully");

    // Create payment proof with the signed transaction
    return {
      x402Version,
      scheme: "exact",
      network: "solana:devnet",
      payload: {
        // The signed transaction bytes (base64 encoded)
        signedTransaction: transactionBase64,
        // Authorization info for backend verification
        authorization: {
          from: fromPubkey.toString(),
          to: payTo,
          amount: amountValue,
          mint: SOLANA_USDC_MINT.toString(),
          blockhash,
          lastValidBlockHeight,
        },
      },
    };
  };

  /**
   * Make a payment-protected API call
   * Automatically detects chain type from 402 response and uses appropriate signing method
   */
  const callAPIWithPayment = async (
    apiUrl: string,
    fee: bigint,
    receiverAddress: string,
    chainType?: ChainType, // Optional: pre-specify chain type
    httpMethod: 'GET' | 'POST' = 'GET', // HTTP method
    requestBody?: unknown // Optional request body for POST
  ): Promise<unknown> => {
    if (!account && !chainType) {
      throw new Error("Please connect your wallet first");
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Step 1: Make initial API request (will return 402 if payment required)
      console.log(`Making initial API request (${httpMethod})...`);
      const initialResponse = await fetch(apiUrl, {
        method: httpMethod,
        headers: {
          "Content-Type": "application/json",
        },
        body: httpMethod === 'POST' && requestBody ? JSON.stringify(requestBody) : undefined,
      });

      // Step 2: If payment is required (402 status), handle payment flow
      if (initialResponse.status === 402) {
        console.log("Payment required. Processing payment...");

        // Get payment details from 402 response
        const paymentInfo = await initialResponse.json().catch(() => ({}));
        console.log("Payment info from 402 response:", paymentInfo);

        const paymentRequirements = paymentInfo?.accepts?.[0];
        const network = paymentRequirements?.network ?? "eip155:84532";
        const payTo = paymentRequirements?.payTo ?? receiverAddress;
        const paymentAsset = paymentRequirements?.asset ?? USDC_ADDRESS;
        const amountValue = paymentRequirements?.maxAmountRequired ?? fee.toString();
        const x402Version = paymentInfo?.x402Version ?? 2;
        const detectedChainType = paymentInfo?.chainType ?? (network.startsWith("solana") ? "solana" : "evm");

        // Use provided chainType or detect from response
        const effectiveChainType = chainType || detectedChainType;

        console.log(`Detected chain type: ${effectiveChainType}, network: ${network}`);

        let paymentProof: any;

        // Step 3: Sign payment based on chain type
        setIsSigning(true);
        try {
          if (effectiveChainType === "solana") {
            console.log("Signing Solana payment authorization...");
            paymentProof = await signSolanaPayment(payTo, amountValue, x402Version);
          } else {
            console.log("Signing EVM payment authorization...");
            if (!account || !wallet) {
              throw new Error("EVM wallet not connected");
            }
            paymentProof = await signEVMPayment(payTo, paymentAsset, amountValue, x402Version);
          }
          console.log("Payment authorization signed successfully");
        } finally {
          setIsSigning(false);
        }

        // Step 4: Wait for facilitator processing
        console.log("Waiting for facilitator to process payment...");
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 5: Retry API call with payment header
        const paymentProofJson = JSON.stringify(paymentProof);
        const paymentProofBase64 = btoa(unescape(encodeURIComponent(paymentProofJson)));

        const paymentHeaderName = x402Version === 2 ? "PAYMENT-SIGNATURE" : "X-PAYMENT";

        const response = await fetch(apiUrl, {
          method: httpMethod,
          headers: {
            "Content-Type": "application/json",
            [paymentHeaderName]: paymentProofBase64,
          },
          body: httpMethod === 'POST' && requestBody ? JSON.stringify(requestBody) : undefined,
        });

        if (!response.ok) {
          let errorMessage = "Payment verification failed";
          try {
            const errorData = await response.json();
            if (typeof errorData === 'string') {
              errorMessage = errorData;
            } else if (errorData && typeof errorData === 'object') {
              errorMessage = errorData.error || errorData.message || JSON.stringify(errorData);
            }
          } catch (e) {
            errorMessage = `Payment verification failed (Status: ${response.status})`;
          }
          throw new Error(errorMessage);
        }

        return await response.json();
      }

      // If no payment required, return the response
      if (!initialResponse.ok) {
        let errorMessage = "API request failed";
        try {
          const errorData = await initialResponse.json();
          if (typeof errorData === 'string') {
            errorMessage = errorData;
          } else if (errorData && typeof errorData === 'object') {
            errorMessage = errorData.error || errorData.message || JSON.stringify(errorData);
          }
        } catch (e) {
          errorMessage = `API request failed (Status: ${initialResponse.status})`;
        }
        throw new Error(errorMessage);
      }

      return await initialResponse.json();
    } catch (err: unknown) {
      let errorMsg = "Failed to process payment";
      if (err) {
        if (typeof err === 'string') {
          errorMsg = err;
        } else if ((err as any).message) {
          errorMsg = (err as any).message;
        } else if ((err as any).error) {
          errorMsg = typeof (err as any).error === 'string' ? (err as any).error : JSON.stringify((err as any).error);
        } else if (typeof err === 'object') {
          errorMsg = JSON.stringify(err);
        } else {
          errorMsg = String(err);
        }
      }
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Check if Solana wallet is available
   */
  const isSolanaWalletAvailable = (): boolean => {
    const solana = (window as any).solana || (window as any).phantom?.solana;
    return !!solana;
  };

  /**
   * Connect Solana wallet (Phantom)
   */
  const connectSolanaWallet = async (): Promise<string | null> => {
    // Try multiple ways to access Phantom
    const phantom = (window as any).phantom?.solana;
    const solana = (window as any).solana;
    const provider = phantom || solana;

    console.log("Attempting to connect Solana wallet...", {
      phantom: !!phantom,
      solana: !!solana,
      isPhantom: provider?.isPhantom,
      isConnected: provider?.isConnected
    });

    if (!provider) {
      throw new Error("Phantom wallet not found. Please install Phantom from phantom.app");
    }

    // If already connected, just return the address
    if (provider.isConnected && provider.publicKey) {
      const address = provider.publicKey.toString();
      console.log("Already connected to Solana wallet:", address);
      return address;
    }

    try {
      // Method 1: Try the request API (newer standard)
      if (provider.request) {
        console.log("Trying request API method...");
        try {
          const response = await provider.request({ method: "connect" });
          if (response.publicKey) {
            const address = response.publicKey.toString();
            console.log("Request API connect succeeded:", address);
            return address;
          }
        } catch (reqErr: any) {
          console.log("Request API failed:", reqErr.message);
        }
      }

      // Method 2: Try signMessage to trigger connection popup
      console.log("Trying signMessage trigger...");
      try {
        // This often triggers the connection popup when connect() fails
        const message = new TextEncoder().encode("Connect to APIX");
        await provider.signMessage(message, "utf8");
        // If we get here, we're connected
        if (provider.publicKey) {
          const address = provider.publicKey.toString();
          console.log("SignMessage trigger succeeded:", address);
          return address;
        }
      } catch (signErr: any) {
        // If user rejected, that's fine - they might still have connected
        if (provider.publicKey) {
          const address = provider.publicKey.toString();
          console.log("Connected after signMessage attempt:", address);
          return address;
        }
        console.log("SignMessage trigger failed:", signErr.message);
      }

      // Method 3: Standard connect
      console.log("Trying standard connect...");
      const response = await provider.connect();
      const address = response.publicKey.toString();
      console.log("Standard connect succeeded:", address);
      return address;
    } catch (err: any) {
      console.error("All connection methods failed:", err);

      // Check if somehow connected despite error
      if (provider.publicKey) {
        const address = provider.publicKey.toString();
        console.log("Found publicKey despite error:", address);
        return address;
      }

      // If it's a user rejection
      if (err.code === 4001 || err.message?.includes("rejected") || err.message?.includes("denied")) {
        throw new Error("Connection rejected. Please approve the connection in Phantom.");
      }

      // For "Unexpected error" - provide helpful instructions
      if (err.message?.includes("Unexpected")) {
        throw new Error(
          "Phantom connection failed. Try: 1) Open Phantom extension, " +
          "2) Settings > Trusted Apps > Remove localhost, 3) Refresh page, 4) Try again."
        );
      }

      throw new Error(err.message || "Failed to connect Phantom wallet. Please try again.");
    }
  };

  /**
   * Get connected Solana wallet address
   */
  const getSolanaAddress = (): string | null => {
    const solana = (window as any).solana || (window as any).phantom?.solana;
    if (solana?.isConnected && solana?.publicKey) {
      return solana.publicKey.toString();
    }
    return null;
  };

  return {
    account,
    wallet,
    callAPIWithPayment,
    isProcessing,
    isSigning,
    error,
    isReady: !!account || isSolanaWalletAvailable(),
    // Solana-specific helpers
    isSolanaWalletAvailable,
    connectSolanaWallet,
    getSolanaAddress,
  };
}
