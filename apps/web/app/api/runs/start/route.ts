import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobTargetId } = await request.json();

    if (!jobTargetId) {
      return NextResponse.json({ error: 'Job target ID required' }, { status: 400 });
    }

    // Verify job belongs to user
    const { data: job, error: jobError } = await supabase
      .from('job_targets')
      .select('id, status')
      .eq('id', jobTargetId)
      .eq('user_id', user.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Get primary resume
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .single();

    if (resumeError || !resume) {
      return NextResponse.json(
        { error: 'No primary resume set. Please upload and set a primary resume first.' },
        { status: 400 }
      );
    }

    // Create application run
    const { data: run, error: runError } = await supabase
      .from('application_runs')
      .insert({
        user_id: user.id,
        job_target_id: jobTargetId,
        resume_id: resume.id,
        status: 'queued',
        attempt: 1,
      })
      .select()
      .single();

    if (runError) {
      console.error('Run create error:', runError);
      return NextResponse.json({ error: 'Failed to create run' }, { status: 500 });
    }

    // Update job status to queued
    await supabase
      .from('job_targets')
      .update({ status: 'queued', updated_at: new Date().toISOString() })
      .eq('id', jobTargetId);

    return NextResponse.json({ run });
  } catch (error) {
    console.error('Start run error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
