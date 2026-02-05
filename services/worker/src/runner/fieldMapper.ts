/**
 * P5: Advanced Field Handling Utilities
 * Handles complex form fields including dropdowns, radio buttons, checkboxes, and textareas.
 */

import { Page, ElementHandle } from 'playwright';
import { ProfileData } from './adapters/base.js';

// P5.01: Field mapper utility for matching labels to profile data
export interface FieldMatch {
  value: string | string[] | boolean;
  confidence: number; // 0-1 score
}

// Common label patterns mapped to profile fields
const LABEL_PATTERNS: Record<string, (profile: ProfileData) => string | null> = {
  // Name fields
  'first.?name': (p) => p.full_name?.split(' ')[0] || null,
  'last.?name': (p) => p.full_name?.split(' ').slice(1).join(' ') || null,
  'full.?name': (p) => p.full_name,
  '^name$': (p) => p.full_name,

  // Contact fields
  'email': (p) => p.email,
  'phone|mobile|telephone': (p) => p.phone,

  // Social/URLs
  'linkedin': (p) => p.linkedin_url,
  'github': (p) => p.github_url,

  // Location fields
  'city': (p) => p.location_city,
  'state|province': (p) => p.location_state,
  'location|address': (p) =>
    [p.location_city, p.location_state].filter(Boolean).join(', ') || null,

  // Work authorization
  'work.?auth|legally.?authorized|right.?to.?work': (p) => p.work_authorization,
  'sponsorship|visa': (p) => (p.work_authorization === 'us_citizen' ? 'No' : null),
};

// P5.01: Match a label to profile data with confidence score
export function matchLabelToProfile(
  label: string,
  profile: ProfileData
): FieldMatch | null {
  const labelLower = label.toLowerCase().trim();

  for (const [pattern, getter] of Object.entries(LABEL_PATTERNS)) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(labelLower)) {
      const value = getter(profile);
      if (value) {
        return { value, confidence: 0.9 };
      }
    }
  }

  return null;
}

// P5.02: Handle dropdown/select with fuzzy matching
export async function handleDropdown(
  selectElement: ElementHandle,
  targetValue: string,
  fallbackValues: string[] = []
): Promise<boolean> {
  const options = await selectElement.$$('option');
  const targetLower = targetValue.toLowerCase();
  const allValues = [targetValue, ...fallbackValues];

  // First pass: exact match
  for (const option of options) {
    const text = ((await option.textContent()) || '').trim();
    const value = (await option.getAttribute('value')) || '';

    if (text.toLowerCase() === targetLower || value.toLowerCase() === targetLower) {
      await selectElement.selectOption(value);
      return true;
    }
  }

  // Second pass: contains match
  for (const target of allValues) {
    const targetL = target.toLowerCase();
    for (const option of options) {
      const text = ((await option.textContent()) || '').toLowerCase();
      const value = ((await option.getAttribute('value')) || '').toLowerCase();

      if (text.includes(targetL) || value.includes(targetL)) {
        const actualValue = await option.getAttribute('value');
        if (actualValue) {
          await selectElement.selectOption(actualValue);
          return true;
        }
      }
    }
  }

  // Third pass: fuzzy match (first word match)
  const targetWords = targetLower.split(/\s+/);
  for (const option of options) {
    const text = ((await option.textContent()) || '').toLowerCase();
    if (targetWords.some((word) => word.length > 3 && text.includes(word))) {
      const value = await option.getAttribute('value');
      if (value) {
        await selectElement.selectOption(value);
        return true;
      }
    }
  }

  return false;
}

// P5.02: Handle work authorization dropdown specifically
export async function handleWorkAuthDropdown(
  selectElement: ElementHandle,
  workAuth: string
): Promise<boolean> {
  const authLower = workAuth.toLowerCase().replace(/_/g, ' ');

  // Map work authorization values to common dropdown options
  const authMappings: Record<string, string[]> = {
    us_citizen: ['citizen', 'us citizen', 'united states citizen', 'authorized', 'yes'],
    green_card: ['permanent resident', 'green card', 'authorized', 'yes'],
    h1b: ['h1b', 'h-1b', 'work visa', 'visa holder'],
    opt: ['opt', 'f-1', 'student'],
    ead: ['ead', 'employment authorization'],
    other: ['other', 'visa'],
  };

  const fallbacks = authMappings[workAuth] || [authLower, 'yes', 'authorized'];
  return handleDropdown(selectElement, authLower, fallbacks);
}

// P5.03: Handle radio button groups
export async function handleRadioGroup(
  page: Page,
  containerSelector: string,
  targetValue: string | boolean
): Promise<boolean> {
  const container = await page.$(containerSelector);
  if (!container) return false;

  const radios = await container.$$('input[type="radio"]');
  const targetStr = String(targetValue).toLowerCase();

  // Map boolean to common labels
  const targetLabels =
    typeof targetValue === 'boolean'
      ? targetValue
        ? ['yes', 'true', '1']
        : ['no', 'false', '0']
      : [targetStr];

  for (const radio of radios) {
    // Check value attribute
    const value = ((await radio.getAttribute('value')) || '').toLowerCase();
    if (targetLabels.includes(value)) {
      await radio.click();
      return true;
    }

    // Check associated label
    const id = await radio.getAttribute('id');
    if (id) {
      const label = await page.$(`label[for="${id}"]`);
      if (label) {
        const labelText = ((await label.textContent()) || '').toLowerCase().trim();
        if (targetLabels.some((t) => labelText.includes(t))) {
          await radio.click();
          return true;
        }
      }
    }

    // Check parent label
    const parentLabel = await radio.$('xpath=ancestor::label');
    if (parentLabel) {
      const labelText = ((await parentLabel.textContent()) || '').toLowerCase().trim();
      if (targetLabels.some((t) => labelText.includes(t))) {
        await radio.click();
        return true;
      }
    }
  }

  return false;
}

// P5.03: Handle yes/no questions (common in job applications)
export async function handleYesNoQuestion(
  page: Page,
  questionContainer: ElementHandle,
  answer: boolean
): Promise<boolean> {
  const targetLabels = answer ? ['yes', 'true'] : ['no', 'false'];

  // Try radio buttons first
  const radios = await questionContainer.$$('input[type="radio"]');
  for (const radio of radios) {
    const value = ((await radio.getAttribute('value')) || '').toLowerCase();
    if (targetLabels.includes(value)) {
      await radio.click();
      return true;
    }

    // Check nearby label
    const id = await radio.getAttribute('id');
    if (id) {
      const label = await page.$(`label[for="${id}"]`);
      if (label) {
        const labelText = ((await label.textContent()) || '').toLowerCase().trim();
        if (targetLabels.some((t) => labelText.includes(t))) {
          await radio.click();
          return true;
        }
      }
    }
  }

  // Try select dropdown
  const select = await questionContainer.$('select');
  if (select) {
    return handleDropdown(select, answer ? 'yes' : 'no', answer ? ['true', '1'] : ['false', '0']);
  }

  return false;
}

// P5.04: Handle checkbox groups
export async function handleCheckboxGroup(
  checkboxes: ElementHandle[],
  targetValues: string[]
): Promise<number> {
  let checked = 0;
  const targetLower = targetValues.map((v) => v.toLowerCase());

  for (const checkbox of checkboxes) {
    const value = ((await checkbox.getAttribute('value')) || '').toLowerCase();
    const name = ((await checkbox.getAttribute('name')) || '').toLowerCase();

    // Check if this checkbox matches any target
    if (targetLower.some((t) => value.includes(t) || name.includes(t))) {
      const isChecked = await checkbox.isChecked();
      if (!isChecked) {
        await checkbox.click();
        checked++;
      }
    }
  }

  return checked;
}

// P5.04: Handle single required checkbox (e.g., terms and conditions)
export async function handleRequiredCheckbox(
  page: Page,
  labelPatterns: string[]
): Promise<boolean> {
  for (const pattern of labelPatterns) {
    const regex = new RegExp(pattern, 'i');

    // Find all checkboxes
    const checkboxes = await page.$$('input[type="checkbox"]');

    for (const checkbox of checkboxes) {
      // Check if already checked
      const isChecked = await checkbox.isChecked();
      if (isChecked) continue;

      // Get associated label
      const id = await checkbox.getAttribute('id');
      let labelText = '';

      if (id) {
        const label = await page.$(`label[for="${id}"]`);
        if (label) {
          labelText = (await label.textContent()) || '';
        }
      }

      // Check parent label
      if (!labelText) {
        const parent = await checkbox.$('xpath=ancestor::label');
        if (parent) {
          labelText = (await parent.textContent()) || '';
        }
      }

      // Check nearby text
      if (!labelText) {
        const parent = await checkbox.$('xpath=..');
        if (parent) {
          labelText = (await parent.textContent()) || '';
        }
      }

      if (regex.test(labelText)) {
        await checkbox.click();
        return true;
      }
    }
  }

  return false;
}

// P5.05: Handle textarea fields
export async function handleTextarea(
  textarea: ElementHandle,
  content: string,
  maxLength?: number
): Promise<boolean> {
  try {
    // Check if textarea is empty
    const currentValue = await textarea.inputValue();
    if (currentValue.trim()) return false; // Already filled

    // Respect maxLength if specified
    const textToFill = maxLength ? content.slice(0, maxLength) : content;
    await textarea.fill(textToFill);
    return true;
  } catch {
    return false;
  }
}

// P5.05: Generate generic responses for common additional information fields
export function generateGenericResponse(questionLabel: string): string | null {
  const labelLower = questionLabel.toLowerCase();

  // Common question patterns and generic responses
  if (labelLower.includes('how did you hear') || labelLower.includes('where did you find')) {
    return 'Online job search';
  }

  if (labelLower.includes('salary expectation') || labelLower.includes('desired salary')) {
    return 'Open to discussion based on total compensation';
  }

  if (labelLower.includes('start date') || labelLower.includes('when can you start')) {
    return 'Flexible, can start within two weeks of offer';
  }

  if (labelLower.includes('relocation') || labelLower.includes('willing to relocate')) {
    return 'Yes';
  }

  if (labelLower.includes('why') && labelLower.includes('company')) {
    return 'Excited about the opportunity to contribute to the team and grow professionally';
  }

  if (labelLower.includes('additional information') || labelLower.includes('anything else')) {
    return 'Thank you for considering my application.';
  }

  return null;
}

// Utility: Detect field type from element
export async function detectFieldType(
  element: ElementHandle
): Promise<'text' | 'email' | 'tel' | 'select' | 'textarea' | 'radio' | 'checkbox' | 'file' | 'other'> {
  const tagName = await element.evaluate((el) => (el as HTMLElement).tagName.toLowerCase());

  if (tagName === 'select') return 'select';
  if (tagName === 'textarea') return 'textarea';

  if (tagName === 'input') {
    const type = ((await element.getAttribute('type')) || 'text').toLowerCase();
    if (type === 'email') return 'email';
    if (type === 'tel') return 'tel';
    if (type === 'radio') return 'radio';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'file') return 'file';
    return 'text';
  }

  return 'other';
}
