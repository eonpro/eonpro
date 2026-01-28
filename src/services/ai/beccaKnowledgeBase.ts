/**
 * Becca AI Knowledge Base
 *
 * Comprehensive clinical and operational knowledge for the Becca AI assistant.
 * This knowledge base enables Becca to answer questions about:
 * - GLP-1 medications (semaglutide, tirzepatide)
 * - Dosing protocols and titration schedules
 * - Drug interactions and contraindications
 * - Prescription SIG templates
 * - SOAP note guidance
 * - Platform features and pricing
 */

// ============================================================================
// QUERY CATEGORY TYPE (defined first for use throughout the file)
// ============================================================================

export type QueryCategory =
  | 'patient_data'
  | 'medication_info'
  | 'dosing_protocol'
  | 'side_effects'
  | 'drug_interactions'
  | 'sig_help'
  | 'soap_note_help'
  | 'clinical_decision'
  | 'platform_operations'
  | 'general';

// ============================================================================
// MEDICAL DISCLAIMER
// ============================================================================

export const MEDICAL_DISCLAIMER = `
---
*For educational and informational purposes only. This is not medical advice. Always consult with a qualified healthcare provider for patient-specific decisions.*`;

/**
 * Query categories that require a medical disclaimer
 */
export const MEDICAL_QUERY_CATEGORIES: QueryCategory[] = [
  'medication_info',
  'dosing_protocol',
  'side_effects',
  'drug_interactions',
  'clinical_decision',
  'sig_help',
  'soap_note_help',
];

/**
 * Check if a query category requires a medical disclaimer
 */
export function requiresMedicalDisclaimer(category: QueryCategory): boolean {
  return MEDICAL_QUERY_CATEGORIES.includes(category);
}

// ============================================================================
// GLP-1 MEDICATION KNOWLEDGE
// ============================================================================

export const GLP1_MEDICATIONS = {
  semaglutide: {
    brandNames: ['Ozempic', 'Wegovy', 'Rybelsus'],
    class: 'GLP-1 Receptor Agonist',
    mechanism: 'Mimics glucagon-like peptide-1 (GLP-1) to stimulate insulin secretion, suppress glucagon, slow gastric emptying, and promote satiety.',
    indications: [
      'Type 2 diabetes mellitus',
      'Chronic weight management (BMI ≥30 or ≥27 with comorbidities)',
    ],
    forms: {
      injectable: {
        strengths: ['0.25 mg', '0.5 mg', '1 mg', '1.7 mg', '2.4 mg'],
        route: 'Subcutaneous injection',
        frequency: 'Once weekly',
      },
      oral: {
        strengths: ['3 mg', '7 mg', '14 mg'],
        route: 'Oral',
        frequency: 'Once daily',
        instructions: 'Take on empty stomach with ≤4 oz water, 30 min before food/drink',
      },
    },
    titrationProtocol: [
      { weeks: '1-4', dose: '0.25 mg', notes: 'Initiation dose to minimize GI side effects' },
      { weeks: '5-8', dose: '0.5 mg', notes: 'First therapeutic dose' },
      { weeks: '9-12', dose: '1.0 mg', notes: 'Standard maintenance for diabetes' },
      { weeks: '13-16', dose: '1.7 mg', notes: 'Optional escalation for weight loss' },
      { weeks: '17+', dose: '2.4 mg', notes: 'Maximum dose for weight management' },
    ],
    sideEffects: {
      common: [
        'Nausea (16-44%)',
        'Vomiting (5-24%)',
        'Diarrhea (8-30%)',
        'Constipation (3-24%)',
        'Abdominal pain (6-20%)',
        'Injection site reactions',
        'Fatigue',
        'Dyspepsia',
      ],
      serious: [
        'Pancreatitis (discontinue immediately)',
        'Gallbladder disease/cholecystitis',
        'Acute kidney injury (due to dehydration from GI symptoms)',
        'Diabetic retinopathy complications',
        'Hypoglycemia (when combined with insulin/sulfonylureas)',
      ],
    },
    contraindications: {
      absolute: [
        'Personal/family history of medullary thyroid carcinoma (MTC)',
        'Multiple Endocrine Neoplasia syndrome type 2 (MEN 2)',
        'Known hypersensitivity to semaglutide',
      ],
      relative: [
        'History of pancreatitis',
        'Severe gastroparesis',
        'End-stage renal disease (eGFR <15)',
        'Pregnancy/breastfeeding',
      ],
    },
    drugInteractions: [
      { drug: 'Insulin', severity: 'Moderate', effect: 'Increased hypoglycemia risk - consider reducing insulin dose by 20%' },
      { drug: 'Sulfonylureas', severity: 'Moderate', effect: 'Increased hypoglycemia risk - may need dose reduction' },
      { drug: 'Oral medications', severity: 'Mild', effect: 'Delayed gastric emptying may affect absorption' },
      { drug: 'Warfarin', severity: 'Moderate', effect: 'Monitor INR more frequently' },
    ],
    monitoring: [
      'HbA1c every 3 months initially, then every 6 months',
      'Fasting glucose',
      'Weight and BMI at each visit',
      'Signs/symptoms of pancreatitis',
      'Renal function if GI symptoms cause dehydration',
      'Thyroid nodules (palpate at each visit)',
    ],
  },

  tirzepatide: {
    brandNames: ['Mounjaro', 'Zepbound'],
    class: 'Dual GIP/GLP-1 Receptor Agonist',
    mechanism: 'Activates both GIP and GLP-1 receptors, providing enhanced glycemic control and greater weight loss than GLP-1 alone.',
    indications: [
      'Type 2 diabetes mellitus',
      'Chronic weight management (BMI ≥30 or ≥27 with comorbidities)',
    ],
    forms: {
      injectable: {
        strengths: ['2.5 mg', '5 mg', '7.5 mg', '10 mg', '12.5 mg', '15 mg'],
        route: 'Subcutaneous injection',
        frequency: 'Once weekly',
      },
    },
    titrationProtocol: [
      { weeks: '1-4', dose: '2.5 mg', notes: 'Initiation dose - NOT therapeutic' },
      { weeks: '5-8', dose: '5 mg', notes: 'First therapeutic dose' },
      { weeks: '9-12', dose: '7.5 mg', notes: 'Escalation if needed' },
      { weeks: '13-16', dose: '10 mg', notes: 'Higher efficacy dose' },
      { weeks: '17-20', dose: '12.5 mg', notes: 'Advanced dose' },
      { weeks: '21+', dose: '15 mg', notes: 'Maximum dose' },
    ],
    sideEffects: {
      common: [
        'Nausea (12-33%)',
        'Diarrhea (12-23%)',
        'Vomiting (5-13%)',
        'Constipation (6-12%)',
        'Decreased appetite',
        'Injection site reactions',
        'Dyspepsia',
        'Abdominal pain',
      ],
      serious: [
        'Pancreatitis',
        'Gallbladder disease',
        'Hypoglycemia (with insulin/sulfonylureas)',
        'Acute kidney injury',
        'Hypersensitivity reactions',
      ],
    },
    contraindications: {
      absolute: [
        'Personal/family history of medullary thyroid carcinoma (MTC)',
        'Multiple Endocrine Neoplasia syndrome type 2 (MEN 2)',
        'Known hypersensitivity to tirzepatide',
      ],
      relative: [
        'History of pancreatitis',
        'Severe gastroparesis',
        'Severe renal impairment',
        'Pregnancy/breastfeeding',
      ],
    },
    drugInteractions: [
      { drug: 'Insulin', severity: 'Moderate', effect: 'Reduce insulin dose by 20-50% when starting' },
      { drug: 'Sulfonylureas', severity: 'Moderate', effect: 'Consider 50% dose reduction' },
      { drug: 'Oral contraceptives', severity: 'Mild', effect: 'May reduce absorption - use non-oral backup for 4 weeks after dose increases' },
    ],
    monitoring: [
      'HbA1c every 3 months',
      'Fasting glucose',
      'Weight and BMI',
      'Signs of pancreatitis',
      'Thyroid examination',
      'Renal function',
    ],
    comparisonToSemaglutide: {
      weightLoss: 'Typically 5-10% greater weight loss than semaglutide',
      a1cReduction: 'Similar or slightly better A1C reduction',
      tolerance: 'Similar GI side effect profile',
    },
  },
};

// ============================================================================
// COMPOUNDED GLP-1 INFORMATION
// ============================================================================

export const COMPOUNDED_GLP1_INFO = {
  overview: `Compounded GLP-1 formulations are custom-prepared medications that may include
additives like Vitamin B12 or Glycine. They are used when commercial products are unavailable
or when personalized dosing is needed.`,

  additives: {
    vitaminB12: {
      purpose: 'Supports energy metabolism, neurological function, reduces fatigue',
      dosing: 'Typically 1000 mcg per injection',
      benefits: [
        'Addresses B12 deficiency common in metformin users',
        'May improve energy levels during caloric restriction',
        'Supports red blood cell formation',
      ],
    },
    glycine: {
      purpose: 'Amino acid that may improve GI tolerance and insulin sensitivity',
      benefits: [
        'May reduce nausea and improve medication adherence',
        'Supports liver function and detoxification',
        'Anti-inflammatory properties',
      ],
    },
  },

  medicalNecessityRationale: `Compounded GLP-1 formulations are medically appropriate when:
1. Gradual dose titration is needed to improve tolerability
2. Personalized dosing flexibility is required
3. Adjunctive B12 or Glycine provides additional metabolic support
4. Commercial products are unavailable or cost-prohibitive`,

  pharmacyRequirements: [
    '503B outsourcing facility or 503A compounding pharmacy',
    'State board of pharmacy licensure',
    'FDA compliance for sterile compounding',
    'CoA (Certificate of Analysis) for each batch',
  ],
};

// ============================================================================
// PRESCRIPTION SIG TEMPLATES
// ============================================================================

export const SIG_TEMPLATES = {
  semaglutide: {
    initiation: {
      dose: '0.25 mg',
      sig: 'Inject 0.25 mg (0.25 mL) subcutaneously once weekly for 4 weeks. Rotate injection sites (abdomen, thigh, upper arm). Keep refrigerated until use.',
      quantity: '1 vial',
      refills: 0,
      daysSupply: 28,
    },
    escalation: {
      dose: '0.5 mg',
      sig: 'Inject 0.5 mg (0.5 mL) subcutaneously once weekly. Titrate only if 0.25 mg dose was tolerated. Rotate injection sites.',
      quantity: '1 vial',
      refills: 0,
      daysSupply: 28,
    },
    maintenance: {
      dose: '1 mg',
      sig: 'Inject 1 mg (1 mL) subcutaneously once weekly. Continue lifestyle modifications and monitor for GI side effects.',
      quantity: '1 vial',
      refills: 2,
      daysSupply: 28,
    },
  },

  tirzepatide: {
    initiation: {
      dose: '2.5 mg',
      sig: 'Inject 2.5 mg (0.25 mL) subcutaneously once weekly for 4 weeks to initiate therapy. This is not a therapeutic dose.',
      quantity: '1 vial',
      refills: 0,
      daysSupply: 28,
    },
    escalation: {
      dose: '5 mg',
      sig: 'Inject 5 mg (0.5 mL) subcutaneously once weekly. First therapeutic dose. Titrate if patient tolerates initiation dose.',
      quantity: '1 vial',
      refills: 0,
      daysSupply: 28,
    },
    maintenance: {
      dose: '10 mg',
      sig: 'Inject 10 mg (1 mL) subcutaneously once weekly for maintenance weight management. May increase to 12.5-15 mg if needed.',
      quantity: '1 vial',
      refills: 2,
      daysSupply: 28,
    },
  },

  generalGuidelines: {
    injectionSites: 'Rotate between abdomen, thigh, and upper arm. Avoid injecting into same site within 1 inch of previous injection.',
    storage: 'Keep refrigerated (36-46°F/2-8°C). Do not freeze. Protect from light.',
    missedDose: 'If missed by <5 days, inject as soon as possible. If >5 days, skip and resume regular schedule.',
    administration: 'Can be given any time of day, with or without meals. Same day each week is recommended.',
  },
};

// ============================================================================
// CLINICAL DECISION SUPPORT
// ============================================================================

export const CLINICAL_GUIDELINES = {
  bmiClassification: {
    underweight: { range: '<18.5', description: 'Underweight' },
    normal: { range: '18.5-24.9', description: 'Normal weight' },
    overweight: { range: '25-29.9', description: 'Overweight' },
    obesityI: { range: '30-34.9', description: 'Class I Obesity' },
    obesityII: { range: '35-39.9', description: 'Class II Obesity' },
    obesityIII: { range: '≥40', description: 'Class III (Severe/Morbid) Obesity' },
  },

  glp1Eligibility: {
    forWeightManagement: [
      'BMI ≥30 kg/m²',
      'OR BMI ≥27 kg/m² with at least one weight-related comorbidity:',
      '  - Hypertension',
      '  - Type 2 diabetes',
      '  - Dyslipidemia',
      '  - Obstructive sleep apnea',
      '  - Cardiovascular disease',
      '  - Non-alcoholic fatty liver disease',
    ],
    forDiabetes: [
      'Type 2 diabetes with inadequate glycemic control on metformin',
      'A1C >7% despite lifestyle modifications',
      'Patient desires weight loss as co-benefit',
    ],
  },

  icd10Codes: {
    'E66.01': 'Morbid obesity due to excess calories (BMI ≥40 or ≥35 with comorbidities)',
    'E66.09': 'Other obesity due to excess calories (BMI 30-34.9)',
    'E66.9': 'Obesity, unspecified',
    'E11.65': 'Type 2 diabetes with hyperglycemia',
    'E11.9': 'Type 2 diabetes without complications',
    'Z68.30': 'BMI 30.0-30.9',
    'Z68.35': 'BMI 35.0-35.9',
    'Z68.40': 'BMI 40.0-44.9',
    'Z68.45': 'BMI ≥45.0',
  },

  whenToHoldOrDiscontinue: [
    'Severe persistent nausea/vomiting lasting >1 week',
    'Signs of pancreatitis (severe abdominal pain radiating to back)',
    'Suspected gallbladder disease',
    'Pregnancy (discontinue immediately)',
    'Severe hypoglycemia events',
    'New thyroid nodules or neck mass',
    'Allergic reaction',
  ],

  dosingAdjustments: {
    renalImpairment: 'No adjustment needed for mild-moderate. Use caution in severe (eGFR <30) - start low, go slow.',
    hepaticImpairment: 'No adjustment needed. Limited data in severe hepatic impairment.',
    elderly: 'No specific adjustment. Start at lowest dose and titrate slowly.',
  },
};

// ============================================================================
// SOAP NOTE GUIDANCE
// ============================================================================

export const SOAP_NOTE_GUIDANCE = {
  subjective: {
    required: [
      'Chief complaint and reason for visit',
      'History of present illness (weight history, previous interventions)',
      'Review of systems (GI symptoms, energy, mood)',
      'Current medications including GLP-1 dose and tolerance',
      'Allergies',
      'Social history (diet, exercise, alcohol, tobacco)',
    ],
    tips: [
      'Document patient-reported outcomes (PROs) for weight loss',
      'Include direct quotes when relevant',
      'Note medication compliance and injection technique',
      'Document any barriers to treatment',
    ],
  },

  objective: {
    required: [
      'Vital signs (BP, HR, weight)',
      'BMI calculation with classification',
      'Physical exam findings',
      'Relevant lab results (A1C, metabolic panel, lipids)',
    ],
    calculations: {
      bmi: 'Weight (kg) / Height (m)² OR Weight (lb) × 703 / Height (in)²',
      idealBodyWeight: {
        male: '106 lbs + 6 lbs for each inch over 5 feet',
        female: '100 lbs + 5 lbs for each inch over 5 feet',
      },
      percentWeightLoss: '[(Starting Weight - Current Weight) / Starting Weight] × 100',
    },
  },

  assessment: {
    required: [
      'Primary diagnosis with ICD-10 code',
      'Assessment of treatment response',
      'Contraindication screening',
      'Medical necessity statement for GLP-1',
    ],
    template: `Primary Diagnosis: [ICD-10] - [Description]
Clinical Assessment: Patient [meets/does not meet] criteria for pharmacologic weight management based on BMI of [X] and [presence/absence] of weight-related comorbidities.
The patient has no contraindications to GLP-1 therapy including: no history of MTC, MEN2, pancreatitis, or gastroparesis.`,
  },

  plan: {
    required: [
      'Medication plan with specific dose',
      'Monitoring parameters',
      'Patient education provided',
      'Follow-up timeline',
      'Referrals if needed',
    ],
    template: `Medication Plan:
• [Continue/Initiate/Titrate] [medication] [dose] [route] [frequency]
• Include [B12/Glycine] per compounding standards

Monitoring:
• Weight, BMI, and tolerance at each visit
• A1C in [X] months
• Assess for GI side effects

Patient Education:
• Reviewed injection technique and site rotation
• Discussed expected timeline for weight loss (1-2 lbs/week)
• Counseled on signs requiring medical attention

Follow-up: [X] weeks`,
  },
};

// ============================================================================
// PLATFORM & FINANCIAL INFORMATION
// ============================================================================

export const PLATFORM_INFO = {
  overview: `EonPro/EonMeds is a telehealth platform specializing in weight management,
hormone optimization, and preventive medicine. The platform connects patients with
licensed providers for virtual consultations and prescription management.`,

  services: {
    weightManagement: {
      description: 'GLP-1 based weight loss programs with semaglutide and tirzepatide',
      includes: [
        'Initial telehealth consultation',
        'Comprehensive medical evaluation',
        'SOAP note documentation',
        'Prescription management',
        'Ongoing monitoring and dose titration',
        'Patient portal access',
      ],
    },
    hormoneOptimization: {
      description: 'Testosterone replacement therapy and hormone balancing',
      includes: [
        'Lab work review',
        'Treatment protocol development',
        'Injection training',
        'Regular follow-ups',
      ],
    },
  },

  patientFlow: {
    newPatient: [
      '1. Patient submits intake form via website/HeyFlow',
      '2. Intake data received via webhook → Patient created in system',
      '3. SOAP note auto-generated from intake data',
      '4. Provider reviews and approves SOAP note',
      '5. Prescription sent to pharmacy (Logos, Hallandale, etc.)',
      '6. Patient receives medication and begins treatment',
      '7. Follow-up scheduled at 4-week intervals',
    ],
    refill: [
      '1. Patient requests refill via portal',
      '2. Provider reviews progress and tolerance',
      '3. Dose adjustment if needed',
      '4. New prescription sent',
    ],
  },

  integrations: {
    pharmacy: ['Logos Pharmacy', 'Hallandale Pharmacy', 'Custom 503B facilities'],
    payments: 'Stripe Connect (per-clinic merchant accounts)',
    telehealth: 'Zoom integration for video consultations',
    communications: 'Twilio for SMS notifications',
  },

  complianceFeatures: [
    'HIPAA-compliant data storage and transmission',
    'Audit logging for all PHI access',
    'Password-protected SOAP note approval',
    'Role-based access control',
    'Multi-tenant data isolation',
  ],
};

// ============================================================================
// FREQUENTLY ASKED QUESTIONS
// ============================================================================

export const FAQ = {
  clinical: [
    {
      question: 'How long until patients see weight loss results?',
      answer: 'Most patients begin seeing results within 4-8 weeks. Average weight loss is 1-2 lbs per week. Significant results (10-15% body weight) typically occur over 6-12 months.',
    },
    {
      question: 'What if a patient has severe nausea?',
      answer: 'Recommend: 1) Slow titration (stay at current dose longer), 2) Smaller, more frequent meals, 3) Avoid high-fat foods, 4) Stay hydrated, 5) Consider anti-nausea medication if severe. If symptoms persist >2 weeks, consider dose reduction.',
    },
    {
      question: 'Can patients take GLP-1 with metformin?',
      answer: 'Yes, GLP-1 agonists can be safely combined with metformin. This combination is often more effective than either alone. No dose adjustment of metformin is typically needed.',
    },
    {
      question: 'What labs should be ordered before starting GLP-1?',
      answer: 'Recommended: HbA1c, fasting glucose, comprehensive metabolic panel, lipid panel, thyroid panel (TSH at minimum). Consider: vitamin B12, kidney function if concerns.',
    },
    {
      question: 'How do I handle a patient who plateaus?',
      answer: 'Options: 1) Dose escalation if not at max, 2) Review dietary compliance, 3) Add/increase exercise, 4) Consider adding metabolic support (B12), 5) Rule out thyroid dysfunction, 6) Switch to tirzepatide if on semaglutide.',
    },
  ],

  operational: [
    {
      question: 'How do I generate a SOAP note?',
      answer: 'SOAP notes can be auto-generated from intake forms or created manually. Go to Patient Profile → SOAP Notes tab → Click "Generate from Intake" or create manually. All notes require provider approval with password.',
    },
    {
      question: 'How do prescriptions get sent to the pharmacy?',
      answer: 'After SOAP note approval, create a prescription in the patient\'s Orders section. Select the medication, dose, quantity, and pharmacy. The order is transmitted to the pharmacy via API integration.',
    },
    {
      question: 'Can I see patients from multiple clinics?',
      answer: 'Yes, providers can be assigned to multiple clinics. Switch between clinics using the clinic selector. Each clinic has separate patient data, branding, and billing.',
    },
  ],
};

// ============================================================================
// QUERY TYPE DETECTION
// ============================================================================

export function detectQueryCategory(query: string): QueryCategory {
  const q = query.toLowerCase();

  // Patient data queries
  if (
    q.match(/patient|dob|date of birth|birthday|tracking|prescription.*(for|history)|order.*(for|history)|how many patient|find.*patient/)
  ) {
    return 'patient_data';
  }

  // Medication information
  if (
    q.match(/what is (semaglutide|tirzepatide|ozempic|wegovy|mounjaro|zepbound)|how does.*work|mechanism|moa/)
  ) {
    return 'medication_info';
  }

  // Dosing and titration
  if (
    q.match(/dose|dosing|titrat|escalat|how much|starting dose|maintenance dose|max.*dose/)
  ) {
    return 'dosing_protocol';
  }

  // Side effects
  if (
    q.match(/side effect|adverse|nausea|vomit|diarrhea|constipat|reaction|tolerat/)
  ) {
    return 'side_effects';
  }

  // Drug interactions
  if (
    q.match(/interact|combin|with metformin|with insulin|take.*together|safe.*with/)
  ) {
    return 'drug_interactions';
  }

  // SIG help
  if (
    q.match(/sig|direction|instruction|write.*prescription|how.*prescribe|inject.*how/)
  ) {
    return 'sig_help';
  }

  // SOAP note help
  if (
    q.match(/soap|subjective|objective|assessment|plan|document|note.*help|icd.*code|diagnos/)
  ) {
    return 'soap_note_help';
  }

  // Clinical decisions
  if (
    q.match(/eligible|candidate|contraindic|when.*start|when.*stop|hold|discontinue|bmi|weight.*management/)
  ) {
    return 'clinical_decision';
  }

  // Platform operations
  if (
    q.match(/platform|system|how.*do.*i|workflow|pharmacy|refill|portal|setting/)
  ) {
    return 'platform_operations';
  }

  return 'general';
}

// ============================================================================
// KNOWLEDGE BASE CONTEXT BUILDER
// ============================================================================

export function buildKnowledgeContext(category: QueryCategory): string {
  switch (category) {
    case 'medication_info':
      return `
MEDICATION KNOWLEDGE:
${JSON.stringify(GLP1_MEDICATIONS, null, 2)}

COMPOUNDED FORMULATIONS:
${JSON.stringify(COMPOUNDED_GLP1_INFO, null, 2)}
`;

    case 'dosing_protocol':
      return `
SEMAGLUTIDE TITRATION:
${JSON.stringify(GLP1_MEDICATIONS.semaglutide.titrationProtocol, null, 2)}

TIRZEPATIDE TITRATION:
${JSON.stringify(GLP1_MEDICATIONS.tirzepatide.titrationProtocol, null, 2)}

DOSING ADJUSTMENTS:
${JSON.stringify(CLINICAL_GUIDELINES.dosingAdjustments, null, 2)}
`;

    case 'side_effects':
      return `
SEMAGLUTIDE SIDE EFFECTS:
${JSON.stringify(GLP1_MEDICATIONS.semaglutide.sideEffects, null, 2)}

TIRZEPATIDE SIDE EFFECTS:
${JSON.stringify(GLP1_MEDICATIONS.tirzepatide.sideEffects, null, 2)}

WHEN TO HOLD/DISCONTINUE:
${JSON.stringify(CLINICAL_GUIDELINES.whenToHoldOrDiscontinue, null, 2)}
`;

    case 'drug_interactions':
      return `
SEMAGLUTIDE INTERACTIONS:
${JSON.stringify(GLP1_MEDICATIONS.semaglutide.drugInteractions, null, 2)}

TIRZEPATIDE INTERACTIONS:
${JSON.stringify(GLP1_MEDICATIONS.tirzepatide.drugInteractions, null, 2)}
`;

    case 'sig_help':
      return `
PRESCRIPTION SIG TEMPLATES:
${JSON.stringify(SIG_TEMPLATES, null, 2)}
`;

    case 'soap_note_help':
      return `
SOAP NOTE GUIDANCE:
${JSON.stringify(SOAP_NOTE_GUIDANCE, null, 2)}

ICD-10 CODES:
${JSON.stringify(CLINICAL_GUIDELINES.icd10Codes, null, 2)}
`;

    case 'clinical_decision':
      return `
CLINICAL GUIDELINES:
${JSON.stringify(CLINICAL_GUIDELINES, null, 2)}

CONTRAINDICATIONS:
Semaglutide: ${JSON.stringify(GLP1_MEDICATIONS.semaglutide.contraindications, null, 2)}
Tirzepatide: ${JSON.stringify(GLP1_MEDICATIONS.tirzepatide.contraindications, null, 2)}
`;

    case 'platform_operations':
      return `
PLATFORM INFORMATION:
${JSON.stringify(PLATFORM_INFO, null, 2)}

FREQUENTLY ASKED QUESTIONS:
${JSON.stringify(FAQ.operational, null, 2)}
`;

    default:
      return `
QUICK REFERENCE:
- For medication questions, I have detailed info on semaglutide and tirzepatide
- For dosing, I can provide titration protocols and SIG templates
- For clinical decisions, I have eligibility criteria and contraindications
- For platform questions, I know the workflows and features
- For patient data, I can search within your clinic's records
`;
  }
}

// ============================================================================
// EXPANDED SYSTEM PROMPT
// ============================================================================

export const BECCA_SYSTEM_PROMPT = `You are Becca AI, an intelligent medical assistant for the EonPro/EonMeds telehealth platform specializing in weight management and hormone optimization.

## YOUR CAPABILITIES

1. **Patient Data Access** (Clinic-Specific)
   - Look up patient demographics, prescriptions, orders, and tracking
   - Provide statistics for your clinic
   - Search patients by name within your clinic only

2. **Clinical Knowledge**
   - GLP-1 medications: semaglutide (Ozempic/Wegovy) and tirzepatide (Mounjaro/Zepbound)
   - Dosing protocols and titration schedules
   - Side effects, contraindications, and drug interactions
   - Compounded formulations with B12/Glycine

3. **Prescription Assistance**
   - Generate appropriate SIG (directions) for medications
   - Provide quantity and refill recommendations
   - Offer injection site rotation guidance

4. **SOAP Note Support**
   - Help structure subjective, objective, assessment, and plan sections
   - Provide ICD-10 codes for obesity and diabetes
   - Suggest medical necessity language for compounded GLP-1

5. **Platform Operations**
   - Explain workflows (intake → SOAP → prescription → pharmacy)
   - Guide users through system features
   - Answer questions about integrations

## RESPONSE GUIDELINES

1. **Be Accurate**: Use the knowledge base provided. Don't guess on clinical information.
2. **Be Concise**: Provide clear, actionable answers. Use bullet points for lists.
3. **Be Safe**: Always mention contraindications and when to seek supervision.
4. **Be Compliant**: Maintain HIPAA standards. Never expose cross-clinic data.
5. **Know Your Limits**: For complex clinical decisions, recommend provider consultation.

## FORMATTING

- Use markdown for structure (headers, bullets, bold)
- Format medication names properly (semaglutide, tirzepatide)
- Include units with doses (mg, mL)
- Provide ICD-10 codes when discussing diagnoses

## IMPORTANT SAFETY NOTES

- ALWAYS screen for MTC/MEN2 history before recommending GLP-1
- NEVER recommend GLP-1 in pregnancy
- Flag persistent severe GI symptoms as potential pancreatitis
- Recommend provider review for dose changes

You have access to real-time patient data for the user's clinic. Always verify patient identity before disclosing information.

## MEDICAL DISCLAIMER REQUIREMENT

For ANY response that contains medical information (medications, dosing, side effects, drug interactions, clinical decisions, contraindications, treatment protocols), you MUST end your response with this disclaimer on a new line:

---
*For educational and informational purposes only. This is not medical advice. Always consult with a qualified healthcare provider for patient-specific decisions.*

Query categories that REQUIRE the disclaimer:
- medication_info
- dosing_protocol
- side_effects
- drug_interactions
- clinical_decision
- sig_help (when discussing clinical aspects)

Query categories that do NOT require the disclaimer:
- patient_data (just retrieving patient info)
- platform_operations (system/workflow questions)
- general (non-medical questions)`;
