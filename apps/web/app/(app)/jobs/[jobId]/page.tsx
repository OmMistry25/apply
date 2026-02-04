import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ApplyButton from './ApplyButton';

type Props = {
  params: Promise<{ jobId: string }>;
};

async function getJob(jobId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from('job_targets')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', user.id)
    .single();

  return data;
}

async function getRuns(jobId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from('application_runs')
    .select('*')
    .eq('job_target_id', jobId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return data || [];
}

const statusColors: Record<string, string> = {
  new: 'bg-gray-100 text-gray-700',
  queued: 'bg-yellow-100 text-yellow-700',
  applying: 'bg-blue-100 text-blue-700',
  applied: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  blocked: 'bg-orange-100 text-orange-700',
};

export default async function JobDetailPage({ params }: Props) {
  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job) {
    notFound();
  }

  const runs = await getRuns(jobId);

  return (
    <div>
      <div className="mb-6">
        <Link href="/jobs" className="text-blue-600 hover:underline text-sm">
          Back to Jobs
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">
              {job.company_name || 'Unknown Company'}
              {job.job_title && ` - ${job.job_title}`}
            </h1>
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm"
            >
              {job.url}
            </a>
          </div>
          <span className={`px-3 py-1 rounded text-sm font-medium ${statusColors[job.status]}`}>
            {job.status}
          </span>
        </div>

        <div className="mt-4 flex gap-4 text-sm text-gray-500">
          <span>ATS: {job.ats_type}</span>
          <span>Added: {new Date(job.created_at).toLocaleDateString()}</span>
        </div>

        <div className="mt-6">
          <ApplyButton jobId={job.id} status={job.status} />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">Run History</h2>
        {runs.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-gray-500">No runs yet. Click Apply to start.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <div
                key={run.id}
                className="p-4 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      run.status === 'succeeded' ? 'bg-green-100 text-green-700' :
                      run.status === 'failed' ? 'bg-red-100 text-red-700' :
                      run.status === 'running' ? 'bg-blue-100 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {run.status}
                    </span>
                    <span className="ml-3 text-sm text-gray-500">
                      Attempt #{run.attempt}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                </div>
                {run.error_message && (
                  <p className="mt-2 text-sm text-red-600">{run.error_message}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
