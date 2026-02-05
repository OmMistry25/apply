/**
 * P9.03: Rate Limiting
 * Simple rate limiter for controlling application frequency per domain.
 */

import { WORKER_CONFIG } from './config.js';

interface RateLimitEntry {
  domain: string;
  lastRequestAt: number;
  requestCount: number;
}

class RateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map();
  private defaultDelayMs: number;

  // Domain-specific rate limits (ms between requests)
  private domainLimits: Map<string, number> = new Map([
    ['greenhouse.io', 5000],
    ['lever.co', 5000],
    ['workday.com', 10000], // Workday tends to be stricter
    ['icims.com', 8000],
    ['smartrecruiters.com', 6000],
  ]);

  constructor() {
    this.defaultDelayMs = WORKER_CONFIG.rateLimitDelayMs;
  }

  // Extract domain from URL
  private getDomain(url: string): string {
    try {
      const parsed = new URL(url);
      // Get the main domain (e.g., greenhouse.io from boards.greenhouse.io)
      const parts = parsed.hostname.split('.');
      if (parts.length >= 2) {
        return parts.slice(-2).join('.');
      }
      return parsed.hostname;
    } catch {
      return 'unknown';
    }
  }

  // Get rate limit for a domain
  private getLimitForDomain(domain: string): number {
    return this.domainLimits.get(domain) || this.defaultDelayMs;
  }

  // Check if we can make a request and update the limiter
  async waitForSlot(url: string): Promise<void> {
    const domain = this.getDomain(url);
    const limit = this.getLimitForDomain(domain);
    const now = Date.now();

    const entry = this.entries.get(domain);

    if (entry) {
      const elapsed = now - entry.lastRequestAt;
      if (elapsed < limit) {
        const waitTime = limit - elapsed;
        console.log(`Rate limiting: waiting ${waitTime}ms for ${domain}`);
        await this.sleep(waitTime);
      }
    }

    // Update entry
    this.entries.set(domain, {
      domain,
      lastRequestAt: Date.now(),
      requestCount: (entry?.requestCount || 0) + 1,
    });
  }

  // Get current status for a domain
  getStatus(url: string): { canRequest: boolean; waitMs: number } {
    const domain = this.getDomain(url);
    const limit = this.getLimitForDomain(domain);
    const entry = this.entries.get(domain);

    if (!entry) {
      return { canRequest: true, waitMs: 0 };
    }

    const elapsed = Date.now() - entry.lastRequestAt;
    if (elapsed >= limit) {
      return { canRequest: true, waitMs: 0 };
    }

    return { canRequest: false, waitMs: limit - elapsed };
  }

  // Set custom rate limit for a domain
  setDomainLimit(domain: string, delayMs: number): void {
    this.domainLimits.set(domain, delayMs);
  }

  // Clear all entries (useful for testing)
  clear(): void {
    this.entries.clear();
  }

  // Get statistics
  getStats(): { domains: string[]; totalRequests: number } {
    const domains = Array.from(this.entries.keys());
    const totalRequests = Array.from(this.entries.values()).reduce(
      (sum, e) => sum + e.requestCount,
      0
    );
    return { domains, totalRequests };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();
