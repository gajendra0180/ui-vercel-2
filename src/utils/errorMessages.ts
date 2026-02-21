/**
 * User-friendly error message mapping
 * Converts technical errors into clear, actionable messages for users
 */

export interface ErrorMessageResult {
  title: string;
  message: string;
  suggestion?: string;
  isRetryable: boolean;
}

/**
 * Extract the best available error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }
    if ('error' in error) {
      const errObj = error as { error: unknown };
      return getErrorMessage(errObj.error);
    }
  }
  return 'An unknown error occurred';
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('network') ||
    message.includes('offline') ||
    message.includes('fetch failed') ||
    message.includes('connection') ||
    message.includes('timeout');
}

/**
 * Check if error is a 404 not found error
 */
export function is404Error(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('404') || message.includes('not found');
}

/**
 * Check if error is a validation error
 */
export function isValidationError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('validation') ||
    message.includes('invalid') ||
    message.includes('required') ||
    message.includes('must be');
}

/**
 * Check if error is an authorization error
 */
export function isAuthError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('permission');
}

/**
 * Check if error is retryable
 */
export function isRetryable(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('timeout') ||
    message.includes('temporary') ||
    message.includes('try again') ||
    message.includes('service unavailable') ||
    message.includes('503');
}

/**
 * Convert technical error to user-friendly message with context
 */
export function getUserFriendlyError(error: unknown, context?: string): ErrorMessageResult {
  const message = getErrorMessage(error);

  // Network errors
  if (isNetworkError(error)) {
    return {
      title: '⚠️ Connection Issue',
      message: 'Unable to connect to the server. Please check your internet connection.',
      suggestion: 'Check your internet connection and try again.',
      isRetryable: true,
    };
  }

  // 404 errors
  if (is404Error(error)) {
    return {
      title: '❌ Not Found',
      message: context || 'The requested item could not be found.',
      suggestion: 'Go back and verify the correct URL or item.',
      isRetryable: false,
    };
  }

  // Validation errors
  if (isValidationError(error)) {
    return {
      title: '⚠️ Invalid Input',
      message: message || 'Please check your input and try again.',
      suggestion: 'Review the form fields for errors.',
      isRetryable: false,
    };
  }

  // Auth errors
  if (isAuthError(error)) {
    return {
      title: '🔒 Permission Denied',
      message: 'You do not have permission to perform this action.',
      suggestion: 'Check your account permissions and try again.',
      isRetryable: false,
    };
  }

  // Payment/Transaction errors
  if (message.toLowerCase().includes('payment') || message.toLowerCase().includes('transaction')) {
    return {
      title: '💳 Payment Error',
      message: message || 'The payment transaction failed. Please try again.',
      suggestion: 'Verify your payment details and try again. Contact support if the issue persists.',
      isRetryable: true,
    };
  }

  // Signature/Wallet errors
  if (message.toLowerCase().includes('signature') || message.toLowerCase().includes('wallet')) {
    return {
      title: '🔐 Wallet Error',
      message: message || 'There was an issue with your wallet connection.',
      suggestion: 'Reconnect your wallet and try again. Make sure you have it unlocked.',
      isRetryable: true,
    };
  }

  // Event/Smart contract errors
  if (message.toLowerCase().includes('event') || message.toLowerCase().includes('reverted')) {
    return {
      title: '⛓️ Contract Error',
      message: 'The blockchain transaction failed. This might be a configuration issue.',
      suggestion: 'Contact the admin to verify the smart contract configuration.',
      isRetryable: false,
    };
  }

  // Generic fallback
  return {
    title: '❌ Error',
    message: message || 'An unexpected error occurred. Please try again.',
    suggestion: 'If the problem persists, contact support.',
    isRetryable: isRetryable(error),
  };
}

/**
 * Format error for display in UI
 */
export function formatErrorForDisplay(error: unknown, context?: string): string {
  const friendly = getUserFriendlyError(error, context);
  if (friendly.suggestion) {
    return `${friendly.message}\n\n${friendly.suggestion}`;
  }
  return friendly.message;
}
