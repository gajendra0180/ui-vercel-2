// Contract addresses for IAO platform

// Token Factory Contract (creates new IAO tokens)
export const TOKEN_FACTORY_ADDRESS = "0x5a40F7f30b25D07aB1C06dEB7400554Bc20f8ad4";

// USDC on Base mainnet (payment token)
export const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// Example token address (used in demo/testing)
export const EXAMPLE_TOKEN_ADDRESS = "";

// Network configuration
export const SUPPORTED_CHAIN = {
  id: 84532, // Base Sepolia testnet
  name: "Base Sepolia",
  rpcUrl: "https://sepolia.base.org",
  blockExplorer: "https://sepolia.basescan.org",
} as const;
