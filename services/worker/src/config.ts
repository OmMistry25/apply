/**
 * P9.01: Environment-based Configuration
 * Centralized configuration management for the worker service.
 */

// Browser configuration
export const BROWSER_CONFIG = {
  // Headless mode (true for production, false for debugging)
  headless: process.env.BROWSER_HEADLESS !== 'false',

  // Default timeouts in milliseconds
  defaultTimeout: parseInt(process.env.BROWSER_DEFAULT_TIMEOUT || '30000', 10),
  navigationTimeout: parseInt(process.env.BROWSER_NAV_TIMEOUT || '30000', 10),

  // Viewport settings
  viewport: {
    width: parseInt(process.env.BROWSER_VIEWPORT_WIDTH || '1920', 10),
    height: parseInt(process.env.BROWSER_VIEWPORT_HEIGHT || '1080', 10),
  },

  // Max concurrent browser contexts
  maxConcurrentContexts: parseInt(process.env.BROWSER_MAX_CONTEXTS || '5', 10),

  // Browser launch arguments
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--disable-extensions',
  ] as string[],
};

// Worker configuration
export const WORKER_CONFIG = {
  // Polling interval for new runs (ms)
  pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '5000', 10),

  // Maximum runs to process concurrently
  // Default to 1 for Browserbase free tier (1 concurrent session limit)
  maxConcurrentRuns: parseInt(process.env.WORKER_MAX_CONCURRENT_RUNS || '1', 10),

  // Rate limiting between applications (ms)
  rateLimitDelayMs: parseInt(process.env.WORKER_RATE_LIMIT_DELAY_MS || '5000', 10),

  // Maximum run duration before timeout (ms)
  maxRunDurationMs: parseInt(process.env.WORKER_MAX_RUN_DURATION_MS || '300000', 10),

  // Enable dry-run mode globally
  globalDryRun: process.env.WORKER_DRY_RUN === 'true',

  // Artifact storage
  enableArtifacts: process.env.WORKER_ENABLE_ARTIFACTS !== 'false',
  uploadArtifacts: process.env.WORKER_UPLOAD_ARTIFACTS !== 'false',
} as const;

// Retry configuration
export const RETRY_CONFIG = {
  maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS || '3', 10),
  baseDelayMs: parseInt(process.env.RETRY_BASE_DELAY_MS || '1000', 10),
  maxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS || '10000', 10),
  backoffMultiplier: parseFloat(process.env.RETRY_BACKOFF_MULTIPLIER || '2'),
} as const;

// Stealth configuration
export const STEALTH_CONFIG = {
  // User agent to use
  userAgent:
    process.env.BROWSER_USER_AGENT ||
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

  // Locale
  locale: process.env.BROWSER_LOCALE || 'en-US',

  // Timezone
  timezoneId: process.env.BROWSER_TIMEZONE || 'America/New_York',
} as const;

// Logging configuration
export const LOG_CONFIG = {
  level: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
  structured: process.env.LOG_STRUCTURED === 'true',
  includeTimestamp: process.env.LOG_TIMESTAMP !== 'false',
} as const;

// Health check configuration
export const HEALTH_CONFIG = {
  port: parseInt(process.env.HEALTH_PORT || '8080', 10),
  enabled: process.env.HEALTH_ENABLED !== 'false',
} as const;

// Validate required environment variables
export function validateConfig(): void {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Get current configuration summary for logging
export function getConfigSummary(): Record<string, any> {
  return {
    browser: {
      headless: BROWSER_CONFIG.headless,
      viewport: BROWSER_CONFIG.viewport,
      maxConcurrentContexts: BROWSER_CONFIG.maxConcurrentContexts,
    },
    worker: {
      pollIntervalMs: WORKER_CONFIG.pollIntervalMs,
      maxConcurrentRuns: WORKER_CONFIG.maxConcurrentRuns,
      globalDryRun: WORKER_CONFIG.globalDryRun,
    },
    retry: RETRY_CONFIG,
    log: LOG_CONFIG,
  };
}
