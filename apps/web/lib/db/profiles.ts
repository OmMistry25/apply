import { createClient } from '@/lib/supabase/server';

export type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location_city: string | null;
  location_state: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  work_authorization: string | null;
  education_json: unknown;
  experience_json: unknown;
  created_at: string;
  updated_at: string;
};

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching profile:', error);
  }

  return data as Profile | null;
}

export type ProfileInput = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  work_authorization?: string | null;
};

export async function upsertProfile(input: ProfileInput): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: user.id,
        ...input,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('Error upserting profile:', error);
    return null;
  }

  return data as Profile;
}
