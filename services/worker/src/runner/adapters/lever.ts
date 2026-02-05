import { ATSAdapter, ApplyContext, ApplyResult } from './base.js';
import * as path from 'path';
import * as os from 'os';

export class LeverAdapter implements ATSAdapter {
  name = 'Lever';

  // P4.01: Lever form patterns
  private static readonly SELECTORS = {
    // Apply button patterns (jobs.lever.co)
    applyButton: [
      'a.postings-btn',
      'a.postings-btn-wrapper',
      'a[href*="/apply"]',
      '.apply-button a',
      'button:has-text("Apply for this job")',
      'button:has-text("Apply now")',
      'a:has-text("Apply")',
    ],
    // Form container
    form: ['form.application-form', '.application-page form', 'form'],
    // Submit button patterns
    submit: [
      'button[type="submit"]',
      'button.postings-btn',
      'button:has-text("Submit application")',
      'button:has-text("Submit")',
      'input[type="submit"]',
    ],
    // Resume/file upload - Lever uses a drag-drop area
    resumeInput: [
      'input[type="file"][name="resume"]',
      'input[type="file"].resume-upload',
      '.resume-upload-input input[type="file"]',
      'input[type="file"]',
    ],
    // Cover letter
    coverLetterInput: [
      'input[type="file"][name="coverLetter"]',
      '.cover-letter-upload input[type="file"]',
    ],
  };

  // P4.02: Lever-specific field patterns
  private static readonly FIELD_PATTERNS = {
    // Lever typically uses name attribute for main fields
    fullName: ['input[name="name"]', 'input[id="name"]', 'input[placeholder*="Full name" i]'],
    email: ['input[name="email"]', 'input[type="email"]', 'input[id="email"]'],
    phone: ['input[name="phone"]', 'input[type="tel"]', 'input[id="phone"]'],
    currentCompany: ['input[name="org"]', 'input[name="company"]', 'input[placeholder*="company" i]'],
    linkedin: ['input[name*="linkedin"]', 'input[placeholder*="linkedin" i]', 'input[name="urls[LinkedIn]"]'],
    github: ['input[name*="github"]', 'input[placeholder*="github" i]', 'input[name="urls[GitHub]"]'],
    twitter: ['input[name*="twitter"]', 'input[placeholder*="twitter" i]', 'input[name="urls[Twitter]"]'],
    portfolio: ['input[name*="portfolio"]', 'input[name*="website"]', 'input[name="urls[Portfolio]"]'],
    location: ['input[name="location"]', 'input[id="location"]', 'input[placeholder*="location" i]'],
  };

  supports(url: string): boolean {
    try {
      const parsed = new URL(url);
      // Lever uses jobs.lever.co or custom domains
      return (
        parsed.host.includes('lever.co') ||
        parsed.host.includes('jobs.lever.co')
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
      // P4.03: Navigate to application form
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

      // P4.04: Fill form fields
      fieldsFilledCount = await this.fillFormFields(ctx, fieldsFailed);
      console.log(`Filled ${fieldsFilledCount} fields, failed: ${fieldsFailed.join(', ') || 'none'}`);

      // P4.05: Handle resume upload
      const resumeUploaded = await this.uploadResume(ctx);
      if (resumeUploaded) {
        fieldsFilledCount++;
        console.log('Resume uploaded successfully');
      }

      // Handle cover letter if available
      await this.handleCoverLetter(ctx);

      // Handle custom questions
      fieldsFilledCount += await this.handleCustomQuestions(ctx, fieldsFailed);

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

      // P4.06: Submit form
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

      // P4.07: Detect success or errors
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

  // P4.03: Navigate to application form
  private async navigateToForm(ctx: ApplyContext): Promise<boolean> {
    const { page } = ctx;

    // Check if we're already on the application form page (URL contains /apply)
    const currentUrl = page.url();
    if (currentUrl.includes('/apply')) {
      // Wait for form elements
      await page.waitForSelector('form', { timeout: 10000 }).catch(() => null);
      return !!(await page.$('form'));
    }

    // Look for Apply button
    const applyButton = await this.findElement(page, LeverAdapter.SELECTORS.applyButton);
    if (applyButton) {
      await applyButton.click();
      await page.waitForLoadState('domcontentloaded');
      // Wait for form to appear
      await page.waitForSelector('form', { timeout: 10000 }).catch(() => null);
      return true;
    }

    // Some pages might have the form directly
    await page.waitForSelector('form', { timeout: 5000 }).catch(() => null);
    return !!(await page.$('form'));
  }

  // P4.04: Fill form fields with Lever-specific patterns
  private async fillFormFields(ctx: ApplyContext, fieldsFailed: string[]): Promise<number> {
    const { page, profile } = ctx;
    let filled = 0;

    // Build location string
    const location = [profile.location_city, profile.location_state]
      .filter(Boolean)
      .join(', ');

    // Define field mappings for Lever
    const fields = [
      { patterns: LeverAdapter.FIELD_PATTERNS.fullName, value: profile.full_name, label: 'Full Name' },
      { patterns: LeverAdapter.FIELD_PATTERNS.email, value: profile.email, label: 'Email' },
      { patterns: LeverAdapter.FIELD_PATTERNS.phone, value: profile.phone, label: 'Phone' },
      { patterns: LeverAdapter.FIELD_PATTERNS.linkedin, value: profile.linkedin_url, label: 'LinkedIn' },
      { patterns: LeverAdapter.FIELD_PATTERNS.github, value: profile.github_url, label: 'GitHub' },
      { patterns: LeverAdapter.FIELD_PATTERNS.location, value: location, label: 'Location' },
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

    return filled;
  }

  // Handle Lever custom questions
  private async handleCustomQuestions(ctx: ApplyContext, fieldsFailed: string[]): Promise<number> {
    const { page, profile } = ctx;
    let filled = 0;

    // Lever custom questions are typically in .custom-questions or .additional-questions
    const questionContainers = await page.$$('.custom-question, .application-question, [data-qa="question"]');

    for (const container of questionContainers) {
      try {
        // Get the label/question text
        const label = await container.$('label, .question-label, .question-text');
        if (!label) continue;

        const labelText = ((await label.textContent()) || '').toLowerCase().trim();
        if (!labelText) continue;

        // Find input within this container
        const input = await container.$('input:not([type="file"]):not([type="hidden"]), textarea, select');
        if (!input) continue;

        // Skip if already filled
        const tagName = await input.evaluate((el: Element) => el.tagName.toLowerCase());
        if (tagName !== 'select') {
          const currentValue = await input.inputValue().catch(() => '');
          if (currentValue) continue;
        }

        // Match label to profile data or common answers
        const value = this.matchLabelToValue(labelText, profile);
        if (value) {
          if (tagName === 'select') {
            const success = await this.selectMatchingOption(input, value);
            if (success) filled++;
          } else {
            await input.fill(value);
            filled++;
          }
        }

        // Handle Yes/No radio buttons for work authorization type questions
        if (labelText.includes('authorized to work') || labelText.includes('require sponsorship')) {
          const yesRadio = await container.$('input[type="radio"][value*="yes" i], input[type="radio"][value="true"]');
          if (yesRadio && profile.work_authorization) {
            await yesRadio.click();
            filled++;
          }
        }
      } catch {
        continue;
      }
    }

    return filled;
  }

  // Match label to profile value or common answer
  private matchLabelToValue(label: string, profile: ApplyContext['profile']): string | null {
    const labelLower = label.toLowerCase();

    if (labelLower.includes('linkedin')) {
      return profile.linkedin_url;
    }
    if (labelLower.includes('github')) {
      return profile.github_url;
    }
    if (labelLower.includes('website') || labelLower.includes('portfolio')) {
      return profile.linkedin_url; // Fallback to LinkedIn if no portfolio
    }
    if (labelLower.includes('city') || labelLower.includes('location')) {
      return [profile.location_city, profile.location_state].filter(Boolean).join(', ') || null;
    }
    if (labelLower.includes('phone')) {
      return profile.phone;
    }

    return null;
  }

  // Select matching option in a dropdown
  private async selectMatchingOption(selectElement: any, value: string): Promise<boolean> {
    const options = await selectElement.$$('option');
    const valueLower = value.toLowerCase();

    for (const option of options) {
      const text = ((await option.textContent()) || '').toLowerCase();
      const optValue = ((await option.getAttribute('value')) || '').toLowerCase();

      if (text.includes(valueLower) || optValue.includes(valueLower)) {
        const actualValue = await option.getAttribute('value');
        if (actualValue) {
          await selectElement.selectOption(actualValue);
          return true;
        }
      }
    }

    // If value contains 'yes' or is affirmative, look for yes options
    if (valueLower === 'yes' || valueLower === 'true') {
      for (const option of options) {
        const text = ((await option.textContent()) || '').toLowerCase();
        if (text.includes('yes')) {
          const actualValue = await option.getAttribute('value');
          if (actualValue) {
            await selectElement.selectOption(actualValue);
            return true;
          }
        }
      }
    }

    return false;
  }

  // P4.05: Upload resume
  private async uploadResume(ctx: ApplyContext): Promise<boolean> {
    const { page, resumePath } = ctx;

    try {
      const fileInput = await this.findElement(page, LeverAdapter.SELECTORS.resumeInput);
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

  // Handle cover letter (optional)
  private async handleCoverLetter(ctx: ApplyContext): Promise<boolean> {
    const { page } = ctx;

    try {
      const coverLetterInput = await this.findElement(page, LeverAdapter.SELECTORS.coverLetterInput);
      if (coverLetterInput) {
        console.log('Cover letter field found but no cover letter provided');
      }
    } catch {
      // Cover letter is optional
    }

    return false;
  }

  // P4.06: Submit form
  private async submitForm(ctx: ApplyContext): Promise<boolean> {
    const { page } = ctx;

    try {
      const submitButton = await this.findElement(page, LeverAdapter.SELECTORS.submit);
      if (submitButton) {
        await submitButton.click();
        return true;
      }
    } catch (error) {
      console.error('Submit failed:', error);
    }

    return false;
  }

  // P4.07: Detect outcome
  private async detectOutcome(
    ctx: ApplyContext,
    fieldsFilledCount: number,
    fieldsFailed: string[],
    screenshots: string[]
  ): Promise<ApplyResult> {
    const { page } = ctx;
    const pageText = ((await page.textContent('body')) || '').toLowerCase();

    // Success indicators for Lever
    const successIndicators = [
      'thank you for applying',
      'application received',
      'successfully submitted',
      'application submitted',
      'thanks for applying',
      'your application has been received',
      'we got your application',
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

    // Already applied indicators
    const alreadyAppliedIndicators = ['already applied', 'duplicate application', 'you have applied'];
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
    const errorElements = await page.$$('.error, .error-message, .field-error, .validation-error');
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

    // Check for CAPTCHA
    if (pageText.includes('captcha') || pageText.includes('verify you are human') || pageText.includes('recaptcha')) {
      return {
        status: 'blocked',
        fieldsFilledCount,
        fieldsFailed,
        screenshots,
        errorCode: 'CAPTCHA_DETECTED',
        errorMessage: 'CAPTCHA or human verification required',
      };
    }

    // URL change to a confirmation page is often a success indicator
    const currentUrl = page.url();
    if (currentUrl.includes('/thanks') || currentUrl.includes('/confirmation') || currentUrl.includes('/applied')) {
      return {
        status: 'succeeded',
        fieldsFilledCount,
        fieldsFailed,
        screenshots,
        confirmationMessage: 'Application submitted (redirected to confirmation)',
      };
    }

    // If no clear success or error, assume success
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

  // Take screenshot for debugging
  private async takeScreenshot(page: any, name: string): Promise<string | null> {
    try {
      const timestamp = Date.now();
      const screenshotPath = path.join(os.tmpdir(), `lever-${name}-${timestamp}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return screenshotPath;
    } catch (error) {
      console.error('Screenshot failed:', error);
      return null;
    }
  }
}
