/**
 * WELLMEDR INTAKE → EONPRO — PASTE THIS ENTIRE SCRIPT IN AIRTABLE
 *
 * This version FIXES the phone issue: it tries multiple column names (Phone Number,
 * Phone (from Contacts), Primary Phone, etc.) and a fallback that finds ANY column
 * whose name contains "phone", "tel", "mobile", or "cell".
 *
 * Replace your current Run script action with this entire file.
 * Keep CONFIG.TABLE_NAME and CONFIG.WEBHOOK_SECRET as you have them.
 */

const CONFIG = {
    WEBHOOK_URL: 'https://app.eonpro.io/api/webhooks/wellmedr-intake',
    WEBHOOK_SECRET: 'aWa/zKA2HSasDFF/ftw5KwcD/lh/F86y4tBYIjFrUnA=',
    TABLE_NAME: 'Onboarding',
    DEBUG: true,
    REQUIRE_CHECKOUT_COMPLETE: false,
};

const CHECKOUT_FIELD_NAMES = [
    'Checkout Completed', 'Checkout Completed 2', 'CheckoutCompleted', 'Checkout completed', 'checkout_completed',
];

// CRITICAL: Airtable columns are rarely named "phone". We try these aliases so phone is found.
const FIELD_ALIASES = {
    'phone': [
        'phone', 'Phone', 'PHONE',
        'Phone Number', 'Phone number', 'phone number',
        'Mobile', 'Mobile Number', 'Cell', 'Cell Phone', 'Telephone',
        'Phone (from Contacts)', 'Phone Number (from Contacts)', 'phone (from contacts)',
        'Mobile (from Contacts)', 'Cell (from Contacts)',
        'Primary Phone', 'Contact Phone', 'Your Phone', 'Patient Phone',
        'Contact Number', 'Primary Contact', 'Phone #',
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
            } catch (_) { }
        }
        return null;
    }
    try {
        return record.getCellValue(wellmedrFieldName);
    } catch (_) {
        return null;
    }
}

function stringCellValue(value, fieldName) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) {
        const parts = value.map(function (v) {
            if (v == null) return '';
            if (typeof v === 'string') return v.trim();
            if (typeof v === 'object')
                return v.phoneNumber || v.phone || v.number || v.name || (v.fields && (v.fields.phone || v.fields.phoneNumber || v.fields.name)) || '';
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
            if (val === true || val === 'true' || val === 'Yes' || val === 'yes' || val === '1') return true;
        } catch (_) { }
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
        console.error('❌ Table "' + CONFIG.TABLE_NAME + '" not found!');
        output.set('success', false);
        output.set('error', 'Table not found: ' + CONFIG.TABLE_NAME);
        return;
    }
    const record = await table.selectRecordAsync(recordId);
    if (!record) {
        console.error('❌ Record ' + recordId + ' not found');
        output.set('success', false);
        output.set('error', 'Record not found');
        return;
    }
    if (CONFIG.REQUIRE_CHECKOUT_COMPLETE && !isCheckoutComplete(record)) {
        console.log('⏭️ Skipping: Checkout not completed.');
        output.set('success', false);
        output.set('skipped', true);
        return;
    }
    console.log('📋 Processing record: ' + recordId);
    const payload = {
        'submission-id': recordId,
        'submission-date': new Date().toISOString(),
    };
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
            if (CONFIG.DEBUG) console.log('⚠️ Field "' + fieldName + '" not found');
        }
    }
    // Fallback: if phone still empty, try ANY field whose name contains "phone", "tel", "mobile", "cell"
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
            } catch (_) { }
        }
    }
    console.log('📊 Extracted ' + fieldCount + ' fields');
    console.log('📦 Patient: ' + (payload['first-name'] || '?') + ' ' + (payload['last-name'] || '?') + ' (' + (payload['email'] || '?') + ')');
    console.log('📦 Phone: ' + (payload['phone'] ? '***' + (payload['phone'].length > 4 ? payload['phone'].slice(-4) : '') : 'MISSING'));
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
            headers: { 'Content-Type': 'application/json', 'x-webhook-secret': CONFIG.WEBHOOK_SECRET },
            body: JSON.stringify(payload),
        });
        let result = {};
        let rawText = '';
        try {
            rawText = await response.text();
            if (CONFIG.DEBUG) {
                console.log('📥 Response status: ' + response.status);
                console.log('📥 Response body: ' + rawText.substring(0, 500));
            }
            if (rawText) result = JSON.parse(rawText);
        } catch (parseErr) {
            console.error('❌ Failed to parse response: ' + parseErr.message);
            output.set('success', false);
            output.set('error', 'Invalid response from EONPRO');
            return;
        }
        const isSuccess = result.success === true;
        const isDuplicate = result.received === true && result.status === 'duplicate';
        if (response.ok && (isSuccess || isDuplicate)) {
            if (isDuplicate) {
                console.log('✅ Already processed (duplicate)');
                output.set('success', true);
                output.set('eonproPatientId', '');
                output.set('eonproDatabaseId', '');
                return;
            }
            console.log('✅ SUCCESS!');
            console.log('   Patient ID: ' + result.eonproPatientId);
            if (result._diagnostic && result._diagnostic.phoneReceived === true) {
                console.log('   📞 Phone received by EONPRO: yes');
            } else if (result._diagnostic) {
                console.log('   📞 Phone received by EONPRO: ' + (result._diagnostic.phoneReceived ? 'yes' : 'no'));
            }
            output.set('success', true);
            output.set('eonproPatientId', result.eonproPatientId || '');
            output.set('eonproDatabaseId', String(result.eonproDatabaseId || ''));
        } else {
            console.error('❌ EONPRO error: ' + (result.error || result.message || 'HTTP ' + response.status));
            output.set('success', false);
            output.set('error', result.error || result.message || 'HTTP ' + response.status);
        }
    } catch (error) {
        console.error('❌ Network error: ' + error.message);
        output.set('success', false);
        output.set('error', 'Network error: ' + error.message);
    }
}

await main();
