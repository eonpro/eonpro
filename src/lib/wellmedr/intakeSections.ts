/**
 * Wellmedr Intake Sections Configuration
 *
 * Maps Wellmedr intake form fields (from https://intake.wellmedr.com) to display sections.
 * This is EXCLUSIVELY for the Wellmedr clinic and should NOT affect any other clinic.
 *
 * The Wellmedr form uses kebab-case field names stored in Airtable, which are different
 * from the eonmeds form structure. This configuration ensures all Wellmedr fields are
 * properly mapped to the existing section structure instead of appearing in "Additional Responses".
 */

import { User, Activity, Pill, Heart, Brain, ClipboardList, Shield } from 'lucide-react';

/**
 * Wellmedr-specific intake sections
 *
 * These map Wellmedr form fields to the same visual structure as eonmeds,
 * but with field IDs and aliases that match the Wellmedr form data.
 */
export const WELLMEDR_INTAKE_SECTIONS = [
  {
    title: 'Patient Profile',
    icon: User,
    editable: false, // Patient profile is edited on the Profile tab
    fields: [
      { id: 'patient-name', label: 'Full Name' },
      { id: 'patient-dob', label: 'Date of Birth' },
      {
        id: 'patient-gender',
        label: 'Gender',
        aliases: ['sex', 'biologicalsex', 'biological-sex', 'biological sex'],
      },
      { id: 'patient-phone', label: 'Phone' },
      { id: 'patient-email', label: 'Email' },
      { id: 'patient-address', label: 'Address' },
    ],
  },
  {
    title: 'Physical Measurements',
    icon: Activity,
    editable: true,
    fields: [
      {
        id: 'weight',
        label: 'Starting Weight',
        aliases: [
          'startingweight',
          'currentweight',
          'current weight',
          'current-weight',
          'current weight (lbs)',
        ],
        inputType: 'text',
        placeholder: 'e.g., 180 lbs',
      },
      {
        id: 'idealWeight',
        label: 'Ideal Weight',
        aliases: [
          'idealweight',
          'goalweight',
          'targetweight',
          'goal-weight',
          'goal weight',
          'goal weight (lbs)',
        ],
        inputType: 'text',
        placeholder: 'e.g., 150 lbs',
      },
      {
        id: 'height',
        label: 'Height',
        // Wellmedr sends height as separate feet/inches fields
        aliases: [
          'heightfeet',
          'heightinches',
          'feet',
          'inches',
          'height (feet)',
          'height (inches)',
        ],
        inputType: 'text',
        placeholder: 'e.g., 5\'8"',
      },
      {
        id: 'bmi',
        label: 'BMI',
        aliases: ['bodymassindex'],
        inputType: 'text',
        placeholder: 'e.g., 27.4',
      },
      {
        id: 'bloodPressure',
        label: 'Blood Pressure',
        aliases: [
          'bloodpressure',
          'bp',
          'avg-blood-pressure-range',
          'avgbloodpressurerange',
          'average blood pressure range',
          'averagebloodpressurerange',
        ],
        inputType: 'text',
        placeholder: 'e.g., 120/80',
      },
      {
        id: 'heartRate',
        label: 'Resting Heart Rate',
        aliases: [
          'avg-resting-heart-rate',
          'avgrestingheartrate',
          'restingheartrate',
          'average resting heart rate',
          'averagerestingheartrate',
          'heart rate',
        ],
        inputType: 'text',
        placeholder: 'e.g., 60-100 bpm',
      },
    ],
  },
  {
    title: 'Medical History',
    icon: Heart,
    editable: true,
    fields: [
      {
        id: 'medicalConditions',
        label: 'Medical Conditions',
        aliases: [
          'medicalconditions',
          'conditions',
          'health-conditions',
          'healthconditions',
          'primary health conditions',
          'primaryhealthconditions',
          'health conditions',
        ],
        inputType: 'textarea',
        placeholder: 'List any medical conditions...',
      },
      {
        id: 'secondaryConditions',
        label: 'Secondary Health Conditions',
        aliases: [
          'health-conditions-2',
          'healthconditions2',
          'secondary health conditions',
          'secondaryhealthconditions',
          'otherconditions',
        ],
        inputType: 'textarea',
        placeholder: 'List any secondary conditions...',
      },
      {
        id: 'currentMedications',
        label: 'Current Medications',
        aliases: [
          'currentmedications',
          'medications',
          'current-meds',
          'currentmeds',
          'current medication list',
          'currentmedicationlist',
          'current-meds-details',
          'currentmedsdetails',
        ],
        inputType: 'textarea',
        placeholder: 'List current medications...',
      },
      {
        id: 'allergies',
        label: 'Allergies',
        aliases: ['allergy'],
        inputType: 'textarea',
        placeholder: 'List any allergies...',
      },
      {
        id: 'familyHistory',
        label: 'Family Medical History',
        aliases: ['familyhistory', 'familymedicalhistory'],
        inputType: 'textarea',
        placeholder: 'Family medical history...',
      },
      {
        id: 'surgicalHistory',
        label: 'Surgical History',
        aliases: [
          'surgicalhistory',
          'surgeries',
          'bariatric',
          'bariatric-details',
          'bariatricdetails',
          'prior bariatric surgery',
          'priorbariatricsurgery',
        ],
        inputType: 'textarea',
        placeholder: 'List any surgeries...',
      },
      {
        id: 'weightRelatedSymptoms',
        label: 'Weight-Related Symptoms',
        aliases: ['weight-related-symptoms', 'weightrelatedsymptoms', 'weight related symptoms'],
        inputType: 'textarea',
        placeholder: 'Symptoms related to weight...',
      },
      {
        id: 'opioidUse',
        label: 'Opioid Use',
        aliases: ['opioids', 'opioid-use', 'opioiduse', 'opioids-details', 'opioidsdetails'],
        inputType: 'select',
        options: ['No', 'Yes', 'Previously'],
      },
    ],
  },
  {
    title: 'Medical Flags',
    icon: Heart,
    editable: true,
    fields: [
      {
        id: 'pregnancyStatus',
        label: 'Pregnancy Status',
        aliases: [
          'pregnancystatus',
          'pregnant',
          'reproductive-status',
          'reproductivestatus',
          'reproductive status',
        ],
        inputType: 'select',
        options: [
          'Not Pregnant',
          'Pregnant',
          'Trying to Conceive',
          'Breastfeeding',
          'None of the below',
          'N/A',
        ],
      },
      {
        id: 'hasDiabetes',
        label: 'Has Diabetes',
        aliases: ['hasdiabetes', 'diabetes', 'type2diabetes', 'type-2-diabetes', 'type 2 diabetes'],
        inputType: 'select',
        options: ['No', 'Yes - Type 1', 'Yes - Type 2', 'Pre-diabetic'],
      },
      {
        id: 'hasGastroparesis',
        label: 'Has Gastroparesis',
        aliases: ['hasgastroparesis', 'gastroparesis'],
        inputType: 'select',
        options: ['No', 'Yes'],
      },
      {
        id: 'hasPancreatitis',
        label: 'Has Pancreatitis',
        aliases: ['haspancreatitis', 'pancreatitis'],
        inputType: 'select',
        options: ['No', 'Yes', 'History of'],
      },
      {
        id: 'hasThyroidCancer',
        label: 'Has Thyroid Cancer',
        aliases: ['hasthyroidcancer', 'thyroidcancer', 'medularythyroid'],
        inputType: 'select',
        options: ['No', 'Yes', 'Family History'],
      },
      {
        id: 'men2History',
        label: 'MEN2 History (GLP-1 Contraindication)',
        aliases: [
          'men2-history',
          'men2history',
          'men2 history',
          'men2historyglp1contraindication',
          'men2 history (glp-1 contraindication)',
        ],
        inputType: 'select',
        options: ['No', 'Yes'],
      },
      {
        id: 'priorBariatricSurgery',
        label: 'Prior Bariatric Surgery',
        aliases: [
          'bariatric',
          'prior-bariatric-surgery',
          'priorbariatricsurgery',
          'prior bariatric surgery',
        ],
        inputType: 'select',
        options: ['No', 'Yes'],
      },
    ],
  },
  {
    title: 'Mental Health',
    icon: Brain,
    editable: true,
    fields: [
      {
        id: 'mentalHealthHistory',
        label: 'Mental Health History',
        aliases: [
          'mentalhealthhistory',
          'mentalhealth',
          'mentalHealthConditions',
          'psychiatrichistory',
          'anxietydepression',
          'mentalhealthdiagnosis',
        ],
        inputType: 'textarea',
        placeholder: 'Mental health history...',
      },
    ],
  },
  {
    title: 'Lifestyle',
    icon: Activity,
    editable: true,
    fields: [
      {
        id: 'activityLevel',
        label: 'Daily Physical Activity',
        aliases: ['activitylevel', 'physicalactivity', 'dailyphysicalactivity'],
        inputType: 'select',
        options: [
          'Sedentary',
          'Lightly Active',
          'Moderately Active',
          'Very Active',
          'Extremely Active',
        ],
      },
      {
        id: 'sleepQuality',
        label: 'Sleep Quality',
        aliases: ['sleep-quality', 'sleepquality', 'sleep quality'],
        inputType: 'select',
        options: ['Poor', 'Fair', 'Pretty good', 'Good', 'Excellent'],
      },
      {
        id: 'alcoholUse',
        label: 'Alcohol Intake',
        aliases: ['alcoholuse', 'alcoholintake', 'alcohol'],
        inputType: 'select',
        options: ['None', 'Occasional', 'Moderate', 'Heavy'],
      },
      {
        id: 'recreationalDrugs',
        label: 'Recreational Drug Use',
        aliases: ['recreationaldrugs', 'recreationaldruguse', 'druguse'],
        inputType: 'select',
        options: ['None', 'Occasional', 'Regular'],
      },
      {
        id: 'weightLossHistory',
        label: 'Weight Loss History',
        aliases: ['weightlosshistory'],
        inputType: 'textarea',
        placeholder: 'Previous weight loss attempts...',
      },
    ],
  },
  {
    title: 'GLP-1 Medications',
    icon: Pill,
    editable: true,
    fields: [
      {
        id: 'glp1History',
        label: 'GLP-1 Medication History',
        aliases: ['glp1history', 'glp1medicationhistory'],
        inputType: 'select',
        options: ['Never Used', 'Currently Using', 'Previously Used'],
      },
      {
        id: 'glp1Last30Days',
        label: 'Used GLP-1 in Last 30 Days',
        aliases: [
          'glp1-last-30',
          'glp1last30',
          'glp1 last 30',
          'used glp-1 in last 30 days',
          'usedglp1inlast30days',
        ],
        inputType: 'select',
        options: ['No', 'Yes'],
      },
      {
        id: 'glp1Type',
        label: 'Recent GLP-1 Medication Type',
        aliases: [
          'glp1type',
          'currentglp1medication',
          'currentglp1',
          'glp1-last-30-medication-type',
          'glp1last30medicationtype',
          'recent glp-1 medication type',
        ],
        inputType: 'select',
        options: [
          'None',
          'Semaglutide (Ozempic/Wegovy)',
          'Tirzepatide (Mounjaro/Zepbound)',
          'Liraglutide (Saxenda)',
          'Other',
        ],
      },
      {
        id: 'medicationPreference',
        label: 'Medication Preference',
        aliases: [
          'medicationpreference',
          'preferred-meds',
          'preferredmeds',
          'preferred medication',
          'preferredmedication',
        ],
        inputType: 'select',
        options: ['No Preference', 'Semaglutide', 'Tirzepatide', 'Other'],
      },
      {
        id: 'injectionPreference',
        label: 'Injection vs Tablet Preference',
        aliases: [
          'injections-tablets',
          'injectionstablets',
          'injection vs tablet preference',
          'injectionvstabletpreference',
        ],
        inputType: 'select',
        options: ['Injections', 'Tablets', 'No Preference'],
      },
      {
        id: 'semaglutideDosage',
        label: 'Semaglutide Dose',
        aliases: [
          'semaglutidedosage',
          'semaglutidedose',
          'glp1-last-30-medication-dose-mg',
          'glp1last30medicationdosemg',
        ],
        inputType: 'text',
        placeholder: 'e.g., 0.5mg weekly',
      },
      {
        id: 'tirzepatideDosage',
        label: 'Tirzepatide Dose',
        aliases: ['tirzepatidedosage', 'tirzepatidedose'],
        inputType: 'text',
        placeholder: 'e.g., 2.5mg weekly',
      },
      {
        id: 'glp1OtherDose',
        label: 'Other GLP-1 Dosing',
        aliases: [
          'glp1-last-30-medication-dose-other',
          'glp1last30medicationdoseother',
          'other glp-1 dosing',
        ],
        inputType: 'text',
        placeholder: 'e.g., custom dose',
      },
      {
        id: 'glp1OtherMedication',
        label: 'Other GLP-1 Medication Name',
        aliases: [
          'glp1-last-30-other-medication-name',
          'glp1last30othermedicationname',
          'other glp-1 medication',
        ],
        inputType: 'text',
        placeholder: 'e.g., medication name',
      },
      {
        id: 'previousSideEffects',
        label: 'Previous Side Effects',
        aliases: ['previoussideeffects', 'sideeffects'],
        inputType: 'textarea',
        placeholder: 'Any side effects experienced...',
      },
      {
        id: 'budgetVsPotency',
        label: 'Budget vs Potency Preference',
        aliases: [
          'affordability-potency',
          'affordabilitypotency',
          'budget vs potency preference',
          'budgetvspotencypreference',
        ],
        inputType: 'select',
        options: ['Budget', 'Potency', 'Balanced'],
      },
    ],
  },
  {
    title: 'Visit Information',
    icon: ClipboardList,
    editable: true,
    fields: [
      {
        id: 'reasonForVisit',
        label: 'Reason for Visit',
        aliases: ['reasonforvisit'],
        inputType: 'textarea',
        placeholder: 'Reason for visit...',
      },
      {
        id: 'chiefComplaint',
        label: 'Chief Complaint',
        aliases: ['chiefcomplaint'],
        inputType: 'textarea',
        placeholder: 'Chief complaint...',
      },
      {
        id: 'healthGoals',
        label: 'Health Goals',
        aliases: [
          'healthgoals',
          'goals',
          'primary-fitness-goal',
          'primaryfitnessgoal',
          'primary fitness goal',
        ],
        inputType: 'textarea',
        placeholder: 'Health goals...',
      },
      {
        id: 'weightLossMotivation',
        label: 'Weight Loss Motivation',
        aliases: ['weight-loss-motivation', 'weightlossmotivation', 'weight loss motivation'],
        inputType: 'textarea',
        placeholder: 'Motivation for weight loss...',
      },
      {
        id: 'motivationLevel',
        label: 'Motivation Level',
        aliases: ['motivation-level', 'motivationlevel', 'motivation level'],
        inputType: 'select',
        options: ['Low', 'Medium', 'High', "I'm ready!"],
      },
      {
        id: 'preferredWeightLossPace',
        label: 'Preferred Weight Loss Pace',
        aliases: [
          'pace',
          'preferred-weight-loss-pace',
          'preferredweightlosspace',
          'preferred weight loss pace',
        ],
        inputType: 'select',
        options: ['Slow and steady', 'Moderate', 'That works for me', 'Aggressive'],
      },
      {
        id: 'additionalInfo',
        label: 'Additional Information',
        aliases: [
          'additional-info',
          'additionalinfo',
          'additional-info-details',
          'additionalinfodetails',
          'additional information to disclose',
          'additionalinformationtodisclose',
        ],
        inputType: 'textarea',
        placeholder: 'Any additional information...',
      },
    ],
  },
  {
    title: 'Referral & Metadata',
    icon: ClipboardList,
    editable: true,
    fields: [
      {
        id: 'referralSource',
        label: 'Referral Source',
        aliases: ['referralsource', 'howdidyouhearaboutus'],
        inputType: 'text',
        placeholder: 'How did they hear about us?',
      },
      {
        id: 'referredBy',
        label: 'Referred By',
        aliases: ['referredby'],
        inputType: 'text',
        placeholder: 'Referred by...',
      },
      {
        id: 'qualified',
        label: 'Qualified Status',
        aliases: ['qualifiedstatus'],
        inputType: 'select',
        options: ['Pending', 'Qualified', 'Not Qualified'],
      },
      {
        id: 'language',
        label: 'Preferred Language',
        aliases: ['preferredlanguage'],
        inputType: 'select',
        options: ['English', 'Spanish', 'French', 'Other'],
      },
      {
        id: 'intakeSource',
        label: 'Intake Source',
        aliases: ['intakesource', 'source'],
        inputType: 'text',
        placeholder: 'Source of intake...',
      },
      {
        id: 'intakeNotes',
        label: 'Intake Notes',
        aliases: ['intakenotes', 'notes'],
        inputType: 'textarea',
        placeholder: 'Additional notes...',
      },
    ],
  },
  {
    title: 'Consent & Acknowledgments',
    icon: Shield,
    editable: false, // Consent records should not be editable
    fields: [
      // HIPAA
      {
        id: 'hipaaConsent',
        label: 'HIPAA Authorization',
        aliases: [
          'hipaaconsent',
          'hipaa',
          'hipaaauthorizationaccepted',
          'hipaa-agreement',
          'hipaagree',
          'hipaa agreement',
        ],
        inputType: 'text',
      },
      // Privacy & Terms
      {
        id: 'privacyPolicyConsent',
        label: 'Privacy Policy',
        aliases: [
          'privacypolicyconsent',
          'privacypolicy',
          'acceptedprivacy',
          'privacypolicyaccepted',
        ],
        inputType: 'text',
      },
      {
        id: 'termsConsent',
        label: 'Terms of Service',
        aliases: ['termsconsent', 'termsandconditions', 'acceptedterms', 'termsofuseaccepted'],
        inputType: 'text',
      },
      // Telehealth & Communication
      {
        id: 'telehealthConsent',
        label: 'Telehealth Consent',
        aliases: ['telehealthconsent', 'telehealth', 'telehealthconsentaccepted'],
        inputType: 'text',
      },
      {
        id: 'smsConsent',
        label: 'SMS Consent',
        aliases: ['smsconsent', 'sms', 'communicationconsent', 'smsconsentaccepted'],
        inputType: 'text',
      },
      {
        id: 'emailConsent',
        label: 'Email Consent',
        aliases: ['emailconsent', 'email', 'emailconsentaccepted'],
        inputType: 'text',
      },
      // Policy & Medical
      {
        id: 'cancellationPolicyConsent',
        label: 'Cancellation Policy',
        aliases: ['cancellationpolicyconsent', 'cancellationpolicy', 'cancellationpolicyaccepted'],
        inputType: 'text',
      },
      {
        id: 'medicalWeightConsent',
        label: 'Weight Loss Treatment',
        aliases: [
          'medicalweightconsent',
          'weightlossconsent',
          'weightlosstreatmentconsentaccepted',
        ],
        inputType: 'text',
      },
      // Legal
      {
        id: 'floridaBillOfRights',
        label: 'Florida Bill of Rights',
        aliases: ['floridabillofrights', 'floridabillofrightsaccepted'],
        inputType: 'text',
      },
      // E-Signature Metadata
      {
        id: 'consentTimestamp',
        label: 'Consent Date/Time',
        aliases: ['consenttimestamp', 'consentdate', 'consenttime', 'timestamp'],
        inputType: 'text',
      },
      {
        id: 'consentIpAddress',
        label: 'IP Address',
        aliases: ['consentipaddress', 'ipaddress', 'ip', 'consentip'],
        inputType: 'text',
      },
      {
        id: 'consentUserAgent',
        label: 'Device/Browser',
        aliases: ['consentuseragent', 'useragent', 'device'],
        inputType: 'text',
      },
      // Geolocation
      {
        id: 'consentCity',
        label: 'City',
        aliases: ['consentcity', 'city'],
        inputType: 'text',
      },
      {
        id: 'consentRegion',
        label: 'State/Region',
        aliases: ['consentregion', 'region', 'state'],
        inputType: 'text',
      },
      {
        id: 'consentCountry',
        label: 'Country',
        aliases: ['consentcountry', 'country'],
        inputType: 'text',
      },
      {
        id: 'consentTimezone',
        label: 'Timezone',
        aliases: ['consenttimezone', 'timezone'],
        inputType: 'text',
      },
      {
        id: 'consentISP',
        label: 'Internet Provider',
        aliases: ['consentisp', 'isp'],
        inputType: 'text',
      },
      // Checkout status
      {
        id: 'checkoutCompleted',
        label: 'Checkout Completed',
        aliases: [
          'checkout completed',
          'checkoutcompleted',
          'checkout-completed',
          'Checkout Completed',
          'Checkout Completed 2',
        ],
        inputType: 'text',
      },
    ],
  },
];

/**
 * Get intake sections for a specific clinic
 *
 * @param clinicSubdomain - The clinic's subdomain (e.g., 'wellmedr', 'eonmeds')
 * @returns The appropriate intake sections configuration
 */
export function getIntakeSectionsForClinic(
  clinicSubdomain?: string | null
): typeof WELLMEDR_INTAKE_SECTIONS {
  // For Wellmedr clinic, use the Wellmedr-specific sections
  if (clinicSubdomain?.toLowerCase() === 'wellmedr') {
    return WELLMEDR_INTAKE_SECTIONS;
  }

  // For all other clinics, return null to use the default sections
  // The component will fall back to its built-in INTAKE_SECTIONS
  return null as any;
}

/**
 * Check if a clinic should use custom intake sections
 *
 * @param clinicSubdomain - The clinic's subdomain
 * @returns true if the clinic has custom sections configured
 */
export function hasCustomIntakeSections(clinicSubdomain?: string | null): boolean {
  return clinicSubdomain?.toLowerCase() === 'wellmedr';
}
