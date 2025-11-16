import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 4,
  baseDelay: 2000, // 2 seconds
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
};

/**
 * Determines if an error is retryable (connection/timeout issues)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof PrismaClientKnownRequestError) {
    // P1001: Can't reach database server
    // P1008: Operations timed out
    // P1017: Server has closed the connection
    return ['P1001', 'P1008', 'P1017'].includes(error.code);
  }
  
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('server has closed')
    );
  }
  
  return false;
}

/**
 * Calculates delay for exponential backoff with jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = Math.min(
    config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelay
  );
  
  // Add jitter (±25% random variation)
  const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
  return Math.max(100, exponentialDelay + jitter);
}

/**
 * Sleeps for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Executes a database operation with retry logic for connection issues
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  context?: string
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // If it's the last attempt or error is not retryable, throw immediately
      if (attempt === config.maxRetries || !isRetryableError(error)) {
        if (context) {
          console.error(`Database operation failed after ${attempt + 1} attempts (${context}):`, error);
        }
        throw error;
      }
      
      // Calculate delay and wait before retry
      const delay = calculateDelay(attempt, config);
      
      if (context) {
        console.warn(
          `Database operation failed (attempt ${attempt + 1}/${config.maxRetries + 1}) (${context}), retrying in ${delay}ms:`,
          error instanceof Error ? error.message : error
        );
      }
      
      await sleep(delay);
    }
  }
  
  // This should never be reached, but TypeScript requires it
  throw lastError;
}

/**
 * Enhanced error handler that provides better error messages for API responses
 */
export function handleDatabaseError(error: unknown, context?: string): {
  message: string;
  status: number;
  shouldRetry: boolean;
} {
  if (error instanceof PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P1001':
        return {
          message: 'Database connection unavailable. Please try again in a moment.',
          status: 503,
          shouldRetry: true,
        };
      case 'P1008':
        return {
          message: 'Database operation timed out. Please try again.',
          status: 504,
          shouldRetry: true,
        };
      case 'P1017':
        return {
          message: 'Database connection lost. Please try again.',
          status: 503,
          shouldRetry: true,
        };
      case 'P2025':
        return {
          message: 'Record not found.',
          status: 404,
          shouldRetry: false,
        };
      default:
        return {
          message: 'Database operation failed.',
          status: 500,
          shouldRetry: false,
        };
    }
  }
  
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('network')
    ) {
      return {
        message: 'Database connection issue. Please try again in a moment.',
        status: 503,
        shouldRetry: true,
      };
    }
  }
  
  // Log the full error details for debugging
  console.error(`Unexpected database error${context ? ` (${context})` : ''}:`, error);
  
  // Provide more context in the error message for debugging
  const errorDetails = error instanceof Error 
    ? error.message 
    : typeof error === 'string' 
      ? error 
      : JSON.stringify(error);
  
  console.error('Error details:', errorDetails);
  if (error instanceof Error && error.stack) {
    console.error('Stack trace:', error.stack);
  }
  
  // In development, include error details for debugging
  // In production, use generic message to avoid leaking sensitive info
  const isDevelopment = process.env.NODE_ENV === 'development';
  const userMessage = isDevelopment && error instanceof Error
    ? `Database error: ${error.message}`
    : 'An unexpected error occurred. Please try again.';
  
  return {
    message: userMessage,
    status: 500,
    shouldRetry: false,
  };
}
