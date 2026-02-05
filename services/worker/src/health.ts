/**
 * P9.04 & P9.05: Health Check and Metrics
 * Provides health check endpoint and basic metrics collection.
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { HEALTH_CONFIG } from './config.js';
import { getBrowser } from './browser/playwright.js';
import { logger } from './logger.js';

// P9.05: Metrics collection
interface WorkerMetrics {
  startedAt: number;
  runsProcessed: number;
  runsSucceeded: number;
  runsFailed: number;
  runsBlocked: number;
  currentlyProcessing: number;
  browserLaunches: number;
  lastRunAt: number | null;
  errors: number;
}

const metrics: WorkerMetrics = {
  startedAt: Date.now(),
  runsProcessed: 0,
  runsSucceeded: 0,
  runsFailed: 0,
  runsBlocked: 0,
  currentlyProcessing: 0,
  browserLaunches: 0,
  lastRunAt: null,
  errors: 0,
};

// P9.05: Update metrics
export function recordRunStart(): void {
  metrics.currentlyProcessing++;
}

export function recordRunComplete(
  status: 'succeeded' | 'failed' | 'blocked' | 'dry_run_complete'
): void {
  metrics.runsProcessed++;
  metrics.currentlyProcessing = Math.max(0, metrics.currentlyProcessing - 1);
  metrics.lastRunAt = Date.now();

  switch (status) {
    case 'succeeded':
    case 'dry_run_complete':
      metrics.runsSucceeded++;
      break;
    case 'failed':
      metrics.runsFailed++;
      break;
    case 'blocked':
      metrics.runsBlocked++;
      break;
  }
}

export function recordError(): void {
  metrics.errors++;
}

export function recordBrowserLaunch(): void {
  metrics.browserLaunches++;
}

export function getMetrics(): WorkerMetrics {
  return { ...metrics };
}

// P9.04: Health check response
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  browser: {
    running: boolean;
  };
  metrics: {
    runsProcessed: number;
    currentlyProcessing: number;
    successRate: number;
  };
  timestamp: string;
}

function getHealthResponse(): HealthResponse {
  const browser = getBrowser();
  const uptimeMs = Date.now() - metrics.startedAt;
  const successRate =
    metrics.runsProcessed > 0
      ? ((metrics.runsSucceeded / metrics.runsProcessed) * 100).toFixed(1)
      : '100';

  // Determine health status
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // If error rate is high, mark as degraded
  if (metrics.runsProcessed >= 10 && parseFloat(successRate) < 50) {
    status = 'degraded';
  }

  // If browser is expected but not running, mark as degraded
  // (browser might not be launched yet, which is fine)

  return {
    status,
    version: process.env.npm_package_version || '1.0.0',
    uptime: uptimeMs,
    browser: {
      running: browser !== null,
    },
    metrics: {
      runsProcessed: metrics.runsProcessed,
      currentlyProcessing: metrics.currentlyProcessing,
      successRate: parseFloat(successRate),
    },
    timestamp: new Date().toISOString(),
  };
}

// HTTP server for health checks
let server: Server | null = null;

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url || '/';

  if (url === '/health' || url === '/healthz') {
    const health = getHealthResponse();
    const statusCode = health.status === 'unhealthy' ? 503 : 200;

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
    return;
  }

  if (url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getMetrics()));
    return;
  }

  if (url === '/ready' || url === '/readyz') {
    // Ready check - are we able to process runs?
    const ready = metrics.currentlyProcessing === 0 || metrics.currentlyProcessing < 5;
    res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ready }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

// P9.04: Start health check server
export function startHealthServer(): void {
  if (!HEALTH_CONFIG.enabled) {
    logger.info('Health server disabled');
    return;
  }

  server = createServer(handleRequest);

  server.listen(HEALTH_CONFIG.port, () => {
    logger.info(`Health server listening on port ${HEALTH_CONFIG.port}`);
  });

  server.on('error', (error) => {
    logger.error('Health server error', error);
  });
}

// Stop health check server
export function stopHealthServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        logger.info('Health server stopped');
        resolve();
      });
    } else {
      resolve();
    }
  });
}
