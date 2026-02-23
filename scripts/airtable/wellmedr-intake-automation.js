/**
 * WELLMEDR INTAKE → EONPRO AIRTABLE AUTOMATION SCRIPT
 *
 * USE THIS FULL VERSION IN AIRTABLE. If you see "Field 'phone' not found", your
 * automation is using an older script that only looks for a column named "phone".
 * This script tries many names (Phone Number, Contact, Contact #, etc.) and
 * handles linked records. Set CONFIG.TABLE_NAME to your actual table name below.
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

// Airtable column names often differ (e.g. "Phone Number" vs "phone"). For each Wellmedr key, try these aliases when reading.
// Phone: include every common label; Airtable/Forms often rename columns and phone then stops flowing.
const FIELD_ALIASES = {
    'phone': [
        'phone', 'Phone', 'PHONE',
        'Phone Number', 'Phone number', 'phone number',
        'Mobile', 'Mobile Number', 'Cell', 'Cell Phone', 'Telephone',
        'Phone (from Contacts)', 'Phone Number (from Contacts)', 'phone (from contacts)',
        'Mobile (from Contacts)', 'Cell (from Contacts)',
        'Primary Phone', 'Contact Phone', 'Your Phone', 'Patient Phone',
        'Contact Number', 'Primary Contact', 'Phone #',
        'Contact #', 'Contact', 'Primary Contact Number', 'Patient Contact',
        'Contact Info', 'Preferred Phone', 'Daytime Phone', 'Work Phone', 'Home Phone',
        'Phone/Text', 'Text Number', 'Your Phone',
    ],
    'first-name': ['first-name', 'First Name', 'FirstName', 'first_name'],
    'last-name': ['last-name', 'Last Name', 'LastName', 'last_name'],
    'email': ['email', 'Email', 'Email Address', 'E-mail'],
    'dob': ['dob', 'DOB', 'Date of Birth', 'Date of birth', 'date-of-birth', 'Birth date'],
    'state': ['state', 'State', 'Address [State]'],
};

function getCellValueWithAliases(record, wellmedrFieldName) {
    const aliases = FIELD_ALIASES[wellmedrFieldName];
    if (aliases) {
        for (const alias of aliases) {
            try {
                const val = record.getCellValue(alias);
                if (val !== null && val !== undefined && val !== '') return val;
            } catch (_) { /* column doesn't exist */ }
        }
        return null;
    }
    try {
        return record.getCellValue(wellmedrFieldName);
    } catch (_) {
        return null;
    }
}

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

    // Extract a string from Airtable cell value (linked records, lookups, primitives).
    // Linked "Contacts" often return { name, phoneNumber } or array of same; we want a single phone string.
    function stringCellValue(value, fieldName) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string' && value.trim() !== '') return value.trim();
        if (typeof value === 'number') return String(value);
        if (Array.isArray(value)) {
            const parts = value.map(function (v) {
                if (v == null) return '';
                if (typeof v === 'string') return v.trim();
                if (typeof v === 'object') {
                    return v.phoneNumber || v.phone || v.number || v.name || (v.fields && (v.fields.phone || v.fields.phoneNumber || v.fields.name)) || '';
                }
                return String(v);
            }).filter(Boolean);
            return parts.length > 0 ? parts.join(', ') : null;
        }
        if (typeof value === 'object') {
            const f = value.fields || value;
            return value.phoneNumber || value.phone || value.number || value.name
                || (f && (f.phoneNumber || f.phone || f.Phone || f.number)) || null;
        }
        return null;
    }

    let fieldCount = 0;
    for (const fieldName of WELLMEDR_FIELDS) {
        try {
            const raw = getCellValueWithAliases(record, fieldName);
            const value = stringCellValue(raw, fieldName);
            if (value !== null && value !== '') {
                payload[fieldName] = typeof value === 'boolean' ? value : String(value);
                fieldCount++;
            }
        } catch (e) {
            if (CONFIG.DEBUG) console.log(`⚠️ Field "${fieldName}" not found`);
        }
    }

    // Fallback 1: if phone still empty, try ANY field whose name contains "phone", "tel", "mobile", "cell" (handles renamed columns).
    // Note: In Airtable Automations, table.fields may be undefined; then we rely on Fallback 2.
    if (!payload['phone'] && typeof table.fields !== 'undefined') {
        const phoneLike = ['phone', 'tel', 'mobile', 'cell'];
        for (let i = 0; i < table.fields.length; i++) {
            const field = table.fields[i];
            const name = field && field.name;
            if (!name) continue;
            const nameLower = name.toLowerCase();
            if (!phoneLike.some(function (sub) { return nameLower.indexOf(sub) !== -1; })) continue;
            try {
                const raw = record.getCellValue(name);
                const s = stringCellValue(raw, 'phone');
                if (s) {
                    payload['phone'] = s;
                    fieldCount++;
                    if (CONFIG.DEBUG) console.log('📞 Phone from fallback field: "' + name + '"');
                    break;
                }
            } catch (_) { /* ignore */ }
        }
    }

    // Fallback 2: try fixed list of common column names (works when table.fields is unavailable in Automations)
    if (!payload['phone']) {
        const extraPhoneNames = [
            'Contact #', 'Contact', 'Primary Contact Number', 'Primary Contact',
            'Phone', 'Phone Number', 'Mobile', 'Cell', 'Telephone', 'Your Phone',
            'Patient Contact', 'Contact Info', 'Preferred Phone', 'Daytime Phone',
            'Work Phone', 'Home Phone', 'Phone/Text', 'Text Number', 'Mobile Number'
        ];
        for (let i = 0; i < extraPhoneNames.length; i++) {
            try {
                const raw = record.getCellValue(extraPhoneNames[i]);
                const s = stringCellValue(raw, 'phone');
                if (s) {
                    payload['phone'] = s;
                    fieldCount++;
                    if (CONFIG.DEBUG) console.log('📞 Phone from extra column: "' + extraPhoneNames[i] + '"');
                    break;
                }
            } catch (_) { /* column doesn't exist */ }
        }
    }

    console.log(`📊 Extracted ${fieldCount} fields`);
    console.log(`📦 Patient: ${payload['first-name'] || '?'} ${payload['last-name'] || '?'} (${payload['email'] || '?'})`);
    console.log(`📦 Phone: ${payload['phone'] ? '***' + (payload['phone'].length > 4 ? payload['phone'].slice(-4) : '') : 'MISSING'}`);
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
