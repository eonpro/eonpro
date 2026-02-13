/**
 * Overtime Men's Clinic - NAD+ Intake Automation
 * 
 * This script sends new NAD+ intake records from Airtable to EONPRO.
 * 
 * Setup in Airtable:
 * 1. Create automation: "When a record is created" trigger
 * 2. Add action: "Run a script"
 * 3. Paste this script
 * 4. Map input variable: record → The triggering record
 * 5. Update WEBHOOK_SECRET with your actual secret
 */

// Configuration - UPDATE THESE VALUES
const WEBHOOK_URL = "https://eonpro-kappa.vercel.app/api/webhooks/overtime-intake";
const WEBHOOK_SECRET = "YOUR_OVERTIME_INTAKE_WEBHOOK_SECRET";

const TREATMENT_TYPE = "nad_plus";

let inputConfig = input.config();
let record = inputConfig.record;

function getCellValue(fieldName, defaultValue = "") {
    try {
        const value = record.getCellValue(fieldName);
        if (value === null || value === undefined) return defaultValue;
        if (typeof value === 'object') {
            if (value.name) return value.name;
            if (Array.isArray(value) && value.length > 0) {
                return value.map(v => v.name || v).join(", ");
            }
        }
        return String(value);
    } catch (e) {
        return defaultValue;
    }
}

const payload = {
    "treatmentType": TREATMENT_TYPE,
    "submission-id": `ot-nad-${record.id}`,
    "submission-date": new Date().toISOString(),
    
    // Patient information
    "first-name": getCellValue("First Name"),
    "last-name": getCellValue("Last Name"),
    "email": getCellValue("Email"),
    "phone": getCellValue("Phone"),
    "dob": getCellValue("Date of Birth"),
    "sex": getCellValue("Sex") || getCellValue("Gender"),
    "state": getCellValue("State"),
    
    // Address
    "address": getCellValue("Address"),
    "city": getCellValue("City"),
    "zip": getCellValue("Zip Code"),
    
    // Body metrics
    "weight": getCellValue("Weight"),
    "height": getCellValue("Height"),
    
    // NAD+ specific fields
    "nad-experience": getCellValue("NAD+ Experience") || getCellValue("Previous NAD+"),
    "previous-nad": getCellValue("Previous NAD+ Treatment"),
    "iv-experience": getCellValue("IV Experience") || getCellValue("IV Therapy Experience"),
    "energy-level": getCellValue("Energy Level") || getCellValue("Current Energy"),
    "cognitive-goals": getCellValue("Cognitive Goals") || getCellValue("Mental Clarity Goals"),
    "recovery-goals": getCellValue("Recovery Goals"),
    "anti-aging-goals": getCellValue("Anti-Aging Goals"),
    "preferred-protocol": getCellValue("Preferred Protocol"),
    "treatment-frequency": getCellValue("Treatment Frequency") || getCellValue("Desired Frequency"),
    "chronic-fatigue": getCellValue("Chronic Fatigue"),
    "brain-fog": getCellValue("Brain Fog"),
    "sleep-quality": getCellValue("Sleep Quality"),
    
    // Medical history
    "health-conditions": getCellValue("Health Conditions"),
    "current-medications": getCellValue("Current Medications"),
    "allergies": getCellValue("Allergies"),
    
    // PROMO CODE - Prefer "Who recommended OT Mens Health to you?" (Airtable column)
    "Who reccomended OT Mens Health to you?": getCellValue("Who reccomended OT Mens Health to you?"),
    "Who recommended OT Mens Health to you?": getCellValue("Who recommended OT Mens Health to you?"),
    "PROMO CODE": getCellValue("Who reccomended OT Mens Health to you?") || getCellValue("Who recommended OT Mens Health to you?") || getCellValue("PROMO CODE") || getCellValue("Promo Code") || getCellValue("Influencer Code"),
    "influencer-code": getCellValue("Who reccomended OT Mens Health to you?") || getCellValue("Who recommended OT Mens Health to you?") || getCellValue("Influencer Code"),
    
    // Checkout
    "Checkout Completed": getCellValue("Checkout Completed") === "true" || 
                          getCellValue("Checkout Completed") === true ||
                          getCellValue("Paid") === "true",
    
    // Consent
    "hipaa-agreement": getCellValue("HIPAA Agreement"),
};

console.log(`\n⚡ Overtime NAD+ Intake`);
console.log(`📋 Record ID: ${record.id}`);
console.log(`📧 Patient: ${payload["first-name"]} ${payload["last-name"]} (${payload["email"]})`);
console.log(`🔋 Energy Level: ${payload["energy-level"]}`);
if (payload["PROMO CODE"]) {
    console.log(`🏷️ Promo Code: ${payload["PROMO CODE"]}`);
}

try {
    let response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": WEBHOOK_SECRET,
        },
        body: JSON.stringify(payload),
    });

    let result = await response.json();

    if (response.ok && result.success) {
        console.log(`\n✅ SUCCESS!`);
        console.log(`   EONPRO Patient ID: ${result.eonproPatientId}`);
        console.log(`   Treatment: ${result.treatment?.label || "NAD+"}`);
        console.log(`   Patient Status: ${result.patient?.isNew ? "NEW" : "UPDATED"}`);
        if (result.affiliate?.tracked) {
            console.log(`   🎉 Affiliate Tracked: ${result.affiliate.code}`);
        }
        
        output.set("eonproPatientId", result.eonproPatientId || "");
        output.set("eonproDatabaseId", String(result.eonproDatabaseId || ""));
        output.set("success", true);
    } else {
        console.error(`\n❌ ERROR: ${result.error || "Unknown error"}`);
        output.set("success", false);
        output.set("error", result.error);
    }
} catch (error) {
    console.error(`\n❌ NETWORK ERROR: ${error.message}`);
    output.set("success", false);
    output.set("error", error.message);
}
