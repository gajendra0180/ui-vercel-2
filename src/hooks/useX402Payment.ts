// x402 payment hook supporting both EVM (Base Sepolia) and Solana payments
import { useState } from "react";
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import { baseSepolia } from "thirdweb/chains";
import { USDC_ADDRESS } from "../constants/addresses";

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
   * Sign Solana payment authorization
   * Uses Ed25519 message signing via Phantom or other Solana wallets
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

    // Generate authorization parameters
    const validAfter = Math.floor(Date.now() / 1000) - 60;
    const validBefore = validAfter + 3600;
    const nonceArray = new Uint8Array(32);
    crypto.getRandomValues(nonceArray);
    // Convert to base58-like string for Solana
    const nonceBase58 = btoa(String.fromCharCode(...nonceArray)).replace(/[+/=]/g, '');

    // Create authorization message
    const authorization = {
      from: solana.publicKey.toString(),
      to: payTo,
      amount: amountValue,
      validAfter,
      validBefore,
      nonce: nonceBase58,
    };

    // Create message to sign
    const messageText = JSON.stringify({
      type: "x402-payment",
      version: x402Version,
      ...authorization,
    });

    const messageBytes = new TextEncoder().encode(messageText);

    console.log("Requesting Solana wallet to sign payment authorization...");

    // Sign with Solana wallet
    const { signature } = await solana.signMessage(messageBytes, "utf8");

    // Convert signature to base64
    const signatureBase64 = btoa(String.fromCharCode(...signature));

    // Create payment proof
    return {
      x402Version,
      scheme: "exact",
      network: "solana:devnet",
      payload: {
        signature: signatureBase64,
        authorization,
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
    chainType?: ChainType // Optional: pre-specify chain type
  ): Promise<unknown> => {
    if (!account && !chainType) {
      throw new Error("Please connect your wallet first");
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Step 1: Make initial API request (will return 402 if payment required)
      console.log("Making initial API request...");
      const initialResponse = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
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

        // Step 4: Wait for facilitator processing
        console.log("Waiting for facilitator to process payment...");
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 5: Retry API call with payment header
        const paymentProofJson = JSON.stringify(paymentProof);
        const paymentProofBase64 = btoa(unescape(encodeURIComponent(paymentProofJson)));

        const paymentHeaderName = x402Version === 2 ? "PAYMENT-SIGNATURE" : "X-PAYMENT";

        const response = await fetch(apiUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            [paymentHeaderName]: paymentProofBase64,
          },
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
    const solana = (window as any).solana || (window as any).phantom?.solana;

    if (!solana) {
      throw new Error("Phantom wallet not found. Please install Phantom.");
    }

    try {
      const response = await solana.connect();
      return response.publicKey.toString();
    } catch (err) {
      console.error("Failed to connect Solana wallet:", err);
      return null;
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
    error,
    isReady: !!account || isSolanaWalletAvailable(),
    // Solana-specific helpers
    isSolanaWalletAvailable,
    connectSolanaWallet,
    getSolanaAddress,
  };
}
