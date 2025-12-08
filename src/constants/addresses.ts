// Contract addresses for IAO platform

// Token Factory Contract (creates new IAO tokens)
export const TOKEN_FACTORY_ADDRESS = "0x8F700d253c580478fC068ceb4369e42657C165ff";

// USDC on Base mainnet (payment token)
export const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// Example token address (used in demo/testing)
export const EXAMPLE_TOKEN_ADDRESS = "0x72CdC921684e8a5E05E99A2319FE4C4fF7F43d20";

// Network configuration
export const SUPPORTED_CHAIN = {
  id: 84532, // Base Sepolia testnet
  name: "Base Sepolia",
  rpcUrl: "https://sepolia.base.org",
  blockExplorer: "https://sepolia.basescan.org",
} as const;
