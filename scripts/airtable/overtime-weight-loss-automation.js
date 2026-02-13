/**
 * Overtime Men's Clinic - Weight Loss Intake Automation
 * 
 * This script sends new Weight Loss intake records from Airtable to EONPRO.
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
const WEBHOOK_SECRET = "YOUR_OVERTIME_INTAKE_WEBHOOK_SECRET"; // Get from EONPRO admin

// Treatment type for this table
const TREATMENT_TYPE = "weight_loss";

// Get the record that triggered this automation
let inputConfig = input.config();
let record = inputConfig.record;

// Helper function to safely get cell value
function getCellValue(fieldName, defaultValue = "") {
    try {
        const value = record.getCellValue(fieldName);
        if (value === null || value === undefined) return defaultValue;
        // Handle linked records or select fields
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

// Build the webhook payload
// Map your Airtable field names to the webhook fields
const payload = {
    // Treatment type - identifies this as Weight Loss
    "treatmentType": TREATMENT_TYPE,
    
    // Submission metadata
    "submission-id": `ot-wl-${record.id}`,
    "submission-date": new Date().toISOString(),
    
    // Patient information
    // UPDATE FIELD NAMES to match your Airtable column names
    "first-name": getCellValue("First Name"),
    "last-name": getCellValue("Last Name"),
    "email": getCellValue("Email"),
    "phone": getCellValue("Phone"),
    "dob": getCellValue("Date of Birth"),
    "sex": getCellValue("Sex") || getCellValue("Gender"),
    "state": getCellValue("State"),
    
    // Address (if available)
    "address": getCellValue("Address"),
    "city": getCellValue("City"),
    "zip": getCellValue("Zip Code") || getCellValue("ZIP"),
    
    // Body metrics
    "weight": getCellValue("Current Weight") || getCellValue("Weight"),
    "height": getCellValue("Height"),
    "feet": getCellValue("Height (feet)"),
    "inches": getCellValue("Height (inches)"),
    "bmi": getCellValue("BMI"),
    
    // Weight Loss specific fields
    "goal-weight": getCellValue("Goal Weight") || getCellValue("Target Weight"),
    "weight-loss-motivation": getCellValue("Weight Loss Motivation") || getCellValue("Motivation"),
    "weight-loss-history": getCellValue("Weight Loss History") || getCellValue("Previous Diets"),
    "diet-history": getCellValue("Diet History"),
    "exercise-frequency": getCellValue("Exercise Frequency"),
    
    // GLP-1 specific
    "glp1-experience": getCellValue("GLP-1 Experience"),
    "glp1-last-30": getCellValue("GLP-1 Last 30 Days") || getCellValue("Used GLP-1 Recently"),
    "glp1-medication-type": getCellValue("GLP-1 Medication Type") || getCellValue("Current GLP-1"),
    "glp1-dose": getCellValue("GLP-1 Dose") || getCellValue("Current Dose"),
    "preferred-meds": getCellValue("Preferred Medication"),
    "medication-preference": getCellValue("Medication Preference"),
    "injections-tablets": getCellValue("Injection vs Tablet"),
    
    // Medical history
    "health-conditions": getCellValue("Health Conditions") || getCellValue("Medical Conditions"),
    "current-medications": getCellValue("Current Medications"),
    "allergies": getCellValue("Allergies"),
    
    // Contraindications
    "men2-history": getCellValue("MEN2 History"),
    "thyroid-cancer": getCellValue("Thyroid Cancer History"),
    "pancreatitis": getCellValue("Pancreatitis"),
    "gastroparesis": getCellValue("Gastroparesis"),
    "bariatric-surgery": getCellValue("Bariatric Surgery") || getCellValue("Previous Bariatric"),
    
    // PROMO CODE - Prefer "Who recommended OT Mens Health to you?" (Airtable column), then Influencer/Promo Code
    "Who reccomended OT Mens Health to you?": getCellValue("Who reccomended OT Mens Health to you?"),
    "Who recommended OT Mens Health to you?": getCellValue("Who recommended OT Mens Health to you?"),
    "PROMO CODE": getCellValue("Who reccomended OT Mens Health to you?") || getCellValue("Who recommended OT Mens Health to you?") || getCellValue("PROMO CODE") || getCellValue("Promo Code") || getCellValue("Influencer Code"),
    "influencer-code": getCellValue("Who reccomended OT Mens Health to you?") || getCellValue("Who recommended OT Mens Health to you?") || getCellValue("Influencer Code") || getCellValue("INFLUENCER CODE"),
    
    // Checkout status
    "Checkout Completed": getCellValue("Checkout Completed") === "true" || 
                          getCellValue("Checkout Completed") === true ||
                          getCellValue("Paid") === "true" ||
                          getCellValue("Paid") === true,
    
    // Consent
    "hipaa-agreement": getCellValue("HIPAA Agreement"),
    "terms-agreement": getCellValue("Terms Agreement"),
};

console.log(`\n🏋️ Overtime Weight Loss Intake`);
console.log(`📋 Record ID: ${record.id}`);
console.log(`📧 Patient: ${payload["first-name"]} ${payload["last-name"]} (${payload["email"]})`);
console.log(`🎯 Goal: ${payload["weight"]}lbs → ${payload["goal-weight"]}lbs`);
if (payload["PROMO CODE"]) {
    console.log(`🏷️ Promo Code: ${payload["PROMO CODE"]}`);
}

// Send to EONPRO
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
        console.log(`   Database ID: ${result.eonproDatabaseId}`);
        console.log(`   Treatment: ${result.treatment?.label || "Weight Loss"}`);
        console.log(`   Patient Status: ${result.patient?.isNew ? "NEW" : "UPDATED"}`);
        
        if (result.affiliate?.tracked) {
            console.log(`   🎉 Affiliate Tracked: ${result.affiliate.code}`);
        }
        
        if (result.soapNote) {
            console.log(`   📄 SOAP Note: #${result.soapNote.id}`);
        }
        
        console.log(`   ⏱️ Processing: ${result.processingTime}`);
        
        // Output for Airtable to store
        output.set("eonproPatientId", result.eonproPatientId || "");
        output.set("eonproDatabaseId", String(result.eonproDatabaseId || ""));
        output.set("success", true);
        
    } else {
        console.error(`\n❌ ERROR: ${result.error || "Unknown error"}`);
        console.error(`   Code: ${result.code}`);
        console.error(`   Request ID: ${result.requestId}`);
        
        output.set("eonproPatientId", "");
        output.set("eonproDatabaseId", "");
        output.set("success", false);
        output.set("error", result.error);
    }
} catch (error) {
    console.error(`\n❌ NETWORK ERROR: ${error.message}`);
    output.set("success", false);
    output.set("error", error.message);
}
