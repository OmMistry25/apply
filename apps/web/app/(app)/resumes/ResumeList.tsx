'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Resume = {
  id: string;
  filename: string;
  is_primary: boolean;
  created_at: string;
};

type Props = {
  resumes: Resume[];
};

export default function ResumeList({ resumes }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();

  const handleSetPrimary = async (resumeId: string) => {
    setLoading(resumeId);
    try {
      const res = await fetch('/api/resumes/primary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeId }),
      });

      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async (resumeId: string) => {
    if (!confirm('Are you sure you want to delete this resume?')) return;

    setLoading(resumeId);
    try {
      const res = await fetch(`/api/resumes/${resumeId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      {resumes.map((resume) => (
        <div
          key={resume.id}
          className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 dark:bg-red-900 rounded flex items-center justify-center text-red-600 dark:text-red-400 text-xs font-bold">
              PDF
            </div>
            <div>
              <p className="font-medium">{resume.filename}</p>
              <p className="text-sm text-gray-500">
                {new Date(resume.created_at).toLocaleDateString()}
                {resume.is_primary && (
                  <span className="ml-2 px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded text-xs">
                    Primary
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!resume.is_primary && (
              <button
                onClick={() => handleSetPrimary(resume.id)}
                disabled={loading === resume.id}
                className="text-sm text-blue-600 hover:underline disabled:opacity-50"
              >
                Set Primary
              </button>
            )}
            <button
              onClick={() => handleDelete(resume.id)}
              disabled={loading === resume.id}
              className="text-sm text-red-600 hover:underline disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
