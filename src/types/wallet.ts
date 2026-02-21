/**
 * Type definitions for Ethereum wallet providers
 * Provides type-safe interfaces for wallet interactions
 */

/**
 * Standard Ethereum RPC request parameters
 */
export interface RpcRequest {
  method: string;
  params?: unknown[];
}

/**
 * Ethereum provider interface (EIP-1193)
 * Represents the basic ethereum provider interface
 */
export interface EthereumProvider {
  request: (args: RpcRequest) => Promise<unknown>;
  on?: (eventName: string, listener: (...args: unknown[]) => void) => void;
  off?: (eventName: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (eventName: string, listener: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
}

/**
 * Wallet account interface
 */
export interface WalletAccount {
  address: string;
  publicKey?: string;
}

/**
 * Connection parameters for wallet requests
 */
export interface WalletConnectionParams {
  method: string;
  params?: unknown[];
  chainId?: string;
}

/**
 * Thirdweb-specific wallet interface
 */
export interface ThirdwebWallet {
  getAccount?: () => Promise<WalletAccount>;
  getProvider?: () => Promise<EthereumProvider>;
  isConnected?: () => Promise<boolean>;
  disconnect?: () => Promise<void>;
  getSigner?: () => Promise<unknown>;
}

/**
 * Extended wallet interface combining multiple wallet providers
 */
export interface ExtendedWallet extends ThirdwebWallet {
  provider?: EthereumProvider;
  ethereum?: EthereumProvider;
  isWalletConnect?: boolean;
  isConnected?: () => Promise<boolean>;
}

/**
 * Window interface with ethereum provider
 */
export interface WindowWithEthereum extends Window {
  ethereum?: EthereumProvider;
}

/**
 * Type guard to check if a value is an EthereumProvider
 */
export function isEthereumProvider(value: unknown): value is EthereumProvider {
  return (
    value !== null &&
    typeof value === 'object' &&
    'request' in value &&
    typeof (value as Record<string, unknown>).request === 'function'
  );
}

/**
 * Type guard to check if a value is a WalletAccount
 */
export function isWalletAccount(value: unknown): value is WalletAccount {
  return (
    value !== null &&
    typeof value === 'object' &&
    'address' in value &&
    typeof (value as Record<string, unknown>).address === 'string'
  );
}

/**
 * Safely cast to EthereumProvider
 */
export function castToEthereumProvider(value: unknown): EthereumProvider | null {
  if (isEthereumProvider(value)) {
    return value;
  }
  return null;
}

/**
 * Safely cast to WalletAccount
 */
export function castToWalletAccount(value: unknown): WalletAccount | null {
  if (isWalletAccount(value)) {
    return value;
  }
  return null;
}

/**
 * Get ethereum provider from window
 */
export function getWindowEthereumProvider(): EthereumProvider | null {
  const win = typeof window !== 'undefined' ? window : null;
  if (!win || !isEthereumProvider((win as WindowWithEthereum).ethereum)) {
    return null;
  }
  return (win as WindowWithEthereum).ethereum || null;
}

/**
 * Check if wallet is connected
 */
export async function isWalletConnected(wallet: ExtendedWallet): Promise<boolean> {
  try {
    if (wallet.isConnected) {
      return await wallet.isConnected();
    }

    if (wallet.getAccount) {
      const account = await wallet.getAccount();
      return !!account;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get wallet account address
 */
export async function getWalletAddress(wallet: ExtendedWallet): Promise<string | null> {
  try {
    if (wallet.getAccount) {
      const account = await wallet.getAccount();
      if (isWalletAccount(account)) {
        return account.address;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Request account access from wallet
 */
export async function requestWalletAccess(provider: EthereumProvider): Promise<string[] | null> {
  try {
    const accounts = (await provider.request({
      method: 'eth_requestAccounts',
    })) as string[];

    return Array.isArray(accounts) && accounts.length > 0 ? accounts : null;
  } catch {
    return null;
  }
}

/**
 * Sign message with wallet
 */
export async function signMessageWithWallet(
  provider: EthereumProvider,
  message: string,
  address: string
): Promise<string | null> {
  try {
    const signature = (await provider.request({
      method: 'personal_sign',
      params: [message, address],
    })) as string;

    return signature;
  } catch {
    return null;
  }
}

/**
 * Get chain ID from wallet
 */
export async function getChainIdFromWallet(provider: EthereumProvider): Promise<string | null> {
  try {
    const chainId = (await provider.request({
      method: 'eth_chainId',
    })) as string;

    return chainId;
  } catch {
    return null;
  }
}
