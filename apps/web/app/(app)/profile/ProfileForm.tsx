'use client';

import { useState } from 'react';
import { Profile } from '@/lib/db/profiles';
import { saveProfile } from './actions';

type Props = {
  initialData: Profile | null;
};

export default function ProfileForm({ initialData }: Props) {
  const [formData, setFormData] = useState({
    full_name: initialData?.full_name || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    work_authorization: initialData?.work_authorization || '',
    location_city: initialData?.location_city || '',
    location_state: initialData?.location_state || '',
    linkedin_url: initialData?.linkedin_url || '',
    github_url: initialData?.github_url || '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      data.append(key, value);
    });

    const result = await saveProfile(data);

    if (result.success) {
      setMessage({ type: 'success', text: 'Profile saved successfully' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to save profile' });
    }

    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="full_name" className="block text-sm font-medium mb-1">
            Full Name *
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            value={formData.full_name}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">
            Email *
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium mb-1">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        <div>
          <label htmlFor="work_authorization" className="block text-sm font-medium mb-1">
            Work Authorization
          </label>
          <select
            id="work_authorization"
            name="work_authorization"
            value={formData.work_authorization}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
          >
            <option value="">Select...</option>
            <option value="us_citizen">US Citizen</option>
            <option value="permanent_resident">Permanent Resident</option>
            <option value="visa_holder">Visa Holder</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label htmlFor="location_city" className="block text-sm font-medium mb-1">
            City
          </label>
          <input
            id="location_city"
            name="location_city"
            type="text"
            value={formData.location_city}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        <div>
          <label htmlFor="location_state" className="block text-sm font-medium mb-1">
            State
          </label>
          <input
            id="location_state"
            name="location_state"
            type="text"
            value={formData.location_state}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        <div>
          <label htmlFor="linkedin_url" className="block text-sm font-medium mb-1">
            LinkedIn URL
          </label>
          <input
            id="linkedin_url"
            name="linkedin_url"
            type="url"
            value={formData.linkedin_url}
            onChange={handleChange}
            placeholder="https://linkedin.com/in/..."
            className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        <div>
          <label htmlFor="github_url" className="block text-sm font-medium mb-1">
            GitHub URL
          </label>
          <input
            id="github_url"
            name="github_url"
            type="url"
            value={formData.github_url}
            onChange={handleChange}
            placeholder="https://github.com/..."
            className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
          />
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-md ${
            message.type === 'success'
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Profile'}
      </button>
    </form>
  );
}
