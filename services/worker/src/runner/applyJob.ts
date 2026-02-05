import { BrowserContext } from 'playwright';
import { createContext, createPage, isUsingBrowserbase } from '../browser/playwright.js';
import { ATSAdapter, ApplyContext, ApplyResult, ProfileData } from './adapters/base.js';
import { GreenhouseAdapter } from './adapters/greenhouse.js';
import { LeverAdapter } from './adapters/lever.js';
import { downloadResume } from './resumeDownloader.js';
import { rateLimiter } from '../rateLimiter.js';
import { logger } from '../logger.js';
import { recordRunStart, recordRunComplete } from '../health.js';
import { WORKER_CONFIG } from '../config.js';
import {
  createArtifactCollector,
  captureScreenshot,
  createDebugPackage,
  uploadArtifacts,
  storeArtifactMetadata,
  cleanupArtifacts,
  ArtifactCollector,
} from './artifacts.js';
import { classifyError, detectBlockingCondition } from './errorHandler.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Registry of all adapters
const adapters: ATSAdapter[] = [
  new GreenhouseAdapter(),
  new LeverAdapter(),
];

export interface ApplyJobInput {
  runId: string;
  userId: string;
  jobUrl: string;
  atsType: string;
  resumeStoragePath: string;
  profile: ProfileData;
  dryRun: boolean;
}

export async function applyJob(input: ApplyJobInput): Promise<ApplyResult> {
  let context: BrowserContext | null = null;
  let tempResumeDir: string | null = null;
  let artifactCollector: ArtifactCollector | null = null;

  const runLogger = logger.withRun(input.runId);

  // P9.05: Record run start
  recordRunStart();

  try {
    // Find adapter for this ATS
    const adapter = adapters.find((a) => a.supports(input.jobUrl));

    if (!adapter) {
      recordRunComplete('failed');
      return {
        status: 'failed',
        fieldsFilledCount: 0,
        fieldsFailed: [],
        screenshots: [],
        errorCode: 'UNSUPPORTED_ATS',
        errorMessage: `No adapter found for URL: ${input.jobUrl}`,
      };
    }

    runLogger.info(`Using ${adapter.name} adapter`, { url: input.jobUrl });

    // P9.03: Wait for rate limit slot
    await rateLimiter.waitForSlot(input.jobUrl);

    // P6: Create artifact collector
    if (WORKER_CONFIG.enableArtifacts) {
      artifactCollector = createArtifactCollector(input.runId);
    }

    // Download resume to temp directory
    tempResumeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-'));
    const resumePath = await downloadResume(input.resumeStoragePath, tempResumeDir);

    // Create browser context and page
    context = await createContext();
    const page = await createPage(context);

    // Navigate to job URL
    await page.goto(input.jobUrl, { waitUntil: 'domcontentloaded' });

    // When using Browserbase, wait for page to stabilize (CAPTCHA solving, etc.)
    if (isUsingBrowserbase()) {
      runLogger.info('Using Browserbase - waiting for page to stabilize...');
      // Wait for network to be idle, giving Browserbase time to handle any CAPTCHAs
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      // Additional wait for any async CAPTCHA solving
      await page.waitForTimeout(3000);
    }

    // P7: Check for blocking conditions before proceeding
    // Skip CAPTCHA check when using Browserbase (they handle it automatically)
    const blockingCondition = await detectBlockingCondition(page);
    if (blockingCondition) {
      // If using Browserbase and it's a CAPTCHA, give it more time
      if (isUsingBrowserbase() && blockingCondition.code === 'CAPTCHA_DETECTED') {
        runLogger.info('CAPTCHA detected with Browserbase - waiting for auto-solve...');
        await page.waitForTimeout(10000);
        
        // Re-check after waiting
        const stillBlocked = await detectBlockingCondition(page);
        if (!stillBlocked || stillBlocked.code !== 'CAPTCHA_DETECTED') {
          runLogger.info('CAPTCHA appears to be resolved, continuing...');
        } else {
          runLogger.warn('CAPTCHA still present after waiting', {
            code: stillBlocked.code,
          });
        }
      } else {
        runLogger.warn('Blocking condition detected', {
          code: blockingCondition.code,
          message: blockingCondition.message,
        });

        // Capture debug artifacts
        if (artifactCollector) {
          await captureScreenshot(page, artifactCollector, 'blocked');
          if (WORKER_CONFIG.uploadArtifacts) {
            await uploadArtifacts(artifactCollector);
            await storeArtifactMetadata(artifactCollector);
          }
        }

        recordRunComplete('blocked');
        return {
          status: 'blocked',
          fieldsFilledCount: 0,
          fieldsFailed: [],
          screenshots: artifactCollector?.artifacts.map((a) => a.storagePath || a.localPath) || [],
          errorCode: blockingCondition.code,
          errorMessage: blockingCondition.message,
        };
      }
    }

    // Apply global dry run mode if configured
    const effectiveDryRun = input.dryRun || WORKER_CONFIG.globalDryRun;

    // Build apply context
    const applyContext: ApplyContext = {
      page,
      jobUrl: input.jobUrl,
      profile: input.profile,
      resumePath,
      dryRun: effectiveDryRun,
    };

    // Run adapter
    const result = await adapter.apply(applyContext);

    // P6: Upload artifacts on success/completion
    if (artifactCollector && WORKER_CONFIG.uploadArtifacts) {
      // Add any screenshots from the result
      for (const screenshot of result.screenshots) {
        if (fs.existsSync(screenshot)) {
          artifactCollector.artifacts.push({
            type: 'screenshot',
            localPath: screenshot,
            timestamp: Date.now(),
          });
        }
      }
      await uploadArtifacts(artifactCollector);
      await storeArtifactMetadata(artifactCollector);

      // Update result with storage paths
      result.screenshots = artifactCollector.artifacts
        .filter((a) => a.type === 'screenshot' && a.storagePath)
        .map((a) => a.storagePath!);
    }

    runLogger.info('Application completed', {
      status: result.status,
      fieldsFilledCount: result.fieldsFilledCount,
      dryRun: effectiveDryRun,
    });

    recordRunComplete(result.status);
    return result;
  } catch (error) {
    const classified = classifyError(error);
    runLogger.error('applyJob error', error as Error, {
      code: classified.code,
      retryable: classified.retryable,
    });

    // P6: Create debug package on error
    if (artifactCollector && context) {
      try {
        const page = context.pages()[0];
        if (page) {
          await createDebugPackage(page, artifactCollector, error as Error);
        }
      } catch {
        // Ignore artifact collection errors
      }
    }

    recordRunComplete('failed');
    return {
      status: 'failed',
      fieldsFilledCount: 0,
      fieldsFailed: [],
      screenshots: artifactCollector?.artifacts
        .filter((a) => a.storagePath)
        .map((a) => a.storagePath!) || [],
      errorCode: classified.code,
      errorMessage: classified.message,
    };
  } finally {
    // Cleanup
    if (context) {
      await context.close();
    }
    if (tempResumeDir && fs.existsSync(tempResumeDir)) {
      fs.rmSync(tempResumeDir, { recursive: true });
    }
    if (artifactCollector) {
      cleanupArtifacts(artifactCollector);
    }
  }
}
