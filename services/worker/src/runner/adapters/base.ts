import { Page } from 'playwright';

// P2.02: ApplyContext - all data needed for an application
export interface ApplyContext {
  page: Page;
  jobUrl: string;
  profile: ProfileData;
  resumePath: string; // Local path to downloaded resume
  dryRun: boolean;
}

export interface ProfileData {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location_city: string | null;
  location_state: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  work_authorization: string | null;
}

// Required input field that needs user answer
export interface RequiredInput {
  fieldName: string;        // Human-readable field name/question
  fieldType: 'select' | 'text' | 'textarea' | 'radio' | 'checkbox';
  options?: string[];       // Available options for select/radio fields
  required: boolean;
}

// P2.03: ApplyResult - outcome of an application attempt
export interface ApplyResult {
  status: 'succeeded' | 'failed' | 'blocked' | 'dry_run_complete' | 'needs_input';
  fieldsFilledCount: number;
  fieldsFailed: string[];
  screenshots: string[]; // Paths to screenshot files
  errorCode?: string;
  errorMessage?: string;
  confirmationMessage?: string;
  requiredInputs?: RequiredInput[];  // Fields that need user input
}

// P2.01: ATSAdapter interface
export interface ATSAdapter {
  // Returns true if this adapter can handle the given URL
  supports(url: string): boolean;

  // Get the name of this adapter (for logging)
  name: string;

  // Apply to the job
  apply(ctx: ApplyContext): Promise<ApplyResult>;
}
