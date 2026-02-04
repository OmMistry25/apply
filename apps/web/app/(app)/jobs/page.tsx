import { createClient } from '@/lib/supabase/server';
import JobLinkForm from './JobLinkForm';
import JobTable from './JobTable';

async function getJobs() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from('job_targets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching jobs:', error);
    return [];
  }

  return data || [];
}

export default async function JobsPage() {
  const jobs = await getJobs();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Job Applications</h1>

      <div className="mb-8">
        <JobLinkForm />
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-gray-600 dark:text-gray-400 mb-2">No jobs added yet</p>
          <p className="text-sm text-gray-500">Paste a job application URL above to get started</p>
        </div>
      ) : (
        <JobTable jobs={jobs} />
      )}
    </div>
  );
}
