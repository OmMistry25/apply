/**
 * P6: Artifacts and Debugging Utilities
 * Handles screenshot capture, HTML snapshots, log capture, and artifact storage.
 */

import { Page, BrowserContext } from 'playwright';
import { getSupabase } from '../db.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Artifact types
export interface Artifact {
  type: 'screenshot' | 'html_snapshot' | 'console_log';
  localPath: string;
  storagePath?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface ArtifactCollector {
  runId: string;
  artifacts: Artifact[];
  consoleLogs: ConsoleLogEntry[];
  tempDir: string;
}

export interface ConsoleLogEntry {
  type: 'log' | 'error' | 'warning' | 'info';
  text: string;
  timestamp: number;
}

// P6.01: Create artifact collector for a run
export function createArtifactCollector(runId: string): ArtifactCollector {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `artifacts-${runId}-`));
  return {
    runId,
    artifacts: [],
    consoleLogs: [],
    tempDir,
  };
}

// P6.01: Take screenshot and add to collector
export async function captureScreenshot(
  page: Page,
  collector: ArtifactCollector,
  name: string,
  fullPage: boolean = false
): Promise<Artifact | null> {
  try {
    const timestamp = Date.now();
    const filename = `${name}-${timestamp}.png`;
    const localPath = path.join(collector.tempDir, filename);

    await page.screenshot({
      path: localPath,
      fullPage,
    });

    const artifact: Artifact = {
      type: 'screenshot',
      localPath,
      timestamp,
      metadata: {
        name,
        fullPage,
        url: page.url(),
      },
    };

    collector.artifacts.push(artifact);
    console.log(`Screenshot captured: ${filename}`);
    return artifact;
  } catch (error) {
    console.error('Screenshot capture failed:', error);
    return null;
  }
}

// P6.04: Capture HTML snapshot for debugging
export async function captureHtmlSnapshot(
  page: Page,
  collector: ArtifactCollector,
  name: string
): Promise<Artifact | null> {
  try {
    const timestamp = Date.now();
    const filename = `${name}-${timestamp}.html`;
    const localPath = path.join(collector.tempDir, filename);

    const html = await page.content();
    fs.writeFileSync(localPath, html, 'utf-8');

    const artifact: Artifact = {
      type: 'html_snapshot',
      localPath,
      timestamp,
      metadata: {
        name,
        url: page.url(),
        title: await page.title(),
      },
    };

    collector.artifacts.push(artifact);
    console.log(`HTML snapshot captured: ${filename}`);
    return artifact;
  } catch (error) {
    console.error('HTML snapshot failed:', error);
    return null;
  }
}

// P6.05: Setup console log capture
export function setupConsoleCapture(
  page: Page,
  collector: ArtifactCollector
): void {
  page.on('console', (msg) => {
    const type = msg.type() as 'log' | 'error' | 'warning' | 'info';
    collector.consoleLogs.push({
      type,
      text: msg.text(),
      timestamp: Date.now(),
    });
  });

  page.on('pageerror', (error) => {
    collector.consoleLogs.push({
      type: 'error',
      text: `Page Error: ${error.message}`,
      timestamp: Date.now(),
    });
  });
}

// P6.05: Save console logs to file
export async function saveConsoleLogs(
  collector: ArtifactCollector
): Promise<Artifact | null> {
  if (collector.consoleLogs.length === 0) return null;

  try {
    const timestamp = Date.now();
    const filename = `console-logs-${timestamp}.json`;
    const localPath = path.join(collector.tempDir, filename);

    fs.writeFileSync(
      localPath,
      JSON.stringify(collector.consoleLogs, null, 2),
      'utf-8'
    );

    const artifact: Artifact = {
      type: 'console_log',
      localPath,
      timestamp,
      metadata: {
        entryCount: collector.consoleLogs.length,
      },
    };

    collector.artifacts.push(artifact);
    return artifact;
  } catch (error) {
    console.error('Console log save failed:', error);
    return null;
  }
}

// P6.02: Upload artifacts to Supabase Storage
export async function uploadArtifacts(
  collector: ArtifactCollector
): Promise<void> {
  const supabase = getSupabase();

  for (const artifact of collector.artifacts) {
    try {
      if (!fs.existsSync(artifact.localPath)) continue;

      const filename = path.basename(artifact.localPath);
      const storagePath = `runs/${collector.runId}/${filename}`;

      const fileBuffer = fs.readFileSync(artifact.localPath);

      const { error } = await supabase.storage
        .from('artifacts')
        .upload(storagePath, fileBuffer, {
          contentType: getContentType(artifact.type),
          upsert: true,
        });

      if (error) {
        console.error(`Failed to upload ${filename}:`, error.message);
      } else {
        artifact.storagePath = storagePath;
        console.log(`Uploaded artifact: ${storagePath}`);
      }
    } catch (error) {
      console.error('Artifact upload error:', error);
    }
  }
}

// P6.03: Store artifact metadata in database
export async function storeArtifactMetadata(
  collector: ArtifactCollector
): Promise<void> {
  const supabase = getSupabase();

  const artifactRecords = collector.artifacts
    .filter((a) => a.storagePath)
    .map((a) => ({
      run_id: collector.runId,
      type: a.type,
      storage_path: a.storagePath,
      metadata: a.metadata,
      created_at: new Date(a.timestamp).toISOString(),
    }));

  if (artifactRecords.length === 0) return;

  const { error } = await supabase.from('run_artifacts').insert(artifactRecords);

  if (error) {
    console.error('Failed to store artifact metadata:', error.message);
  } else {
    console.log(`Stored ${artifactRecords.length} artifact records`);
  }
}

// P6: Cleanup temporary artifacts
export function cleanupArtifacts(collector: ArtifactCollector): void {
  try {
    if (fs.existsSync(collector.tempDir)) {
      fs.rmSync(collector.tempDir, { recursive: true });
      console.log('Cleaned up temporary artifacts');
    }
  } catch (error) {
    console.error('Artifact cleanup failed:', error);
  }
}

// Helper: Get content type for artifact
function getContentType(type: Artifact['type']): string {
  switch (type) {
    case 'screenshot':
      return 'image/png';
    case 'html_snapshot':
      return 'text/html';
    case 'console_log':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

// Create a full debug package for failed runs
export async function createDebugPackage(
  page: Page,
  collector: ArtifactCollector,
  error?: Error
): Promise<void> {
  // Capture final state
  await captureScreenshot(page, collector, 'error-state', true);
  await captureHtmlSnapshot(page, collector, 'error-state');

  // Save console logs
  await saveConsoleLogs(collector);

  // Add error info if provided
  if (error) {
    const errorPath = path.join(collector.tempDir, 'error.json');
    fs.writeFileSync(
      errorPath,
      JSON.stringify(
        {
          message: error.message,
          stack: error.stack,
          timestamp: Date.now(),
        },
        null,
        2
      ),
      'utf-8'
    );

    collector.artifacts.push({
      type: 'console_log', // Using console_log type for JSON
      localPath: errorPath,
      timestamp: Date.now(),
      metadata: { isError: true },
    });
  }

  // Upload all artifacts
  await uploadArtifacts(collector);
  await storeArtifactMetadata(collector);
}
