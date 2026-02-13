/**
 * Overtime Men's Clinic - Testosterone Replacement (TRT) Intake Automation
 * 
 * This script sends new TRT intake records from Airtable to EONPRO.
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

const TREATMENT_TYPE = "testosterone";

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
    "submission-id": `ot-trt-${record.id}`,
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
    
    // TRT Symptoms Assessment
    "trt-symptoms": getCellValue("TRT Symptoms") || getCellValue("Symptoms"),
    "fatigue-level": getCellValue("Fatigue Level") || getCellValue("Fatigue"),
    "muscle-loss": getCellValue("Muscle Loss"),
    "libido-changes": getCellValue("Libido Changes") || getCellValue("Low Libido"),
    "mood-changes": getCellValue("Mood Changes") || getCellValue("Mood Symptoms"),
    "brain-fog": getCellValue("Brain Fog") || getCellValue("Mental Clarity"),
    "sleep-issues": getCellValue("Sleep Issues") || getCellValue("Sleep Problems"),
    "weight-gain": getCellValue("Weight Gain"),
    
    // TRT History
    "previous-trt": getCellValue("Previous TRT") || getCellValue("TRT History"),
    "current-trt": getCellValue("Currently on TRT"),
    "trt-duration": getCellValue("TRT Duration") || getCellValue("How Long on TRT"),
    "trt-type": getCellValue("TRT Type") || getCellValue("Administration Method"),
    "injection-frequency": getCellValue("Injection Frequency"),
    
    // Lab Results
    "recent-testosterone-level": getCellValue("Recent Testosterone") || getCellValue("Total T"),
    "total-testosterone": getCellValue("Total Testosterone"),
    "free-testosterone": getCellValue("Free Testosterone") || getCellValue("Free T"),
    "estradiol-level": getCellValue("Estradiol") || getCellValue("E2 Level"),
    "psa-level": getCellValue("PSA Level") || getCellValue("PSA"),
    "hematocrit": getCellValue("Hematocrit") || getCellValue("HCT"),
    "recent-lab-date": getCellValue("Lab Date") || getCellValue("When Labs Done"),
    
    // Preferences
    "preferred-administration": getCellValue("Preferred Administration") || getCellValue("Preferred Method"),
    "injection-comfort": getCellValue("Injection Comfort"),
    
    // Contraindications
    "prostate-history": getCellValue("Prostate History") || getCellValue("Prostate Issues"),
    "heart-disease": getCellValue("Heart Disease") || getCellValue("Cardiac History"),
    "blood-clot-history": getCellValue("Blood Clot History") || getCellValue("DVT/PE"),
    "sleep-apnea": getCellValue("Sleep Apnea"),
    "fertility-concerns": getCellValue("Fertility Concerns") || getCellValue("Want Children"),
    
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

console.log(`\n💉 Overtime TRT Intake`);
console.log(`📋 Record ID: ${record.id}`);
console.log(`📧 Patient: ${payload["first-name"]} ${payload["last-name"]} (${payload["email"]})`);
console.log(`🧪 Total T: ${payload["total-testosterone"] || "Not provided"}`);
console.log(`📊 Previous TRT: ${payload["previous-trt"]}`);
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
        console.log(`   Treatment: ${result.treatment?.label || "Testosterone Replacement"}`);
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
