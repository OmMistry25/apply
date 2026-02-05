import { chromium, Browser, BrowserContext, Page } from 'playwright';
import Browserbase from '@browserbasehq/sdk';
import { BROWSER_CONFIG, STEALTH_CONFIG } from '../config.js';
import { logger } from '../logger.js';
import { recordBrowserLaunch } from '../health.js';

let localBrowser: Browser | null = null;
let browserbaseClient: Browserbase | null = null;
let contextCount = 0;
let lastBrowserbaseSessionTime = 0;

// Browserbase rate limit: 5 requests per minute (12 seconds minimum between requests)
const BROWSERBASE_MIN_INTERVAL_MS = 15000; // 15 seconds to be safe

// Check if Browserbase is configured (runtime check)
function shouldUseBrowserbase(): boolean {
  return !!(process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID);
}

// Wait for rate limit if needed
async function waitForBrowserbaseRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastBrowserbaseSessionTime;
  if (elapsed < BROWSERBASE_MIN_INTERVAL_MS) {
    const waitTime = BROWSERBASE_MIN_INTERVAL_MS - elapsed;
    logger.info('Waiting for Browserbase rate limit', { waitMs: waitTime });
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastBrowserbaseSessionTime = Date.now();
}

// Initialize Browserbase client
function getBrowserbaseClient(): Browserbase {
  if (!browserbaseClient) {
    const apiKey = process.env.BROWSERBASE_API_KEY;
    if (!apiKey) {
      throw new Error('BROWSERBASE_API_KEY is not set');
    }
    browserbaseClient = new Browserbase({ apiKey });
  }
  return browserbaseClient;
}

// Launch browser - uses Browserbase if configured, otherwise local Chromium
// For Browserbase, creates a fresh session each time (sessions are not reusable)
export async function launchBrowser(): Promise<Browser> {
  if (shouldUseBrowserbase()) {
    // Use Browserbase cloud browser - always create a new session
    const bb = getBrowserbaseClient();
    
    // Wait for rate limit before creating session
    await waitForBrowserbaseRateLimit();
    
    // Create a new session
    const session = await bb.sessions.create({
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
      browserSettings: {
        // Enable stealth mode and fingerprinting
        fingerprint: {
          browsers: ['chrome'],
          devices: ['desktop'],
          operatingSystems: ['macos'],
        },
      },
    });

    logger.info('Browserbase session created', { sessionId: session.id });

    // Connect to the session via CDP
    const browser = await chromium.connectOverCDP(session.connectUrl);
    
    recordBrowserLaunch();
    logger.info('Connected to Browserbase', { sessionId: session.id });
    return browser;
  } else {
    // Fall back to local Chromium - reuse browser instance
    if (localBrowser) {
      return localBrowser;
    }
    
    localBrowser = await chromium.launch({
      headless: BROWSER_CONFIG.headless,
      args: BROWSER_CONFIG.args,
    });

    recordBrowserLaunch();
    logger.info('Local browser launched', { headless: BROWSER_CONFIG.headless });
    return localBrowser;
  }
}

// Close local browser (Browserbase sessions are closed when context closes)
export async function closeBrowser(): Promise<void> {
  if (localBrowser) {
    await localBrowser.close();
    localBrowser = null;
    contextCount = 0;
    logger.info('Browser closed');
  }
}

// Check if we can create more contexts
export function canCreateContext(): boolean {
  return contextCount < BROWSER_CONFIG.maxConcurrentContexts;
}

// Create browser context - Browserbase provides the context, local needs configuration
export async function createContext(): Promise<BrowserContext> {
  if (!canCreateContext()) {
    throw new Error(
      `Max concurrent contexts (${BROWSER_CONFIG.maxConcurrentContexts}) reached`
    );
  }

  const b = await launchBrowser();

  // For Browserbase, get the default context (already configured with stealth)
  if (shouldUseBrowserbase()) {
    const contexts = b.contexts();
    if (contexts.length > 0) {
      contextCount++;
      const context = contexts[0];
      
      // Track context closure
      context.on('close', () => {
        contextCount = Math.max(0, contextCount - 1);
      });
      
      return context;
    }
  }

  // For local browser or if no context exists, create new one
  const context = await b.newContext({
    viewport: BROWSER_CONFIG.viewport,
    userAgent: STEALTH_CONFIG.userAgent,
    locale: STEALTH_CONFIG.locale,
    timezoneId: STEALTH_CONFIG.timezoneId,
    geolocation: { latitude: 40.7128, longitude: -74.006 },
    permissions: ['geolocation'],
    bypassCSP: true,
  });

  contextCount++;

  // Track context closure
  context.on('close', () => {
    contextCount = Math.max(0, contextCount - 1);
  });

  // Additional stealth for local browser
  if (!shouldUseBrowserbase()) {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });
  }

  return context;
}

// P1.04: Create page with timeout defaults
export async function createPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();

  page.setDefaultTimeout(BROWSER_CONFIG.defaultTimeout);
  page.setDefaultNavigationTimeout(BROWSER_CONFIG.navigationTimeout);

  return page;
}

// P1.05: Graceful shutdown handling
export function setupShutdownHandlers(additionalCleanup?: () => Promise<void>): void {
  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    await closeBrowser();
    if (additionalCleanup) {
      await additionalCleanup();
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Helper: Get current browser instance (local only, Browserbase sessions are transient)
export function getBrowser(): Browser | null {
  return localBrowser;
}

// Helper: Get current context count
export function getContextCount(): number {
  return contextCount;
}

// Helper: Check if using Browserbase
export function isUsingBrowserbase(): boolean {
  return shouldUseBrowserbase();
}
