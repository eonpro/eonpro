/**
 * Overtime Men's Clinic Intake Sections Configuration
 * 
 * Maps intake form fields to display sections for the Patient Intake View.
 * Supports all 6 treatment types offered by Overtime Men's Clinic.
 * 
 * This is EXCLUSIVELY for the Overtime Men's Clinic (subdomain: ot).
 */

import { User, Activity, Pill, Heart, Brain, ClipboardList, Shield, Syringe, Zap, TestTube, FlaskConical } from 'lucide-react';
import type { OvertimeTreatmentType } from './types';

/**
 * Base intake sections (common to all treatment types)
 */
const BASE_SECTIONS = [
  {
    title: "Patient Profile",
    icon: User,
    editable: false,
    fields: [
      { id: "patient-name", label: "Full Name" },
      { id: "patient-dob", label: "Date of Birth" },
      { id: "patient-gender", label: "Gender", aliases: ["sex", "biologicalsex", "biological-sex"] },
      { id: "patient-phone", label: "Phone" },
      { id: "patient-email", label: "Email" },
      { id: "patient-address", label: "Address" },
    ],
  },
  {
    title: "Physical Measurements",
    icon: Activity,
    editable: true,
    fields: [
      { 
        id: "weight", 
        label: "Current Weight", 
        aliases: ["currentweight", "current-weight", "startingweight"],
        inputType: "text", 
        placeholder: "e.g., 180 lbs" 
      },
      { 
        id: "height", 
        label: "Height", 
        aliases: ["heightfeet", "heightinches", "feet", "inches"],
        inputType: "text", 
        placeholder: "e.g., 5'10\"" 
      },
      { 
        id: "bmi", 
        label: "BMI", 
        aliases: ["bodymassindex"],
        inputType: "text", 
        placeholder: "e.g., 27.4" 
      },
    ],
  },
  {
    title: "Medical History",
    icon: Heart,
    editable: true,
    fields: [
      { 
        id: "healthConditions", 
        label: "Health Conditions", 
        aliases: ["health-conditions", "medical-conditions", "medicalconditions"],
        inputType: "textarea", 
        placeholder: "List any medical conditions..." 
      },
      { 
        id: "currentMedications", 
        label: "Current Medications", 
        aliases: ["current-medications", "medications"],
        inputType: "textarea", 
        placeholder: "List current medications..." 
      },
      { 
        id: "allergies", 
        label: "Allergies", 
        aliases: ["allergy"],
        inputType: "textarea", 
        placeholder: "List any allergies..." 
      },
    ],
  },
];

/**
 * Weight Loss specific sections
 */
const WEIGHT_LOSS_SECTIONS = [
  {
    title: "Weight Goals",
    icon: Activity,
    editable: true,
    fields: [
      { 
        id: "goalWeight", 
        label: "Goal Weight", 
        aliases: ["goal-weight", "idealweight", "ideal-weight", "target-weight"],
        inputType: "text", 
        placeholder: "e.g., 150 lbs" 
      },
      { 
        id: "weightLossMotivation", 
        label: "Weight Loss Motivation", 
        aliases: ["weight-loss-motivation", "motivation"],
        inputType: "textarea", 
        placeholder: "What motivates you?" 
      },
      { 
        id: "weightLossHistory", 
        label: "Weight Loss History", 
        aliases: ["weight-loss-history", "previous-diets"],
        inputType: "textarea", 
        placeholder: "Previous weight loss attempts..." 
      },
    ],
  },
  {
    title: "GLP-1 Medications",
    icon: Pill,
    editable: true,
    fields: [
      { 
        id: "glp1Experience", 
        label: "GLP-1 Experience", 
        aliases: ["glp1-experience", "previous-glp1"],
        inputType: "select", 
        options: ["Never Used", "Currently Using", "Previously Used"] 
      },
      { 
        id: "glp1Last30", 
        label: "Used GLP-1 in Last 30 Days", 
        aliases: ["glp1-last-30"],
        inputType: "select", 
        options: ["No", "Yes"] 
      },
      { 
        id: "glp1Type", 
        label: "GLP-1 Medication Type", 
        aliases: ["glp1-medication-type", "glp1-type"],
        inputType: "select", 
        options: ["None", "Semaglutide", "Tirzepatide", "Liraglutide", "Other"] 
      },
      { 
        id: "glp1Dose", 
        label: "Current GLP-1 Dose", 
        aliases: ["glp1-dose", "glp1-dosage"],
        inputType: "text", 
        placeholder: "e.g., 0.5mg weekly" 
      },
      { 
        id: "preferredMeds", 
        label: "Preferred Medication", 
        aliases: ["preferred-meds", "medication-preference"],
        inputType: "select", 
        options: ["No Preference", "Semaglutide", "Tirzepatide"] 
      },
      { 
        id: "injectionsTablets", 
        label: "Injection vs Tablet Preference", 
        aliases: ["injections-tablets"],
        inputType: "select", 
        options: ["Injections", "Tablets", "No Preference"] 
      },
    ],
  },
  {
    title: "Contraindications",
    icon: Shield,
    editable: true,
    fields: [
      { 
        id: "men2History", 
        label: "MEN2 History (GLP-1 Contraindication)", 
        aliases: ["men2-history"],
        inputType: "select", 
        options: ["No", "Yes"] 
      },
      { 
        id: "thyroidCancer", 
        label: "Thyroid Cancer History", 
        aliases: ["thyroid-cancer"],
        inputType: "select", 
        options: ["No", "Yes", "Family History"] 
      },
      { 
        id: "pancreatitis", 
        label: "Pancreatitis History", 
        aliases: ["pancreatitis"],
        inputType: "select", 
        options: ["No", "Yes", "History of"] 
      },
      { 
        id: "gastroparesis", 
        label: "Gastroparesis", 
        aliases: ["gastroparesis"],
        inputType: "select", 
        options: ["No", "Yes"] 
      },
      { 
        id: "bariatricSurgery", 
        label: "Previous Bariatric Surgery", 
        aliases: ["bariatric-surgery", "bariatric"],
        inputType: "select", 
        options: ["No", "Yes"] 
      },
    ],
  },
];

/**
 * Peptides specific sections
 */
const PEPTIDES_SECTIONS = [
  {
    title: "Peptide Experience",
    icon: FlaskConical,
    editable: true,
    fields: [
      { 
        id: "peptideExperience", 
        label: "Previous Peptide Experience", 
        aliases: ["peptide-experience"],
        inputType: "select", 
        options: ["None", "Some", "Experienced"] 
      },
      { 
        id: "previousPeptides", 
        label: "Previous Peptides Used", 
        aliases: ["previous-peptides"],
        inputType: "textarea", 
        placeholder: "List peptides you've used..." 
      },
      { 
        id: "currentPeptides", 
        label: "Current Peptides", 
        aliases: ["current-peptides"],
        inputType: "textarea", 
        placeholder: "Currently using..." 
      },
    ],
  },
  {
    title: "Treatment Goals",
    icon: Activity,
    editable: true,
    fields: [
      { 
        id: "peptideGoals", 
        label: "Peptide Treatment Goals", 
        aliases: ["peptide-goals"],
        inputType: "textarea", 
        placeholder: "What are your goals?" 
      },
      { 
        id: "primaryGoal", 
        label: "Primary Goal", 
        aliases: ["primary-goal"],
        inputType: "select", 
        options: ["Performance", "Recovery", "Anti-Aging", "Weight Loss", "Muscle Building", "Other"] 
      },
    ],
  },
  {
    title: "Preferences",
    icon: ClipboardList,
    editable: true,
    fields: [
      { 
        id: "injectionComfort", 
        label: "Injection Comfort Level", 
        aliases: ["injection-comfort"],
        inputType: "select", 
        options: ["Very Comfortable", "Somewhat Comfortable", "Nervous", "Never Done Before"] 
      },
      { 
        id: "preferredPeptide", 
        label: "Preferred Peptide", 
        aliases: ["preferred-peptide"],
        inputType: "text", 
        placeholder: "e.g., BPC-157, CJC-1295..." 
      },
    ],
  },
];

/**
 * NAD+ specific sections
 */
const NAD_PLUS_SECTIONS = [
  {
    title: "NAD+ Experience",
    icon: Zap,
    editable: true,
    fields: [
      { 
        id: "nadExperience", 
        label: "Previous NAD+ Experience", 
        aliases: ["nad-experience"],
        inputType: "select", 
        options: ["None", "Oral Supplements", "IV Therapy", "Both"] 
      },
      { 
        id: "ivExperience", 
        label: "IV Therapy Experience", 
        aliases: ["iv-experience"],
        inputType: "select", 
        options: ["None", "Some", "Experienced"] 
      },
    ],
  },
  {
    title: "Treatment Goals",
    icon: Brain,
    editable: true,
    fields: [
      { 
        id: "energyLevel", 
        label: "Current Energy Level", 
        aliases: ["energy-level"],
        inputType: "select", 
        options: ["Very Low", "Low", "Moderate", "Good", "High"] 
      },
      { 
        id: "cognitiveGoals", 
        label: "Cognitive Enhancement Goals", 
        aliases: ["cognitive-goals"],
        inputType: "textarea", 
        placeholder: "Mental clarity, focus, memory..." 
      },
      { 
        id: "recoveryGoals", 
        label: "Recovery Goals", 
        aliases: ["recovery-goals"],
        inputType: "textarea", 
        placeholder: "Athletic recovery, illness recovery..." 
      },
      { 
        id: "antiAgingGoals", 
        label: "Anti-Aging Goals", 
        aliases: ["anti-aging-goals"],
        inputType: "textarea", 
        placeholder: "Longevity, cellular health..." 
      },
    ],
  },
  {
    title: "Health Assessment",
    icon: Heart,
    editable: true,
    fields: [
      { 
        id: "chronicFatigue", 
        label: "Chronic Fatigue", 
        aliases: ["chronic-fatigue"],
        inputType: "select", 
        options: ["No", "Mild", "Moderate", "Severe"] 
      },
      { 
        id: "brainFog", 
        label: "Brain Fog", 
        aliases: ["brain-fog"],
        inputType: "select", 
        options: ["No", "Occasional", "Frequent", "Constant"] 
      },
      { 
        id: "sleepQuality", 
        label: "Sleep Quality", 
        aliases: ["sleep-quality"],
        inputType: "select", 
        options: ["Poor", "Fair", "Good", "Excellent"] 
      },
    ],
  },
];

/**
 * Better Sex (ED/Sexual Health) specific sections
 */
const BETTER_SEX_SECTIONS = [
  {
    title: "ED History",
    icon: Heart,
    editable: true,
    fields: [
      { 
        id: "edHistory", 
        label: "ED History", 
        aliases: ["ed-history"],
        inputType: "select", 
        options: ["No ED", "Occasional", "Frequent", "Consistent"] 
      },
      { 
        id: "edDuration", 
        label: "Duration of ED", 
        aliases: ["ed-duration"],
        inputType: "select", 
        options: ["N/A", "Less than 6 months", "6-12 months", "1-2 years", "2+ years"] 
      },
      { 
        id: "edSeverity", 
        label: "ED Severity", 
        aliases: ["ed-severity"],
        inputType: "select", 
        options: ["N/A", "Mild", "Moderate", "Severe"] 
      },
      { 
        id: "edOnset", 
        label: "ED Onset", 
        aliases: ["ed-onset"],
        inputType: "select", 
        options: ["Gradual", "Sudden", "Situational"] 
      },
    ],
  },
  {
    title: "Current Status",
    icon: Activity,
    editable: true,
    fields: [
      { 
        id: "libidoLevel", 
        label: "Libido Level", 
        aliases: ["libido-level"],
        inputType: "select", 
        options: ["Very Low", "Low", "Moderate", "Normal", "High"] 
      },
      { 
        id: "performanceAnxiety", 
        label: "Performance Anxiety", 
        aliases: ["performance-anxiety"],
        inputType: "select", 
        options: ["No", "Occasional", "Frequent", "Significant"] 
      },
      { 
        id: "relationshipStatus", 
        label: "Relationship Status", 
        aliases: ["relationship-status"],
        inputType: "select", 
        options: ["Single", "In a Relationship", "Married", "Prefer not to say"] 
      },
    ],
  },
  {
    title: "Previous Treatments",
    icon: Pill,
    editable: true,
    fields: [
      { 
        id: "previousEdMeds", 
        label: "Previous ED Medications", 
        aliases: ["previous-ed-meds"],
        inputType: "textarea", 
        placeholder: "List medications tried..." 
      },
      { 
        id: "viagraExperience", 
        label: "Viagra/Sildenafil Experience", 
        aliases: ["viagra-experience"],
        inputType: "select", 
        options: ["Never Used", "Used - Effective", "Used - Partially Effective", "Used - Not Effective"] 
      },
      { 
        id: "cialisExperience", 
        label: "Cialis/Tadalafil Experience", 
        aliases: ["cialis-experience"],
        inputType: "select", 
        options: ["Never Used", "Used - Effective", "Used - Partially Effective", "Used - Not Effective"] 
      },
    ],
  },
  {
    title: "Health Factors",
    icon: Shield,
    editable: true,
    fields: [
      { 
        id: "cardiovascularHealth", 
        label: "Cardiovascular Health", 
        aliases: ["cardiovascular-health"],
        inputType: "select", 
        options: ["Excellent", "Good", "Fair", "Poor", "Heart Condition"] 
      },
      { 
        id: "bloodPressure", 
        label: "Blood Pressure", 
        aliases: ["blood-pressure"],
        inputType: "select", 
        options: ["Normal", "Controlled High", "Uncontrolled High", "Low"] 
      },
      { 
        id: "nitrateUse", 
        label: "Nitrate Use (Contraindication)", 
        aliases: ["nitrate-use"],
        inputType: "select", 
        options: ["No", "Yes - Cannot Use PDE5 Inhibitors"] 
      },
    ],
  },
];

/**
 * Testosterone Replacement specific sections
 */
const TESTOSTERONE_SECTIONS = [
  {
    title: "Symptoms Assessment",
    icon: Activity,
    editable: true,
    fields: [
      { 
        id: "trtSymptoms", 
        label: "TRT Symptoms Checklist", 
        aliases: ["trt-symptoms"],
        inputType: "textarea", 
        placeholder: "List your symptoms..." 
      },
      { 
        id: "fatigueLevel", 
        label: "Fatigue Level", 
        aliases: ["fatigue-level"],
        inputType: "select", 
        options: ["None", "Mild", "Moderate", "Severe"] 
      },
      { 
        id: "muscleLoss", 
        label: "Muscle Loss", 
        aliases: ["muscle-loss"],
        inputType: "select", 
        options: ["None", "Some", "Significant"] 
      },
      { 
        id: "libidoChanges", 
        label: "Libido Changes", 
        aliases: ["libido-changes"],
        inputType: "select", 
        options: ["Normal", "Decreased", "Significantly Decreased"] 
      },
      { 
        id: "moodChanges", 
        label: "Mood Changes", 
        aliases: ["mood-changes"],
        inputType: "select", 
        options: ["None", "Irritability", "Depression", "Anxiety", "Multiple"] 
      },
    ],
  },
  {
    title: "TRT History",
    icon: Syringe,
    editable: true,
    fields: [
      { 
        id: "previousTrt", 
        label: "Previous TRT Experience", 
        aliases: ["previous-trt"],
        inputType: "select", 
        options: ["None", "Previously on TRT", "Currently on TRT"] 
      },
      { 
        id: "trtType", 
        label: "TRT Type", 
        aliases: ["trt-type"],
        inputType: "select", 
        options: ["N/A", "Injections", "Gel/Cream", "Pellets", "Patches"] 
      },
      { 
        id: "injectionFrequency", 
        label: "Injection Frequency", 
        aliases: ["injection-frequency"],
        inputType: "select", 
        options: ["N/A", "Weekly", "Twice Weekly", "Every 2 Weeks", "Other"] 
      },
      { 
        id: "trtDuration", 
        label: "Duration on TRT", 
        aliases: ["trt-duration"],
        inputType: "text", 
        placeholder: "e.g., 6 months, 2 years" 
      },
    ],
  },
  {
    title: "Lab Results",
    icon: TestTube,
    editable: true,
    fields: [
      { 
        id: "totalTestosterone", 
        label: "Total Testosterone", 
        aliases: ["total-testosterone", "recent-testosterone-level"],
        inputType: "text", 
        placeholder: "e.g., 350 ng/dL" 
      },
      { 
        id: "freeTestosterone", 
        label: "Free Testosterone", 
        aliases: ["free-testosterone"],
        inputType: "text", 
        placeholder: "e.g., 8.5 pg/mL" 
      },
      { 
        id: "estradiolLevel", 
        label: "Estradiol (E2)", 
        aliases: ["estradiol-level"],
        inputType: "text", 
        placeholder: "e.g., 25 pg/mL" 
      },
      { 
        id: "psaLevel", 
        label: "PSA Level", 
        aliases: ["psa-level"],
        inputType: "text", 
        placeholder: "e.g., 1.2 ng/mL" 
      },
      { 
        id: "hematocrit", 
        label: "Hematocrit", 
        aliases: ["hematocrit"],
        inputType: "text", 
        placeholder: "e.g., 45%" 
      },
    ],
  },
  {
    title: "Contraindications",
    icon: Shield,
    editable: true,
    fields: [
      { 
        id: "prostateHistory", 
        label: "Prostate History", 
        aliases: ["prostate-history"],
        inputType: "select", 
        options: ["None", "BPH", "Prostate Cancer", "Elevated PSA"] 
      },
      { 
        id: "heartDisease", 
        label: "Heart Disease", 
        aliases: ["heart-disease"],
        inputType: "select", 
        options: ["No", "Yes"] 
      },
      { 
        id: "bloodClotHistory", 
        label: "Blood Clot History", 
        aliases: ["blood-clot-history"],
        inputType: "select", 
        options: ["No", "Yes"] 
      },
      { 
        id: "sleepApnea", 
        label: "Sleep Apnea", 
        aliases: ["sleep-apnea"],
        inputType: "select", 
        options: ["No", "Yes - Treated", "Yes - Untreated"] 
      },
      { 
        id: "fertilityConcerns", 
        label: "Fertility Concerns", 
        aliases: ["fertility-concerns"],
        inputType: "select", 
        options: ["No", "Yes - Want to preserve fertility"] 
      },
    ],
  },
];

/**
 * Baseline/Bloodwork specific sections
 */
const BASELINE_BLOODWORK_SECTIONS = [
  {
    title: "Lab Preferences",
    icon: TestTube,
    editable: true,
    fields: [
      { 
        id: "labLocation", 
        label: "Preferred Lab Location", 
        aliases: ["lab-location"],
        inputType: "text", 
        placeholder: "e.g., Quest, LabCorp, nearby location" 
      },
      { 
        id: "preferredLab", 
        label: "Preferred Lab Company", 
        aliases: ["preferred-lab"],
        inputType: "select", 
        options: ["No Preference", "Quest Diagnostics", "LabCorp", "Other"] 
      },
      { 
        id: "fastingAvailable", 
        label: "Fasting Available", 
        aliases: ["fasting-available"],
        inputType: "select", 
        options: ["Yes", "No", "Can fast for specific tests"] 
      },
      { 
        id: "mobilePhlebotomy", 
        label: "Mobile Phlebotomy Interest", 
        aliases: ["mobile-phlebotomy"],
        inputType: "select", 
        options: ["No", "Yes - interested", "Yes - required"] 
      },
    ],
  },
  {
    title: "Health Assessment",
    icon: ClipboardList,
    editable: true,
    fields: [
      { 
        id: "reasonForLabs", 
        label: "Reason for Labs", 
        aliases: ["reason-for-labs"],
        inputType: "textarea", 
        placeholder: "Why are you getting labs?" 
      },
      { 
        id: "symptoms", 
        label: "Current Symptoms", 
        aliases: ["symptoms"],
        inputType: "textarea", 
        placeholder: "List any symptoms..." 
      },
      { 
        id: "treatmentInterest", 
        label: "Treatment Interest", 
        aliases: ["treatment-interest"],
        inputType: "textarea", 
        placeholder: "What treatments are you interested in?" 
      },
    ],
  },
  {
    title: "Previous Labs",
    icon: Activity,
    editable: true,
    fields: [
      { 
        id: "hasRecentLabs", 
        label: "Has Recent Labs", 
        aliases: ["has-recent-labs"],
        inputType: "select", 
        options: ["No", "Yes - within 6 months", "Yes - over 6 months ago"] 
      },
      { 
        id: "lastLabDate", 
        label: "Last Lab Date", 
        aliases: ["last-lab-date"],
        inputType: "text", 
        placeholder: "e.g., January 2026" 
      },
    ],
  },
];

/**
 * Referral & Promo Code section (common to all)
 */
const REFERRAL_SECTION = {
  title: "Referral & Promo Code",
  icon: ClipboardList,
  editable: true,
  fields: [
    { 
      id: "promoCode", 
      label: "Promo Code", 
      aliases: ["promo-code", "promocode", "PROMO CODE"],
      inputType: "text", 
      placeholder: "Enter promo code if you have one" 
    },
    { 
      id: "influencerCode", 
      label: "Influencer Code", 
      aliases: ["influencer-code", "influencercode", "INFLUENCER CODE"],
      inputType: "text", 
      placeholder: "Enter influencer code if you have one" 
    },
    { 
      id: "referralSource", 
      label: "How Did You Hear About Us?", 
      aliases: ["referral-source", "referralsource", "howdidyouhearaboutus"],
      inputType: "text", 
      placeholder: "e.g., Google, Instagram, Friend" 
    },
  ],
};

/**
 * Consent section (common to all)
 */
const CONSENT_SECTION = {
  title: "Consent & Checkout",
  icon: Shield,
  editable: false,
  fields: [
    { 
      id: "hipaaAgreement", 
      label: "HIPAA Agreement", 
      aliases: ["hipaa-agreement", "hipaaagree"],
      inputType: "text" 
    },
    { 
      id: "termsAgreement", 
      label: "Terms Agreement", 
      aliases: ["terms-agreement", "termsagree"],
      inputType: "text" 
    },
    { 
      id: "checkoutCompleted", 
      label: "Checkout Completed", 
      aliases: ["Checkout Completed", "checkout-completed", "paid"],
      inputType: "text" 
    },
    { 
      id: "consentTimestamp", 
      label: "Consent Timestamp", 
      aliases: ["consenttimestamp", "submittedAt"],
      inputType: "text" 
    },
  ],
};

/**
 * Get intake sections for Overtime clinic based on treatment type
 */
export function getOvertimeIntakeSections(treatmentType?: OvertimeTreatmentType | null) {
  // Start with base sections
  const sections = [...BASE_SECTIONS];

  // Add treatment-specific sections
  switch (treatmentType) {
    case 'weight_loss':
      sections.push(...WEIGHT_LOSS_SECTIONS);
      break;
    case 'peptides':
      sections.push(...PEPTIDES_SECTIONS);
      break;
    case 'nad_plus':
      sections.push(...NAD_PLUS_SECTIONS);
      break;
    case 'better_sex':
      sections.push(...BETTER_SEX_SECTIONS);
      break;
    case 'testosterone':
      sections.push(...TESTOSTERONE_SECTIONS);
      break;
    case 'baseline_bloodwork':
      sections.push(...BASELINE_BLOODWORK_SECTIONS);
      break;
    default:
      // If no treatment type, include all treatment sections
      // This ensures no fields appear in "Additional Responses"
      sections.push(...WEIGHT_LOSS_SECTIONS);
      sections.push(...PEPTIDES_SECTIONS);
      sections.push(...NAD_PLUS_SECTIONS);
      sections.push(...BETTER_SEX_SECTIONS);
      sections.push(...TESTOSTERONE_SECTIONS);
      sections.push(...BASELINE_BLOODWORK_SECTIONS);
  }

  // Always add referral and consent sections at the end
  sections.push(REFERRAL_SECTION);
  sections.push(CONSENT_SECTION);

  return sections;
}

/**
 * Full Overtime intake sections (includes all treatment types)
 * Used when treatment type is unknown
 */
export const OVERTIME_INTAKE_SECTIONS = getOvertimeIntakeSections(null);

/**
 * Check if clinic should use Overtime intake sections
 */
export function hasOvertimeIntakeSections(clinicSubdomain?: string | null): boolean {
  return clinicSubdomain?.toLowerCase() === 'ot';
}

/**
 * Get intake sections for a specific clinic
 */
export function getIntakeSectionsForOvertimeClinic(
  clinicSubdomain?: string | null,
  treatmentType?: OvertimeTreatmentType | null
): typeof OVERTIME_INTAKE_SECTIONS | null {
  if (hasOvertimeIntakeSections(clinicSubdomain)) {
    return getOvertimeIntakeSections(treatmentType);
  }
  return null;
}
