-- Add needs_input status for jobs requiring user input on custom questions
-- This allows jobs to pause and wait for user to provide answers

-- Add new value to run_status enum
alter type run_status add value if not exists 'needs_input';

-- Add new value to job_status enum  
alter type job_status add value if not exists 'needs_input';

-- Add column to store required input fields (questions the user needs to answer)
-- Format: [{ "field_name": "...", "field_type": "select|text", "options": [...] }]
alter table application_runs 
add column if not exists required_inputs jsonb default null;

-- Add column to store user-provided answers for custom questions
-- Format: { "field_name": "answer_value", ... }
alter table application_runs
add column if not exists user_inputs jsonb default null;

comment on column application_runs.required_inputs is 'Questions/fields that require user input before application can be submitted';
comment on column application_runs.user_inputs is 'User-provided answers to custom questions';
