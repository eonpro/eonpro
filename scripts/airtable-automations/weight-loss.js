// ═══════════════════════════════════════════════════════════════════
// EONPRO Webhook — OT Mens: Weight Loss
// Sends new intake records to ot.eonpro.io with affiliate tracking
// ═══════════════════════════════════════════════════════════════════

let inputConfig = input.config();

let table = base.getTable("OT Mens - Weight Loss");
let record = await table.selectRecordAsync(inputConfig.recordId);

if (!record) {
    console.log("Record not found");
    return;
}

// ── Helper: read all fields from a record ──
function readAllFields(rec) {
    let data = {};
    for (let field of table.fields) {
        let value = rec.getCellValue(field.name);
        if (value !== null && value !== undefined) {
            if (typeof value === 'object' && value.name) {
                data[field.name] = value.name;
            } else if (Array.isArray(value)) {
                data[field.name] = value.map(v => v.name || v).join(", ");
            } else {
                data[field.name] = value;
            }
        }
    }
    return data;
}

let payload = readAllFields(record);

// ── CRITICAL: Ensure affiliate URL tracking fields are included ──
const AFFILIATE_URL_FIELDS = ["URL with parameters", "URL", "Referrer"];

let missingUrlFields = AFFILIATE_URL_FIELDS.filter(f => !payload[f]);

if (missingUrlFields.length > 0) {
    console.log("⚠️ Missing URL tracking fields on first read:", missingUrlFields.join(", "));
    console.log("   Re-reading record...");

    let refreshed = await table.selectRecordAsync(inputConfig.recordId);
    if (refreshed) {
        let refreshedData = readAllFields(refreshed);
        for (let f of missingUrlFields) {
            if (refreshedData[f]) {
                payload[f] = refreshedData[f];
                console.log("   ✓ Recovered:", f, "=", refreshedData[f]);
            }
        }
    }
}

// Log affiliate-relevant fields for debugging
console.log("── Affiliate Tracking Fields ──");
for (let f of AFFILIATE_URL_FIELDS) {
    console.log(`  ${f}: ${payload[f] || "(empty)"}`);
}
let promoFields = ["promo-code", "PROMO CODE", "influencer-code", "affiliate-code",
    "Who reccomended OT Mens Health to you?", "Who recommended OT Mens Health to you?",
    "How did you hear about us?"];
for (let f of promoFields) {
    if (payload[f]) console.log(`  ${f}: ${payload[f]}`);
}
console.log("───────────────────────────────");

// Add submission metadata
payload['submission-id'] = record.id;
payload['submittedAt'] = new Date().toISOString();
payload['treatmentType'] = 'weight-loss';

console.log("Sending payload with", Object.keys(payload).length, "fields");

// ── Send to EONPRO webhook (PRODUCTION) ──
let response = await fetch("https://ot.eonpro.io/api/webhooks/overtime-intake", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": "dcfc60541d7cd35089c3421bbdb9fabd27ed64afdcd4b149be78f33567bd08d5"
    },
    body: JSON.stringify(payload)
});

let result = await response.text();
console.log("Response status:", response.status);
console.log("Response:", result);

if (response.ok) {
    console.log("✓ Successfully sent to EONPRO!");
} else {
    console.log("✗ Failed to send to EONPRO");
}
