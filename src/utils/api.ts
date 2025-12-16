// API utilities for IAO backend integration

// @ts-ignore - Vite env variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/**
 * Individual API entry within a token
 * Multiple APIs can be registered under a single token (1 builder = 1 token = N APIs)
 */
export interface ApiEntry {
  index: number;        // 0-based index (order of registration)
  name: string;         // API name
  description?: string; // Optional description
  createdAt: string;    // ISO timestamp
  // Note: apiUrl is NOT included - hidden from frontend for security
}

/**
 * IAO Token entry representing a builder
 * One builder has one token, which can have multiple APIs
 */
export interface IAOTokenEntry {
  id: string;                    // Token address
  builder: string;               // Builder address
  name: string;                  // Token/Builder name
  symbol: string;                // Token symbol
  subscriptionFee: string;       // Fee for all APIs under this token
  paymentToken: string;          // Payment token address
  subscriptionCount?: string;    // Total usage count (aggregated across all APIs)
  apis?: ApiEntry[];             // Array of registered APIs
  apiCount?: number;             // Number of APIs
  createdAt?: string;            // Creation timestamp
  updatedAt?: string;            // Last update timestamp
}

/**
 * Get all registered IAO tokens from backend
 */
export async function getAllAPIs(): Promise<IAOTokenEntry[]> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetch(`${baseUrl}/api/tokens`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch APIs: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && Array.isArray(data.tokens)) {
      return data.tokens;
    }
    
    return [];
  } catch (error) {
    console.error("Error fetching APIs:", error);
    return [];
  }
}

/**
 * Get a specific IAO token by address
 */
export async function getAPIByAddress(tokenAddress: string): Promise<IAOTokenEntry | null> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetch(`${baseUrl}/api/token/${tokenAddress}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch API: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && data.token) {
      return data.token;
    }
    
    return null;
  } catch (error) {
    console.error("Error fetching API by address:", error);
    return null;
  }
}

/**
 * Get trending APIs (sorted by subscription count)
 */
export async function getTrendingAPIs(limit: number = 10): Promise<IAOTokenEntry[]> {
  try {
    const allAPIs = await getAllAPIs();
    
    // Sort by subscription count (descending)
    const sorted = allAPIs.sort((a, b) => {
      const aCount = parseInt(a.subscriptionCount || "0");
      const bCount = parseInt(b.subscriptionCount || "0");
      return bCount - aCount;
    });

    return sorted.slice(0, limit);
  } catch (error) {
    console.error("Error fetching trending APIs:", error);
    return [];
  }
}

/**
 * Register a new token with multiple APIs
 */
export async function registerToken(tokenData: {
  tokenAddress: string;
  name: string;
  symbol: string;
  apis: { name: string; apiUrl: string; description?: string }[];
  builder: string;
  paymentToken: string;
  subscriptionFee: string;
}): Promise<{ success: boolean; token?: any; error?: string }> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetch(`${baseUrl}/api/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tokenData),
    });

    const data = await response.json();
    
    if (response.ok && data.success) {
      return { success: true, token: data.token };
    } else {
      return { success: false, error: data.message || "Registration failed" };
    }
  } catch (error: any) {
    console.error("Error registering token:", error);
    return { success: false, error: error.message || "Network error" };
  }
}

/**
 * Add a new API to an existing token
 */
export async function addApiToToken(data: {
  tokenAddress: string;
  name: string;
  apiUrl: string;
  description?: string;
  builder: string;
}): Promise<{ success: boolean; api?: ApiEntry; error?: string }> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetch(`${baseUrl}/api/add-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    
    if (response.ok && result.success) {
      return { success: true, api: result.api };
    } else {
      return { success: false, error: result.message || "Failed to add API" };
    }
  } catch (error: any) {
    console.error("Error adding API:", error);
    return { success: false, error: error.message || "Network error" };
  }
}

/**
 * Get APIs grouped by builder
 * Returns a map of builder address -> token entry (with all their APIs)
 */
export async function getAPIsByBuilder(): Promise<Map<string, IAOTokenEntry>> {
  try {
    const allAPIs = await getAllAPIs();
    const byBuilder = new Map<string, IAOTokenEntry>();
    
    for (const api of allAPIs) {
      byBuilder.set(api.builder.toLowerCase(), api);
    }
    
    return byBuilder;
  } catch (error) {
    console.error("Error fetching APIs by builder:", error);
    return new Map();
  }
}
