-- AI Job Agent Platform - Initial Schema
-- Tables: profiles, resumes, job_targets, application_runs, run_events

-- Enums
create type work_authorization as enum (
  'us_citizen',
  'permanent_resident',
  'visa_holder',
  'other'
);

create type ats_type as enum (
  'greenhouse',
  'lever',
  'workday',
  'unknown'
);

create type job_status as enum (
  'new',
  'queued',
  'applying',
  'applied',
  'failed',
  'blocked'
);

create type run_status as enum (
  'queued',
  'running',
  'succeeded',
  'failed',
  'retryable'
);

create type event_level as enum (
  'info',
  'warn',
  'error'
);

-- Profiles table
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  location_city text,
  location_state text,
  linkedin_url text,
  github_url text,
  work_authorization work_authorization,
  education_json jsonb,
  experience_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Resumes table
create table resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  filename text,
  content_type text,
  size_bytes integer,
  is_primary boolean not null default false,
  parsed_json jsonb,
  created_at timestamptz not null default now()
);

create index resumes_user_id_idx on resumes(user_id);

-- Job targets table
create table job_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text,
  job_title text,
  url text not null,
  normalized_url text not null,
  ats_type ats_type not null default 'unknown',
  status job_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index job_targets_user_status_idx on job_targets(user_id, status);
create unique index job_targets_user_normalized_url_idx on job_targets(user_id, normalized_url);

-- Application runs table
create table application_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_target_id uuid not null references job_targets(id) on delete cascade,
  resume_id uuid not null references resumes(id) on delete cascade,
  status run_status not null default 'queued',
  attempt integer not null default 1,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_message text,
  result_json jsonb,
  artifacts_json jsonb,
  created_at timestamptz not null default now()
);

create index application_runs_user_id_idx on application_runs(user_id);
create index application_runs_status_idx on application_runs(status);

-- Run events table (for detailed logging)
create table run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references application_runs(id) on delete cascade,
  ts timestamptz not null default now(),
  level event_level not null default 'info',
  message text not null,
  data jsonb
);

create index run_events_run_ts_idx on run_events(run_id, ts);
