// API utilities for IAO backend integration

// @ts-ignore - Vite env variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export interface IAOTokenEntry {
  id: string; // Token address
  apiUrl: string;
  builder: string;
  name: string;
  symbol: string;
  subscriptionFee: string;
  subscriptionTokenAmount: string;
  paymentToken: string;
  subscriptionCount?: string; // Usage count
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
 * Register a new token with the backend
 */
export async function registerToken(tokenData: {
  tokenAddress: string;
  name: string;
  symbol: string;
  apiUrl: string;
  builder: string;
  paymentToken: string;
  subscriptionFee: string;
  subscriptionTokenAmount: string;
  maxSubscriptionCount?: string;
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
