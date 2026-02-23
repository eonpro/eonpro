/**
 * Fillout → Wellmedr payload adapter
 *
 * Converts Fillout webhook payload (questions array + metadata) into the flat
 * kebab-case object shape expected by the Wellmedr intake normalizer and
 * wellmedr-intake webhook. This allows intake.wellmedr.com to send submissions
 * directly from Fillout to EONPRO without Airtable.
 *
 * Fillout webhook format (same as /submissions API):
 *   - submissionId, submissionTime, lastUpdatedAt
 *   - questions: [{ id, name?, type?, value }]
 *   - optional: payments[], urlParameters[], etc.
 *
 * Fillout's Body mapping may send keys like "First Name", "Goal Weight", "Feet".
 * We map those to our expected kebab-case keys so sections and patient fields match.
 *
 * @see https://www.fillout.com/help/api-reference/create-a-webhook
 * @see https://fillout.com/help/api-reference/create-submissions
 */

import type { WellmedrPayload } from './types';
import { logger } from '@/lib/logger';

/**
 * Map Fillout Body / question IDs (title case, spaces, etc.) to Wellmedr kebab-case keys.
 * Used so buildWellmedrSections and buildWellmedrPatient group and recognize fields.
 */
const FILLOUT_KEY_TO_WELLMEDR: Record<string, string> = {
  // Patient identity
  'First Name': 'first-name',
  'Last Name': 'last-name',
  FirstName: 'first-name',
  LastName: 'last-name',
  Email: 'email',
  'Phone Number': 'phone',
  Phone: 'phone',
  'Primary Phone': 'phone',
  'Contact Phone': 'phone',
  Mobile: 'phone',
  Cell: 'phone',
  Telephone: 'phone',
  'Mobile Number': 'phone',
  'Cell Phone': 'phone',
  State: 'state',
  DOB: 'dob',
  'DOB (Day)': 'dob-day',
  'DOB (Month)': 'dob-month',
  'DOB (Year)': 'dob-year',
  Gender: 'sex',
  Sex: 'sex',
  // Body metrics
  Feet: 'feet',
  Inches: 'inches',
  Weight: 'weight',
  'Weight (lbs)': 'weight',
  'Goal Weight': 'goal-weight',
  'Your goal weight (lbs)': 'goal-weight',
  BMI: 'bmi',
  // Vitals
  'Weight Related Symptoms': 'weight-related-symptoms',
  'Blood Pressure': 'avg-blood-pressure-range',
  'Heart rate': 'avg-resting-heart-rate',
  'Primary Fitness Goal': 'primary-fitness-goal',
  'Reproductive Status': 'reproductive-status',
  'Weight Loss Motivation': 'weight-loss-motivation',
  Pace: 'pace',
  "How's your overall sleep?": 'sleep-quality',
  'How is your sleep, overall?': 'sleep-quality',
  'Pre-existing conditions': 'health-conditions',
  'Overall Health': 'health-conditions-2',
  'Have you taken a weight loss medication in the last 4 w': 'glp1-last-30',
  // Medical / risk (map Body key labels from Fillout left column)
  'Opioids History': 'opioids',
  'Details Opioids': 'opioids-details',
  'Bariatric - Weight loss Surgery History': 'bariatric',
  'Details Bariatric': 'bariatric-details',
  'Current Medications': 'current-meds',
  'Details Medications': 'current-meds-details',
  'Additional Information': 'additional-info',
  'Details - Additional Information': 'additional-info-details',
  Importance: 'affordability-potency',
  'How motivated are you to reach your weight goal': 'motivation-level',
  // GLP-1 history
  'Past GLP-1 Weight Loss Medication History': 'glp1-last-30',
  'Specify Name of the Medication': 'glp1-last-30-other-medication-name',
  'Semaglutide - Most Recent Dose': 'glp1-last-30-medication-dose-mg',
  'Tirzepatide - Most Recent Dose': 'glp1-last-30-medication-dose-mg',
  'Other - Most Recent Dose': 'glp1-last-30-medication-dose-other',
  'Submission ID': 'submission-id',
};

/** Single question/response in Fillout webhook payload */
export interface FilloutQuestion {
  id: string;
  name?: string;
  type?: string;
  value?: unknown;
}

/** Fillout webhook payload (same structure as Submission from API) */
export interface FilloutWebhookPayload {
  submissionId?: string;
  submissionTime?: string;
  lastUpdatedAt?: string;
  questions?: FilloutQuestion[];
  payments?: Array<{ id: string; name?: string; value?: { paymentId?: string; status?: string } }>;
  urlParameters?: Array<{ id: string; name?: string; value?: string }>;
  [key: string]: unknown;
}

/**
 * Returns true if the payload looks like a Fillout webhook (has questions array and submission id/time).
 */
export function isFilloutPayload(payload: Record<string, unknown>): payload is FilloutWebhookPayload {
  const p = payload as FilloutWebhookPayload;
  return (
    Array.isArray(p.questions) &&
    p.questions.length > 0 &&
    (typeof p.submissionId === 'string' || typeof p.submissionTime === 'string')
  );
}

/**
 * Converts a Fillout webhook payload into the flat Wellmedr payload shape.
 * Question ids become top-level keys; values are stringified where needed.
 * Preserves submissionId and submission-date for idempotency and display.
 */
export function filloutToWellmedrPayload(fillout: FilloutWebhookPayload): WellmedrPayload {
  const flat: Record<string, unknown> = {};

  // Metadata
  if (fillout.submissionId) {
    flat['submission-id'] = fillout.submissionId;
    flat.submissionId = fillout.submissionId;
  }
  if (fillout.submissionTime) {
    flat['submission-date'] = fillout.submissionTime;
    flat.submittedAt = fillout.submissionTime;
  }
  if (fillout.lastUpdatedAt) {
    flat.lastUpdatedAt = fillout.lastUpdatedAt;
  }

  // Questions → flat key-value (id → value); normalize Fillout Body keys to Wellmedr kebab-case
  for (const q of fillout.questions ?? []) {
    if (q.id == null) continue;
    const v = q.value;
    if (v === undefined || v === null) continue;
    const idStr = String(q.id).trim();
    const key = FILLOUT_KEY_TO_WELLMEDR[idStr] || idStr;
    const value =
      typeof v === 'object' && v !== null && !Array.isArray(v)
        ? JSON.stringify(v)
        : v;
    flat[key] = value;
  }

  // Combine DOB (Day), (Month), (Year) into single dob if present
  const dobDay = flat['dob-day'];
  const dobMonth = flat['dob-month'];
  const dobYear = flat['dob-year'];
  if (dobDay != null && dobMonth != null && dobYear != null && !flat['dob']) {
    const month = String(dobMonth).padStart(2, '0');
    const day = String(dobDay).padStart(2, '0');
    const year = String(dobYear);
    flat['dob'] = `${year}-${month}-${day}`;
    delete flat['dob-day'];
    delete flat['dob-month'];
    delete flat['dob-year'];
  }

  // URL parameters (e.g. ?source=facebook) as extra flat fields
  for (const param of fillout.urlParameters ?? []) {
    if (param.id && param.value !== undefined) {
      flat[param.id] = param.value;
    }
  }

  // Checkout completed: infer from payments if present (Fillout Payments)
  if (Array.isArray(fillout.payments) && fillout.payments.length > 0) {
    const hasSuccessfulPayment = fillout.payments.some(
      (p) => p.value?.status === 'succeeded' || p.value?.paymentId
    );
    if (hasSuccessfulPayment && flat['Checkout Completed'] == null) {
      flat['Checkout Completed'] = true;
    }
  }

  logger.debug('[Fillout Adapter] Converted to flat payload', {
    submissionId: flat['submission-id'],
    keys: Object.keys(flat).length,
  });

  return flat as WellmedrPayload;
}
