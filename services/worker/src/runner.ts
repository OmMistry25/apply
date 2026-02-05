import { getSupabase } from './db.js';
import { applyJob } from './runner/applyJob.js';
import { ProfileData } from './runner/adapters/base.js';

export type Run = {
  id: string;
  user_id: string;
  job_target_id: string;
  resume_id: string;
  status: string;
  attempt: number;
  dry_run?: boolean;
};

export type JobTarget = {
  id: string;
  url: string;
  ats_type: string;
};

export type Resume = {
  id: string;
  storage_path: string;
};

export type Profile = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location_city: string | null;
  location_state: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  work_authorization: string | null;
};

// T072: Claim a queued run atomically
export async function claimRun(): Promise<Run | null> {
  const supabase = getSupabase();

  // Find a queued run and atomically update it to running
  const { data: runs, error: fetchError } = await supabase
    .from('application_runs')
    .select('*')
    .eq('status', 'queued')
    .limit(1);

  if (fetchError || !runs || runs.length === 0) {
    return null;
  }

  const run = runs[0];

  // Atomically claim it
  const { data: claimed, error: claimError } = await supabase
    .from('application_runs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', run.id)
    .eq('status', 'queued') // Guard: only if still queued
    .select()
    .single();

  if (claimError || !claimed) {
    // Another worker claimed it
    return null;
  }

  // Log event
  await logEvent(claimed.id, 'info', 'Run claimed by worker');

  return claimed as Run;
}

// Process the run using real browser automation
export async function processRun(run: Run): Promise<void> {
  const supabase = getSupabase();

  try {
    // Get job target info
    const { data: job } = await supabase
      .from('job_targets')
      .select('*')
      .eq('id', run.job_target_id)
      .single();

    if (!job) {
      await failRun(run.id, 'JOB_NOT_FOUND', 'Job target not found');
      return;
    }

    // Get resume info
    const { data: resume } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', run.resume_id)
      .single();

    if (!resume) {
      await failRun(run.id, 'RESUME_NOT_FOUND', 'Resume not found');
      return;
    }

    // Get profile info
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', run.user_id)
      .single();

    if (!profile) {
      await failRun(run.id, 'PROFILE_NOT_FOUND', 'Profile not found');
      return;
    }

    await logEvent(run.id, 'info', `Starting application to ${job.url}`);

    // Check for legacy test failure trigger
    const url = new URL(job.url);
    if (url.searchParams.get('fail') === 'true') {
      await failRun(run.id, 'TEST_FAILURE', 'Intentional failure for testing');
      await updateJobStatus(run.job_target_id, 'failed');
      return;
    }

    // Build profile data for adapter
    const profileData: ProfileData = {
      full_name: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      location_city: profile.location_city,
      location_state: profile.location_state,
      linkedin_url: profile.linkedin_url,
      github_url: profile.github_url,
      work_authorization: profile.work_authorization,
    };

    // Run the actual application
    const result = await applyJob({
      runId: run.id,
      userId: run.user_id,
      jobUrl: job.url,
      atsType: job.ats_type,
      resumeStoragePath: resume.storage_path,
      profile: profileData,
      dryRun: run.dry_run || false,
    });

    await logEvent(run.id, 'info', `Application result: ${result.status}`, {
      fieldsFilledCount: result.fieldsFilledCount,
      fieldsFailed: result.fieldsFailed,
    });

    if (result.status === 'succeeded' || result.status === 'dry_run_complete') {
      await supabase
        .from('application_runs')
        .update({
          status: result.status === 'dry_run_complete' ? 'succeeded' : 'succeeded',
          finished_at: new Date().toISOString(),
          result_json: {
            fieldsFilledCount: result.fieldsFilledCount,
            fieldsFailed: result.fieldsFailed,
            confirmationMessage: result.confirmationMessage,
            screenshots: result.screenshots,
            dryRun: run.dry_run || false,
          },
        })
        .eq('id', run.id);

      if (!run.dry_run) {
        await updateJobStatus(run.job_target_id, 'applied');
      }

      console.log(`Run ${run.id} completed successfully`);
    } else if (result.status === 'needs_input') {
      // Application paused - needs user input for custom questions
      await supabase
        .from('application_runs')
        .update({
          status: 'needs_input',
          finished_at: null, // Not finished - waiting for user input
          error_code: 'NEEDS_INPUT',
          error_message: result.errorMessage || 'Waiting for user to answer custom questions',
          required_inputs: result.requiredInputs || [],
          result_json: {
            fieldsFilledCount: result.fieldsFilledCount,
            fieldsFailed: result.fieldsFailed,
            screenshots: result.screenshots,
          },
        })
        .eq('id', run.id);

      await updateJobStatus(run.job_target_id, 'needs_input');
      console.log(`Run ${run.id} needs user input: ${result.requiredInputs?.length || 0} fields`);
    } else if (result.status === 'blocked') {
      await supabase
        .from('application_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error_code: result.errorCode || 'BLOCKED',
          error_message: result.errorMessage || 'Application blocked',
          result_json: {
            fieldsFilledCount: result.fieldsFilledCount,
            fieldsFailed: result.fieldsFailed,
            screenshots: result.screenshots,
          },
        })
        .eq('id', run.id);

      await updateJobStatus(run.job_target_id, 'blocked');
      console.log(`Run ${run.id} blocked: ${result.errorMessage}`);
    } else {
      await failRun(run.id, result.errorCode || 'UNKNOWN', result.errorMessage || 'Application failed');
      await updateJobStatus(run.job_target_id, 'failed');
    }
  } catch (error) {
    console.error(`Run ${run.id} failed:`, error);
    await failRun(
      run.id,
      'UNEXPECTED_ERROR',
      error instanceof Error ? error.message : 'Unknown error'
    );
    await updateJobStatus(run.job_target_id, 'failed');
  }
}

async function failRun(runId: string, errorCode: string, errorMessage: string): Promise<void> {
  const supabase = getSupabase();
  await logEvent(runId, 'error', errorMessage);

  await supabase
    .from('application_runs')
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_code: errorCode,
      error_message: errorMessage,
    })
    .eq('id', runId);
}

// T075: Update job status based on run result
async function updateJobStatus(jobTargetId: string, status: string): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from('job_targets')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobTargetId);
}

// T076: Log run events
async function logEvent(
  runId: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabase();
  await supabase.from('run_events').insert({
    run_id: runId,
    level,
    message,
    data: data || null,
  });
}
