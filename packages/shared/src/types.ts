// Shared TypeScript types for the AI Job Agent Platform

export type WorkAuthorization =
  | 'us_citizen'
  | 'permanent_resident'
  | 'visa_holder'
  | 'other';

export type AtsType = 'greenhouse' | 'lever' | 'workday' | 'unknown';

export type JobStatus =
  | 'new'
  | 'queued'
  | 'applying'
  | 'applied'
  | 'failed'
  | 'blocked';

export type RunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'retryable';

export type EventLevel = 'info' | 'warn' | 'error';
