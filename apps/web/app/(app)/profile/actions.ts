'use server';

import { revalidatePath } from 'next/cache';
import { upsertProfile } from '@/lib/db/profiles';

function toNullIfEmpty(value: FormDataEntryValue | null): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function saveProfile(formData: FormData) {
  const data = {
    full_name: toNullIfEmpty(formData.get('full_name')),
    email: toNullIfEmpty(formData.get('email')),
    phone: toNullIfEmpty(formData.get('phone')),
    location_city: toNullIfEmpty(formData.get('location_city')),
    location_state: toNullIfEmpty(formData.get('location_state')),
    linkedin_url: toNullIfEmpty(formData.get('linkedin_url')),
    github_url: toNullIfEmpty(formData.get('github_url')),
    work_authorization: toNullIfEmpty(formData.get('work_authorization')),
  };

  const profile = await upsertProfile(data);

  if (!profile) {
    return { success: false, error: 'Failed to save profile' };
  }

  revalidatePath('/profile');
  return { success: true };
}
