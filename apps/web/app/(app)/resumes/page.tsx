import { createClient } from '@/lib/supabase/server';
import ResumeUploader from './ResumeUploader';
import ResumeList from './ResumeList';

async function getResumes() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching resumes:', error);
    return [];
  }

  return data || [];
}

export default async function ResumesPage() {
  const resumes = await getResumes();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Your Resumes</h1>
        <ResumeUploader />
      </div>

      {resumes.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-gray-600 dark:text-gray-400 mb-2">No resumes yet</p>
          <p className="text-sm text-gray-500">Upload a PDF resume to get started</p>
        </div>
      ) : (
        <ResumeList resumes={resumes} />
      )}
    </div>
  );
}
