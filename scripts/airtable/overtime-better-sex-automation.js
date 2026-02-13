/**
 * Overtime Men's Clinic - Better Sex (ED/Sexual Health) Intake Automation
 * 
 * This script sends new Better Sex intake records from Airtable to EONPRO.
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

const TREATMENT_TYPE = "better_sex";

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
    "submission-id": `ot-sex-${record.id}`,
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
    
    // ED/Sexual Health specific fields
    "ed-history": getCellValue("ED History") || getCellValue("Erectile Dysfunction"),
    "ed-duration": getCellValue("ED Duration") || getCellValue("How Long"),
    "ed-severity": getCellValue("ED Severity"),
    "ed-onset": getCellValue("ED Onset") || getCellValue("When Started"),
    "libido-level": getCellValue("Libido Level") || getCellValue("Sex Drive"),
    "performance-anxiety": getCellValue("Performance Anxiety"),
    "relationship-status": getCellValue("Relationship Status"),
    "previous-ed-meds": getCellValue("Previous ED Medications") || getCellValue("Tried Before"),
    "viagra-experience": getCellValue("Viagra Experience") || getCellValue("Sildenafil"),
    "cialis-experience": getCellValue("Cialis Experience") || getCellValue("Tadalafil"),
    "preferred-medication": getCellValue("Preferred Medication"),
    "frequency-needed": getCellValue("Frequency Needed") || getCellValue("How Often"),
    "cardiovascular-health": getCellValue("Cardiovascular Health") || getCellValue("Heart Health"),
    "blood-pressure": getCellValue("Blood Pressure"),
    "nitrate-use": getCellValue("Nitrate Use") || getCellValue("Taking Nitrates"),
    "diabetes": getCellValue("Diabetes"),
    
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

console.log(`\n💪 Overtime Better Sex Intake`);
console.log(`📋 Record ID: ${record.id}`);
console.log(`📧 Patient: ${payload["first-name"]} ${payload["last-name"]} (${payload["email"]})`);
console.log(`📊 ED History: ${payload["ed-history"]}`);
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
        console.log(`   Treatment: ${result.treatment?.label || "Better Sex"}`);
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
