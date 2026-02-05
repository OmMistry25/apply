import { getSupabase } from '../db.js';
import * as fs from 'fs';
import * as path from 'path';

export async function downloadResume(
  storagePath: string,
  tempDir: string
): Promise<string> {
  const supabase = getSupabase();

  // Download file from Supabase Storage
  const { data, error } = await supabase.storage
    .from('resumes')
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to download resume: ${error?.message || 'No data'}`);
  }

  // Write to temp file
  const fileName = path.basename(storagePath);
  const localPath = path.join(tempDir, fileName);

  const buffer = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(localPath, buffer);

  console.log(`Resume downloaded to ${localPath}`);
  return localPath;
}
