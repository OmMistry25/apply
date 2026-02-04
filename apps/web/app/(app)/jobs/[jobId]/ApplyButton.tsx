'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  jobId: string;
  status: string;
};

export default function ApplyButton({ jobId, status }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const canApply = ['new', 'failed'].includes(status);

  const handleApply = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/runs/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobTargetId: jobId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start run');
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start');
    } finally {
      setLoading(false);
    }
  };

  if (!canApply) {
    return (
      <p className="text-sm text-gray-500">
        {status === 'applied' ? 'Already applied' : `Status: ${status}`}
      </p>
    );
  }

  return (
    <div>
      <button
        onClick={handleApply}
        disabled={loading}
        className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? 'Starting...' : 'Apply Now'}
      </button>
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );
}
