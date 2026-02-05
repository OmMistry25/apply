import { ATSAdapter, ApplyContext, ApplyResult, RequiredInput } from './base.js';
import * as path from 'path';
import * as os from 'os';

export class GreenhouseAdapter implements ATSAdapter {
  name = 'Greenhouse';

  // P3.01: Greenhouse form patterns
  private static readonly SELECTORS = {
    // Apply button patterns (boards.greenhouse.io)
    applyButton: [
      '#apply_button',
      'a[data-job-apply-button]',
      'a[href*="#app"]',
      'a:has-text("Apply for this job")',
      'a:has-text("Apply Now")',
      'button:has-text("Apply")',
    ],
    // Form container
    form: ['#application_form', 'form#job_application', 'form'],
    // Submit button patterns
    submit: [
      '#submit_app',
      'button[type="submit"]:has-text("Submit")',
      'input[type="submit"][value*="Submit"]',
      'button:has-text("Submit Application")',
    ],
    // Resume/file upload
    resumeInput: [
      'input[type="file"][name*="resume"]',
      'input[type="file"][id*="resume"]',
      'input[type="file"][data-field="resume"]',
      '#resume_input',
      'input[type="file"]',
    ],
    // Cover letter upload
    coverLetterInput: [
      'input[type="file"][name*="cover_letter"]',
      'input[type="file"][id*="cover_letter"]',
      'input[type="file"][data-field="cover_letter"]',
    ],
  };

  // P3.02: Common Greenhouse field patterns
  private static readonly FIELD_PATTERNS = {
    firstName: ['input[name*="first_name"]', 'input[id*="first_name"]', '#first_name'],
    lastName: ['input[name*="last_name"]', 'input[id*="last_name"]', '#last_name'],
    email: ['input[name*="email"]', 'input[type="email"]', '#email'],
    phone: ['input[name*="phone"]', 'input[type="tel"]', '#phone'],
    linkedin: [
      'input[name*="linkedin"]',
      'input[id*="linkedin"]',
      'input[placeholder*="linkedin"]',
      'input[placeholder*="LinkedIn"]',
      'input[aria-label*="LinkedIn"]',
      'input[aria-label*="linkedin"]',
      '.field:has(label:has-text("LinkedIn")) input',
      'label:has-text("LinkedIn") + input',
      'label:has-text("LinkedIn") ~ input',
    ],
    github: ['input[name*="github"]', 'input[id*="github"]', 'input[placeholder*="github"]'],
    website: ['input[name*="website"]', 'input[id*="website"]', 'input[name*="portfolio"]'],
    location: ['input[name*="location"]', 'input[id*="location"]'],
    city: ['input[name*="city"]', 'input[id*="city"]'],
    state: ['input[name*="state"]', 'input[id*="state"]', 'select[name*="state"]'],
    country: [
      'select[name*="country"]',
      'select[id*="country"]',
      'input[name*="country"]',
      'input[id*="country"]',
    ],
    workAuth: [
      'select[name*="authorization"]',
      'select[id*="authorization"]',
      'select[name*="sponsorship"]',
      'select[name*="legally_authorized"]',
    ],
  };

  supports(url: string): boolean {
    try {
      const parsed = new URL(url);
      // Greenhouse uses boards.greenhouse.io or custom domains pointing to greenhouse
      return (
        parsed.host.includes('greenhouse.io') ||
        parsed.host.includes('boards.eu.greenhouse.io')
      );
    } catch {
      return false;
    }
  }

  async apply(ctx: ApplyContext): Promise<ApplyResult> {
    const { page, dryRun } = ctx;
    const screenshots: string[] = [];
    let fieldsFilledCount = 0;
    const fieldsFailed: string[] = [];

    try {
      // P3.03: Navigate to application form
      const foundForm = await this.navigateToForm(ctx);
      if (!foundForm) {
        return {
          status: 'failed',
          fieldsFilledCount: 0,
          fieldsFailed: [],
          screenshots,
          errorCode: 'FORM_NOT_FOUND',
          errorMessage: 'Could not find or navigate to application form',
        };
      }

      // Take screenshot after form loads
      const formScreenshot = await this.takeScreenshot(page, 'form-loaded');
      if (formScreenshot) screenshots.push(formScreenshot);

      // P3.04-P3.08: Fill form fields
      fieldsFilledCount = await this.fillFormFields(ctx, fieldsFailed);
      console.log(`Filled ${fieldsFilledCount} fields, failed: ${fieldsFailed.join(', ') || 'none'}`);

      // P3.09: Handle resume upload
      const resumeUploaded = await this.uploadResume(ctx);
      if (resumeUploaded) {
        fieldsFilledCount++;
        console.log('Resume uploaded successfully');
      }

      // P3.10: Handle cover letter if available (optional)
      await this.handleCoverLetter(ctx);

      // Take screenshot before submission
      const preSubmitScreenshot = await this.takeScreenshot(page, 'pre-submit');
      if (preSubmitScreenshot) screenshots.push(preSubmitScreenshot);

      // P8: Dry run mode - stop before submission
      if (dryRun) {
        return {
          status: 'dry_run_complete',
          fieldsFilledCount,
          fieldsFailed,
          screenshots,
          confirmationMessage: 'Dry run completed - form filled but not submitted',
        };
      }

      // Pre-submit check: Detect any unfilled required fields that need user input
      const unfilledFields = await this.detectUnfilledRequiredFields(page);
      if (unfilledFields.length > 0) {
        console.log(`Found ${unfilledFields.length} unfilled required fields that need user input`);
        for (const field of unfilledFields) {
          console.log(`  - ${field.fieldName} (${field.fieldType})`);
        }
        
        // Return needs_input status so user can provide answers
        return {
          status: 'needs_input',
          fieldsFilledCount,
          fieldsFailed,
          screenshots,
          requiredInputs: unfilledFields,
          errorMessage: `Application requires answers to ${unfilledFields.length} custom question(s)`,
        };
      }

      // P3.11: Submit form
      const submitted = await this.submitForm(ctx);
      if (!submitted) {
        return {
          status: 'failed',
          fieldsFilledCount,
          fieldsFailed,
          screenshots,
          errorCode: 'SUBMIT_FAILED',
          errorMessage: 'Could not find or click submit button',
        };
      }

      // Wait for response
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

      // Take post-submit screenshot
      const postSubmitScreenshot = await this.takeScreenshot(page, 'post-submit');
      if (postSubmitScreenshot) screenshots.push(postSubmitScreenshot);

      // P3.12: Detect success or P3.13: Handle errors
      return await this.detectOutcome(ctx, fieldsFilledCount, fieldsFailed, screenshots);
    } catch (error) {
      const errorScreenshot = await this.takeScreenshot(page, 'error');
      if (errorScreenshot) screenshots.push(errorScreenshot);

      return {
        status: 'failed',
        fieldsFilledCount,
        fieldsFailed,
        screenshots,
        errorCode: 'ADAPTER_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // P3.03: Navigate to application form
  private async navigateToForm(ctx: ApplyContext): Promise<boolean> {
    const { page } = ctx;

    // Check if we're already on the form
    const existingForm = await this.findElement(page, GreenhouseAdapter.SELECTORS.form);
    if (existingForm) {
      // Look for any input fields - if present, we're on the form
      const hasInputs = await page.$('form input[type="text"], form input[type="email"]');
      if (hasInputs) {
        console.log('Already on application form');
        return true;
      }
    }

    // Look for Apply button
    const applyButton = await this.findElement(page, GreenhouseAdapter.SELECTORS.applyButton);
    if (applyButton) {
      await applyButton.click();
      await page.waitForLoadState('domcontentloaded');
      // Wait for form to appear
      await page.waitForSelector('form', { timeout: 10000 }).catch(() => null);
      return true;
    }

    // Some Greenhouse jobs have the form directly on the page
    await page.waitForSelector('form', { timeout: 5000 }).catch(() => null);
    return !!(await page.$('form'));
  }

  // P3.04-P3.08: Fill form fields with comprehensive patterns
  private async fillFormFields(ctx: ApplyContext, fieldsFailed: string[]): Promise<number> {
    const { page, profile } = ctx;
    let filled = 0;

    // Parse full name into first/last
    const nameParts = (profile.full_name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Build location string
    const location = [profile.location_city, profile.location_state]
      .filter(Boolean)
      .join(', ');

    // Define field mappings
    const fields = [
      { patterns: GreenhouseAdapter.FIELD_PATTERNS.firstName, value: firstName, label: 'First Name' },
      { patterns: GreenhouseAdapter.FIELD_PATTERNS.lastName, value: lastName, label: 'Last Name' },
      { patterns: GreenhouseAdapter.FIELD_PATTERNS.email, value: profile.email, label: 'Email' },
      { patterns: GreenhouseAdapter.FIELD_PATTERNS.phone, value: profile.phone, label: 'Phone' },
      { patterns: GreenhouseAdapter.FIELD_PATTERNS.linkedin, value: profile.linkedin_url, label: 'LinkedIn' },
      { patterns: GreenhouseAdapter.FIELD_PATTERNS.github, value: profile.github_url, label: 'GitHub' },
      { patterns: GreenhouseAdapter.FIELD_PATTERNS.location, value: location, label: 'Location' },
      { patterns: GreenhouseAdapter.FIELD_PATTERNS.city, value: profile.location_city, label: 'City' },
      { patterns: GreenhouseAdapter.FIELD_PATTERNS.state, value: profile.location_state, label: 'State' },
    ];

    for (const field of fields) {
      if (!field.value) continue;

      try {
        const element = await this.findElement(page, field.patterns);
        if (element) {
          await element.fill(field.value);
          filled++;
        }
      } catch (error) {
        console.log(`Failed to fill ${field.label}:`, error);
        fieldsFailed.push(field.label);
      }
    }

    // Handle country dropdown - could be standard select or custom dropdown
    try {
      const countryFilled = await this.handleCountryField(page);
      if (countryFilled) {
        filled++;
        console.log('Country selected: United States');
      }
    } catch (error) {
      console.log('Failed to fill Country:', error);
      fieldsFailed.push('Country');
    }

    // Handle work authorization dropdown
    if (profile.work_authorization) {
      try {
        const authSelect = await this.findElement(page, GreenhouseAdapter.FIELD_PATTERNS.workAuth);
        if (authSelect) {
          const success = await this.selectWorkAuthOption(authSelect, profile.work_authorization);
          if (success) filled++;
        }
      } catch (error) {
        console.log('Failed to fill Work Authorization:', error);
        fieldsFailed.push('Work Authorization');
      }
    }

    // Handle any custom questions (basic text inputs with labels)
    filled += await this.handleCustomQuestions(ctx, fieldsFailed);

    return filled;
  }

  // Handle country field - supports standard select, custom dropdown, or text input
  private async handleCountryField(page: any): Promise<boolean> {
    // Try standard select first
    const standardSelect = await this.findElement(page, GreenhouseAdapter.FIELD_PATTERNS.country);
    if (standardSelect) {
      const tagName = await standardSelect.evaluate((el: Element) => el.tagName.toLowerCase());
      if (tagName === 'select') {
        return await this.selectCountryOption(standardSelect, 'United States');
      } else if (tagName === 'input') {
        // For input-based dropdowns, we need to type and then select from options
        await standardSelect.click();
        await page.waitForTimeout(300);
        await standardSelect.fill('United States');
        await page.waitForTimeout(500);
        
        // Look for the matching option to click
        const optionSelectors = [
          'text="United States"',
          '[class*="option"]:has-text("United States")',
          'li:has-text("United States")',
          'div[class*="option"]:has-text("United States")',
          '[role="option"]:has-text("United States")',
          'text="United States +1"',
        ];
        
        for (const selector of optionSelectors) {
          try {
            const option = await page.$(selector);
            if (option) {
              const isVisible = await option.isVisible();
              if (isVisible) {
                await option.click();
                await page.waitForTimeout(300);
                console.log('Clicked country option with selector:', selector);
                return true;
              }
            }
          } catch {
            continue;
          }
        }
        
        // If no option found, press Enter to confirm (some dropdowns work this way)
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        console.log('Pressed Enter to confirm country input');
        return true;
      }
    }

    // Look for custom dropdown (React Select style or similar)
    // These usually have a clickable container with "Country" label nearby
    const customDropdownSelectors = [
      // Common custom dropdown patterns
      '[class*="country"] [class*="select"]',
      '[class*="country"] [class*="dropdown"]',
      '[data-field*="country"]',
      'div[class*="select"]:has(+ label:has-text("Country"))',
      // Look for dropdown trigger near Country label
      'label:has-text("Country") + div',
      'label:has-text("Country") ~ div[class*="select"]',
      // Greenhouse specific patterns
      '.field:has(label:has-text("Country")) select',
      '.field:has(label:has-text("Country")) [role="combobox"]',
      '.field:has(label:has-text("Country")) [role="listbox"]',
      '[aria-label*="Country"]',
      '[aria-label*="country"]',
    ];

    for (const selector of customDropdownSelectors) {
      try {
        const dropdown = await page.$(selector);
        if (dropdown) {
          // Click to open the dropdown
          await dropdown.click();
          await page.waitForTimeout(500);

          // Look for United States option
          const usOption = await page.$('text="United States"') ||
            await page.$('[class*="option"]:has-text("United States")') ||
            await page.$('li:has-text("United States")') ||
            await page.$('div:has-text("United States +1")');

          if (usOption) {
            await usOption.click();
            await page.waitForTimeout(300);
            return true;
          }
        }
      } catch {
        continue;
      }
    }

    // Try finding any element with Country in its accessible name or nearby label
    // and interacting with it as a dropdown
    try {
      // Find the Country field container
      const countryContainer = await page.$('.field:has(label:has-text("Country"))') ||
        await page.$('[class*="field"]:has-text("Country")');

      if (countryContainer) {
        // Click on the dropdown trigger within the container
        const trigger = await countryContainer.$('[class*="select"], [class*="dropdown"], [role="combobox"], button, [class*="trigger"]');
        if (trigger) {
          await trigger.click();
          await page.waitForTimeout(500);

          // Now find United States in the opened dropdown
          const usOption = await page.$('text="United States"') ||
            await page.$('text="United States +1"') ||
            await page.$('[data-value="US"]') ||
            await page.$('li:has-text("United States")') ||
            await page.$('[class*="option"]:has-text("United States")');

          if (usOption) {
            await usOption.click();
            await page.waitForTimeout(300);
            return true;
          }
        }
      }
    } catch {
      // Continue to fallback
    }

    // Last resort: try typing in a searchable dropdown
    try {
      // Some dropdowns allow typing to filter
      const searchInput = await page.$('[class*="country"] input') ||
        await page.$('.field:has(label:has-text("Country")) input');

      if (searchInput) {
        await searchInput.fill('United States');
        await page.waitForTimeout(500);

        // Select first matching option
        const firstOption = await page.$('[class*="option"]') ||
          await page.$('li:first-child');

        if (firstOption) {
          await firstOption.click();
          return true;
        }
      }
    } catch {
      // Ignore
    }

    return false;
  }

  // Select country from standard dropdown
  private async selectCountryOption(selectElement: any, country: string): Promise<boolean> {
    const options = await selectElement.$$('option');
    const countryLower = country.toLowerCase();

    // Try exact match first
    for (const option of options) {
      const text = ((await option.textContent()) || '').toLowerCase().trim();
      if (text === countryLower || text === 'united states' || text === 'united states of america' || text === 'usa' || text === 'us') {
        const value = await option.getAttribute('value');
        if (value) {
          await selectElement.selectOption(value);
          return true;
        }
      }
    }

    // Try partial match
    for (const option of options) {
      const text = ((await option.textContent()) || '').toLowerCase();
      if (text.includes('united states') || text.includes('usa')) {
        const value = await option.getAttribute('value');
        if (value) {
          await selectElement.selectOption(value);
          return true;
        }
      }
    }

    return false;
  }

  // Handle work authorization select dropdown
  private async selectWorkAuthOption(selectElement: any, workAuth: string): Promise<boolean> {
    const options = await selectElement.$$('option');
    const authLower = workAuth.toLowerCase().replace(/_/g, ' ');

    // Priority order of keywords to match
    const keywords = [
      authLower,
      'authorized',
      'citizen',
      'permanent resident',
      'green card',
      'yes',
    ];

    for (const keyword of keywords) {
      for (const option of options) {
        const text = ((await option.textContent()) || '').toLowerCase();
        if (text.includes(keyword)) {
          const value = await option.getAttribute('value');
          if (value) {
            await selectElement.selectOption(value);
            return true;
          }
        }
      }
    }
    return false;
  }

  // P3.05: Handle custom questions with simple patterns
  private async handleCustomQuestions(ctx: ApplyContext, fieldsFailed: string[]): Promise<number> {
    const { page, profile } = ctx;
    let filled = 0;

    // Find all question containers in Greenhouse format
    const questionContainers = await page.$$('.field, .question-container, [data-question-id]');

    for (const container of questionContainers) {
      try {
        // Get the label text
        const label = await container.$('label, .label, .question-label');
        if (!label) continue;

        const labelText = ((await label.textContent()) || '').trim();
        const labelLower = labelText.toLowerCase();
        if (!labelText) continue;

        // Check if this is a required field
        const isRequired = labelText.includes('*') || 
          await container.$('[required]') !== null ||
          await container.$('.required') !== null;

        // Find input within this container - first try standard elements
        let input = await container.$('input:not([type="file"]):not([type="hidden"]), textarea, select');
        
        // Check for custom React dropdown (used by some Greenhouse forms)
        const customDropdown = await container.$('[role="combobox"], [class*="select__control"], [class*="dropdown"], [class*="Select"]');
        
        if (!input && !customDropdown) continue;

        // Handle custom dropdown (React Select style) - ONLY if we have matching profile data
        if (customDropdown) {
          // Check if already has a selection
          const selectedText = await customDropdown.textContent();
          if (selectedText && !selectedText.toLowerCase().includes('select')) {
            continue; // Already filled
          }
          
          // Only try to fill if we have matching profile data for this field
          const value = this.matchLabelToProfileValue(labelLower, profile);
          if (value) {
            // Click to open dropdown
            await customDropdown.click();
            await page.waitForTimeout(500);
            
            // Find and click matching option
            const option = await page.$(`[class*="option"]:has-text("${value}")`) ||
                          await page.$(`li:has-text("${value}")`) ||
                          await page.$(`div[role="option"]:has-text("${value}")`);
            if (option) {
              const isVisible = await option.isVisible();
              if (isVisible) {
                await option.click();
                filled++;
                console.log(`Filled custom dropdown "${labelText}" with profile value: "${value}"`);
                await page.waitForTimeout(300);
              }
            }
            
            // Close dropdown if still open (press Escape)
            await page.keyboard.press('Escape');
          }
          // If no profile data, leave unfilled - detectUnfilledRequiredFields will catch it
          continue;
        }

        if (!input) continue;

        // Skip if already filled
        const tagName = await input.evaluate((el: Element) => el.tagName.toLowerCase());
        const currentValue = await input.inputValue().catch(() => '');
        
        // For selects, check if a non-placeholder option is selected
        let isSelectFilled = false;
        if (tagName === 'select') {
          const selectedValue = await input.evaluate((el: HTMLSelectElement) => el.value);
          isSelectFilled = selectedValue !== '' && selectedValue !== 'Select...' && selectedValue !== 'select';
        }
        
        if (currentValue || isSelectFilled) continue;

        // Match label to profile data
        const value = this.matchLabelToProfileValue(labelLower, profile);
        if (value) {
          if (tagName === 'select') {
            // For select, try to find matching option
            const options = await input.$$('option');
            for (const option of options) {
              const optText = ((await option.textContent()) || '').toLowerCase();
              if (optText.includes(value.toLowerCase())) {
                const optValue = await option.getAttribute('value');
                if (optValue) {
                  await input.selectOption(optValue);
                  filled++;
                  console.log(`Filled select "${labelText}" with matched value`);
                  break;
                }
              }
            }
          } else {
            await input.fill(value);
            filled++;
            console.log(`Filled input "${labelText}" with matched value`);
          }
        }
        // Note: Required selects without profile data will be detected by detectUnfilledRequiredFields
        // and returned to the user for input - we no longer auto-fill with arbitrary defaults
      } catch (error) {
        // Skip individual question errors
        continue;
      }
    }

    return filled;
  }

  // Match a field label to profile data
  private matchLabelToProfileValue(label: string, profile: ApplyContext['profile']): string | null {
    const labelLower = label.toLowerCase();

    if (labelLower.includes('first name')) {
      return profile.full_name?.split(' ')[0] || null;
    }
    if (labelLower.includes('last name')) {
      return profile.full_name?.split(' ').slice(1).join(' ') || null;
    }
    if (labelLower.includes('email')) {
      return profile.email;
    }
    if (labelLower.includes('phone') || labelLower.includes('mobile')) {
      return profile.phone;
    }
    if (labelLower.includes('linkedin')) {
      return profile.linkedin_url;
    }
    if (labelLower.includes('github')) {
      return profile.github_url;
    }
    if (labelLower.includes('city')) {
      return profile.location_city;
    }
    if (labelLower.includes('state') || labelLower.includes('province')) {
      return profile.location_state;
    }
    if (labelLower.includes('location') || labelLower.includes('address')) {
      return [profile.location_city, profile.location_state].filter(Boolean).join(', ') || null;
    }

    return null;
  }

  // P3.09: Upload resume
  private async uploadResume(ctx: ApplyContext): Promise<boolean> {
    const { page, resumePath } = ctx;

    try {
      const fileInput = await this.findElement(page, GreenhouseAdapter.SELECTORS.resumeInput);
      if (fileInput) {
        await fileInput.setInputFiles(resumePath);
        // Wait for upload to process
        await page.waitForTimeout(1000);
        return true;
      }
    } catch (error) {
      console.error('Resume upload failed:', error);
    }

    return false;
  }

  // P3.10: Handle cover letter upload (optional)
  private async handleCoverLetter(ctx: ApplyContext): Promise<boolean> {
    const { page } = ctx;

    try {
      const coverLetterInput = await this.findElement(page, GreenhouseAdapter.SELECTORS.coverLetterInput);
      if (coverLetterInput) {
        // Cover letter is optional - we don't have one in the current implementation
        // Could be extended to support cover letter storage path in ApplyContext
        console.log('Cover letter field found but no cover letter provided');
      }
    } catch {
      // Cover letter is optional
    }

    return false;
  }

  // Detect unfilled required fields that need user input (instead of auto-filling)
  private async detectUnfilledRequiredFields(page: any): Promise<RequiredInput[]> {
    const unfilledFields: RequiredInput[] = [];

    try {
      // Find all select elements that show placeholder text
      const selects = await page.$$('select');
      for (const select of selects) {
        try {
          const selectedValue = await select.evaluate((el: HTMLSelectElement) => el.value);
          const selectedText = await select.evaluate((el: HTMLSelectElement) => 
            el.options[el.selectedIndex]?.text || ''
          );
          
          // Check if this is unfilled (placeholder selected)
          if (selectedValue === '' || selectedText.toLowerCase().includes('select')) {
            // Check if it's required
            const isRequired = await select.evaluate((el: HTMLSelectElement) => el.required);
            const container = await select.$('xpath=ancestor::*[contains(@class, "field") or contains(@class, "question")]');
            const labelText = await container?.textContent() || '';
            const hasAsterisk = labelText.includes('*');
            
            if (isRequired || hasAsterisk) {
              // Extract field name from label
              const fieldName = labelText.replace(/\*/g, '').trim().split('\n')[0].trim();
              
              // Extract available options
              const options: string[] = [];
              const optionElements = await select.$$('option');
              for (const option of optionElements) {
                const optText = ((await option.textContent()) || '').trim();
                const optValue = await option.getAttribute('value');
                // Skip placeholder options
                if (optValue && optText && !optText.toLowerCase().includes('select') && optText !== '--') {
                  options.push(optText);
                }
              }
              
              unfilledFields.push({
                fieldName,
                fieldType: 'select',
                options,
                required: true,
              });
            }
          }
        } catch {
          continue;
        }
      }

      // Also look for custom React dropdowns that show "Select..."
      const customDropdowns = await page.$$('[class*="select__control"], [class*="Select"], [role="combobox"]');
      for (const dropdown of customDropdowns) {
        try {
          const text = await dropdown.textContent();
          if (text && text.toLowerCase().includes('select')) {
            // Check if required (look for asterisk in nearby label)
            const container = await dropdown.$('xpath=ancestor::*[contains(@class, "field") or contains(@class, "question")]');
            const labelText = await container?.textContent() || '';
            const isRequired = labelText.includes('*');
            
            if (isRequired) {
              const fieldName = labelText.replace(/\*/g, '').replace(/Select\.\.\./gi, '').trim().split('\n')[0].trim();
              
              // Try to get options by clicking the dropdown
              await dropdown.click();
              await page.waitForTimeout(500);
              
              const options: string[] = [];
              const optionElements = await page.$$('[class*="option"], [role="option"]');
              for (const option of optionElements) {
                const optText = ((await option.textContent()) || '').trim();
                if (optText) {
                  options.push(optText);
                }
              }
              
              // Close the dropdown
              await page.keyboard.press('Escape');
              await page.waitForTimeout(200);
              
              unfilledFields.push({
                fieldName,
                fieldType: 'select',
                options,
                required: true,
              });
            }
          }
        } catch {
          continue;
        }
      }
      
      // Check for unfilled required text inputs
      const textInputs = await page.$$('input[type="text"]:not([type="file"]), textarea');
      for (const input of textInputs) {
        try {
          const value = await input.inputValue();
          if (!value) {
            const isRequired = await input.evaluate((el: HTMLInputElement) => el.required);
            const container = await input.$('xpath=ancestor::*[contains(@class, "field") or contains(@class, "question")]');
            const labelText = await container?.textContent() || '';
            const hasAsterisk = labelText.includes('*');
            
            if (isRequired || hasAsterisk) {
              const fieldName = labelText.replace(/\*/g, '').trim().split('\n')[0].trim();
              const tagName = await input.evaluate((el: Element) => el.tagName.toLowerCase());
              
              unfilledFields.push({
                fieldName,
                fieldType: tagName === 'textarea' ? 'textarea' : 'text',
                required: true,
              });
            }
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      console.error('Error in detectUnfilledRequiredFields:', error);
    }

    return unfilledFields;
  }

  // P3.11: Submit form
  private async submitForm(ctx: ApplyContext): Promise<boolean> {
    const { page } = ctx;

    try {
      const submitButton = await this.findElement(page, GreenhouseAdapter.SELECTORS.submit);
      if (submitButton) {
        await submitButton.click();
        return true;
      }
    } catch (error) {
      console.error('Submit failed:', error);
    }

    return false;
  }

  // P3.12 & P3.13: Detect outcome
  private async detectOutcome(
    ctx: ApplyContext,
    fieldsFilledCount: number,
    fieldsFailed: string[],
    screenshots: string[]
  ): Promise<ApplyResult> {
    const { page } = ctx;
    const pageText = ((await page.textContent('body')) || '').toLowerCase();

    // P3.12: Success indicators
    const successIndicators = [
      'thank you for applying',
      'application received',
      'successfully submitted',
      'application submitted',
      'thanks for applying',
      'we received your application',
      'you have applied',
      'your application has been submitted',
    ];

    for (const indicator of successIndicators) {
      if (pageText.includes(indicator)) {
        return {
          status: 'succeeded',
          fieldsFilledCount,
          fieldsFailed,
          screenshots,
          confirmationMessage: 'Application submitted successfully',
        };
      }
    }

    // P3.13: Error indicators
    const alreadyAppliedIndicators = ['already applied', 'duplicate application', 'previously applied'];
    for (const indicator of alreadyAppliedIndicators) {
      if (pageText.includes(indicator)) {
        return {
          status: 'blocked',
          fieldsFilledCount,
          fieldsFailed,
          screenshots,
          errorCode: 'ALREADY_APPLIED',
          errorMessage: 'You have already applied to this position',
        };
      }
    }

    // Check for validation errors
    const errorElements = await page.$$('.error, .field-error, .error-message, [class*="error"]');
    if (errorElements.length > 0) {
      const errorTexts: string[] = [];
      for (const el of errorElements.slice(0, 3)) {
        const text = await el.textContent();
        if (text?.trim()) errorTexts.push(text.trim());
      }

      if (errorTexts.length > 0) {
        return {
          status: 'failed',
          fieldsFilledCount,
          fieldsFailed,
          screenshots,
          errorCode: 'VALIDATION_ERROR',
          errorMessage: `Form validation failed: ${errorTexts.join('; ')}`,
        };
      }
    }

    // Check for blocked/captcha
    if (pageText.includes('captcha') || pageText.includes('verify you are human')) {
      return {
        status: 'blocked',
        fieldsFilledCount,
        fieldsFailed,
        screenshots,
        errorCode: 'CAPTCHA_DETECTED',
        errorMessage: 'CAPTCHA or human verification required',
      };
    }

    // If no clear success or error, assume success (form was submitted)
    return {
      status: 'succeeded',
      fieldsFilledCount,
      fieldsFailed,
      screenshots,
      confirmationMessage: 'Application submitted',
    };
  }

  // Helper: Find element using multiple selector patterns
  private async findElement(page: any, selectors: string[]): Promise<any> {
    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) return element;
      } catch {
        continue;
      }
    }
    return null;
  }

  // P6: Take screenshot for debugging
  private async takeScreenshot(page: any, name: string): Promise<string | null> {
    try {
      const timestamp = Date.now();
      const screenshotPath = path.join(os.tmpdir(), `greenhouse-${name}-${timestamp}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return screenshotPath;
    } catch (error) {
      console.error('Screenshot failed:', error);
      return null;
    }
  }
}
