// API utilities for IAO backend integration

// @ts-ignore - Vite env variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/**
 * Individual API entry within a server
 * Multiple APIs can be registered under a single server (1 builder = 1 server = N APIs)
 */
export interface ApiEntry {
  index: number;        // 0-based index (order of registration)
  slug: string;         // Unique slug within the server (e.g., "eigenpie-pool")
  name: string;         // API name
  description: string;  // Description (required)
  createdAt: string;    // ISO timestamp
  // Note: apiUrl is NOT included - hidden from frontend for security
}

/**
 * Server entry representing a builder
 * One builder has one server (token), which can have multiple APIs
 */
export interface ServerEntry {
  id: string;                    // Token address
  slug: string;                  // Unique server slug (e.g., "magpie")
  builder: string;               // Builder address
  name: string;                  // Server name
  symbol: string;                // Token symbol
  subscriptionFee: string;       // Fee for all APIs under this server
  paymentToken: string;          // Payment token address
  subscriptionCount?: string;    // Total usage count (aggregated across all APIs)
  apis?: ApiEntry[];             // Array of registered APIs
  apiCount?: number;             // Number of APIs
  createdAt?: string;            // Creation timestamp
  updatedAt?: string;            // Last update timestamp
}

// Alias for backward compatibility
export type IAOTokenEntry = ServerEntry;

/**
 * Get all registered servers from backend
 */
export async function getAllServers(): Promise<ServerEntry[]> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetch(`${baseUrl}/api/servers`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch servers: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && Array.isArray(data.servers)) {
      return data.servers;
    }
    
    return [];
  } catch (error) {
    console.error("Error fetching servers:", error);
    return [];
  }
}

// Alias for backward compatibility
export const getAllAPIs = getAllServers;

/**
 * Get a specific server by slug
 */
export async function getServerBySlug(serverSlug: string): Promise<ServerEntry | null> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetch(`${baseUrl}/api/server/${serverSlug}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch server: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && data.server) {
      return data.server;
    }
    
    return null;
  } catch (error) {
    console.error("Error fetching server by slug:", error);
    return null;
  }
}

/**
 * Get trending servers (sorted by subscription count)
 */
export async function getTrendingServers(limit: number = 10): Promise<ServerEntry[]> {
  try {
    const allServers = await getAllServers();
    
    // Sort by subscription count (descending)
    const sorted = allServers.sort((a, b) => {
      const aCount = parseInt(a.subscriptionCount || "0");
      const bCount = parseInt(b.subscriptionCount || "0");
      return bCount - aCount;
    });

    return sorted.slice(0, limit);
  } catch (error) {
    console.error("Error fetching trending servers:", error);
    return [];
  }
}

// Alias for backward compatibility
export const getTrendingAPIs = getTrendingServers;

/**
 * Register a new server with multiple APIs
 */
export async function registerServer(serverData: {
  tokenAddress: string;
  slug: string;                  // Server slug (e.g., "magpie")
  name: string;
  symbol: string;
  apis: { slug: string; name: string; apiUrl: string; description: string }[];
  builder: string;
  paymentToken: string;
  subscriptionFee: string;
}): Promise<{ success: boolean; server?: ServerEntry; error?: string }> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetch(`${baseUrl}/api/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(serverData),
    });

    const data = await response.json();
    
    if (response.ok && data.success) {
      return { success: true, server: data.token };
    } else {
      return { success: false, error: data.message || "Registration failed" };
    }
  } catch (error: any) {
    console.error("Error registering server:", error);
    return { success: false, error: error.message || "Network error" };
  }
}

// Alias for backward compatibility
export const registerToken = registerServer;

/**
 * Add a new API to an existing server
 */
export async function addApiToServer(data: {
  serverSlug: string;
  slug: string;         // API slug
  name: string;
  apiUrl: string;
  description: string;
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

// Alias for backward compatibility
export const addApiToToken = addApiToServer;

/**
 * Get servers grouped by builder
 * Returns a map of builder address -> server entry (with all their APIs)
 */
export async function getServersByBuilder(): Promise<Map<string, ServerEntry>> {
  try {
    const allServers = await getAllServers();
    const byBuilder = new Map<string, ServerEntry>();
    
    for (const server of allServers) {
      byBuilder.set(server.builder.toLowerCase(), server);
    }
    
    return byBuilder;
  } catch (error) {
    console.error("Error fetching servers by builder:", error);
    return new Map();
  }
}

// Alias for backward compatibility  
export const getAPIsByBuilder = getServersByBuilder;

/**
 * Check if a server slug exists
 */
export async function checkServerSlugExists(slug: string): Promise<boolean> {
  const server = await getServerBySlug(slug);
  return server !== null;
}

/**
 * Build the proxy URL for an API call
 */
export function buildProxyUrl(serverSlug: string, apiSlug: string): string {
  const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  return `${baseUrl}/api/${serverSlug}/${apiSlug}`;
}
