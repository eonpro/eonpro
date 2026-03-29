import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { IntakeProcessor } from '@/lib/webhooks/intake-processor';
import { basePrisma, runWithClinicContext } from '@/lib/db';
import type { NormalizedIntake, NormalizedPatient, IntakeSection, IntakeEntry } from '@/lib/medlink/types';

/**
 * POST /api/intake-forms/submit-to-eonpro
 *
 * Native intake submission — builds NormalizedIntake DIRECTLY from form
 * responses. Maps camelCase storageKeys to display-ready labels and
 * human-readable values.
 */

const EONMEDS_SUBDOMAIN = 'eonmeds';
const WELLMEDR_SUBDOMAIN = 'wellmedr';
const OT_SUBDOMAIN = 'ot';

// ============================================================================
// Field labels for the intake document display
// ============================================================================

const FIELD_LABELS: Record<string, string> = {
  language: 'Preferred Language',
  goals: 'Health Goals',
  medication_preference: 'Medication Preference',
  consent_accepted: 'Consent Accepted',
  terms_of_use_accepted: 'Terms of Use',
  consent_privacy_policy_accepted: 'Privacy Policy',
  telehealth_consent_accepted: 'Telehealth Consent',
  cancellation_policy_accepted: 'Cancellation Policy',
  terms_of_use_accepted_at: 'Consent Date/Time',
  smsConsentAccepted: 'SMS Consent',
  contact_consent: 'Contact Consent',
  state: 'State',
  stateFull: 'State/Region',
  firstName: 'First Name',
  lastName: 'Last Name',
  dob: 'Date of Birth',
  sex: 'Gender',
  email: 'Email',
  phone: 'Phone Number',
  street: 'Street Address',
  apartment: 'Apartment/Suite',
  addressCity: 'City',
  addressState: 'State',
  addressZipCode: 'ZIP Code',
  fullAddress: 'Full Address',
  idealWeight: 'Ideal Weight',
  currentWeight: 'Starting Weight',
  heightFeet: 'Height (feet)',
  heightInches: 'Height (inches)',
  bmi: 'BMI',
  pregnancy_status: 'Pregnancy Status',
  activity_level: 'Daily Physical Activity',
  has_mental_health: 'Mental Health Diagnosis',
  mental_health_conditions: 'Mental Health Conditions',
  has_chronic_conditions: 'Chronic Conditions',
  chronic_conditions_detail: 'Chronic Conditions Details',
  digestive_conditions: 'Digestive Conditions',
  has_kidney_conditions: 'Kidney Problems',
  had_surgery: 'Surgery History',
  surgery_types: 'Surgery Types',
  blood_pressure: 'Blood Pressure',
  glp1_history: 'GLP-1 Medication History',
  glp1_type: 'Current GLP-1 Medication',
  semaglutide_dosage: 'Semaglutide Dose',
  semaglutide_side_effects: 'Semaglutide Side Effects',
  semaglutide_success: 'Semaglutide Success',
  tirzepatide_dosage: 'Tirzepatide Dose',
  tirzepatide_side_effects: 'Tirzepatide Side Effects',
  tirzepatide_success: 'Tirzepatide Success',
  dosage_satisfaction: 'Dosage Satisfaction',
  recreational_drugs: 'Recreational Drug Use',
  weight_loss_methods: 'Weight Loss History',
  weight_loss_support: 'Weight Loss Support Preferences',
  dosage_interest: 'Personalized Dosage Interest',
  alcohol_consumption: 'Alcohol Intake',
  common_side_effects: 'Side Effect Concerns',
  referral_source: 'Referral Source',
  referrer_name: 'Referrer Name',
  health_improvements: 'Health Improvement Interests',
  ipAddress: 'IP Address',
  userAgent: 'Device/Browser',
  peptide_symptoms: 'Current Symptoms',
  peptide_therapy: 'Peptide Therapy Interest',
  sermorelin_goals: 'Sermorelin Therapy Goals',
  optimize_goals: 'Optimization Goals',
  sermorelin_medications: 'Sermorelin-Interfering Medications',
  has_prescription_meds: 'Taking Prescription Medications',
  prescription_details: 'Prescription Medication Details',
  vitamin_b12_deficiency: 'Vitamin B-12 Deficiency',
  has_medical_conditions: 'Medical Conditions or Chronic Illness',
  sermorelin_conditions: 'Sermorelin-Specific Conditions',
  cancer_treatment: 'Currently Undergoing Cancer Treatment',
  lifestyle_factors: 'Lifestyle Factors',
  has_allergies: 'Has Allergies',
  allergy_details: 'Allergy Details',
  recent_lab_work: 'Most Recent Lab Work',
  trt_symptoms: 'TRT Symptoms',
  trt_interest: 'Reason for Seeking TRT',
  trt_goals: 'TRT Goals',
  prior_testosterone: 'Prior Testosterone Use',
  trt_type: 'Testosterone Type Used',
  trt_dose: 'Testosterone Dose & Frequency',
  blood_work_checked: 'Testosterone Levels Checked',
  blood_work_results: 'Testosterone Level Results',
  prostate_health: 'Prostate Health',
  blood_clot_history: 'Blood Clot History',
  sleep_apnea: 'Sleep Apnea',
  heart_conditions: 'Cardiovascular History',
  fertility_concerns: 'Fertility Concerns',
};

// ============================================================================
// Human-readable value translations
// ============================================================================

const VALUE_TRANSLATIONS: Record<string, Record<string, string>> = {
  sex: {
    male: 'Male',
    female: 'Female',
  },
  language: {
    en: 'English',
    es: 'Spanish',
  },
  medication_preference: {
    recommendation: 'I\'d like a recommendation from a provider',
    have_in_mind: 'I already have a medication in mind',
  },
  pregnancy_status: {
    yes: 'Currently pregnant or planning to become pregnant',
    no: 'Not pregnant and not planning to become pregnant',
  },
  activity_level: {
    '1': 'Sedentary (little or no exercise)',
    '2': 'Lightly active (1-3 days/week)',
    '3': 'Moderately active (3-5 days/week)',
    '4': 'Very active (6-7 days/week)',
    '5': 'Extremely active (twice daily or physical job)',
  },
  has_mental_health: {
    yes: 'Yes, I have been diagnosed with a mental health condition',
    no: 'No mental health conditions',
  },
  has_chronic_conditions: {
    yes: 'Yes, I have a chronic condition',
    no: 'No chronic conditions',
  },
  has_kidney_conditions: {
    yes: 'Yes, I have kidney problems',
    no: 'No kidney problems',
  },
  had_surgery: {
    yes: 'Yes, I have had surgery',
    no: 'No previous surgeries',
  },
  blood_pressure: {
    normal: 'Normal blood pressure',
    low: 'Low blood pressure',
    high: 'High blood pressure (hypertension)',
    controlled: 'High blood pressure, controlled with medication',
    elevated: 'Elevated blood pressure',
    high_stage1: 'High blood pressure — Stage 1',
    high_stage2: 'High blood pressure — Stage 2',
    crisis: 'Hypertensive crisis',
    unknown: 'Unknown / not sure',
    not_sure: 'Unknown / not sure',
  },
  mental_health_conditions: {
    none: 'None',
    depression: 'Depression',
    bipolar: 'Bipolar disorder',
    bpd: 'Borderline personality disorder (BPD)',
    panic: 'Panic disorder / anxiety',
    schizophrenia: 'Schizophrenia',
    psychosis: 'Psychosis',
  },
  digestive_conditions: {
    none: 'None',
    ibs: 'Irritable bowel syndrome (IBS)',
    celiac: 'Celiac disease',
    constipation: 'Chronic constipation',
    heartburn: 'Chronic heartburn / GERD',
    gastroparesis: 'Gastroparesis',
    ulcer: 'Stomach ulcer',
    crohns: 'Crohn\'s disease',
    colitis: 'Ulcerative colitis',
    diverticulitis: 'Diverticulitis',
  },
  surgery_types: {
    none: 'No previous bariatric surgery',
    gastric_bypass: 'Gastric bypass',
    duodenal_switch: 'Duodenal switch',
    lap_band: 'Lap band',
    gastric_sleeve: 'Gastric sleeve',
    intestinal_surgery: 'Intestinal surgery',
  },
  glp1_history: {
    currently_taking: 'Currently taking a GLP-1 medication',
    previously_taken: 'Previously taken a GLP-1 medication',
    never_taken: 'Never taken a GLP-1 medication',
    considering: 'Considering starting a GLP-1 medication',
  },
  glp1_type: {
    semaglutide: 'Semaglutide (Ozempic/Wegovy)',
    tirzepatide: 'Tirzepatide (Mounjaro/Zepbound)',
    liraglutide: 'Liraglutide (Saxenda/Victoza)',
    oral_glp1: 'Oral GLP-1 (Rybelsus)',
    other: 'Other GLP-1 medication',
  },
  semaglutide_side_effects: {
    none: 'No side effects experienced',
    nausea: 'Nausea',
    vomiting: 'Vomiting',
    diarrhea: 'Diarrhea',
    constipation: 'Constipation',
    headache: 'Headache',
    fatigue: 'Fatigue',
    abdominal_pain: 'Abdominal pain',
    appetite_decrease: 'Decreased appetite',
    dizziness: 'Dizziness',
  },
  tirzepatide_side_effects: {
    none: 'No side effects experienced',
    nausea: 'Nausea',
    vomiting: 'Vomiting',
    diarrhea: 'Diarrhea',
    constipation: 'Constipation',
    headache: 'Headache',
    fatigue: 'Fatigue',
    abdominal_pain: 'Abdominal pain',
    appetite_decrease: 'Decreased appetite',
    dizziness: 'Dizziness',
  },
  semaglutide_success: {
    very_successful: 'Very successful — achieved significant weight loss',
    somewhat_successful: 'Somewhat successful — lost some weight',
    not_successful: 'Not successful — minimal or no weight loss',
    hard_to_stay_consistent: 'Hard to stay consistent with treatment',
    hard_consistency: 'Hard to stay consistent with treatment',
  },
  tirzepatide_success: {
    very_successful: 'Very successful — achieved significant weight loss',
    somewhat_successful: 'Somewhat successful — lost some weight',
    not_successful: 'Not successful — minimal or no weight loss',
    hard_to_stay_consistent: 'Hard to stay consistent with treatment',
    hard_consistency: 'Hard to stay consistent with treatment',
  },
  dosage_satisfaction: {
    increase: 'I would like to increase my dosage',
    maintain: 'I am satisfied with my current dosage',
    reduce: 'I would like to reduce my dosage',
  },
  dosage_interest: {
    yes: 'Yes, I\'m interested in a personalized dosage plan',
    no: 'No, I prefer a standard dosage',
    not_sure: 'Not sure yet — I\'d like to discuss with a provider',
  },
  alcohol_consumption: {
    none: 'I don\'t drink alcohol',
    never: 'I don\'t drink alcohol',
    rarely: 'Rarely (a few times a month)',
    few_times_year: 'Rarely (a few times a year)',
    few_times_month: 'Occasionally (a few times a month)',
    moderate: 'Moderately (a few times a week)',
    few_times_week: 'Moderately (a few times a week)',
    heavy: 'Frequently (daily or almost daily)',
    daily: 'Daily or almost daily',
    social: 'Socially (only on occasions)',
  },
  common_side_effects: {
    yes: 'Yes, I am concerned about potential side effects',
    no: 'No, I am not concerned about side effects',
    not_sure: 'I\'d like more information about side effects',
    gastrointestinal: 'Gastrointestinal issues',
    abdominal_pain: 'Abdominal pain',
    appetite_decrease: 'Decreased appetite',
    fatigue: 'Fatigue',
    dizziness: 'Dizziness',
    headache: 'Headache',
    nausea: 'Nausea',
    none: 'No concerns about side effects',
  },
  recreational_drugs: {
    none: 'None',
    cocaine: 'Cocaine',
    kratom: 'Kratom',
    opiates: 'Opiates',
    meth: 'Methamphetamine',
    cannabis: 'Cannabis / marijuana',
  },
  weight_loss_methods: {
    none: 'No previous weight loss attempts',
    diet: 'Diet changes',
    exercise: 'Exercise program',
    supplements: 'Weight loss supplements',
    programs: 'Structured weight loss programs',
    surgery: 'Bariatric surgery',
    medication: 'Prescription weight loss medication',
  },
  weight_loss_support: {
    nutrition: 'Nutritional guidance',
    meals: 'Meal planning support',
    digital: 'Digital health tools / app tracking',
    dosage: 'Personalized dosage management',
    community: 'Community support group',
    other: 'Other',
  },
  semaglutide_dosage: {
    oral: 'Oral semaglutide',
  },
  tirzepatide_dosage: {
    oral: 'Oral tirzepatide',
  },
  contact_consent: {
    true: 'Yes, I consent to being contacted',
    false: 'No',
  },
};

const GOAL_LABELS: Record<string, string> = {
  clothes: 'Enjoy how my clothes fit',
  confidence: 'Having more confidence',
  energy: 'Getting my energy back',
  feel_better: 'Feel better about myself',
  health: 'Improving overall health',
};

// ============================================================================
// Value formatting
// ============================================================================

function formatValue(key: string, val: unknown): string {
  if (val === undefined || val === null || val === '') return '';

  // Boolean values
  if (typeof val === 'boolean') {
    return val ? 'Yes' : 'No';
  }
  if (val === 'true') return 'Yes';
  if (val === 'false') return 'No';

  // Arrays (multi-select fields like goals, side effects, drugs)
  if (Array.isArray(val)) {
    if (key === 'goals') {
      return val.map((v) => GOAL_LABELS[String(v)] || String(v).replace(/_/g, ' ')).join(', ');
    }
    const translations = VALUE_TRANSLATIONS[key];
    if (translations) {
      return val.map((v) => translations[String(v)] || String(v).replace(/_/g, ' ')).join(', ');
    }
    return val.map((v) => String(v).replace(/_/g, ' ')).join(', ');
  }

  const strVal = String(val);

  // Check for direct translation
  const translations = VALUE_TRANSLATIONS[key];
  if (translations && translations[strVal]) {
    return translations[strVal];
  }

  // Weight fields — append "lbs"
  if ((key === 'currentWeight' || key === 'idealWeight') && /^\d+$/.test(strVal)) {
    return `${strVal} lbs`;
  }

  // Height feet
  if (key === 'heightFeet' && /^\d+$/.test(strVal)) {
    return `${strVal} ft`;
  }

  // Height inches
  if (key === 'heightInches' && /^\d+$/.test(strVal)) {
    return `${strVal} in`;
  }

  // Consent timestamps — format nicely
  if (key.endsWith('_at') && strVal.includes('T')) {
    return `Accepted on ${strVal}`;
  }

  // Objects
  if (typeof val === 'object') return JSON.stringify(val);

  return strVal;
}

// Keys to exclude from answers (internal-only, not useful for display)
const EXCLUDE_KEYS = new Set([
  'fullAddress', 'addressState',
]);

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  logger.info(`[submit-to-eonpro ${requestId}] Native intake submission received`);

  try {
    const body = await req.json();
    const { responses, submissionType, qualified, clinicSlug, treatmentType, refCode } = body;

    if (!responses || typeof responses !== 'object') {
      logger.warn(`[submit-to-eonpro ${requestId}] Missing responses`);
      return NextResponse.json({ error: 'Missing responses' }, { status: 400 });
    }

    if (!responses.firstName && !responses.email) {
      logger.warn(`[submit-to-eonpro ${requestId}] No patient identifiers`);
      return NextResponse.json({ error: 'Missing patient identifiers' }, { status: 400 });
    }

    // Capture IP and user-agent
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Resolve clinic — support OT, WellMedR, and EONMeds
    const isOtClinic = clinicSlug === 'ot' || clinicSlug === 'otmens';
    const targetSubdomain = isOtClinic ? OT_SUBDOMAIN
      : clinicSlug === 'wellmedr' ? WELLMEDR_SUBDOMAIN
      : EONMEDS_SUBDOMAIN;
    const targetName = isOtClinic ? 'OVERTIME'
      : clinicSlug === 'wellmedr' ? 'WELLMEDR'
      : 'EONMEDS';

    const clinic = await basePrisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: targetSubdomain },
          ...(isOtClinic ? [{ subdomain: 'otmens' }] : []),
          { name: { contains: targetName, mode: 'insensitive' as const } },
        ],
      },
      select: { id: true, name: true },
    });

    if (!clinic) {
      logger.error(`[submit-to-eonpro ${requestId}] Clinic not found for slug: ${clinicSlug}`);
      return NextResponse.json({ error: 'Clinic not found' }, { status: 500 });
    }

    // Compose full height string
    const heightFeet = String(responses.heightFeet || '');
    const heightInches = String(responses.heightInches || '0');
    const heightDisplay = heightFeet ? `${heightFeet}'${heightInches}"` : '';

    // Compute BMI if not already stored
    let bmiValue = responses.bmi ? String(responses.bmi) : '';
    if (!bmiValue && responses.currentWeight && heightFeet) {
      const totalInches = parseInt(heightFeet) * 12 + parseInt(heightInches || '0');
      const weight = parseInt(String(responses.currentWeight));
      if (totalInches > 0 && weight > 0) {
        bmiValue = ((weight / (totalInches * totalInches)) * 703).toFixed(2);
      }
    }

    // Build full address from components
    const streetAddr = String(responses.street || '');
    const apt = String(responses.apartment || '');
    const city = String(responses.addressCity || '');
    const stateCode = String(responses.addressState || responses.state || '').toUpperCase();
    const zip = String(responses.addressZipCode || '');

    // Build patient directly from storageKeys
    const patient: NormalizedPatient = {
      firstName: String(responses.firstName || 'Unknown'),
      lastName: String(responses.lastName || 'Unknown'),
      email: String(responses.email || '').toLowerCase().trim(),
      phone: String(responses.phone || '').replace(/\D/g, ''),
      dob: String(responses.dob || ''),
      gender: responses.sex === 'female' ? 'Female' : responses.sex === 'male' ? 'Male' : String(responses.sex || ''),
      address1: apt ? `${streetAddr}, ${apt}` : streetAddr,
      address2: '',
      city,
      state: stateCode,
      zip,
    };

    // Merge computed/derived values into responses for answer generation
    const enrichedResponses: Record<string, unknown> = {
      ...responses,
      bmi: bmiValue || undefined,
      height: heightDisplay || undefined,
      ipAddress,
      userAgent,
    };

    // Build answers from ALL responses with human-readable values
    const answers: IntakeEntry[] = [];
    for (const [key, value] of Object.entries(enrichedResponses)) {
      if (EXCLUDE_KEYS.has(key)) continue;
      const formatted = formatValue(key, value);
      if (!formatted) continue;
      answers.push({
        id: key,
        label: FIELD_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim(),
        value: formatted,
        rawValue: value,
      });
    }

    // Build sections for organized display on patient profile
    const sections: IntakeSection[] = [
      {
        title: 'Patient Information',
        entries: answers.filter((a) =>
          ['firstName', 'lastName', 'email', 'phone', 'dob', 'sex', 'state', 'street', 'apartment', 'addressCity', 'addressZipCode'].includes(a.id)
        ),
      },
      {
        title: 'Physical Measurements',
        entries: [
          ...answers.filter((a) => a.id === 'currentWeight'),
          ...answers.filter((a) => a.id === 'idealWeight'),
          { id: 'height', label: 'Height', value: heightDisplay, rawValue: heightDisplay },
          ...(bmiValue ? [{ id: 'bmi', label: 'BMI', value: bmiValue, rawValue: bmiValue }] : []),
          ...answers.filter((a) => a.id === 'blood_pressure'),
        ].filter((e) => e.value),
      },
      {
        title: 'Medical History',
        entries: answers.filter((a) =>
          ['pregnancy_status', 'activity_level', 'has_mental_health', 'mental_health_conditions',
           'has_chronic_conditions', 'chronic_conditions_detail', 'digestive_conditions',
           'has_kidney_conditions', 'had_surgery', 'surgery_types'].includes(a.id)
        ),
      },
      {
        title: 'GLP-1 Medications',
        entries: answers.filter((a) =>
          ['glp1_history', 'glp1_type', 'semaglutide_dosage', 'semaglutide_side_effects',
           'semaglutide_success', 'tirzepatide_dosage', 'tirzepatide_side_effects',
           'tirzepatide_success', 'dosage_satisfaction', 'medication_preference'].includes(a.id)
        ),
      },
      {
        title: 'Peptide Therapy',
        entries: answers.filter((a) =>
          ['peptide_symptoms', 'peptide_therapy', 'sermorelin_goals', 'optimize_goals',
           'sermorelin_medications', 'has_prescription_meds', 'prescription_details',
           'vitamin_b12_deficiency', 'has_medical_conditions', 'sermorelin_conditions',
           'cancer_treatment', 'recent_lab_work'].includes(a.id)
        ),
      },
      {
        title: 'Testosterone Replacement Therapy',
        entries: answers.filter((a) =>
          ['trt_symptoms', 'trt_interest', 'trt_goals', 'prior_testosterone',
           'trt_type', 'trt_dose', 'blood_work_checked', 'blood_work_results',
           'prostate_health', 'blood_clot_history', 'sleep_apnea',
           'heart_conditions', 'fertility_concerns'].includes(a.id)
        ),
      },
      {
        title: 'Lifestyle',
        entries: answers.filter((a) =>
          ['recreational_drugs', 'weight_loss_methods', 'weight_loss_support',
           'dosage_interest', 'alcohol_consumption', 'common_side_effects', 'goals',
           'health_improvements', 'lifestyle_factors', 'has_allergies', 'allergy_details'].includes(a.id)
        ),
      },
      {
        title: 'Referral',
        entries: answers.filter((a) =>
          ['referral_source', 'referrer_name'].includes(a.id)
        ),
      },
      {
        title: 'Consent & Acknowledgments',
        entries: [
          ...answers.filter((a) =>
            ['terms_of_use_accepted', 'consent_privacy_policy_accepted', 'telehealth_consent_accepted',
             'cancellation_policy_accepted', 'smsConsentAccepted', 'contact_consent',
             'terms_of_use_accepted_at'].includes(a.id)
          ),
          { id: 'ipAddress', label: 'IP Address', value: ipAddress, rawValue: ipAddress },
          { id: 'userAgent', label: 'Device/Browser', value: userAgent, rawValue: userAgent },
        ],
      },
    ];

    const normalized: NormalizedIntake = {
      submissionId: `native-${requestId}`,
      submittedAt: new Date(),
      patient,
      sections: sections.filter((s) => s.entries.length > 0),
      answers,
    };

    logger.info(`[submit-to-eonpro ${requestId}] Built NormalizedIntake: ${answers.length} answers, patient: ${patient.firstName} ${patient.lastName} <${patient.email}>, address: ${patient.address1}, ${patient.city}, ${patient.state} ${patient.zip}`);

    const processor = new IntakeProcessor({ source: 'eonpro', requestId });

    const clinicTag = isOtClinic ? 'otmens' : clinicSlug === 'wellmedr' ? 'wellmedr' : 'eonmeds';
    const isPeptideIntake = treatmentType === 'peptides';
    const isTRTIntake = treatmentType === 'trt';
    const intakeTypeTags = isPeptideIntake
      ? ['peptide-therapy-intake', 'sermorelin']
      : isTRTIntake
      ? ['trt-intake', 'testosterone']
      : ['weightlossintake', 'glp1'];

    const result = await runWithClinicContext(clinic.id, () =>
      processor.process(normalized, {
        clinicId: clinic.id,
        clinicSubdomain: targetSubdomain,
        isPartialSubmission: submissionType === 'partial',
        generateSoapNote: submissionType !== 'partial',
        tags: [...intakeTypeTags, clinicTag, 'complete-intake', 'native-form'],
        treatmentType: treatmentType || undefined,
        ...(refCode ? { promoCode: String(refCode) } : {}),
      })
    );

    const duration = Date.now() - startTime;

    if (result.success) {
      logger.info(`[submit-to-eonpro ${requestId}] SUCCESS in ${duration}ms — patient ${result.patient.patientId} (ID: ${result.patient.id}), new: ${result.patient.isNew}, doc: ${result.document?.id}, soap: ${result.soapNote?.id}`);
    } else {
      logger.warn(`[submit-to-eonpro ${requestId}] Partial success with ${result.errors.length} errors in ${duration}ms`, { errors: result.errors });
    }

    return NextResponse.json({
      success: result.success,
      patientId: result.patient.patientId,
      eonproDatabaseId: result.patient.id,
      isNew: result.patient.isNew,
      documentId: result.document?.id || null,
      soapNoteId: result.soapNote?.id || null,
      processingTimeMs: duration,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);

    logger.error(`[submit-to-eonpro ${requestId}] FAILED in ${duration}ms: ${errMsg}`, {
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { error: 'Submission failed', message: errMsg, requestId },
      { status: 500 },
    );
  }
}
