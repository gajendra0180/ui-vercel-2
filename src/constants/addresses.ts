// Contract addresses for IAO platform

// Token Factory Contract (creates new IAO tokens)
export const TOKEN_FACTORY_ADDRESS = "0x61B7b814b814C460bEEAcE46Dd21BEE9e788B893";

// USDC on Base mainnet (payment token)
export const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// Example token address (used in demo/testing)
export const EXAMPLE_TOKEN_ADDRESS = "0xB5eB13fa63FF65c969834aE6eA5686EcF8ED6779";

// Network configuration
export const SUPPORTED_CHAIN = {
  id: 84532, // Base Sepolia testnet
  name: "Base Sepolia",
  rpcUrl: "https://sepolia.base.org",
  blockExplorer: "https://sepolia.basescan.org",
} as const;
