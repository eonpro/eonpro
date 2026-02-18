/**
 * WELLMEDR INVOICE → EONPRO AIRTABLE AUTOMATION SCRIPT
 *
 * Creates an invoice in EONPRO when payment is detected in Airtable.
 * This puts the patient in the Prescription Queue for provider review.
 *
 * TRIGGER: When `payment_method_id` (or `method_payment_id`) field has a pm_* value
 *
 * SETUP:
 * 1. Airtable → Automations → New automation
 * 2. TRIGGER: "When record matches conditions"
 *    - Table: Your orders table (e.g. "Orders")
 *    - Condition: "payment_method_id" is not empty AND starts with "pm_"
 * 3. ACTION: Run script
 * 4. Input variables: Map Airtable fields to script inputs (see config below)
 * 5. Paste this script
 *
 * ⚠️  CRITICAL: PATIENT MATCHING REQUIREMENTS
 * The EONPRO invoice webhook matches invoices to patients primarily by EMAIL.
 * For matching to succeed:
 *   - `customer_email` MUST be the PATIENT's email (same as the intake form email)
 *   - If `customer_email` is the PAYER's email (e.g. spouse), matching WILL FAIL
 *     and a stub patient will be created (tagged 'needs-intake-merge')
 *   - To fix: Add a Lookup field in Orders table → Onboarding table → email field
 *     and map THAT field to `customer_email` instead of the payment email
 *
 * Created: 2026-01-24 | Updated: 2026-02-17
 */

const CONFIG = {
    WEBHOOK_URL: 'https://app.eonpro.io/api/webhooks/wellmedr-invoice',
    // Secret must match WELLMEDR_INTAKE_WEBHOOK_SECRET in EONPRO production
    WEBHOOK_SECRET: 'aWa/zKA2HSasDFF/ftw5KwcD/lh/F86y4tBYIjFrUnA=',
    DEBUG: true,
};

let inputCfg = input.config();

async function main() {
    console.log('🚀 Starting WellMedR Invoice → EONPRO sync...');

    // ═══════════════════════════════════════════════════════════════
    // Debug: Show what we received
    // ═══════════════════════════════════════════════════════════════
    if (CONFIG.DEBUG) {
        console.log('=== Received Inputs ===');
        console.log('customer_email:', inputCfg.customer_email);
        console.log('payment_method_id:', inputCfg.payment_method_id);
        console.log('product:', inputCfg.product);
        console.log('medication_type:', inputCfg.medication_type);
        console.log('plan:', inputCfg.plan);
        console.log('price:', inputCfg.price);
        console.log('shipping_address RAW:', inputCfg.shipping_address);
        console.log('created_at:', inputCfg.created_at);
    }

    // ═══════════════════════════════════════════════════════════════
    // Validate required fields
    // ═══════════════════════════════════════════════════════════════
    if (!inputCfg.payment_method_id) {
        console.log('❌ Skipping - payment_method_id is empty');
        output.set('success', false);
        output.set('error', 'payment_method_id is empty');
        return;
    }

    if (!inputCfg.payment_method_id.startsWith('pm_')) {
        console.log('❌ Skipping - payment_method_id does not start with pm_');
        console.log('   Value received:', inputCfg.payment_method_id);
        output.set('success', false);
        output.set('error', 'Invalid payment_method_id format');
        return;
    }

    if (!inputCfg.customer_email) {
        console.log('❌ Skipping - customer_email is empty');
        output.set('success', false);
        output.set('error', 'customer_email is empty');
        return;
    }

    // ═══════════════════════════════════════════════════════════════
    // Parse shipping address
    // Supports JSON object and comma-separated string formats.
    // IMPORTANT: Always send shipping_address as the combined string
    // so the EONPRO server can parse it reliably (handles apartments).
    // ═══════════════════════════════════════════════════════════════
    let shippingAddress = {};
    let customerName = '';
    let rawShippingString = '';

    if (inputCfg.shipping_address) {
        const rawAddress = String(inputCfg.shipping_address).trim();
        rawShippingString = rawAddress;

        if (rawAddress.startsWith('{')) {
            try {
                shippingAddress = JSON.parse(rawAddress);
                console.log('✓ Parsed JSON address:', shippingAddress.address, shippingAddress.city, shippingAddress.state);
                customerName = shippingAddress.firstName && shippingAddress.lastName
                    ? `${shippingAddress.firstName} ${shippingAddress.lastName}`
                    : '';
                // Reconstruct combined string for server-side parsing
                rawShippingString = [
                    shippingAddress.address,
                    shippingAddress.apt || shippingAddress.address_line2,
                    shippingAddress.city,
                    shippingAddress.state,
                    shippingAddress.zipCode || shippingAddress.zip,
                ].filter(Boolean).join(', ');
            } catch (e) {
                console.log('⚠ JSON parse failed:', e.message, '- using raw string');
            }
        } else {
            console.log('📍 Address is a string format - sending as-is for server-side parsing');
            // Let the server parse it - it has robust address parsing that handles apartments
            const parts = rawAddress.split(',').map(p => p.trim());
            if (parts.length >= 4) {
                shippingAddress = { address: parts[0], city: parts[1], state: parts[2], zipCode: parts[3] };
            } else if (parts.length === 3) {
                if (/\d/.test(parts[0])) {
                    const stateZip = parts[2].split(/\s+/);
                    shippingAddress = { address: parts[0], city: parts[1], state: stateZip[0] || '', zipCode: stateZip[1] || '' };
                } else {
                    shippingAddress = { city: parts[0], state: parts[1], zipCode: parts[2] };
                }
            } else {
                shippingAddress = { address: rawAddress };
            }
        }
    }

    if (!customerName) {
        customerName = inputCfg.customer_name || '';
    }

    // ═══════════════════════════════════════════════════════════════
    // Build payload
    // ═══════════════════════════════════════════════════════════════
    const payload = {
        // Required
        customer_email: inputCfg.customer_email,
        method_payment_id: inputCfg.payment_method_id,

        // Customer info
        customer_name: customerName,

        // Treatment details
        product: inputCfg.product || '',
        medication_type: inputCfg.medication_type || '',
        plan: inputCfg.plan || '',
        price: inputCfg.price || '',
        stripe_price_id: inputCfg.stripe_price_id || '',

        // Order info
        submission_id: inputCfg.submission_id || '',
        total_discount: inputCfg.total_discount || '',
        coupon_code: inputCfg.coupon_code || '',

        // Address - send BOTH the combined string AND individual fields
        // The server prefers the combined string (handles apartments correctly)
        shipping_address: rawShippingString,
        address: shippingAddress.address || '',
        address_line2: shippingAddress.apt || shippingAddress.address_line2 || '',
        city: shippingAddress.city || '',
        state: shippingAddress.state || '',
        zip: shippingAddress.zipCode || shippingAddress.zip || '',
        country: 'US',

        // Payment date
        payment_date: inputCfg.created_at || '',
    };

    console.log('');
    console.log('=== Sending to EONPRO ===');
    console.log('Email:', payload.customer_email);
    console.log('Customer:', payload.customer_name);
    console.log('Product:', payload.product, payload.medication_type, '(' + payload.plan + ')');
    console.log('Price:', payload.price);
    console.log('Payment ID:', payload.method_payment_id.substring(0, 20) + '...');
    console.log('Address:', payload.address, payload.city, payload.state, payload.zip);
    if (rawShippingString) {
        console.log('Combined address:', rawShippingString.substring(0, 80));
    }

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
        // Airtable's fetch() runtime can mishandle response.json().
        // Use text() + JSON.parse() for maximum compatibility.
        // ═══════════════════════════════════════════════════════════════
        let result = {};
        let rawText = '';
        try {
            rawText = await response.text();
            if (CONFIG.DEBUG) {
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
            output.set('error', `Invalid response: ${parseErr.message}`);
            return;
        }

        // Handle success, duplicate, and error responses
        const isSuccess = result.success === true;
        const isDuplicate = result.duplicate === true;

        console.log('');
        if (response.ok && (isSuccess || isDuplicate)) {
            if (isDuplicate) {
                console.log('✅ Already processed (duplicate payment detected)');
                console.log('   Invoice ID:', result.invoiceId || result.invoice?.id || 'N/A');
                output.set('success', true);
                output.set('invoiceId', String(result.invoiceId || result.invoice?.id || ''));
                return;
            }

            console.log('✅ SUCCESS!');
            console.log('   Invoice ID:', result.invoice?.id);
            console.log('   Invoice #:', result.invoice?.invoiceNumber);
            console.log('   Amount:', result.invoice?.amountFormatted);
            console.log('   Status:', result.invoice?.status);
            console.log('   Patient:', result.patient?.name);
            console.log('   Patient ID:', result.patient?.id);
            console.log('   Patient #:', result.patient?.patientId);
            if (result.patient?.wasAutoCreated) {
                console.log('   ⚠️ Patient was auto-created (intake not yet received)');
            }
            if (result.soapNote) {
                console.log('   SOAP Note:', result.soapNote.action, '- ID:', result.soapNote.id);
            }

            output.set('success', true);
            output.set('invoiceId', String(result.invoice?.id || ''));
            output.set('patientId', String(result.patient?.id || ''));
        } else {
            console.error('❌ EONPRO returned error');
            console.error('   HTTP Status:', response.status);
            console.error('   Error:', result.error || 'No error message');
            console.error('   Message:', result.message || 'N/A');
            if (result.requestId) console.error('   Request ID:', result.requestId);
            if (result.queued) console.log('   ℹ️ Queued for retry');

            output.set('success', false);
            output.set('error', result.error || result.message || `HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('❌ Network error:', error.message);
        console.error('   Check that EONPRO is reachable at:', CONFIG.WEBHOOK_URL);
        output.set('success', false);
        output.set('error', `Network error: ${error.message}`);
    }
}

await main();
