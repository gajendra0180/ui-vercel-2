// Contract addresses for IAO platform

// Token Factory Contract (creates new IAO tokens)
export const TOKEN_FACTORY_ADDRESS = "0x9b0D7BEc7b570046384e628c3646F3A8373079c4";

// USDC on Base mainnet (payment token)
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Example token address (used in demo/testing)
export const EXAMPLE_TOKEN_ADDRESS = "0xea9E7e288df6644d9E45A9853Ac61cb02027a42A";

// Network configuration
export const SUPPORTED_CHAIN = {
  id: 8453, // Base mainnet
  name: "Base",
  rpcUrl: "https://mainnet.base.org",
  blockExplorer: "https://basescan.org",
} as const;
