import { z } from 'zod';

export const ProfileSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').nullable(),
  email: z.string().email('Invalid email address').nullable(),
  phone: z.string().nullable(),
  location_city: z.string().nullable(),
  location_state: z.string().nullable(),
  linkedin_url: z.string().url('Invalid URL').nullable().or(z.literal('')),
  github_url: z.string().url('Invalid URL').nullable().or(z.literal('')),
  work_authorization: z.enum(['us_citizen', 'permanent_resident', 'visa_holder', 'other']).nullable(),
});

export type ProfileFormData = z.infer<typeof ProfileSchema>;
