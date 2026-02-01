/**
 * Overtime Men's Clinic - Baseline/Bloodwork Intake Automation
 * 
 * This script sends new Baseline/Bloodwork intake records from Airtable to EONPRO.
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

const TREATMENT_TYPE = "baseline_bloodwork";

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
    "submission-id": `ot-labs-${record.id}`,
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
    
    // Lab Preferences
    "lab-location": getCellValue("Lab Location") || getCellValue("Preferred Location"),
    "preferred-lab": getCellValue("Preferred Lab") || getCellValue("Lab Company"),
    "fasting-available": getCellValue("Fasting Available") || getCellValue("Can Fast"),
    "preferred-time": getCellValue("Preferred Time") || getCellValue("Appointment Time"),
    "mobile-phlebotomy": getCellValue("Mobile Phlebotomy") || getCellValue("Home Visit"),
    
    // Health Assessment
    "reason-for-labs": getCellValue("Reason for Labs") || getCellValue("Why Labs"),
    "symptoms": getCellValue("Symptoms") || getCellValue("Current Symptoms"),
    "treatment-interest": getCellValue("Treatment Interest") || getCellValue("Interested In"),
    
    // Previous Labs
    "last-lab-date": getCellValue("Last Lab Date") || getCellValue("Previous Labs Date"),
    "previous-lab-results": getCellValue("Previous Lab Results"),
    "has-recent-labs": getCellValue("Has Recent Labs"),
    
    // Insurance/Payment
    "insurance-coverage": getCellValue("Insurance Coverage") || getCellValue("Insurance"),
    "self-pay": getCellValue("Self Pay") || getCellValue("Cash Pay"),
    
    // Medical history
    "health-conditions": getCellValue("Health Conditions"),
    "current-medications": getCellValue("Current Medications"),
    "allergies": getCellValue("Allergies"),
    
    // PROMO CODE
    "PROMO CODE": getCellValue("PROMO CODE") || getCellValue("Promo Code") || getCellValue("Influencer Code"),
    "influencer-code": getCellValue("Influencer Code"),
    
    // Checkout
    "Checkout Completed": getCellValue("Checkout Completed") === "true" || 
                          getCellValue("Checkout Completed") === true ||
                          getCellValue("Paid") === "true",
    
    // Consent
    "hipaa-agreement": getCellValue("HIPAA Agreement"),
};

console.log(`\n🧪 Overtime Baseline/Bloodwork Intake`);
console.log(`📋 Record ID: ${record.id}`);
console.log(`📧 Patient: ${payload["first-name"]} ${payload["last-name"]} (${payload["email"]})`);
console.log(`📍 Preferred Lab: ${payload["preferred-lab"] || "Not specified"}`);
console.log(`🎯 Reason: ${payload["reason-for-labs"]}`);
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
        console.log(`   Treatment: ${result.treatment?.label || "Baseline/Bloodwork"}`);
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
