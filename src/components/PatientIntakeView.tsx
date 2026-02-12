'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import SendIntakeFormModal from './SendIntakeFormModal';
import {
  FileText,
  Download,
  ChevronDown,
  ChevronUp,
  User,
  Activity,
  Pill,
  Heart,
  Brain,
  ClipboardList,
  Pencil,
  Save,
  X,
  Loader2,
  Check,
  Shield,
} from 'lucide-react';
import { calculateBMI as calcBMI } from '@/lib/calculators/bmi';
import { WELLMEDR_INTAKE_SECTIONS, hasCustomIntakeSections } from '@/lib/wellmedr/intakeSections';
import {
  getOvertimeIntakeSections,
  hasOvertimeIntakeSections,
} from '@/lib/overtime/intakeSections';
import type { OvertimeTreatmentType } from '@/lib/overtime/treatmentTypes';

/** Parse weight string (e.g. "218", "218 lbs") to pounds. */
function parseWeightToLbs(str: string): number | null {
  if (!str || typeof str !== 'string') return null;
  const n = parseFloat(str.replace(/[^0-9.]/g, ''));
  return typeof n === 'number' && !isNaN(n) && n > 0 ? n : null;
}

/** Parse height string (e.g. "5'6\"", "5'8", "68") to inches. */
function parseHeightToInches(str: string): number | null {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  const feetInchMatch = trimmed.match(/(\d+)['']\s*(\d+)/);
  if (feetInchMatch) {
    const feet = parseInt(feetInchMatch[1], 10);
    const inches = parseInt(feetInchMatch[2], 10);
    if (!isNaN(feet) && !isNaN(inches)) return feet * 12 + inches;
  }
  const asNumber = parseFloat(trimmed.replace(/[^0-9.]/g, ''));
  return typeof asNumber === 'number' && !isNaN(asNumber) && asNumber > 0 ? asNumber : null;
}

/**
 * Default intake display sections - maps fields from WeightLossIntake (eonmeds and other clinics)
 *
 * NOTE: For clinic-specific customization, see:
 * - Wellmedr: src/lib/wellmedr/intakeSections.ts
 */
const DEFAULT_INTAKE_SECTIONS = [
  {
    title: 'Patient Profile',
    icon: User,
    editable: false, // Patient profile is edited on the Profile tab
    fields: [
      { id: 'patient-name', label: 'Full Name' },
      { id: 'patient-dob', label: 'Date of Birth' },
      { id: 'patient-gender', label: 'Gender' },
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
        aliases: ['startingweight', 'currentweight'],
        inputType: 'text',
        placeholder: 'e.g., 180 lbs',
      },
      {
        id: 'idealWeight',
        label: 'Ideal Weight',
        aliases: ['idealweight', 'goalweight', 'targetweight'],
        inputType: 'text',
        placeholder: 'e.g., 150 lbs',
      },
      { id: 'height', label: 'Height', aliases: [], inputType: 'text', placeholder: 'e.g., 5\'8"' },
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
        aliases: ['bloodpressure', 'bp'],
        inputType: 'text',
        placeholder: 'e.g., 120/80',
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
        aliases: ['medicalconditions', 'conditions'],
        inputType: 'textarea',
        placeholder: 'List any medical conditions...',
      },
      {
        id: 'currentMedications',
        label: 'Current Medications',
        aliases: ['currentmedications', 'medications'],
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
        aliases: ['surgicalhistory', 'surgeries'],
        inputType: 'textarea',
        placeholder: 'List any surgeries...',
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
        aliases: ['pregnancystatus', 'pregnant'],
        inputType: 'select',
        options: ['Not Pregnant', 'Pregnant', 'Trying to Conceive', 'N/A'],
      },
      {
        id: 'hasDiabetes',
        label: 'Has Diabetes',
        aliases: ['hasdiabetes', 'diabetes', 'type2diabetes'],
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
        id: 'glp1Type',
        label: 'Current GLP-1 Medication',
        aliases: ['glp1type', 'currentglp1medication', 'currentglp1'],
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
        aliases: ['medicationpreference'],
        inputType: 'select',
        options: ['No Preference', 'Semaglutide', 'Tirzepatide', 'Other'],
      },
      {
        id: 'semaglutideDosage',
        label: 'Semaglutide Dose',
        aliases: ['semaglutidedosage', 'semaglutidedose'],
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
        id: 'previousSideEffects',
        label: 'Previous Side Effects',
        aliases: ['previoussideeffects', 'sideeffects'],
        inputType: 'textarea',
        placeholder: 'Any side effects experienced...',
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
        aliases: ['healthgoals', 'goals'],
        inputType: 'textarea',
        placeholder: 'Health goals...',
      },
    ],
  },
  {
    title: 'Referral & Promo Code',
    icon: ClipboardList,
    editable: true,
    fields: [
      {
        id: 'affiliateCode',
        label: 'Affiliate Code',
        aliases: [
          'affiliatecode',
          'affiliate-code',
          'promocode',
          'promo-code',
          'influencercode',
          'influencer-code',
          'whorecommended',
          'whorecommendedus',
        ],
        inputType: 'text',
        placeholder: 'Affiliate/promo code...',
      },
      {
        id: 'referralSource',
        label: 'How Did You Hear About Us?',
        aliases: ['referralsource', 'howdidyouhearaboutus', 'howdidyouhear'],
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
        aliases: ['intakesource'],
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
      // HIPAA & Legal
      {
        id: 'hipaaConsent',
        label: 'HIPAA Authorization',
        aliases: ['hipaaconsent', 'hipaa', 'hipaaauthorizationaccepted'],
        inputType: 'text',
      },
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
      { id: 'consentCity', label: 'City', aliases: ['consentcity', 'city'], inputType: 'text' },
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
    ],
  },
];

type IntakeData = {
  submissionId?: string;
  submittedAt?: Date;
  receivedAt?: string;
  source?: string;
  treatmentType?: string;
  treatment_type?: string;
  treatment?: { type?: string };
  sections?: Array<{
    title: string;
    entries: Array<{ id?: string; label?: string; value?: any }>;
  }>;
  answers?: Array<{ id?: string; label?: string; value?: any }>;
  patient?: any;
  // E-Signature and consent metadata fields
  ipAddress?: string;
  userAgent?: string;
  consentTimestamp?: string;
  geoLocation?: {
    ip?: string;
    city?: string;
    region?: string;
    regionCode?: string;
    country?: string;
    countryCode?: string;
    timezone?: string;
    isp?: string;
  };
  consentData?: {
    // Privacy & Terms
    privacyPolicyConsent?: boolean | string;
    termsConsent?: boolean | string;
    // Telehealth & Communication
    telehealthConsent?: boolean | string;
    smsConsent?: boolean | string;
    emailConsent?: boolean | string;
    // Policy & Medical
    cancellationPolicyConsent?: boolean | string;
    medicalWeightConsent?: boolean | string;
    // HIPAA & Legal
    hipaaConsent?: boolean | string;
    floridaBillOfRights?: boolean | string;
    // Metadata
    timestamp?: string;
    ipAddress?: string;
    userAgent?: string;
    geoLocation?: {
      ip?: string;
      city?: string;
      region?: string;
      regionCode?: string;
      country?: string;
      countryCode?: string;
      timezone?: string;
      isp?: string;
    };
    signatures?: string;
  };
};

type Props = {
  patient: {
    id: number;
    patientId?: string | null;
    firstName: string;
    lastName: string;
    dob: string;
    gender: string;
    phone: string;
    email: string;
    address1: string;
    address2?: string | null;
    city: string;
    state: string;
    zip: string;
  };
  documents: Array<{
    id: number;
    createdAt: Date;
    filename: string;
    mimeType: string;
    sourceSubmissionId: string | null;
    category: string;
    externalUrl: string | null;
    data?: any;
    intakeData?: any;
  }>;
  intakeFormSubmissions?: Array<{
    id: number;
    createdAt: Date;
    completedAt?: Date | null;
    status: string;
    template: {
      id: number;
      name: string;
      description?: string | null;
      treatmentType: string;
    };
    responses: Array<{
      id: number;
      questionId: number;
      answer?: string | null;
      value?: string | null;
      question: {
        id: number;
        questionText: string;
        questionType: string;
        section?: string | null;
        isRequired: boolean;
      };
    }>;
  }>;
  /**
   * Clinic subdomain for clinic-specific field mappings
   * - 'wellmedr': Uses Wellmedr-specific sections from src/lib/wellmedr/intakeSections.ts
   * - 'ot': Uses Overtime sections from src/lib/overtime/intakeSections.ts
   * - Other clinics: Uses default sections (eonmeds structure)
   */
  clinicSubdomain?: string | null;
  /**
   * Fallback when clinicSubdomain is null (e.g. patient.clinic not loaded) but clinic is known.
   * Set when patient.clinicId matches OVERTIME_CLINIC_ID or WELLMEDR_CLINIC_ID.
   */
  fallbackSubdomainForSections?: string | null;
};

// Helper to normalize keys for matching
const normalizeKey = (value?: string) => {
  if (!value) return '';
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
};

// Helper to format answer values for display
const formatAnswerValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';

  let cleanValue = String(value)
    .replace(/\u00e2\u0080\u0099/g, "'")
    .replace(/\u00e2\u0080\u009c/g, '"')
    .replace(/\u00e2\u0080\u009d/g, '"')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim();

  // Try to parse JSON values
  try {
    const parsed = JSON.parse(cleanValue);
    if (typeof parsed === 'object' && parsed !== null) {
      if ('checked' in parsed) return parsed.checked ? 'Yes' : 'No';
      if (Array.isArray(parsed)) {
        return (
          parsed.filter((item: any) => item && item !== 'None of the above').join(', ') || 'None'
        );
      }
      return Object.entries(parsed)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    }
  } catch {
    // Not JSON
  }

  if (cleanValue === 'true' || cleanValue === 'True') return 'Yes';
  if (cleanValue === 'false' || cleanValue === 'False') return 'No';

  return cleanValue.replace(/\s+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
};

// Helper to get raw value for editing
const getRawValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '' || value === '—') return '';
  return String(value).trim();
};

// Helper to format consent values with timestamp
const formatConsentValue = (value: boolean | string, timestamp?: string): string => {
  const accepted =
    value === true ||
    value === 'true' ||
    value === 'Yes' ||
    value === 'yes' ||
    value === 'Accepted';
  if (accepted) {
    return timestamp ? `Accepted on ${timestamp}` : 'Accepted';
  }
  return String(value);
};

export default function PatientIntakeView({
  patient,
  documents,
  intakeFormSubmissions = [],
  clinicSubdomain,
  fallbackSubdomainForSections,
}: Props) {
  const router = useRouter();

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(DEFAULT_INTAKE_SECTIONS.map((s) => s.title))
  );
  const [showSendModal, setShowSendModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  // Find and parse the latest intake document
  const intakeDoc = documents.find(
    (doc: any) => doc.category === 'MEDICAL_INTAKE_FORM' && (doc.intakeData || doc.data)
  );

  // Parse intake data and extract treatment type
  const { intakeData, treatmentType } = useMemo(() => {
    let parsed: IntakeData = {};
    let treatment: OvertimeTreatmentType | null = null;

    if (intakeDoc) {
      if (intakeDoc.intakeData) {
        try {
          parsed =
            typeof intakeDoc.intakeData === 'string'
              ? JSON.parse(intakeDoc.intakeData)
              : intakeDoc.intakeData;
        } catch (error: any) {
          logger.error('Error parsing intakeData field:', error);
        }
      } else if (intakeDoc.data) {
        try {
          let rawData = intakeDoc.data;

          // Handle various buffer/array formats (Prisma 6.x returns Uint8Array)
          if (rawData instanceof Uint8Array) {
            rawData = new TextDecoder().decode(rawData);
          } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(rawData)) {
            rawData = rawData.toString('utf8');
          } else if (
            typeof rawData === 'object' &&
            rawData?.type === 'Buffer' &&
            Array.isArray(rawData.data)
          ) {
            rawData = new TextDecoder().decode(new Uint8Array(rawData.data));
          }

          // Parse or use directly
          if (typeof rawData === 'string') {
            const trimmed = rawData.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              parsed = JSON.parse(trimmed);
            }
          } else if (typeof rawData === 'object' && rawData !== null) {
            // Already parsed by page.tsx
            parsed = rawData as IntakeData;
          }
        } catch (error: any) {
          logger.debug('Data field does not contain valid JSON');
        }
      }

      // Extract treatment type from parsed data
      // Check multiple possible field names
      const rawTreatment =
        (parsed as any).treatmentType ||
        (parsed as any).treatment_type ||
        (parsed as any).treatment?.type;

      if (rawTreatment && typeof rawTreatment === 'string') {
        // Validate it's a known Overtime treatment type
        const validTypes: OvertimeTreatmentType[] = [
          'weight_loss',
          'peptides',
          'nad_plus',
          'better_sex',
          'testosterone',
          'baseline_bloodwork',
        ];
        if (validTypes.includes(rawTreatment as OvertimeTreatmentType)) {
          treatment = rawTreatment as OvertimeTreatmentType;
        }
      }
    }

    return { intakeData: parsed, treatmentType: treatment };
  }, [intakeDoc]);

  // Select the appropriate intake sections based on clinic and treatment type
  // Wellmedr and Overtime use custom field mappings; other clinics use default
  // Fallback: when clinicSubdomain is null (e.g. patient.clinic missing) but clinic is known via OVERTIME_CLINIC_ID
  const effectiveSubdomain = clinicSubdomain ?? fallbackSubdomainForSections ?? null;
  const activeSections = useMemo(() => {
    // Check for Wellmedr clinic
    if (hasCustomIntakeSections(effectiveSubdomain)) {
      return WELLMEDR_INTAKE_SECTIONS;
    }
    // Check for Overtime Men's Clinic - use treatment-specific sections
    if (hasOvertimeIntakeSections(effectiveSubdomain)) {
      return getOvertimeIntakeSections(treatmentType);
    }
    return DEFAULT_INTAKE_SECTIONS;
  }, [effectiveSubdomain, treatmentType]);

  // Build a map of all answers from various sources
  const buildAnswerMap = useCallback(() => {
    const answerMap = new Map<string, string>();

    if (intakeData.sections && Array.isArray(intakeData.sections)) {
      for (const section of intakeData.sections) {
        if (section.entries && Array.isArray(section.entries)) {
          for (const entry of section.entries) {
            if (entry.id) answerMap.set(normalizeKey(entry.id), formatAnswerValue(entry.value));
            if (entry.label)
              answerMap.set(normalizeKey(entry.label), formatAnswerValue(entry.value));
          }
        }
      }
    }

    if (intakeData.answers && Array.isArray(intakeData.answers)) {
      for (const answer of intakeData.answers) {
        if (answer.id) answerMap.set(normalizeKey(answer.id), formatAnswerValue(answer.value));
        if (answer.label)
          answerMap.set(normalizeKey(answer.label), formatAnswerValue(answer.value));
      }
    }

    for (const submission of intakeFormSubmissions) {
      if (submission.responses && Array.isArray(submission.responses)) {
        for (const response of submission.responses) {
          const value = response.answer || response.value;
          if (response.question?.questionText) {
            answerMap.set(normalizeKey(response.question.questionText), formatAnswerValue(value));
          }
        }
      }
    }

    // Add consent and metadata from intakeData (Wellmedr/other webhooks store at top level)
    if (intakeData.receivedAt) {
      answerMap.set(normalizeKey('consentTimestamp'), intakeData.receivedAt);
      answerMap.set(normalizeKey('consentDateTime'), intakeData.receivedAt);
    }
    if (intakeData.submissionId) {
      answerMap.set(normalizeKey('intakeId'), intakeData.submissionId);
      answerMap.set(normalizeKey('submissionId'), intakeData.submissionId);
    }
    if (intakeData.checkoutCompleted !== undefined) {
      const val = intakeData.checkoutCompleted;
      const display =
        val === true || val === 'true' || val === 'Yes' ? 'Yes' : val === false || val === 'false' ? 'No' : String(val);
      answerMap.set(normalizeKey('checkoutCompleted'), display);
      answerMap.set(normalizeKey('Checkout Completed'), display);
    }
    if (intakeData.ipAddress) {
      answerMap.set(normalizeKey('consentIpAddress'), intakeData.ipAddress);
      answerMap.set(normalizeKey('ipAddress'), intakeData.ipAddress);
    }
    if (intakeData.userAgent) {
      answerMap.set(normalizeKey('consentUserAgent'), intakeData.userAgent);
      answerMap.set(normalizeKey('userAgent'), intakeData.userAgent);
    }

    // Handle geolocation data
    const geo = intakeData.geoLocation || intakeData.consentData?.geoLocation;
    if (geo) {
      if (geo.ip) answerMap.set(normalizeKey('consentIpAddress'), geo.ip);
      if (geo.city) answerMap.set(normalizeKey('consentCity'), geo.city);
      if (geo.region) answerMap.set(normalizeKey('consentRegion'), geo.region);
      if (geo.regionCode) answerMap.set(normalizeKey('consentRegionCode'), geo.regionCode);
      if (geo.country) answerMap.set(normalizeKey('consentCountry'), geo.country);
      if (geo.countryCode) answerMap.set(normalizeKey('consentCountryCode'), geo.countryCode);
      if (geo.timezone) answerMap.set(normalizeKey('consentTimezone'), geo.timezone);
      if (geo.isp) answerMap.set(normalizeKey('consentISP'), geo.isp);
    }

    // Handle consentData object if present
    if (intakeData.consentData) {
      const cd = intakeData.consentData;
      const ts = cd.timestamp || intakeData.receivedAt;

      // Privacy & Terms
      if (cd.privacyPolicyConsent)
        answerMap.set(
          normalizeKey('privacyPolicyConsent'),
          formatConsentValue(cd.privacyPolicyConsent, ts)
        );
      if (cd.termsConsent)
        answerMap.set(normalizeKey('termsConsent'), formatConsentValue(cd.termsConsent, ts));

      // Telehealth & Communication
      if (cd.telehealthConsent)
        answerMap.set(
          normalizeKey('telehealthConsent'),
          formatConsentValue(cd.telehealthConsent, ts)
        );
      if (cd.smsConsent)
        answerMap.set(normalizeKey('smsConsent'), formatConsentValue(cd.smsConsent, ts));
      if (cd.emailConsent)
        answerMap.set(normalizeKey('emailConsent'), formatConsentValue(cd.emailConsent, ts));

      // Policy & Medical
      if (cd.cancellationPolicyConsent)
        answerMap.set(
          normalizeKey('cancellationPolicyConsent'),
          formatConsentValue(cd.cancellationPolicyConsent, ts)
        );
      if (cd.medicalWeightConsent)
        answerMap.set(
          normalizeKey('medicalWeightConsent'),
          formatConsentValue(cd.medicalWeightConsent, ts)
        );

      // HIPAA & Legal
      if (cd.hipaaConsent)
        answerMap.set(normalizeKey('hipaaConsent'), formatConsentValue(cd.hipaaConsent, ts));
      if (cd.floridaBillOfRights)
        answerMap.set(
          normalizeKey('floridaBillOfRights'),
          formatConsentValue(cd.floridaBillOfRights, ts)
        );

      // Metadata
      if (cd.timestamp) answerMap.set(normalizeKey('consentTimestamp'), cd.timestamp);
      if (cd.ipAddress) answerMap.set(normalizeKey('consentIpAddress'), cd.ipAddress);
      if (cd.userAgent) answerMap.set(normalizeKey('consentUserAgent'), cd.userAgent);
    }

    return answerMap;
  }, [intakeData, intakeFormSubmissions]);

  const answerMap = buildAnswerMap();

  // Fields that should default to "No" when not present in the intake
  // (because a previous question filtered them out or they weren't asked)
  const FIELDS_DEFAULTING_TO_NO = new Set([
    'hasdiabetes',
    'hasgastroparesis',
    'haspancreatitis',
    'hasthyroidcancer',
    'diabetes',
    'gastroparesis',
    'pancreatitis',
    'thyroidcancer',
    'type2diabetes',
    'medularythyroid',
  ]);

  // Fields that should default to "None" when not present
  const FIELDS_DEFAULTING_TO_NONE = new Set([
    'currentmedications',
    'medications',
    'allergies',
    'allergy',
  ]);

  // Consent fields that should show "Accepted" with timestamp when intake exists
  const CONSENT_FIELDS = new Set([
    'telehealthconsent',
    'privacypolicyconsent',
    'termsconsent',
    'smsconsent',
    'emailconsent',
    'cancellationpolicyconsent',
    'medicalweightconsent',
    'hipaaconsent',
    'floridabillofrights',
    'informedconsent',
    'patientacknowledgment',
  ]);

  // Find answer for a field
  const findAnswer = (field: { id: string; label: string; aliases?: string[] }): string => {
    const byId = answerMap.get(normalizeKey(field.id));
    if (byId && byId !== '—') return byId;

    const byLabel = answerMap.get(normalizeKey(field.label));
    if (byLabel && byLabel !== '—') return byLabel;

    if (field.aliases) {
      for (const alias of field.aliases) {
        const byAlias = answerMap.get(normalizeKey(alias));
        if (byAlias && byAlias !== '—') return byAlias;
      }
    }

    // Apply default values for fields that should have them
    const normalizedId = normalizeKey(field.id);
    if (FIELDS_DEFAULTING_TO_NO.has(normalizedId)) {
      return 'No';
    }
    if (FIELDS_DEFAULTING_TO_NONE.has(normalizedId)) {
      return 'None';
    }
    // For consent fields, show "Accepted" with timestamp if we have intake data
    if (CONSENT_FIELDS.has(normalizedId) && intakeData.receivedAt) {
      return `Accepted on ${intakeData.receivedAt}`;
    }

    return '—';
  };

  // Get patient profile data
  const getPatientValue = (fieldId: string): string => {
    switch (fieldId) {
      case 'patient-name':
        return `${patient.firstName} ${patient.lastName}`;
      case 'patient-dob':
        return formatDob(patient.dob);
      case 'patient-gender':
        return formatGender(patient.gender);
      case 'patient-phone':
        return patient.phone || '—';
      case 'patient-email':
        return patient.email || '—';
      case 'patient-address':
        return buildAddress();
      default:
        return '—';
    }
  };

  const formatDob = (dob: string) => {
    if (!dob) return '—';
    if (dob.includes('/')) return dob;
    const parts = dob.split('-');
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    return dob;
  };

  const formatGender = (gender?: string | null) => {
    if (!gender) return '—';
    const g = gender.toLowerCase().trim();
    if (g === 'f' || g === 'female' || g === 'woman') return 'Female';
    if (g === 'm' || g === 'male' || g === 'man') return 'Male';
    return gender;
  };

  const buildAddress = () => {
    const parts = [
      patient.address1,
      patient.address2,
      [patient.city, patient.state].filter(Boolean).join(', '),
      patient.zip,
    ].filter(Boolean);
    return parts.join(', ') || '—';
  };

  const toggleSection = (title: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(title)) {
      newExpanded.delete(title);
    } else {
      newExpanded.add(title);
    }
    setExpandedSections(newExpanded);
  };

  // Get edited value or original
  const getFieldValue = (field: { id: string; label: string; aliases?: string[] }): string => {
    if (isEditing && field.id in editedValues) {
      return editedValues[field.id];
    }
    const answer = findAnswer(field);
    return getRawValue(answer);
  };

  // Handle field change (auto-calculate BMI when height or weight changes)
  const handleFieldChange = (fieldId: string, value: string) => {
    setEditedValues((prev) => {
      const next = { ...prev, [fieldId]: value };
      if (fieldId !== 'weight' && fieldId !== 'height') return next;

      const allFields = activeSections.flatMap((s) => s.fields);
      const weightField = allFields.find((f) => f.id === 'weight');
      const heightField = allFields.find((f) => f.id === 'height');
      const weightStr =
        fieldId === 'weight' ? value : (prev.weight ?? (weightField ? getRawValue(findAnswer(weightField)) : ''));
      const heightStr =
        fieldId === 'height' ? value : (prev.height ?? (heightField ? getRawValue(findAnswer(heightField)) : ''));

      const weightLbs = parseWeightToLbs(weightStr);
      const heightInches = parseHeightToInches(heightStr);
      if (weightLbs != null && heightInches != null) {
        const bmi = calcBMI(weightLbs, heightInches);
        next.bmi = bmi > 0 ? String(bmi) : '';
      }
      return next;
    });
  };

  // Start editing
  const startEditing = () => {
    // Pre-populate edited values with current values
    const currentValues: Record<string, string> = {};
    for (const section of activeSections) {
      if (section.editable) {
        for (const field of section.fields) {
          const value = findAnswer(field);
          currentValues[field.id] = getRawValue(value);
        }
      }
    }
    setEditedValues(currentValues);
    setIsEditing(true);
    setSaveError(null);
    setSaveSuccess(false);
  };

  // Cancel editing
  const cancelEditing = () => {
    setIsEditing(false);
    setEditedValues({});
    setSaveError(null);
  };

  // Save changes
  const saveChanges = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const response = await fetch(`/api/patients/${patient.id}/intake`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: editedValues }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save');
      }

      // Show success message
      setSaveSuccess(true);
      setIsSaving(false);

      // Hard refresh to reload from server (bypass Next.js cache)
      setTimeout(() => {
        window.location.href = window.location.href;
      }, 500);
    } catch (error: any) {
      setSaveError(error.message || 'Failed to save intake data');
      setIsSaving(false);
    }
  };

  // Collect any additional answers not in our predefined sections
  // Uses activeSections which is clinic-specific (Wellmedr vs default)
  const getAdditionalAnswers = () => {
    const usedKeys = new Set<string>();

    for (const section of activeSections) {
      for (const field of section.fields) {
        usedKeys.add(normalizeKey(field.id));
        usedKeys.add(normalizeKey(field.label));
        if ('aliases' in field && field.aliases) {
          for (const alias of field.aliases) {
            usedKeys.add(normalizeKey(alias));
          }
        }
      }
    }

    const additional: Array<{ label: string; value: string }> = [];

    if (intakeData.sections) {
      for (const section of intakeData.sections) {
        if (section.entries) {
          for (const entry of section.entries) {
            const key = normalizeKey(entry.id || entry.label);
            if (!usedKeys.has(key) && entry.value) {
              additional.push({
                label: entry.label || entry.id || 'Unknown Field',
                value: formatAnswerValue(entry.value),
              });
              usedKeys.add(key);
            }
          }
        }
      }
    }

    if (intakeData.answers) {
      for (const answer of intakeData.answers) {
        const key = normalizeKey(answer.id || answer.label);
        if (!usedKeys.has(key) && answer.value) {
          additional.push({
            label: answer.label || answer.id || 'Unknown Field',
            value: formatAnswerValue(answer.value),
          });
          usedKeys.add(key);
        }
      }
    }

    return additional;
  };

  const additionalAnswers = getAdditionalAnswers();
  const hasIntakeData = intakeDoc || intakeFormSubmissions.length > 0;

  // Render field input based on type
  const renderFieldInput = (field: any, value: string) => {
    const inputType = field.inputType || 'text';

    if (inputType === 'select' && field.options) {
      return (
        <select
          value={value}
          onChange={(e) => handleFieldChange(field.id, e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
        >
          <option value="">Select...</option>
          {field.options.map((opt: string) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (inputType === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={(e) => handleFieldChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          rows={2}
          className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
        />
      );
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(e) => handleFieldChange(field.id, e.target.value)}
        placeholder={field.placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]"
      />
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Medical Intake</h1>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={cancelEditing}
                disabled={isSaving}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                onClick={saveChanges}
                disabled={isSaving}
                className="flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 text-sm font-medium text-white hover:bg-[#3f8660] disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              {intakeDoc?.externalUrl && (
                <a
                  href={intakeDoc.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </a>
              )}
              <button
                onClick={startEditing}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Pencil className="h-4 w-4" />
                Edit Intake
              </button>
              <button
                onClick={() => setShowSendModal(true)}
                className="flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 text-sm font-medium text-white hover:bg-[#3f8660]"
              >
                <FileText className="h-4 w-4" />
                Send New Intake
              </button>
            </>
          )}
        </div>
      </div>

      {/* Save Success */}
      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <Check className="h-4 w-4" />
          <span>Intake data saved successfully! Refreshing...</span>
        </div>
      )}

      {/* Save Error */}
      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>Error:</strong> {saveError}
        </div>
      )}

      {/* Submission Info */}
      {intakeData.submissionId && !isEditing && (
        <div className="rounded-lg border border-[#13a97b]/30 bg-[#f6f2a2] p-4">
          <div className="flex flex-wrap gap-4 text-sm text-gray-700">
            <span>
              <strong>Submission ID:</strong> {intakeData.submissionId}
            </span>
            {intakeData.source && (
              <span>
                <strong>Source:</strong> {intakeData.source}
              </span>
            )}
            {intakeData.receivedAt && (
              <span suppressHydrationWarning>
                <strong>Received:</strong> {new Date(intakeData.receivedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Edit Mode Notice */}
      {isEditing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Edit Mode:</strong> Make changes to intake fields below. Patient Profile is edited
          on the Profile tab.
        </div>
      )}

      {!hasIntakeData && !isEditing ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-2 text-lg font-medium text-gray-900">No Intake Form Submitted</h3>
          <p className="mb-4 text-gray-500">This patient has not completed an intake form yet.</p>
          <div className="flex justify-center gap-2">
            <button
              onClick={startEditing}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="mr-2 inline h-4 w-4" />
              Enter Manually
            </button>
            <button
              onClick={() => setShowSendModal(true)}
              className="rounded-lg bg-[#4fa77e] px-4 py-2 text-sm font-medium text-white hover:bg-[#3f8660]"
            >
              Send Intake Form
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Predefined Sections - uses clinic-specific configuration for Wellmedr */}
          {activeSections.map((section) => {
            const Icon = section.icon;
            const isExpanded = expandedSections.has(section.title);
            const isPatientProfile = section.title === 'Patient Profile';
            const isSectionEditable = section.editable && isEditing;

            return (
              <div
                key={section.title}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
              >
                <button
                  onClick={() => toggleSection(section.title)}
                  className="flex w-full items-center justify-between p-4 transition-colors hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full ${
                        isSectionEditable ? 'bg-amber-100' : 'bg-[#4fa77e]/10'
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 ${isSectionEditable ? 'text-amber-600' : 'text-[#4fa77e]'}`}
                      />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
                    {isSectionEditable && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        Editing
                      </span>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <div className="divide-y divide-gray-100">
                      {section.fields.map((field: any) => {
                        const displayValue = isPatientProfile
                          ? getPatientValue(field.id)
                          : findAnswer(field);
                        const editValue = getFieldValue(field);
                        const hasValue = displayValue !== '—';

                        return (
                          <div key={field.id} className="flex items-start px-6 py-3">
                            <div className="w-1/3 pt-2 text-sm text-gray-500">{field.label}</div>
                            <div className="w-2/3">
                              {isSectionEditable ? (
                                renderFieldInput(field, editValue)
                              ) : (
                                <div
                                  className={`pt-2 text-sm ${hasValue ? 'text-gray-900' : 'text-gray-400'}`}
                                >
                                  {displayValue}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Additional Responses (not in predefined sections) */}
          {additionalAnswers.length > 0 && !isEditing && (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <button
                onClick={() => toggleSection('Additional Responses')}
                className="flex w-full items-center justify-between p-4 transition-colors hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
                    <ClipboardList className="h-5 w-5 text-purple-600" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">Additional Responses</h2>
                  <span className="text-sm text-gray-500">({additionalAnswers.length} items)</span>
                </div>
                {expandedSections.has('Additional Responses') ? (
                  <ChevronUp className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                )}
              </button>

              {expandedSections.has('Additional Responses') && (
                <div className="border-t border-gray-100">
                  <div className="divide-y divide-gray-100">
                    {additionalAnswers.map((item, idx) => (
                      <div key={idx} className="flex px-6 py-3">
                        <div className="w-1/3 text-sm text-gray-500">{item.label}</div>
                        <div className="w-2/3 text-sm text-gray-900">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Send Intake Form Modal */}
      {showSendModal && (
        <SendIntakeFormModal patient={patient} onClose={() => setShowSendModal(false)} />
      )}
    </div>
  );
}
