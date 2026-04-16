/**
 * WellMedR Airtable Sync
 *
 * Syncs intake form responses and checkout data to the WellMedR Airtable base.
 * Uses REST API (same pattern as src/lib/overtime/airtableClient.ts).
 */

import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';

const AIRTABLE_BASE_ID = 'app7yWQkMnz0aoysI';
const AIRTABLE_TABLE_ID = 'tbln93c69GlrNGEqa';
const AIRTABLE_API_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`;

function getApiKey(): string {
  return process.env.AIRTABLE_API_KEY || '';
}

/**
 * Maps intake store response keys to Airtable field names.
 */
const INTAKE_FIELD_MAP: Record<string, string> = {
  height_feet: 'feet',
  heightFeet: 'feet',
  height_inches: 'inches',
  heightInches: 'inches',
  current_weight: 'weight',
  currentWeight: 'weight',
  ideal_weight: 'goal-weight',
  idealWeight: 'goal-weight',
  sex: 'sex',
  dob: 'dob',
  health_effects: 'weight-related-symptoms',
  safety_pregnancy: 'reproductive-status',
  goals_priority: 'primary-fitness-goal',
  motivation_reason: 'weight-loss-motivation',
  weight_pace: 'pace',
  sleep_quality: 'sleep-quality',
  health_conditions: 'health-conditions',
  contraindications: 'health-conditions-2',
  glp1_history_recent: 'glp1-last-30',
  glp1_type: 'glp1-last-30-medication-type',
  glp1_type_other: 'glp1-last-30-other-medication-name',
  glp1_dose: 'glp1-last-30-medication-dose-mg',
  glp1_dose_other: 'glp1-last-30-medication-dose-other',
  current_medications: 'current-meds',
  current_medications_detail: 'current-meds-details',
  known_allergies: 'known-allergies',
  known_allergies_detail: 'known-allergies-details',
  blood_pressure: 'avg-blood-pressure-range',
  med_priority: 'affordability-potency',
  opioid_use: 'opioids',
  opioid_use_detail: 'opioids-details',
  heart_rate: 'avg-resting-heart-rate',
  motivation_level: 'motivation-level',
  prior_surgeries: 'bariatric',
  prior_surgeries_detail: 'bariatric-details',
  anything_else: 'additional-info',
  anything_else_detail: 'additional-info-details',
  firstName: 'first-name',
  lastName: 'last-name',
  email: 'email',
  phone: 'phone number',
  state: 'state',
  contact_consent: 'hipaa-agreement',
};

/**
 * Airtable field type classification from schema screenshots.
 */
const NUMBER_FIELDS = new Set(['feet', 'inches', 'weight', 'bmi', 'goal-weight']);
const MULTIPLE_SELECT_FIELDS = new Set([
  'health-conditions',
  'health-conditions-2',
  'weight-related-symptoms',
  'reproductive-status',
]);
const CHECKBOX_FIELDS = new Set(['hipaa-agreement']);

/**
 * Convert intake responses to Airtable-compatible fields with correct types.
 */
export function mapIntakeToAirtable(responses: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(responses)) {
    const airtableField = INTAKE_FIELD_MAP[key];
    if (!airtableField || value === undefined || value === null || value === '') continue;

    if (CHECKBOX_FIELDS.has(airtableField)) {
      fields[airtableField] = value === true || value === 'true' || value === 'Yes';
    } else if (NUMBER_FIELDS.has(airtableField)) {
      const num = Number(value);
      if (!isNaN(num)) fields[airtableField] = num;
    } else if (MULTIPLE_SELECT_FIELDS.has(airtableField)) {
      if (Array.isArray(value)) {
        fields[airtableField] = value.map(String);
      } else {
        fields[airtableField] = [String(value)];
      }
    } else if (Array.isArray(value)) {
      fields[airtableField] = value.join(', ');
    } else {
      fields[airtableField] = String(value);
    }
  }

  // Compute BMI if we have weight and height
  const weight = Number(responses.current_weight || responses.currentWeight);
  const feet = Number(responses.height_feet || responses.heightFeet);
  const inches = Number(responses.height_inches || responses.heightInches || 0);
  if (weight > 0 && feet > 0) {
    const totalInches = feet * 12 + inches;
    const bmi = parseFloat(((weight / (totalInches * totalInches)) * 703).toFixed(2));
    fields['bmi'] = bmi;
  }

  return fields;
}

/**
 * Create a new record in Airtable.
 */
export async function createAirtableRecord(
  fields: Record<string, unknown>
): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.error('[WellMedR-Airtable] AIRTABLE_API_KEY is empty or not set!');
    return null;
  }

  const payload = { fields };

  try {
    const res = await fetch(AIRTABLE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();

    if (!res.ok) {
      logger.error('[WellMedR-Airtable] Create failed', {
        status: res.status,
        response: responseText,
      });
      Sentry.captureMessage('Airtable create failed', {
        level: 'error',
        extra: { status: res.status },
      });
      return null;
    }

    const data = JSON.parse(responseText);
    return data.id || null;
  } catch (err) {
    logger.error('[WellMedR-Airtable] Create error', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    Sentry.captureException(err, { tags: { module: 'wellmedr-airtable', op: 'create' } });
    return null;
  }
}

/**
 * Retrieve an existing Airtable record by ID.
 */
export async function getAirtableRecord(
  recordId: string
): Promise<{ id: string; fields: Record<string, unknown> } | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const res = await fetch(`${AIRTABLE_API_URL}/${recordId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Update an existing Airtable record by ID.
 */
export async function updateAirtableRecord(
  recordId: string,
  fields: Record<string, unknown>
): Promise<boolean> {
  const apiKey = getApiKey();
  if (!apiKey) return false;

  try {
    const res = await fetch(`${AIRTABLE_API_URL}/${recordId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const err = await res.text();
      logger.error('[WellMedR-Airtable] Update failed', { status: res.status, response: err });
      Sentry.captureMessage('Airtable update failed', {
        level: 'error',
        extra: { status: res.status },
      });
      return false;
    }

    return true;
  } catch (err) {
    logger.error('[WellMedR-Airtable] Update error', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    Sentry.captureException(err, { tags: { module: 'wellmedr-airtable', op: 'update' } });
    return false;
  }
}

/**
 * Update checkout fields on an existing Airtable record.
 */
export async function updateCheckoutFields(
  recordId: string,
  checkoutData: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionStatus?: string;
    paymentMethodType?: string;
    paymentMethodId?: string;
    cardLast4?: string;
    couponCode?: string;
    product?: string;
    medicationType?: string;
    plan?: string;
    price?: number;
    customerEmail?: string;
    customerName?: string;
    cardholderName?: string;
    shippingAddress?: string;
    billingAddress?: string;
    paymentStatus?: string;
    orderStatus?: string;
  }
): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const fields: Record<string, unknown> = {
    'Checkout Completed': 'Yes',
    'submission-date': today,
    created_at: today,
  };

  if (checkoutData.stripeCustomerId) fields['stripe_customer_id'] = checkoutData.stripeCustomerId;
  if (checkoutData.stripeSubscriptionId)
    fields['stripe_subscription_id'] = checkoutData.stripeSubscriptionId;
  if (checkoutData.subscriptionStatus)
    fields['subscription_status'] = checkoutData.subscriptionStatus;
  if (checkoutData.paymentMethodType)
    fields['payment_method_type'] = checkoutData.paymentMethodType;
  if (checkoutData.paymentMethodId) fields['payment_method_id'] = checkoutData.paymentMethodId;
  if (checkoutData.cardLast4) fields['card_last4'] = checkoutData.cardLast4;
  if (checkoutData.couponCode) fields['coupon_code'] = checkoutData.couponCode;
  if (checkoutData.product) fields['product'] = checkoutData.product;
  if (checkoutData.medicationType) fields['medication_type'] = checkoutData.medicationType;
  if (checkoutData.plan) fields['plan'] = checkoutData.plan;
  if (checkoutData.price) fields['price'] = checkoutData.price;
  if (checkoutData.customerEmail) fields['customer_email'] = checkoutData.customerEmail;
  if (checkoutData.customerName) fields['customer_name'] = checkoutData.customerName;
  if (checkoutData.cardholderName) fields['cardholder_name'] = checkoutData.cardholderName;
  if (checkoutData.shippingAddress) fields['shipping_address'] = checkoutData.shippingAddress;
  if (checkoutData.billingAddress) fields['billing_address'] = checkoutData.billingAddress;
  if (checkoutData.paymentStatus) fields['payment_status'] = checkoutData.paymentStatus;
  if (checkoutData.orderStatus) fields['order_status'] = checkoutData.orderStatus;

  return updateAirtableRecord(recordId, fields);
}
