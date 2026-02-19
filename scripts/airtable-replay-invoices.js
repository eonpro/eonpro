/**
 * AIRTABLE REPLAY SCRIPT — Paste into Airtable Scripting Extension
 *
 * Replays all succeeded orders since a cutoff date to the EONPRO invoice webhook.
 * Use this to backfill orders that were missed due to broken input variable mappings.
 *
 * HOW TO RUN:
 * 1. In Airtable, go to Extensions → Scripting
 * 2. Paste this entire script
 * 3. Click "Run"
 * 4. It will process each succeeded order and report results
 *
 * SAFE: Uses EONPRO's idempotency — orders already processed will be skipped.
 */

const CONFIG = {
    WEBHOOK_URL: 'https://app.eonpro.io/api/webhooks/wellmedr-invoice',
    WEBHOOK_SECRET: 'aWa/zKA2HSasDFF/ftw5KwcD/lh/F86y4tBYIjFrUnA=',
    TABLE_NAME: 'Orders',
    // Replay orders created after this time (6 PM EST = 11 PM UTC on 2/17)
    CUTOFF_DATE: new Date('2026-02-17T23:00:00Z'),
    // Only process orders with these payment statuses
    VALID_PAYMENT_STATUSES: ['succeeded'],
    // Delay between requests to avoid rate limiting (ms)
    DELAY_MS: 1500,
    DEBUG: true,
};

// Fields to read from the Orders table — adjust names if your table uses different names
const FIELD_NAMES = {
    submissionId: 'submission_id',
    paymentStatus: 'payment_status',
    paymentMethodId: 'payment_method_id',
    customerEmail: 'customer_email',
    customerName: 'customer_name',
    product: 'product',
    medicationType: 'medication_type',
    plan: 'plan',
    price: 'price',
    shippingAddress: 'shipping_address',
    totalDiscount: 'total_discount',
    couponCode: 'coupon_code',
    stripePriceId: 'stripe_price_id',
    createdAt: 'Created',
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function safeFieldValue(record, fieldName) {
    try {
        const val = record.getCellValue(fieldName);
        if (val === null || val === undefined) return '';
        if (typeof val === 'object' && val.name) return val.name;
        if (Array.isArray(val)) return val.map(v => v.name || v).join(', ');
        return String(val);
    } catch (e) {
        return '';
    }
}

async function main() {
    console.log('🔄 Starting EONPRO Invoice Replay...');
    console.log(`   Cutoff: ${CONFIG.CUTOFF_DATE.toISOString()}`);
    console.log(`   Table: ${CONFIG.TABLE_NAME}`);
    console.log('');

    let table;
    try {
        table = base.getTable(CONFIG.TABLE_NAME);
    } catch (e) {
        console.error(`❌ Table "${CONFIG.TABLE_NAME}" not found. Check CONFIG.TABLE_NAME.`);
        return;
    }

    // Fetch all records (Airtable scripting loads all into memory)
    const query = await table.selectRecordsAsync({
        sorts: [{ field: FIELD_NAMES.createdAt || 'Created', direction: 'asc' }],
    });

    console.log(`📋 Total records in table: ${query.records.length}`);

    // Filter to succeeded orders after cutoff
    const eligibleOrders = [];
    for (const record of query.records) {
        const paymentStatus = safeFieldValue(record, FIELD_NAMES.paymentStatus).toLowerCase();
        const paymentMethodId = safeFieldValue(record, FIELD_NAMES.paymentMethodId);
        const customerEmail = safeFieldValue(record, FIELD_NAMES.customerEmail);
        const createdAt = record.getCellValue(FIELD_NAMES.createdAt);

        // Skip if no payment method
        if (!paymentMethodId || !paymentMethodId.startsWith('pm_')) continue;

        // Skip non-succeeded payments
        if (!CONFIG.VALID_PAYMENT_STATUSES.includes(paymentStatus)) continue;

        // Skip if before cutoff
        if (createdAt) {
            const recordDate = new Date(createdAt);
            if (recordDate < CONFIG.CUTOFF_DATE) continue;
        }

        // Skip if no email
        if (!customerEmail || customerEmail === 'customer_email' || !customerEmail.includes('@')) continue;

        eligibleOrders.push(record);
    }

    console.log(`✅ Eligible orders to replay: ${eligibleOrders.length}`);
    console.log('');

    if (eligibleOrders.length === 0) {
        console.log('No orders to replay. Check CUTOFF_DATE and table name.');
        return;
    }

    let successCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < eligibleOrders.length; i++) {
        const record = eligibleOrders[i];
        const email = safeFieldValue(record, FIELD_NAMES.customerEmail);
        const name = safeFieldValue(record, FIELD_NAMES.customerName);
        const pmId = safeFieldValue(record, FIELD_NAMES.paymentMethodId);
        const submissionId = safeFieldValue(record, FIELD_NAMES.submissionId) || record.id;

        // Parse shipping address
        let shippingAddress = safeFieldValue(record, FIELD_NAMES.shippingAddress);
        let addressObj = {};
        let rawShippingString = shippingAddress;

        if (shippingAddress.startsWith('{')) {
            try {
                addressObj = JSON.parse(shippingAddress);
                rawShippingString = [
                    addressObj.address,
                    addressObj.apt || addressObj.address_line2,
                    addressObj.city,
                    addressObj.state,
                    addressObj.zipCode || addressObj.zip,
                ].filter(Boolean).join(', ');
            } catch (e) { /* use raw string */ }
        } else {
            const parts = shippingAddress.split(',').map(p => p.trim());
            if (parts.length >= 4) {
                addressObj = { address: parts[0], city: parts[1], state: parts[2], zipCode: parts[3] };
            }
        }

        const payload = {
            customer_email: email,
            method_payment_id: pmId,
            customer_name: name,
            product: safeFieldValue(record, FIELD_NAMES.product),
            medication_type: safeFieldValue(record, FIELD_NAMES.medicationType),
            plan: safeFieldValue(record, FIELD_NAMES.plan),
            price: safeFieldValue(record, FIELD_NAMES.price),
            stripe_price_id: safeFieldValue(record, FIELD_NAMES.stripePriceId),
            submission_id: submissionId,
            total_discount: safeFieldValue(record, FIELD_NAMES.totalDiscount),
            coupon_code: safeFieldValue(record, FIELD_NAMES.couponCode),
            shipping_address: rawShippingString,
            address: addressObj.address || '',
            city: addressObj.city || '',
            state: addressObj.state || '',
            zip: addressObj.zipCode || addressObj.zip || '',
            country: 'US',
            payment_date: safeFieldValue(record, FIELD_NAMES.createdAt) || new Date().toISOString(),
        };

        console.log(`[${i + 1}/${eligibleOrders.length}] ${name} (${email}) — $${payload.price} ${payload.plan}...`);

        try {
            const response = await remoteFetchAsync(CONFIG.WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-webhook-secret': CONFIG.WEBHOOK_SECRET,
                },
                body: JSON.stringify(payload),
            });

            let result = {};
            try {
                const rawText = await response.text();
                if (rawText) result = JSON.parse(rawText);
            } catch (e) { /* parse error */ }

            if (response.ok && result.success) {
                if (result.duplicate) {
                    duplicateCount++;
                    console.log(`   ⏭️ Already processed (duplicate)`);
                } else {
                    successCount++;
                    console.log(`   ✅ Invoice #${result.invoice?.id} created — ${result.invoice?.amountFormatted}`);
                }
            } else {
                errorCount++;
                const errMsg = result.error || result.message || `HTTP ${response.status}`;
                errors.push(`${email}: ${errMsg}`);
                console.log(`   ❌ Error: ${errMsg}`);
            }
        } catch (networkErr) {
            errorCount++;
            errors.push(`${email}: Network error - ${networkErr.message}`);
            console.log(`   ❌ Network error: ${networkErr.message}`);
        }

        // Rate limit delay
        if (i < eligibleOrders.length - 1) {
            await sleep(CONFIG.DELAY_MS);
        }
    }

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Created: ${successCount}`);
    console.log(`⏭️ Duplicates (already existed): ${duplicateCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total processed: ${eligibleOrders.length}`);
    console.log('═══════════════════════════════════════');

    if (errors.length > 0) {
        console.log('');
        console.log('Error details:');
        for (const err of errors) {
            console.log(`  - ${err}`);
        }
    }
}

await main();
