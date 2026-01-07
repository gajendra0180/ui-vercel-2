/**
 * Type-safe error handling utilities
 * Complements errorMessages.ts with runtime type checking and safe property access
 */

/**
 * HTTP error with status code
 */
export interface HttpError extends Error {
  status?: number;
  code?: string;
}

/**
 * API error response structure
 */
export interface ApiError {
  message?: string;
  error?: string;
  code?: string;
  status?: number;
  details?: unknown;
}

/**
 * Safe error message extraction that handles various error types
 * @param error - Unknown error from catch block
 * @returns Extracted message string
 */
export function extractErrorMessage(error: unknown): string {
  // Handle Error instances
  if (error instanceof Error) {
    return error.message;
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }

  // Handle objects with message property
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;

    // Check common message properties
    if ('message' in err && typeof err.message === 'string') {
      return err.message;
    }

    // Check for error property (nested error)
    if ('error' in err && typeof err.error === 'string') {
      return err.error;
    }

    // Check for nested error object
    if ('error' in err && err.error instanceof Error) {
      return err.error.message;
    }

    // Check for response property (fetch response)
    if ('response' in err && err.response instanceof Error) {
      return err.response.message;
    }

    // Try to stringify as last resort
    try {
      return JSON.stringify(err);
    } catch {
      return 'An unknown error occurred';
    }
  }

  // Fallback
  return 'An unknown error occurred';
}

/**
 * Extract HTTP status code from error
 * @param error - Unknown error
 * @returns Status code or undefined
 */
export function extractStatusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;

    // Direct status property
    if ('status' in err && typeof err.status === 'number') {
      return err.status;
    }

    // Response object with status
    if ('response' in err && err.response && typeof err.response === 'object') {
      const response = err.response as Record<string, unknown>;
      if ('status' in response && typeof response.status === 'number') {
        return response.status;
      }
    }

    // Status code in message (e.g., "404 Not Found")
    if ('message' in err && typeof err.message === 'string') {
      const match = err.message.match(/\b(\d{3})\b/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  }

  return undefined;
}

/**
 * Extract error code from error
 * @param error - Unknown error
 * @returns Error code or undefined
 */
export function extractErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;

    // Direct code property
    if ('code' in err && typeof err.code === 'string') {
      return err.code;
    }

    // Error name as code
    if ('name' in err && typeof err.name === 'string') {
      return err.name;
    }
  }

  return undefined;
}

/**
 * Check if error is a network connectivity issue
 * @param error - Unknown error
 * @returns True if network error
 */
export function isNetworkConnectivityError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();

  return (
    message.includes('network') ||
    message.includes('offline') ||
    message.includes('connection refused') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed')
  );
}

/**
 * Check if error is a timeout
 * @param error - Unknown error
 * @returns True if timeout error
 */
export function isTimeoutError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  const code = extractErrorCode(error)?.toUpperCase();

  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    code === 'ETIMEDOUT' ||
    code === 'ESOCKETTIMEDOUT'
  );
}

/**
 * Check if error is a 4xx client error
 * @param error - Unknown error
 * @returns True if 4xx error
 */
export function isClientError(error: unknown): boolean {
  const status = extractStatusCode(error);
  return status !== undefined && status >= 400 && status < 500;
}

/**
 * Check if error is a 5xx server error
 * @param error - Unknown error
 * @returns True if 5xx error
 */
export function isServerError(error: unknown): boolean {
  const status = extractStatusCode(error);
  return status !== undefined && status >= 500 && status < 600;
}

/**
 * Check if error is retryable based on status code and error type
 * @param error - Unknown error
 * @returns True if the error should be retried
 */
export function isRetryableError(error: unknown): boolean {
  // Network errors are retryable
  if (isNetworkConnectivityError(error)) {
    return true;
  }

  // Timeouts are retryable
  if (isTimeoutError(error)) {
    return true;
  }

  // Server errors (5xx) are retryable
  if (isServerError(error)) {
    return true;
  }

  // Specific retryable status codes
  const status = extractStatusCode(error);
  if (status === 429 || status === 503 || status === 504) {
    return true;
  }

  // Check message for retry keywords
  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes('retry') ||
    message.includes('try again') ||
    message.includes('temporary') ||
    message.includes('service unavailable')
  );
}

/**
 * Check if error is due to authentication/authorization
 * @param error - Unknown error
 * @returns True if auth error
 */
export function isAuthenticationError(error: unknown): boolean {
  const status = extractStatusCode(error);
  if (status === 401 || status === 403) {
    return true;
  }

  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes('unauthorized') ||
    message.includes('authentication required') ||
    message.includes('not authenticated')
  );
}

/**
 * Check if error is due to authorization/permissions
 * @param error - Unknown error
 * @returns True if authorization error
 */
export function isAuthorizationError(error: unknown): boolean {
  const status = extractStatusCode(error);
  if (status === 403) {
    return true;
  }

  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes('forbidden') ||
    message.includes('permission denied') ||
    message.includes('access denied')
  );
}

/**
 * Check if error is validation/input error
 * @param error - Unknown error
 * @returns True if validation error
 */
export function isValidationError(error: unknown): boolean {
  const status = extractStatusCode(error);
  if (status === 400) {
    return true;
  }

  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes('validation') ||
    message.includes('invalid') ||
    message.includes('required') ||
    message.includes('malformed')
  );
}

/**
 * Cast error to ApiError type for safe property access
 * @param error - Unknown error
 * @returns Error cast to ApiError interface
 */
export function castToApiError(error: unknown): ApiError {
  if (error instanceof Error) {
    return {
      message: error.message,
      error: error.message,
    };
  }

  if (error && typeof error === 'object') {
    return error as ApiError;
  }

  if (typeof error === 'string') {
    return {
      message: error,
      error: error,
    };
  }

  return {
    message: 'Unknown error',
    error: 'Unknown error',
  };
}

/**
 * Safely get a nested property from an error object
 * @param error - Unknown error
 * @param path - Dot-separated property path (e.g., "response.data.message")
 * @returns Property value or undefined
 */
export function getErrorProperty(error: unknown, path: string): unknown {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const parts = path.split('.');
  let current: unknown = error;

  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Create a standardized error object for logging
 * @param error - Unknown error
 * @param context - Additional context
 * @returns Standardized error object
 */
export function createErrorContext(error: unknown, context?: string) {
  return {
    message: extractErrorMessage(error),
    code: extractErrorCode(error),
    status: extractStatusCode(error),
    isNetwork: isNetworkConnectivityError(error),
    isTimeout: isTimeoutError(error),
    isRetryable: isRetryableError(error),
    context,
    timestamp: new Date().toISOString(),
  };
}
