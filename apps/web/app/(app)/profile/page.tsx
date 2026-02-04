import { getProfile, Profile } from '@/lib/db/profiles';
import ProfileForm from './ProfileForm';

function calculateCompleteness(profile: Profile | null): number {
  if (!profile) return 0;

  const fields = [
    profile.full_name,
    profile.email,
    profile.phone,
    profile.location_city,
    profile.location_state,
    profile.linkedin_url,
    profile.github_url,
    profile.work_authorization,
  ];

  const filled = fields.filter((f) => f && f.trim() !== '').length;
  return Math.round((filled / fields.length) * 100);
}

export default async function ProfilePage() {
  const profile = await getProfile();
  const completeness = calculateCompleteness(profile);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Your Profile</h1>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {completeness}% complete
          </div>
          <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${completeness}%` }}
            />
          </div>
        </div>
      </div>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Fill in your details below. This information will be used when applying to jobs.
      </p>
      <ProfileForm initialData={profile} />
    </div>
  );
}
