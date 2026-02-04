# Supabase Storage Setup

## Required Buckets

Create these buckets in Supabase Dashboard → Storage:

### 1. `resumes` bucket
- **Purpose:** Store user resume PDFs
- **Path convention:** `resumes/<user_id>/<resume_id>.pdf`
- **Public:** No

### 2. `run-artifacts` bucket
- **Purpose:** Store screenshots, HTML snapshots, debug logs from application runs
- **Path convention:** `run-artifacts/<user_id>/<run_id>/<filename>`
- **Public:** No

---

## Storage Policies

Apply these policies in Supabase Dashboard → Storage → Policies:

### `resumes` bucket policies

```sql
-- Allow users to upload to their own folder
create policy "Users can upload own resumes"
on storage.objects for insert
with check (
  bucket_id = 'resumes' and
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to view their own resumes
create policy "Users can view own resumes"
on storage.objects for select
using (
  bucket_id = 'resumes' and
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own resumes
create policy "Users can delete own resumes"
on storage.objects for delete
using (
  bucket_id = 'resumes' and
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### `run-artifacts` bucket policies

```sql
-- Allow users to view their own artifacts
create policy "Users can view own artifacts"
on storage.objects for select
using (
  bucket_id = 'run-artifacts' and
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Service role uploads artifacts (no user policy needed for insert)
```

---

## Manual Steps

1. Go to Supabase Dashboard → Storage
2. Click "New bucket" and create `resumes` (private)
3. Click "New bucket" and create `run-artifacts` (private)
4. Go to Policies tab and add the SQL policies above
