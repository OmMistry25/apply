'use client';

import Link from 'next/link';

type Job = {
  id: string;
  company_name: string | null;
  job_title: string | null;
  url: string;
  ats_type: string;
  status: string;
  created_at: string;
};

type Props = {
  jobs: Job[];
};

const statusColors: Record<string, string> = {
  new: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  queued: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  applying: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  applied: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  blocked: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
};

const atsLabels: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  workday: 'Workday',
  unknown: 'Unknown',
};

export default function JobTable({ jobs }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b dark:border-gray-700">
            <th className="text-left py-3 px-4 font-medium">Job</th>
            <th className="text-left py-3 px-4 font-medium">ATS</th>
            <th className="text-left py-3 px-4 font-medium">Status</th>
            <th className="text-left py-3 px-4 font-medium">Added</th>
            <th className="text-right py-3 px-4 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
              <td className="py-3 px-4">
                <div>
                  <p className="font-medium">
                    {job.company_name || 'Unknown Company'}
                    {job.job_title && ` - ${job.job_title}`}
                  </p>
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline truncate block max-w-xs"
                  >
                    {new URL(job.url).hostname}
                  </a>
                </div>
              </td>
              <td className="py-3 px-4">
                <span className="text-sm">{atsLabels[job.ats_type] || job.ats_type}</span>
              </td>
              <td className="py-3 px-4">
                <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[job.status] || statusColors.new}`}>
                  {job.status}
                </span>
              </td>
              <td className="py-3 px-4 text-sm text-gray-500">
                {new Date(job.created_at).toLocaleDateString()}
              </td>
              <td className="py-3 px-4 text-right">
                <Link
                  href={`/jobs/${job.id}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
