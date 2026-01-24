/**
 * WELLMEDR INTAKE → EONPRO AIRTABLE AUTOMATION SCRIPT
 * 
 * This script sends patient intake data from Airtable to EONPRO.
 * 
 * SETUP INSTRUCTIONS:
 * 1. In Airtable, go to Automations
 * 2. Create new automation with trigger: "When record matches conditions" or "When record created"
 * 3. Add action: "Run script"
 * 4. Paste this entire script
 * 5. Configure input variables (see below)
 * 
 * INPUT VARIABLES NEEDED:
 * - recordId: Record ID (from trigger)
 * 
 * Created: 2026-01-24
 * For: Wellmedr LLC → EONPRO Integration
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
    // EONPRO Webhook URL
    WEBHOOK_URL: 'https://app.eonpro.io/api/webhooks/wellmedr-intake',
    
    // Webhook secret - KEEP THIS SECURE!
    WEBHOOK_SECRET: 'aWa/zKA2HSasDFF/ftw5KwcD/lh/F86y4tBYIjFrUnA=',
    
    // Your Airtable table name
    TABLE_NAME: '2026 Q1 Fillout Intake - 1',
    
    // Set to true to log detailed debug info
    DEBUG: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// WELLMEDR AIRTABLE FIELD NAMES (from your field mapping guide)
// These are your exact Airtable column names
// ═══════════════════════════════════════════════════════════════════════════

const WELLMEDR_FIELDS = [
    // Submission Metadata
    'submission-id',
    'submission-date',
    
    // Patient Identity
    'first-name',
    'last-name',
    'email',
    'phone',
    'state',
    'dob',
    'sex',
    
    // Body Metrics
    'feet',
    'inches',
    'weight',
    'goal-weight',
    'bmi',
    
    // Vitals & Health
    'avg-blood-pressure-range',
    'avg-resting-heart-rate',
    'weight-related-symptoms',
    
    // Medical History
    'health-conditions',
    'health-conditions-2',
    'type-2-diabetes',
    'men2-history',
    'bariatric',
    'bariatric-details',
    
    // Lifestyle & Goals
    'reproductive-status',
    'sleep-quality',
    'primary-fitness-goal',
    'weight-loss-motivation',
    'motivation-level',
    'pace',
    'affordability-potency',
    
    // Medication Preferences & GLP-1 History
    'preferred-meds',
    'injections-tablets',
    'glp1-last-30',
    'glp1-last-30-medication-type',
    'glp1-last-30-medication-dose-mg',
    'glp1-last-30-medication-dose-other',
    'glp1-last-30-other-medication-name',
    
    // Current Medications
    'current-meds',
    'current-meds-details',
    
    // Risk Screening
    'opioids',
    'opioids-details',
    'allergies',
    
    // Additional Info & Compliance
    'additional-info',
    'additional-info-details',
    'hipaa-agreement',
    
    // Checkout Status
    'Checkout Completed',
    'Checkout Completed 2',
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SCRIPT
// ═══════════════════════════════════════════════════════════════════════════

let inputConfig = input.config();

async function main() {
    console.log('🚀 Starting Wellmedr → EONPRO sync...');
    
    // Get the record from the trigger
    const recordId = inputConfig.recordId;
    
    if (!recordId) {
        console.error('❌ No record ID provided!');
        console.error('   Make sure to add "recordId" as an input variable in the automation.');
        output.set('success', false);
        output.set('error', 'No record ID provided');
        return;
    }
    
    // Get the table
    let table;
    try {
        table = base.getTable(CONFIG.TABLE_NAME);
    } catch (e) {
        console.error(`❌ Table "${CONFIG.TABLE_NAME}" not found!`);
        console.error('   Update CONFIG.TABLE_NAME to match your actual table name.');
        output.set('success', false);
        output.set('error', `Table not found: ${CONFIG.TABLE_NAME}`);
        return;
    }
    
    // Fetch the record
    const record = await table.selectRecordAsync(recordId);
    
    if (!record) {
        console.error(`❌ Record ${recordId} not found`);
        output.set('success', false);
        output.set('error', 'Record not found');
        return;
    }
    
    console.log(`📋 Processing record: ${recordId}`);
    
    // Build the payload
    const payload = {
        'submission-id': recordId,
        'submission-date': new Date().toISOString(),
    };
    
    // Extract all fields
    let fieldCount = 0;
    for (const fieldName of WELLMEDR_FIELDS) {
        try {
            const value = record.getCellValue(fieldName);
            if (value !== null && value !== undefined && value !== '') {
                // Handle different Airtable field types
                if (typeof value === 'object' && value.name) {
                    // Single select field
                    payload[fieldName] = value.name;
                } else if (Array.isArray(value)) {
                    // Multi-select or linked records
                    if (value.length > 0) {
                        payload[fieldName] = value.map(v => v.name || v).join(', ');
                    }
                } else if (typeof value === 'boolean') {
                    // Checkbox field
                    payload[fieldName] = value;
                } else {
                    // Text, number, date, etc.
                    payload[fieldName] = String(value);
                }
                fieldCount++;
            }
        } catch (e) {
            // Field doesn't exist in this table - that's okay
            if (CONFIG.DEBUG) {
                console.log(`⚠️ Field "${fieldName}" not found (skipping)`);
            }
        }
    }
    
    console.log(`📊 Extracted ${fieldCount} fields from record`);
    
    if (CONFIG.DEBUG) {
        console.log('📦 Payload preview:');
        console.log(`   Name: ${payload['first-name']} ${payload['last-name']}`);
        console.log(`   Email: ${payload['email']}`);
        console.log(`   Phone: ${payload['phone']}`);
        console.log(`   State: ${payload['state']}`);
        console.log(`   Checkout: ${payload['Checkout Completed']}`);
    }
    
    // Validate required fields
    if (!payload['email'] && !payload['phone']) {
        console.error('❌ Missing required fields: need at least email or phone');
        output.set('success', false);
        output.set('error', 'Missing email and phone');
        return;
    }
    
    // Send to EONPRO
    console.log(`📤 Sending to EONPRO...`);
    
    try {
        const response = await fetch(CONFIG.WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-webhook-secret': CONFIG.WEBHOOK_SECRET,
            },
            body: JSON.stringify(payload),
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            console.log('');
            console.log('✅ ═══════════════════════════════════════════════');
            console.log('   SUCCESS! Patient synced to EONPRO');
            console.log('═══════════════════════════════════════════════════');
            console.log(`   📋 EONPRO Patient ID: ${result.eonproPatientId}`);
            console.log(`   🔢 Database ID: ${result.eonproDatabaseId}`);
            console.log(`   👤 Patient: ${result.patient?.name}`);
            console.log(`   🆕 New Patient: ${result.patient?.isNew ? 'Yes' : 'No (updated existing)'}`);
            console.log(`   📝 Checkout: ${result.submission?.checkoutCompleted ? 'Complete' : 'Partial'}`);
            console.log(`   ⏱️ Processing: ${result.processingTime}`);
            
            if (result.document) {
                console.log(`   📄 Document ID: ${result.document.id}`);
            }
            
            if (result.soapNote) {
                console.log(`   🩺 SOAP Note: #${result.soapNote.id} (${result.soapNote.status})`);
            }
            
            if (result.warnings && result.warnings.length > 0) {
                console.log(`   ⚠️ Warnings: ${result.warnings.join(', ')}`);
            }
            
            // Set outputs for the next action (to update Airtable)
            output.set('success', true);
            output.set('eonproPatientId', result.eonproPatientId || '');
            output.set('eonproDatabaseId', String(result.eonproDatabaseId || ''));
            output.set('isNewPatient', result.patient?.isNew || false);
            output.set('message', result.message || 'Success');
            output.set('soapNoteId', result.soapNote?.id ? String(result.soapNote.id) : '');
            
        } else {
            console.log('');
            console.log('❌ ═══════════════════════════════════════════════');
            console.log('   ERROR from EONPRO');
            console.log('═══════════════════════════════════════════════════');
            console.log(`   Status: ${response.status}`);
            console.log(`   Error: ${result.error || 'Unknown error'}`);
            console.log(`   Code: ${result.code || 'N/A'}`);
            console.log(`   Request ID: ${result.requestId || 'N/A'}`);
            
            output.set('success', false);
            output.set('error', result.error || `HTTP ${response.status}`);
            output.set('errorCode', result.code || '');
        }
        
    } catch (error) {
        console.log('');
        console.log('❌ ═══════════════════════════════════════════════');
        console.log('   NETWORK ERROR');
        console.log('═══════════════════════════════════════════════════');
        console.log(`   Error: ${error.message}`);
        
        output.set('success', false);
        output.set('error', `Network error: ${error.message}`);
    }
}

// Run the script
await main();
