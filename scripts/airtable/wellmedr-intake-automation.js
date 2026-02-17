/**
 * WELLMEDR INTAKE → EONPRO AIRTABLE AUTOMATION SCRIPT
 *
 * Sends patient intake data from Airtable to EONPRO when patients complete intake/payment.
 *
 * CRITICAL: You need TWO automations for the full flow:
 * 1. THIS SCRIPT (Intake) → Creates/updates patient in EONPRO, generates SOAP note when checkout complete
 * 2. INVOICE SCRIPT → Creates invoice when payment detected → Puts patient in Rx Queue for prescription
 *    See: docs/clinics/WELLMEDR.md "Invoice Webhook" section
 *
 * SETUP:
 * 1. Airtable → Automations → New automation
 * 2. TRIGGER: "When record matches conditions"
 *    - Table: Your intake table (e.g. "Onboarding" or "2026 Q1 Fillout Intake - 1")
 *    - Condition: "Checkout Completed" is checked  (OR use "When record updated" + same condition)
 * 3. ACTION: Run script
 * 4. Input variable: recordId → map to "Record ID" from trigger
 * 5. Paste this script
 *
 * TABLE NAME: Update CONFIG.TABLE_NAME to match your Airtable table name exactly.
 *
 * Created: 2026-01-24 | Updated: 2026-02-17
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION - UPDATE THESE FOR YOUR BASE
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
    WEBHOOK_URL: 'https://app.eonpro.io/api/webhooks/wellmedr-intake',
    // Secret must match WELLMEDR_INTAKE_WEBHOOK_SECRET in EONPRO production
    WEBHOOK_SECRET: 'aWa/zKA2HSasDFF/ftw5KwcD/lh/F86y4tBYIjFrUnA=',
    // YOUR actual Airtable table name (common: "Onboarding", "2026 Q1 Fillout Intake - 1")
    TABLE_NAME: 'Onboarding',
    DEBUG: true,
    // If true, script exits early when Checkout Completed is not true (avoids creating partial leads)
    // Set false to sync ALL intake records (partial + complete)
    REQUIRE_CHECKOUT_COMPLETE: false,
};

// Alternate field names Airtable might use for checkout status
const CHECKOUT_FIELD_NAMES = [
    'Checkout Completed',
    'Checkout Completed 2',
    'CheckoutCompleted',
    'Checkout completed',
    'checkout_completed',
];

const WELLMEDR_FIELDS = [
    'submission-id', 'submission-date',
    'first-name', 'last-name', 'email', 'phone', 'state', 'dob', 'sex',
    'feet', 'inches', 'weight', 'goal-weight', 'bmi',
    'avg-blood-pressure-range', 'avg-resting-heart-rate', 'weight-related-symptoms',
    'health-conditions', 'health-conditions-2', 'type-2-diabetes', 'men2-history', 'bariatric', 'bariatric-details',
    'reproductive-status', 'sleep-quality', 'primary-fitness-goal', 'weight-loss-motivation', 'motivation-level', 'pace', 'affordability-potency',
    'preferred-meds', 'injections-tablets', 'glp1-last-30', 'glp1-last-30-medication-type', 'glp1-last-30-medication-dose-mg', 'glp1-last-30-medication-dose-other', 'glp1-last-30-other-medication-name',
    'current-meds', 'current-meds-details',
    'opioids', 'opioids-details', 'allergies',
    'additional-info', 'additional-info-details', 'hipaa-agreement',
    'Checkout Completed', 'Checkout Completed 2',
];

let inputConfig = input.config();

function isCheckoutComplete(record) {
    for (const fieldName of CHECKOUT_FIELD_NAMES) {
        try {
            const val = record.getCellValue(fieldName);
            if (val === true || val === 'true' || val === 'Yes' || val === 'yes' || val === '1') {
                return true;
            }
        } catch (_) { /* field doesn't exist */ }
    }
    return false;
}

async function main() {
    console.log('🚀 Starting Wellmedr → EONPRO sync...');

    const recordId = inputConfig.recordId;
    if (!recordId) {
        console.error('❌ No record ID provided! Add "recordId" as input variable (map to Record ID from trigger).');
        output.set('success', false);
        output.set('error', 'No record ID provided');
        return;
    }

    let table;
    try {
        table = base.getTable(CONFIG.TABLE_NAME);
    } catch (e) {
        console.error(`❌ Table "${CONFIG.TABLE_NAME}" not found!`);
        console.error('   Update CONFIG.TABLE_NAME to match your Airtable table name exactly.');
        output.set('success', false);
        output.set('error', `Table not found: ${CONFIG.TABLE_NAME}`);
        return;
    }

    const record = await table.selectRecordAsync(recordId);
    if (!record) {
        console.error(`❌ Record ${recordId} not found`);
        output.set('success', false);
        output.set('error', 'Record not found');
        return;
    }

    // Skip if we require checkout complete and it's not
    if (CONFIG.REQUIRE_CHECKOUT_COMPLETE && !isCheckoutComplete(record)) {
        console.log('⏭️ Skipping: Checkout not completed. (Set REQUIRE_CHECKOUT_COMPLETE: false to sync partial leads.)');
        output.set('success', false);
        output.set('skipped', true);
        output.set('reason', 'Checkout not completed');
        return;
    }

    console.log(`📋 Processing record: ${recordId}`);

    const payload = {
        'submission-id': recordId,
        'submission-date': new Date().toISOString(),
    };

    let fieldCount = 0;
    for (const fieldName of WELLMEDR_FIELDS) {
        try {
            const value = record.getCellValue(fieldName);
            if (value !== null && value !== undefined && value !== '') {
                if (typeof value === 'object' && value.name) {
                    payload[fieldName] = value.name;
                } else if (Array.isArray(value)) {
                    if (value.length > 0) {
                        payload[fieldName] = value.map(v => v.name || v).join(', ');
                    }
                } else if (typeof value === 'boolean') {
                    payload[fieldName] = value;
                } else {
                    payload[fieldName] = String(value);
                }
                fieldCount++;
            }
        } catch (e) {
            if (CONFIG.DEBUG) console.log(`⚠️ Field "${fieldName}" not found`);
        }
    }

    console.log(`📊 Extracted ${fieldCount} fields`);
    console.log(`📦 Patient: ${payload['first-name'] || '?'} ${payload['last-name'] || '?'} (${payload['email'] || '?'})`);
    console.log(`📦 Checkout Completed: ${payload['Checkout Completed'] ?? payload['Checkout Completed 2'] ?? 'N/A'}`);

    if (!payload['email'] && !payload['phone']) {
        console.error('❌ Missing email and phone');
        output.set('success', false);
        output.set('error', 'Missing email and phone');
        return;
    }

    console.log('📤 Sending to EONPRO...');

    try {
        const response = await fetch(CONFIG.WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-webhook-secret': CONFIG.WEBHOOK_SECRET,
            },
            body: JSON.stringify(payload),
        });

        // ═══════════════════════════════════════════════════════════════
        // ROBUST RESPONSE PARSING
        // Airtable's fetch() environment can behave differently from
        // standard Node.js/browser fetch. Use text() + JSON.parse()
        // for maximum compatibility and better error diagnostics.
        // ═══════════════════════════════════════════════════════════════
        let result = {};
        let rawText = '';
        try {
            rawText = await response.text();
            if (CONFIG.DEBUG) {
                // Log first 500 chars of response for debugging
                console.log(`📥 Response status: ${response.status}`);
                console.log(`📥 Response body: ${rawText.substring(0, 500)}`);
            }
            if (rawText) {
                result = JSON.parse(rawText);
            }
        } catch (parseErr) {
            console.error(`❌ Failed to parse response JSON: ${parseErr.message}`);
            console.error(`   Raw response (first 300 chars): ${rawText.substring(0, 300)}`);
            output.set('success', false);
            output.set('error', `Invalid response from EONPRO: ${parseErr.message}`);
            return;
        }

        // Check for success - handle multiple response formats:
        // 1. Standard success: { success: true, eonproPatientId: "...", ... }
        // 2. Duplicate (idempotency): { received: true, status: "duplicate", ... }
        const isSuccess = result.success === true;
        const isDuplicate = result.received === true && result.status === 'duplicate';

        if (response.ok && (isSuccess || isDuplicate)) {
            if (isDuplicate) {
                console.log('✅ Already processed (duplicate request detected by EONPRO)');
                output.set('success', true);
                output.set('eonproPatientId', '');
                output.set('eonproDatabaseId', '');
                return;
            }

            console.log('✅ SUCCESS!');
            console.log(`   Patient ID: ${result.eonproPatientId}`);
            console.log(`   Database ID: ${result.eonproDatabaseId}`);
            console.log(`   New Patient: ${result.patient?.isNew ? 'Yes' : 'No (updated)'}`);
            console.log(`   Time: ${result.processingTime}`);
            if (result.soapNote) console.log(`   SOAP Note: #${result.soapNote.id}`);
            if (result.warnings && result.warnings.length > 0) {
                console.log(`   ⚠️ Warnings: ${result.warnings.join(', ')}`);
            }

            output.set('success', true);
            output.set('eonproPatientId', result.eonproPatientId || '');
            output.set('eonproDatabaseId', String(result.eonproDatabaseId || ''));
        } else {
            console.error(`❌ EONPRO returned error`);
            console.error(`   HTTP Status: ${response.status}`);
            console.error(`   Error: ${result.error || 'No error message'}`);
            console.error(`   Code: ${result.code || 'N/A'}`);
            console.error(`   Message: ${result.message || 'N/A'}`);
            if (result.requestId) console.error(`   Request ID: ${result.requestId}`);
            if (result.queued) console.log(`   ℹ️ Queued for retry (DLQ): ${result.dlqId || 'yes'}`);
            output.set('success', false);
            output.set('error', result.error || result.message || `HTTP ${response.status}`);
        }
    } catch (error) {
        console.error(`❌ Network error: ${error.message}`);
        console.error('   Check that EONPRO is reachable at: ' + CONFIG.WEBHOOK_URL);
        output.set('success', false);
        output.set('error', `Network error: ${error.message}`);
    }
}

await main();
