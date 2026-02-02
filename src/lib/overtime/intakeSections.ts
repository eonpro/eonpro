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
 * Updated for OT Mens - Weight Loss Airtable table
 * Heyflow ID: uvvNo2JSHPctHpG87s0x
 */
const WEIGHT_LOSS_SECTIONS = [
  {
    title: "Weight Goals",
    icon: Activity,
    editable: true,
    fields: [
      {
        id: "idealWeight",
        label: "Ideal Weight",
        aliases: ["goal-weight", "idealweight", "ideal-weight", "target-weight", "ideal weight"],
        inputType: "text",
        placeholder: "e.g., 150 lbs"
      },
      {
        id: "startingWeight",
        label: "Starting Weight",
        aliases: ["starting-weight", "startingweight", "starting weight", "current-weight"],
        inputType: "text",
        placeholder: "e.g., 220 lbs"
      },
      {
        id: "weightLossMotivation",
        label: "Weight Loss Motivation",
        aliases: ["weight-loss-motivation", "motivation", "How would your life change by losing weight"],
        inputType: "textarea",
        placeholder: "What motivates you?"
      },
    ],
  },
  {
    title: "GLP-1 History",
    icon: Pill,
    editable: true,
    fields: [
      {
        id: "glp1History",
        label: "GLP-1 History",
        aliases: ["glp1-experience", "previous-glp1", "GLP-1 History"],
        inputType: "select",
        options: ["Never Used", "Currently Using", "Previously Used"]
      },
      {
        id: "typeOfGlp1",
        label: "Type of GLP-1",
        aliases: ["glp1-medication-type", "glp1-type", "Type of GLP-1"],
        inputType: "select",
        options: ["None", "Semaglutide", "Tirzepatide", "Liraglutide", "Other"]
      },
      {
        id: "happyWithGlp1Dose",
        label: "Happy with GLP-1 Dose",
        aliases: ["Happy with GLP-1 Dose", "glp1-satisfaction"],
        inputType: "select",
        options: ["Yes", "No", "N/A"]
      },
      {
        id: "sideEffectHistory",
        label: "Side Effect History",
        aliases: ["Side Effect History", "side-effect-history"],
        inputType: "textarea",
        placeholder: "Any side effects experienced..."
      },
    ],
  },
  {
    title: "Semaglutide Experience",
    icon: Syringe,
    editable: true,
    fields: [
      {
        id: "semaglutideDose",
        label: "Semaglutide Dose",
        aliases: ["Semaglutide Dose", "semaglutide-dose"],
        inputType: "text",
        placeholder: "e.g., 0.5mg weekly"
      },
      {
        id: "semaglutideSideEffects",
        label: "Semaglutide Side Effects",
        aliases: ["Semaglutide Side Effects", "semaglutide-side-effects"],
        inputType: "textarea",
        placeholder: "Any side effects..."
      },
      {
        id: "semaglutideSuccess",
        label: "Semaglutide Success",
        aliases: ["Semaglutide Success", "semaglutide-success"],
        inputType: "select",
        options: ["Very Effective", "Somewhat Effective", "Not Effective", "N/A"]
      },
    ],
  },
  {
    title: "Tirzepatide Experience",
    icon: Syringe,
    editable: true,
    fields: [
      {
        id: "tirzepatideDose",
        label: "Tirzepatide Dose",
        aliases: ["Tirzepatide Dose", "tirzepatide-dose"],
        inputType: "text",
        placeholder: "e.g., 2.5mg weekly"
      },
      {
        id: "tirzepatideSideEffects",
        label: "Tirzepatide Side Effects",
        aliases: ["Tirzepatide Side Effects", "tirzepatide-side-effects"],
        inputType: "textarea",
        placeholder: "Any side effects..."
      },
      {
        id: "tirzepatideSuccess",
        label: "Tirzepatide Success",
        aliases: ["Tirzepatide Success", "tirzepatide-success"],
        inputType: "select",
        options: ["Very Effective", "Somewhat Effective", "Not Effective", "N/A"]
      },
    ],
  },
  {
    title: "Treatment Preferences",
    icon: ClipboardList,
    editable: true,
    fields: [
      {
        id: "personalizedTreatment",
        label: "Personalized Treatment",
        aliases: ["Personalized Treatment", "personalized-treatment", "preferred-meds"],
        inputType: "textarea",
        placeholder: "Treatment preferences..."
      },
      {
        id: "qualifyingConditions",
        label: "Qualifying Conditions",
        aliases: ["Qualifying Conditions", "qualifying-conditions"],
        inputType: "textarea",
        placeholder: "Conditions qualifying for treatment..."
      },
    ],
  },
  {
    title: "Contraindications",
    icon: Shield,
    editable: true,
    fields: [
      {
        id: "thyroidCancer",
        label: "Thyroid Cancer History",
        aliases: ["thyroid-cancer", "Thyroid Cancer"],
        inputType: "select",
        options: ["No", "Yes", "Family History"]
      },
      {
        id: "men2History",
        label: "MEN2 History (GLP-1 Contraindication)",
        aliases: ["men2-history", "Neoplasia type 2 (MEN 2)"],
        inputType: "select",
        options: ["No", "Yes"]
      },
      {
        id: "pancreatitis",
        label: "Pancreatitis History",
        aliases: ["pancreatitis", "Pancreatitis"],
        inputType: "select",
        options: ["No", "Yes", "History of"]
      },
      {
        id: "gastroparesis",
        label: "Gastroparesis",
        aliases: ["gastroparesis", "Gastroparesis"],
        inputType: "select",
        options: ["No", "Yes"]
      },
      {
        id: "pregnantOrBreastfeeding",
        label: "Pregnant or Breastfeeding",
        aliases: ["Pregnant or Breastfeeding", "pregnant-breastfeeding"],
        inputType: "select",
        options: ["No", "Yes"]
      },
      {
        id: "type2Diabetes",
        label: "Type 2 Diabetes",
        aliases: ["Type 2 Diabetes", "type2-diabetes", "diabetes"],
        inputType: "select",
        options: ["No", "Yes", "Pre-diabetic"]
      },
    ],
  },
  {
    title: "Chronic Conditions & Surgery",
    icon: Heart,
    editable: true,
    fields: [
      {
        id: "chronicIllness",
        label: "Chronic Illness",
        aliases: ["Chronic Illness", "chronic-illness"],
        inputType: "select",
        options: ["No", "Yes"]
      },
      {
        id: "specificChronicIllness",
        label: "Specific Chronic Illness",
        aliases: ["Specific Chronic Illness", "specific-chronic-illness"],
        inputType: "textarea",
        placeholder: "List specific conditions..."
      },
      {
        id: "typeOfChronicIllness",
        label: "Type of Chronic Illness",
        aliases: ["Type of Chronic Illness", "type-of-chronic-illness"],
        inputType: "text",
        placeholder: "Type of illness..."
      },
      {
        id: "familyHistoryDiagnoses",
        label: "Family History Diagnoses",
        aliases: ["Family History Diagnoses", "family-history"],
        inputType: "textarea",
        placeholder: "Family medical history..."
      },
      {
        id: "pastSurgery",
        label: "Past Surgery",
        aliases: ["Past surgery", "past-surgery"],
        inputType: "select",
        options: ["No", "Yes"]
      },
      {
        id: "surgeryType",
        label: "Surgery Type",
        aliases: ["Surgery Type", "surgery-type"],
        inputType: "textarea",
        placeholder: "Type of surgery..."
      },
    ],
  },
  {
    title: "Mental Health",
    icon: Brain,
    editable: true,
    fields: [
      {
        id: "mentalHealth",
        label: "Mental Health History",
        aliases: ["Mental Health", "mental-health"],
        inputType: "select",
        options: ["No Concerns", "Yes - Managed", "Yes - Unmanaged"]
      },
      {
        id: "mentalHealthDiagnosis",
        label: "Mental Health Diagnosis",
        aliases: ["Mental health Diagnosis", "mental-health-diagnosis"],
        inputType: "textarea",
        placeholder: "Any diagnoses..."
      },
    ],
  },
  {
    title: "Medications & Lifestyle",
    icon: Pill,
    editable: true,
    fields: [
      {
        id: "medicationsSupplements",
        label: "Medications / Supplements",
        aliases: ["Medications / Supplements", "medications-supplements", "current-medications"],
        inputType: "textarea",
        placeholder: "List current medications..."
      },
      {
        id: "whichMedication",
        label: "Which Medication / Supplement",
        aliases: ["Which Medication /Supplement", "which-medication"],
        inputType: "textarea",
        placeholder: "Specific medications..."
      },
      {
        id: "alcoholUse",
        label: "Alcohol Use",
        aliases: ["Alcohol Use", "alcohol-use"],
        inputType: "select",
        options: ["None", "Occasional", "Regular", "Heavy"]
      },
      {
        id: "activityLevel",
        label: "Activity Level",
        aliases: ["Activity Level", "activity-level"],
        inputType: "select",
        options: ["Sedentary", "Light", "Moderate", "Active", "Very Active"]
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
 * Updated for OT Mens - Better Sex Airtable table
 * Heyflow ID: 5ypJkFxQN4V4U4PB7R4u
 */
const BETTER_SEX_SECTIONS = [
  {
    title: "Symptoms & Duration",
    icon: Heart,
    editable: true,
    fields: [
      {
        id: "symptoms",
        label: "Current Symptoms",
        aliases: ["Symptoms", "symptoms", "ed-history"],
        inputType: "textarea",
        placeholder: "Describe symptoms..."
      },
      {
        id: "howLongNotice",
        label: "Symptom Duration",
        aliases: ["How long have you notice", "ed-duration"],
        inputType: "text",
        placeholder: "How long have you noticed symptoms?"
      },
      {
        id: "symptomFrequency",
        label: "Symptom Frequency",
        aliases: ["How often do these sexual issues occur?", "ed-severity"],
        inputType: "select",
        options: ["Rarely", "Sometimes", "Often", "Always"]
      },
    ],
  },
  {
    title: "Treatment Goals",
    icon: Activity,
    editable: true,
    fields: [
      {
        id: "goals",
        label: "Treatment Goals",
        aliases: ["goals", "treatment-goals"],
        inputType: "textarea",
        placeholder: "What are your goals?"
      },
    ],
  },
  {
    title: "Physical Activity & Lifestyle",
    icon: Activity,
    editable: true,
    fields: [
      {
        id: "physicalActive",
        label: "Physical Activity Level",
        aliases: ["Physical Active", "physical-activity"],
        inputType: "select",
        options: ["Sedentary", "Light", "Moderate", "Active", "Very Active"]
      },
      {
        id: "smokeNicotine",
        label: "Smoking/Nicotine Use",
        aliases: ["Smoke/Nicotine", "smoking-status"],
        inputType: "select",
        options: ["Never", "Former", "Current - Occasional", "Current - Regular"]
      },
    ],
  },
  {
    title: "Cardiovascular Health",
    icon: Shield,
    editable: true,
    fields: [
      {
        id: "heartCondition",
        label: "Heart Condition",
        aliases: ["Heart condition", "heart-condition", "cardiovascular-health"],
        inputType: "select",
        options: ["No", "Yes - Managed", "Yes - Unmanaged"]
      },
      {
        id: "chestPains",
        label: "Chest Pain History",
        aliases: ["Chest Pains", "chest-pains"],
        inputType: "select",
        options: ["No", "Yes - Past", "Yes - Current"]
      },
      {
        id: "nitratesMeds",
        label: "Nitrate Medications (Contraindication)",
        aliases: ["meds with nitrates or nitroglycerin", "nitrate-use"],
        inputType: "select",
        options: ["No", "Yes - Cannot Use PDE5 Inhibitors"]
      },
    ],
  },
  {
    title: "Chronic Conditions",
    icon: Heart,
    editable: true,
    fields: [
      {
        id: "chronicDisease",
        label: "Chronic Disease",
        aliases: ["Chronic Disease", "chronic-disease"],
        inputType: "select",
        options: ["No", "Yes"]
      },
      {
        id: "chronicIllnesses",
        label: "Chronic Illnesses",
        aliases: ["Chronic Illnesses", "chronic-illnesses"],
        inputType: "textarea",
        placeholder: "List chronic illnesses..."
      },
      {
        id: "specificConditions",
        label: "Specific Medical Conditions",
        aliases: ["Specific Conditions", "specific-conditions"],
        inputType: "textarea",
        placeholder: "List specific conditions..."
      },
      {
        id: "cancer",
        label: "Cancer History",
        aliases: ["Cancer", "cancer-history"],
        inputType: "select",
        options: ["No", "Yes - Past", "Yes - Current"]
      },
    ],
  },
  {
    title: "Medications",
    icon: Pill,
    editable: true,
    fields: [
      {
        id: "medications",
        label: "Current Medications",
        aliases: ["Medications", "current-medications"],
        inputType: "textarea",
        placeholder: "List current medications..."
      },
      {
        id: "listOfMedications",
        label: "Medication List",
        aliases: ["List of Medications", "medication-list"],
        inputType: "textarea",
        placeholder: "Detailed medication list..."
      },
    ],
  },
  {
    title: "Lab Work",
    icon: TestTube,
    editable: true,
    fields: [
      {
        id: "labwork",
        label: "Recent Lab Work",
        aliases: ["Labwork", "recent-labwork"],
        inputType: "select",
        options: ["No Recent Labs", "Within 6 months", "Over 6 months ago"]
      },
    ],
  },
  {
    title: "Allergies",
    icon: Shield,
    editable: true,
    fields: [
      {
        id: "whichAllergies",
        label: "Allergy Details",
        aliases: ["Which allergies", "allergy-details"],
        inputType: "textarea",
        placeholder: "List allergies..."
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
      id: "affiliateCode",
      label: "Affiliate Code",
      aliases: [
        "affiliate-code", "affiliatecode", "AFFILIATE CODE",
        "Who Recommended Us?", "whorecommendedus", "who-recommended-us",
        "Who reccomended OT Mens Health to you?", // Typo in Airtable
        "Who recommended OT Mens Health to you?",
        "partner-code", "partnercode", "PARTNER CODE"
      ],
      inputType: "text",
      placeholder: "Affiliate or partner code"
    },
    {
      id: "referralSource",
      label: "How Did You Hear About Us?",
      aliases: ["referral-source", "referralsource", "howdidyouhearaboutus", "How did you hear..."],
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
