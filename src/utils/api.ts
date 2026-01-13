// API utilities for APIX backend integration
import { extractErrorMessage } from "./errorHandling";

// @ts-ignore - Vite env variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/**
 * Fetch with timeout - prevents requests from hanging indefinitely
 * @param url - The URL to fetch
 * @param options - Fetch options (method, headers, body, etc.)
 * @param timeoutMs - Timeout in milliseconds (default: 30000ms = 30s)
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Request timeout after ${timeoutMs}ms - server is not responding`
      );
    }
    throw error;
  }
}

/**
 * Individual API entry within a server
 * Multiple APIs can be registered under a single server (1 builder = 1 server = N APIs)
 */
export interface ApiEntry {
  index: number;        // 0-based index (order of registration)
  slug: string;         // Unique slug within the server (e.g., "eigenpie-pool")
  name: string;         // API name
  description: string;  // Description (required)
  fee: string;          // Fee in payment token smallest unit (e.g., "10000" = $0.01 USDC)
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
  paymentToken: string;          // Payment token address
  subscriptionCount?: string;    // Total usage count (aggregated across all APIs)
  tags?: string[];               // Array of category tags
  apis?: ApiEntry[];             // Array of registered APIs (each with own fee)
  apiCount?: number;             // Number of APIs
  chainId?: string;              // Chain ID (e.g., "84532" for Base Sepolia, "devnet" for Solana)
  chainType?: "evm" | "solana";  // Chain type
  createdAt?: string;            // Creation timestamp
  updatedAt?: string;            // Last update timestamp
}

/**
 * Chain configuration from backend
 */
export interface ChainConfig {
  chainId: string;
  chainType: "evm" | "solana";
  name: string;
  factoryAddress: string;
  paymentTokenAddress: string;
  rpcUrl: string;
  explorerUrl: string;
  enabled: boolean;
}

// Alias for backward compatibility
export type IAOTokenEntry = ServerEntry;

/**
 * Generic result type for API operations
 */
export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server registration result
 */
export interface ServerRegistrationResult {
  success: boolean;
  server?: ServerEntry;
  error?: string;
}

/**
 * API addition result
 */
export interface ApiAdditionResult {
  success: boolean;
  api?: ApiEntry;
  error?: string;
}

/**
 * Agent interface
 */
export interface Agent {
  id: string;
  name: string;
  description: string;
  creator: string;
  llmProvider: "claude" | "gpt" | "gemini";
  availableTools: string[];
  starterPrompts: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  totalMessages?: number;
}

/**
 * Agent with statistics
 */
export interface AgentWithStats extends Agent {
  messageCount: number;
  userCount: number;
  toolCallCount: number;
  usageScore?: number;
}

/**
 * Agent creation result
 */
export interface AgentCreationResult {
  success: boolean;
  agent?: Agent;
  error?: string;
}

/**
 * Chat session interface
 */
export interface ChatSession {
  id: string;
  agentId: string;
  userAddress: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Chat session creation result
 */
export interface ChatSessionResult {
  success: boolean;
  session?: ChatSession;
  error?: string;
}

/**
 * Chat message interface
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

/**
 * Chat message send result
 */
export interface ChatMessageResult {
  success: boolean;
  message?: ChatMessage;
  error?: string;
}

/**
 * Get all registered servers from backend
 */
export async function getAllServers(): Promise<ServerEntry[]> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetchWithTimeout(`${baseUrl}/api/servers`);
    
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
 * Get all available chain configurations
 */
export async function getChains(): Promise<ChainConfig[]> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetchWithTimeout(`${baseUrl}/api/chains`);

    if (!response.ok) {
      throw new Error(`Failed to fetch chains: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && Array.isArray(data.chains)) {
      return data.chains.filter((chain: ChainConfig) => chain.enabled);
    }

    return [];
  } catch (error) {
    console.error("Error fetching chains:", error);
    // Return default chain on error
    return [{
      chainId: "84532",
      chainType: "evm",
      name: "Base Sepolia",
      factoryAddress: "",
      paymentTokenAddress: "",
      rpcUrl: "",
      explorerUrl: "",
      enabled: true,
    }];
  }
}

/**
 * Get servers filtered by chain ID
 */
export async function getServersByChain(chainId: string | null): Promise<ServerEntry[]> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const url = chainId
      ? `${baseUrl}/api/servers?chainId=${encodeURIComponent(chainId)}`
      : `${baseUrl}/api/servers`;

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch servers: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && Array.isArray(data.servers)) {
      return data.servers;
    }

    return [];
  } catch (error) {
    console.error("Error fetching servers by chain:", error);
    return [];
  }
}

/**
 * Get a specific server by slug
 */
export async function getServerBySlug(serverSlug: string): Promise<ServerEntry | null> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetchWithTimeout(`${baseUrl}/api/server/${serverSlug}`);
    
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
  apis: { slug: string; name: string; apiUrl: string; description: string; fee: string }[];
  builder: string;
  paymentToken: string;
  chainId?: string;              // Chain ID (e.g., "84532" or "devnet")
  tags?: string[];               // Category tags
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
  } catch (error: unknown) {
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
  fee: string;          // Fee in payment token smallest unit (e.g., "10000" = $0.01 USDC)
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
  } catch (error: unknown) {
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

/**
 * Server metrics interface
 */
export interface ServerMetrics {
  server: {
    totalCalls: string;
    totalRevenue: string; // Total USDC paid to contract
    totalRevenueUSD: number; // Total USDC paid to contract (USD)
    averageLatency: number;
    p95Latency: number;
    successRate: number;
    apiCount: number;
    perApiMetrics: {
      apiSlug: string;
      callCount: string;
      revenue: string; // USDC paid to contract
      revenueUSD: number; // USDC paid to contract (USD)
      averageLatency: number;
      p95Latency: number;
      successRate: number;
    }[];
  } | null;
  contract: {
    tokenAddress: string;
    graduationThreshold: string;
    totalTokensDistributed: string;
    totalFeesCollected: string;
    bondingProgress: number;
    isGraduated: boolean;
    uniswapLink?: string;
    paymentTokenPrice?: string | null;
    paymentTokenDecimals?: number | null;
    error?: string;
  } | null;
  apisWithTokenAmounts?: Array<{
    index: number;
    slug: string;
    name: string;
    description: string;
    fee: string;
    createdAt: string;
    tokensPerCall: string | null;
  }>;
}

/**
 * API metrics interface
 */
export interface ApiMetrics {
  api: {
    id: string;
    tokenAddress: string;
    apiSlug: string;
    callCount: string;
    totalRevenue: string;
    successCount: string;
    failureCount: string;
    totalLatency: string;
    averageLatency: string;
    lastCallAt: string;
  } | null;
}

/**
 * Get server metrics
 */
export async function getServerMetrics(serverSlug: string): Promise<ServerMetrics | null> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetch(`${baseUrl}/api/metrics/${serverSlug}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch metrics: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && data.metrics) {
      // Include apisWithTokenAmounts from the top level response
      return {
        ...data.metrics,
        apisWithTokenAmounts: data.apisWithTokenAmounts,
      };
    }
    
    return null;
  } catch (error) {
    console.error("Error fetching server metrics:", error);
    return null;
  }
}

/**
 * Get API-specific metrics
 */
export async function getApiMetrics(serverSlug: string, apiSlug: string): Promise<ApiMetrics | null> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetch(`${baseUrl}/api/metrics/${serverSlug}/${apiSlug}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch API metrics: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && data.metrics) {
      return data.metrics;
    }
    
    return null;
  } catch (error) {
    console.error("Error fetching API metrics:", error);
    return null;
  }
}

/**
 * Transaction entry from the request queue
 */
export interface TransactionEntry {
  id: string;
  iaoToken: string;
  from: string;
  globalRequestNumber: string;
  fee: string;
  createdAt: string;
  server: {
    slug: string;
    name: string;
    symbol: string;
  } | null;
}

/**
 * Get recent transactions across all servers
 */
export async function getRecentTransactions(limit: number = 20): Promise<TransactionEntry[]> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetch(`${baseUrl}/api/transactions?limit=${limit}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch transactions: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && data.transactions) {
      return data.transactions;
    }

    return [];
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return [];
  }
}

/**
 * Create a new agent
 */
export async function createAgent(data: {
  name: string;
  description: string;
  creator: string;
  llmProvider: 'claude' | 'gpt' | 'gemini';
  availableTools: string[];
  starterPrompts: string[];
  isPublic?: boolean;
}): Promise<{ success: boolean; agent?: Agent; error?: string }> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetchWithTimeout(`${baseUrl}/api/agents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      return { success: true, agent: result.data };
    } else {
      return { success: false, error: result.message || result.error || "Failed to create agent" };
    }
  } catch (error: unknown) {
    console.error("Error creating agent:", error);
    return { success: false, error: error.message || "Network error" };
  }
}

/**
 * Get all available servers (for tool selection)
 * Includes all APIs that can be added to agents
 */
export async function getAvailableServersForTools(): Promise<ServerEntry[]> {
  return getAllServers();
}

/**
 * Get all available tools across all servers
 */
export function getAllAvailableTools(servers: ServerEntry[]): Array<{ id: string; label: string; serverName: string; description: string }> {
  const tools: Array<{ id: string; label: string; serverName: string; description: string }> = [];

  for (const server of servers) {
    if (server.apis) {
      for (const api of server.apis) {
        tools.push({
          id: `${server.slug}/${api.slug}`,
          label: api.name,
          serverName: server.name,
          description: api.description || api.name,
        });
      }
    }
  }

  return tools;
}

/**
 * Get a specific agent by ID
 */
export async function getAgent(agentId: string): Promise<Agent | null> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetchWithTimeout(`${baseUrl}/api/agents/${agentId}`);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch agent: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && data.data) {
      return data.data;
    }

    return null;
  } catch (error) {
    console.error("Error fetching agent:", error);
    return null;
  }
}

/**
 * Get all agents (for listing/discovery)
 */
export async function getAllAgents(): Promise<Agent[]> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetchWithTimeout(`${baseUrl}/api/agents`);

    if (!response.ok) {
      throw new Error(`Failed to fetch agents: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && Array.isArray(data.data)) {
      return data.data;
    }

    return [];
  } catch (error) {
    console.error("Error fetching agents:", error);
    return [];
  }
}

/**
 * Chat session interface
 */
export interface ChatSession {
  id: string;
  agentId: string;
  userAddress: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
}

/**
 * Chat message interface
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/**
 * Create a new chat session
 */
export async function createChatSession(data: {
  agentId: string;
  userAddress: string;
  forceNew?: boolean;
}): Promise<{ success: boolean; session?: ChatSession; error?: string }> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetchWithTimeout(`${baseUrl}/api/chat/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      return { success: true, session: result.data };
    } else {
      return { success: false, error: result.message || result.error || "Failed to create session" };
    }
  } catch (error: unknown) {
    console.error("Error creating chat session:", error);
    return { success: false, error: error.message || "Network error" };
  }
}

/**
 * Get user's chat sessions (optionally filtered by agent)
 */
export async function getUserChatSessions(
  userAddress: string,
  agentId?: string
): Promise<ChatSession[]> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const url = agentId
      ? `${baseUrl}/api/chat/sessions/user/${userAddress}?agentId=${agentId}`
      : `${baseUrl}/api/chat/sessions/user/${userAddress}`;

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch sessions: ${response.status}`);
    }

    const result = await response.json();
    return result.data || [];
  } catch (error: unknown) {
    console.error("Error fetching user sessions:", error);
    return [];
  }
}

/**
 * Send a message to chat
 */
export async function sendChatMessage(data: {
  sessionId: string;
  content: string;
  tools?: string[];  // Optional tool overrides (format: "serverSlug/apiSlug")
  model?: string;    // Optional model override
}): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetch(`${baseUrl}/api/chat/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      return { success: true, message: result.data };
    } else {
      return { success: false, error: result.message || result.error || "Failed to send message" };
    }
  } catch (error: unknown) {
    console.error("Error sending message:", error);
    return { success: false, error: error.message || "Network error" };
  }
}

/**
 * Get chat messages for a session
 */
export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  try {
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const response = await fetch(`${baseUrl}/api/chat/sessions/${sessionId}/messages`);

    if (!response.ok) {
      throw new Error(`Failed to fetch messages: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && Array.isArray(data.data)) {
      return data.data;
    }

    return [];
  } catch (error) {
    console.error("Error fetching messages:", error);
    return [];
  }
}

/**
 * SSE event types for streaming responses
 * Discriminated union for type-safe event handling
 */

export type SSEEvent =
  | {
      type: 'token';
      data: {
        content: string;
      };
    }
  | {
      type: 'tool_call';
      data: {
        name: string;
        description: string;
        input?: unknown;
      };
    }
  | {
      type: 'tool_result';
      data: {
        toolName: string;
        success: boolean;
        result?: unknown;
        error?: string;
      };
    }
  | {
      type: 'payment_option';
      data: {
        toolName: string;
        toolDisplayName: string;
        serverSlug: string;
        apiSlug: string;
        fee: string;
        displayFee: string;
        tokenAddress: string;
        description: string;
      };
    }
  | {
      type: 'payment_recorded';
      data: {
        serverSlug: string;
        apiSlug: string;
        fee: string;
        displayFee: string;
      };
    }
  | {
      type: 'done';
      data: Record<string, never>;
    }
  | {
      type: 'error';
      data: {
        message: string;
      };
    }
  | {
      type: 'warning';
      data: {
        message: string;
      };
    };

/**
 * Stream chat response via SSE
 * Returns an async iterator of events
 */
export async function* streamChatResponse(sessionId: string): AsyncGenerator<SSEEvent, void, unknown> {
  const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const eventSource = new EventSource(`${baseUrl}/api/chat/stream/${sessionId}`);

  try {
    yield* new Promise<AsyncGenerator<SSEEvent, void, unknown>>((resolve, reject) => {
      const events: SSEEvent[] = [];
      let resolved = false;

      eventSource.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          events.push(data);
        } catch (error) {
          console.error('Failed to parse SSE event:', error);
        }
      });

      eventSource.addEventListener('error', (error) => {
        eventSource.close();
        if (!resolved) {
          resolved = true;
          reject(new Error('SSE connection error'));
        }
      });

      // Yield events as they arrive
      const intervalId = setInterval(() => {
        if (events.length > 0) {
          const event = events.shift();
          if (event) {
            // Return generator function that yields this event
          }
        }
      }, 10);

      // Wait for 'done' event
      const checkDone = setInterval(() => {
        if (events.some(e => e.type === 'done')) {
          clearInterval(intervalId);
          clearInterval(checkDone);
          eventSource.close();
          if (!resolved) {
            resolved = true;
            resolve(async function* () {
              for (const event of events) {
                yield event;
              }
            }());
          }
        }
      }, 100);
    });
  } finally {
    eventSource.close();
  }
}

/**
 * Alternative: Stream chat response using fetch with streaming
 */
export async function createChatStreamListener(
  sessionId: string,
  onEvent: (event: SSEEvent) => void,
  onError: (error: Error) => void,
  onComplete: () => void,
  options?: {
    tools?: string[];  // Tool overrides (format: "serverSlug/apiSlug")
    model?: string;    // Model override
  }
): Promise<() => void> {
  const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

  // Build URL with optional query params for tool/model overrides
  let streamUrl = `${baseUrl}/api/chat/stream/${sessionId}`;
  const params = new URLSearchParams();
  if (options?.tools && options.tools.length > 0) {
    params.set('tools', options.tools.join(','));
  }
  if (options?.model) {
    params.set('model', options.model);
  }
  if (params.toString()) {
    streamUrl += `?${params.toString()}`;
  }

  const eventSource = new EventSource(streamUrl);

  const handleMessage = (event: Event) => {
    try {
      const messageEvent = event as MessageEvent;
      const data = JSON.parse(messageEvent.data);
      onEvent(data);

      if (data.type === 'done') {
        eventSource.close();
        onComplete();
      }
    } catch (error) {
      console.error('Failed to parse SSE event:', error);
      onError(error as Error);
    }
  };

  const handleError = () => {
    eventSource.close();
    onError(new Error('SSE connection error'));
  };

  eventSource.addEventListener('message', handleMessage);
  eventSource.addEventListener('error', handleError);

  // Return cleanup function
  return () => {
    eventSource.removeEventListener('message', handleMessage);
    eventSource.removeEventListener('error', handleError);
    eventSource.close();
  };
}

/**
 * Get trending agents sorted by usage
 */
export async function getTrendingAgents(limit: number = 10): Promise<AgentWithStats[]> {
  try {
    const agents = await getAllAgents();

    // Convert to AgentWithStats and calculate scores
    const agentsWithStats = agents
      .map((agent) => {
        const messageCount = parseInt(agent.totalMessages || '0');
        const userCount = parseInt(agent.totalUsers || '0');
        const toolCallCount = parseInt(agent.totalToolCalls || '0');

        // Calculate usage score: messages (50%) + users (30%) + tool calls (20%)
        const usageScore =
          messageCount * 0.5 + userCount * 0.3 + toolCallCount * 0.2;

        return {
          ...agent,
          messageCount,
          userCount,
          toolCallCount,
          usageScore,
        };
      })
      .filter((agent) => agent.isPublic) // Only public agents
      .sort((a, b) => b.usageScore - a.usageScore) // Sort by score descending
      .slice(0, limit);

    return agentsWithStats;
  } catch (error) {
    console.error('Error fetching trending agents:', error);
    return [];
  }
}

/**
 * Get all public agents with stats
 */
export async function getPublicAgents(): Promise<AgentWithStats[]> {
  try {
    const agents = await getAllAgents();

    const agentsWithStats = agents
      .map((agent) => ({
        ...agent,
        messageCount: parseInt(agent.totalMessages || '0'),
        userCount: parseInt(agent.totalUsers || '0'),
        toolCallCount: parseInt(agent.totalToolCalls || '0'),
        usageScore:
          parseInt(agent.totalMessages || '0') * 0.5 +
          parseInt(agent.totalUsers || '0') * 0.3 +
          parseInt(agent.totalToolCalls || '0') * 0.2,
      }))
      .filter((agent) => agent.isPublic)
      .sort((a, b) => b.usageScore - a.usageScore);

    return agentsWithStats;
  } catch (error) {
    console.error('Error fetching public agents:', error);
    return [];
  }
}

/**
 * Search agents by name or description
 */
export function searchAgents(
  agents: AgentWithStats[],
  query: string
): AgentWithStats[] {
  if (!query.trim()) {
    return agents;
  }

  const lowerQuery = query.toLowerCase();
  return agents.filter(
    (agent) =>
      agent.name.toLowerCase().includes(lowerQuery) ||
      agent.description.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Filter agents by LLM provider
 */
export function filterAgentsByProvider(
  agents: AgentWithStats[],
  provider: string | null
): AgentWithStats[] {
  if (!provider) {
    return agents;
  }
  return agents.filter((agent) => agent.llmProvider === provider);
}

/**
 * Sort agents by different criteria
 */
export type AgentSortBy = 'trending' | 'newest' | 'messages' | 'users' | 'name';

export function sortAgents(
  agents: AgentWithStats[],
  sortBy: AgentSortBy
): AgentWithStats[] {
  const sorted = [...agents];

  switch (sortBy) {
    case 'trending':
      return sorted.sort((a, b) => b.usageScore - a.usageScore);
    case 'newest':
      return sorted.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    case 'messages':
      return sorted.sort((a, b) => b.messageCount - a.messageCount);
    case 'users':
      return sorted.sort((a, b) => b.userCount - a.userCount);
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return sorted;
  }
}
