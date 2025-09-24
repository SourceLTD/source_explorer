/**
 * Enhanced API client with automatic retry logic for database connection issues
 */

interface ApiError {
  error: string;
  retryable?: boolean;
  timestamp?: string;
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 4,
  baseDelay: 2000,
  maxDelay: 20000,
};

/**
 * Sleeps for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculates delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = Math.min(
    config.baseDelay * Math.pow(2, attempt),
    config.maxDelay
  );
  
  // Add jitter (±25% random variation)
  const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
  return Math.max(500, exponentialDelay + jitter);
}

/**
 * Enhanced fetch with retry logic for database connection issues
 */
export async function apiRequest<T>(
  url: string, 
  options?: RequestInit,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
  timeoutMs: number = 45000 // 45 second timeout
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      // Clear timeout if request completes
      clearTimeout(timeoutId);
      
      // If successful, return the parsed JSON
      if (response.ok) {
        return await response.json();
      }
      
      // Parse error response
      const errorData: ApiError = await response.json().catch(() => ({ 
        error: `HTTP ${response.status}: ${response.statusText}` 
      }));
      
      // Check if this is a retryable error
      const isRetryable = errorData.retryable || 
        response.status === 503 || // Service Unavailable
        response.status === 504 || // Gateway Timeout
        response.status === 502;   // Bad Gateway
      
      // If it's the last attempt or not retryable, throw immediately
      if (attempt === retryConfig.maxRetries || !isRetryable) {
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }
      
      // Wait before retry
      const delay = calculateDelay(attempt, retryConfig);
      console.warn(`API request failed (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}), retrying in ${delay}ms:`, errorData.error);
      await sleep(delay);
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // For network errors and timeouts, retry if we haven't reached max attempts
      if (attempt < retryConfig.maxRetries && (
        lastError.message.includes('fetch') ||
        lastError.message.includes('network') ||
        lastError.message.includes('timeout') ||
        lastError.message.includes('aborted') ||
        lastError.name === 'AbortError'
      )) {
        const delay = calculateDelay(attempt, retryConfig);
        console.warn(`Network error (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}), retrying in ${delay}ms:`, lastError.message);
        await sleep(delay);
        continue;
      }
      
      // Non-retryable error or max attempts reached
      throw lastError;
    }
  }
  
  // This should never be reached, but TypeScript requires it
  throw lastError || new Error('Unexpected error in apiRequest');
}

/**
 * Convenience methods for common HTTP operations
 */
export const api = {
  get: <T>(url: string, retryConfig?: RetryConfig, timeoutMs?: number): Promise<T> => 
    apiRequest<T>(url, { method: 'GET' }, retryConfig, timeoutMs),
    
  post: <T>(url: string, data: unknown, retryConfig?: RetryConfig, timeoutMs?: number): Promise<T> =>
    apiRequest<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }, retryConfig, timeoutMs),
    
  patch: <T>(url: string, data: unknown, retryConfig?: RetryConfig, timeoutMs?: number): Promise<T> =>
    apiRequest<T>(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }, retryConfig, timeoutMs),
    
  delete: <T>(url: string, retryConfig?: RetryConfig, timeoutMs?: number): Promise<T> =>
    apiRequest<T>(url, { method: 'DELETE' }, retryConfig, timeoutMs),
};

// Note: useApiCall hook is removed from this file to avoid build issues
// If you need this hook, create it in a separate client-side component file
