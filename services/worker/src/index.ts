import { config } from 'dotenv';
config({ path: '.env.local' });

import { claimRun, processRun } from './runner.js';
import { setupShutdownHandlers } from './browser/playwright.js';
import { validateConfig, getConfigSummary, WORKER_CONFIG } from './config.js';
import { logger } from './logger.js';
import { startHealthServer, stopHealthServer, recordError } from './health.js';

async function main() {
  // P9.01: Validate configuration
  try {
    validateConfig();
  } catch (error) {
    logger.error('Configuration validation failed', error as Error);
    process.exit(1);
  }

  // P1.05: Setup graceful shutdown
  setupShutdownHandlers(async () => {
    await stopHealthServer();
  });

  // P9.04: Start health server
  startHealthServer();

  logger.info('Worker started', getConfigSummary());

  while (true) {
    try {
      const run = await claimRun();

      if (run) {
        logger.info(`Processing run ${run.id} for job ${run.job_target_id}`);
        await processRun(run);
      }
    } catch (error) {
      logger.error('Worker error', error as Error);
      recordError();
    }

    await new Promise((resolve) => setTimeout(resolve, WORKER_CONFIG.pollIntervalMs));
  }
}

main().catch((error) => {
  logger.error('Fatal worker error', error);
  process.exit(1);
});
