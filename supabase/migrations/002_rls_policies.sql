-- Enable Row Level Security on all user-owned tables

alter table profiles enable row level security;
alter table resumes enable row level security;
alter table job_targets enable row level security;
alter table application_runs enable row level security;
alter table run_events enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = user_id);
create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = user_id);
create policy "Users can delete own profile"
  on profiles for delete using (auth.uid() = user_id);

-- Resumes policies
create policy "Users can view own resumes"
  on resumes for select using (auth.uid() = user_id);
create policy "Users can insert own resumes"
  on resumes for insert with check (auth.uid() = user_id);
create policy "Users can update own resumes"
  on resumes for update using (auth.uid() = user_id);
create policy "Users can delete own resumes"
  on resumes for delete using (auth.uid() = user_id);

-- Job targets policies
create policy "Users can view own job targets"
  on job_targets for select using (auth.uid() = user_id);
create policy "Users can insert own job targets"
  on job_targets for insert with check (auth.uid() = user_id);
create policy "Users can update own job targets"
  on job_targets for update using (auth.uid() = user_id);
create policy "Users can delete own job targets"
  on job_targets for delete using (auth.uid() = user_id);

-- Application runs policies
create policy "Users can view own runs"
  on application_runs for select using (auth.uid() = user_id);
create policy "Users can insert own runs"
  on application_runs for insert with check (auth.uid() = user_id);
create policy "Users can update own runs"
  on application_runs for update using (auth.uid() = user_id);
create policy "Users can delete own runs"
  on application_runs for delete using (auth.uid() = user_id);

-- Run events policies (access via run ownership)
create policy "Users can view own run events"
  on run_events for select using (
    exists (
      select 1 from application_runs
      where application_runs.id = run_events.run_id
      and application_runs.user_id = auth.uid()
    )
  );
create policy "Users can insert own run events"
  on run_events for insert with check (
    exists (
      select 1 from application_runs
      where application_runs.id = run_events.run_id
      and application_runs.user_id = auth.uid()
    )
  );
