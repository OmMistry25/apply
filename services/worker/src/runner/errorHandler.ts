/**
 * P7: Error Handling and Retries
 * Structured error handling, classification, and retry logic for browser automation.
 */

import { Page, errors } from 'playwright';

const { TimeoutError } = errors;

// P7.01: Error classification
export enum ErrorCategory {
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  VALIDATION = 'VALIDATION',
  CAPTCHA = 'CAPTCHA',
  RATE_LIMITED = 'RATE_LIMITED',
  ALREADY_APPLIED = 'ALREADY_APPLIED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  UNKNOWN = 'UNKNOWN',
}

export interface ClassifiedError {
  category: ErrorCategory;
  code: string;
  message: string;
  retryable: boolean;
  maxRetries: number;
  originalError?: Error;
}

// P7.01: Classify an error for proper handling
export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof TimeoutError) {
    return {
      category: ErrorCategory.TIMEOUT,
      code: 'TIMEOUT',
      message: 'Operation timed out',
      retryable: true,
      maxRetries: 2,
      originalError: error,
    };
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Network errors
    if (
      msg.includes('net::') ||
      msg.includes('network') ||
      msg.includes('connection refused') ||
      msg.includes('econnrefused')
    ) {
      return {
        category: ErrorCategory.NETWORK,
        code: 'NETWORK_ERROR',
        message: 'Network connection failed',
        retryable: true,
        maxRetries: 3,
        originalError: error,
      };
    }

    // Element not found
    if (
      msg.includes('waiting for selector') ||
      msg.includes('element not found') ||
      msg.includes('no element matching')
    ) {
      return {
        category: ErrorCategory.ELEMENT_NOT_FOUND,
        code: 'ELEMENT_NOT_FOUND',
        message: 'Required page element not found',
        retryable: true,
        maxRetries: 1,
        originalError: error,
      };
    }

    // Session/auth issues
    if (msg.includes('session') || msg.includes('login') || msg.includes('unauthorized')) {
      return {
        category: ErrorCategory.SESSION_EXPIRED,
        code: 'SESSION_EXPIRED',
        message: 'Session expired or authentication required',
        retryable: false,
        maxRetries: 0,
        originalError: error,
      };
    }

    return {
      category: ErrorCategory.UNKNOWN,
      code: 'UNKNOWN_ERROR',
      message: error.message,
      retryable: false,
      maxRetries: 0,
      originalError: error,
    };
  }

  return {
    category: ErrorCategory.UNKNOWN,
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    retryable: false,
    maxRetries: 0,
    originalError: error instanceof Error ? error : undefined,
  };
}

// P7.02: Detect blocking conditions from page content
export async function detectBlockingCondition(
  page: Page
): Promise<ClassifiedError | null> {
  try {
    const pageText = ((await page.textContent('body')) || '').toLowerCase();
    const url = page.url().toLowerCase();

    // CAPTCHA detection - only detect actual visible challenges, not script references
    // Check for visible CAPTCHA challenge elements
    const hasCaptchaChallenge = await page.$('iframe[src*="recaptcha"][style*="visibility: visible"], iframe[src*="recaptcha"][style*="display: block"]');
    const hasVisibleRecaptcha = await page.$('div.g-recaptcha:visible, div.g-recaptcha[style*="display: block"]');
    const hasCaptchaOverlay = await page.$('[class*="captcha-overlay"], [class*="captcha-modal"], [id*="captcha-container"]');
    
    // Check for explicit CAPTCHA challenge text (not just mentions)
    const hasChallengeText = 
      pageText.includes('verify you are human') ||
      pageText.includes('prove you are not a robot') ||
      pageText.includes('complete the captcha') ||
      pageText.includes('solve this captcha') ||
      pageText.includes('security check') ||
      pageText.includes('please verify');

    if (hasCaptchaChallenge || hasVisibleRecaptcha || hasCaptchaOverlay || hasChallengeText) {
      return {
        category: ErrorCategory.CAPTCHA,
        code: 'CAPTCHA_DETECTED',
        message: 'CAPTCHA or human verification required',
        retryable: false,
        maxRetries: 0,
      };
    }

    // Rate limiting
    if (
      pageText.includes('rate limit') ||
      pageText.includes('too many requests') ||
      pageText.includes('slow down') ||
      pageText.includes('please try again later')
    ) {
      return {
        category: ErrorCategory.RATE_LIMITED,
        code: 'RATE_LIMITED',
        message: 'Rate limited by the website',
        retryable: true,
        maxRetries: 1,
      };
    }

    // Already applied
    if (
      pageText.includes('already applied') ||
      pageText.includes('duplicate application') ||
      pageText.includes('previously applied') ||
      pageText.includes('you have applied')
    ) {
      return {
        category: ErrorCategory.ALREADY_APPLIED,
        code: 'ALREADY_APPLIED',
        message: 'Already applied to this position',
        retryable: false,
        maxRetries: 0,
      };
    }

    // Access denied / blocked
    if (
      pageText.includes('access denied') ||
      pageText.includes('blocked') ||
      pageText.includes('forbidden') ||
      url.includes('blocked')
    ) {
      return {
        category: ErrorCategory.RATE_LIMITED,
        code: 'ACCESS_BLOCKED',
        message: 'Access to the page was blocked',
        retryable: false,
        maxRetries: 0,
      };
    }

    return null;
  } catch {
    return null;
  }
}

// P7.03: Retry configuration
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

// P7.03: Execute with retries
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs, backoffMultiplier } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const classified = classifyError(error);

      // Don't retry non-retryable errors
      if (!classified.retryable) {
        throw lastError;
      }

      // Don't retry if we've exceeded the error-specific max retries
      if (attempt > classified.maxRetries) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        baseDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );

      console.log(
        `Attempt ${attempt}/${maxAttempts} failed (${classified.code}), retrying in ${delay}ms...`
      );

      await sleep(delay);
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

// P7.04: Wait for element with retry
export async function waitForElementWithRetry(
  page: Page,
  selector: string,
  options: { timeout?: number; retries?: number } = {}
): Promise<boolean> {
  const { timeout = 5000, retries = 2 } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await page.waitForSelector(selector, { timeout });
      return true;
    } catch {
      if (attempt < retries) {
        // Scroll to try to trigger lazy loading
        await page.evaluate(() => window.scrollBy(0, 300));
        await sleep(500);
      }
    }
  }

  return false;
}

// P7.05: Safe page navigation with error handling
export async function safeNavigate(
  page: Page,
  url: string,
  options: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' } = {}
): Promise<ClassifiedError | null> {
  const { timeout = 30000, waitUntil = 'domcontentloaded' } = options;

  try {
    const response = await page.goto(url, { timeout, waitUntil });

    if (!response) {
      return {
        category: ErrorCategory.NETWORK,
        code: 'NO_RESPONSE',
        message: 'No response from server',
        retryable: true,
        maxRetries: 2,
      };
    }

    const status = response.status();
    if (status >= 400) {
      return {
        category: ErrorCategory.NETWORK,
        code: `HTTP_${status}`,
        message: `HTTP error: ${status}`,
        retryable: status >= 500,
        maxRetries: status >= 500 ? 2 : 0,
      };
    }

    // Check for blocking conditions after navigation
    return await detectBlockingCondition(page);
  } catch (error) {
    return classifyError(error);
  }
}

// P7.06: Safe click with error handling
export async function safeClick(
  page: Page,
  selector: string,
  options: { timeout?: number; force?: boolean } = {}
): Promise<boolean> {
  const { timeout = 10000, force = false } = options;

  try {
    // Wait for element
    const element = await page.waitForSelector(selector, {
      timeout,
      state: 'visible',
    });

    if (!element) return false;

    // Scroll into view
    await element.scrollIntoViewIfNeeded();

    // Click
    await element.click({ force, timeout: 5000 });
    return true;
  } catch (error) {
    console.log(`Safe click failed for ${selector}:`, error);
    return false;
  }
}

// P7.06: Safe fill with error handling
export async function safeFill(
  page: Page,
  selector: string,
  value: string,
  options: { timeout?: number; clear?: boolean } = {}
): Promise<boolean> {
  const { timeout = 10000, clear = true } = options;

  try {
    const element = await page.waitForSelector(selector, {
      timeout,
      state: 'visible',
    });

    if (!element) return false;

    if (clear) {
      await element.fill(value);
    } else {
      await element.type(value);
    }

    return true;
  } catch (error) {
    console.log(`Safe fill failed for ${selector}:`, error);
    return false;
  }
}

// Helper: Sleep for specified milliseconds
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// P7: Create error summary for logging
export function createErrorSummary(error: ClassifiedError): string {
  return `[${error.category}] ${error.code}: ${error.message} (retryable: ${error.retryable})`;
}
