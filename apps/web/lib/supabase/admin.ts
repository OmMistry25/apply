import { createClient } from '@supabase/supabase-js';

// Service role client - server-only, bypasses RLS
// Never import this in client code
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
