import {
  Activity,
  Droplets,
  Brain,
  Zap,
  Heart,
  Frown,
  Shield,
  CheckCircle,
  Eye,
  Calendar,
  MessageCircle,
  AlertTriangle,
  Phone,
} from 'lucide-react';

export type Step = 'welcome' | 'body-area' | 'symptoms' | 'details' | 'analyzing' | 'result';
export type UrgencyLevel =
  | 'self-care'
  | 'monitor'
  | 'schedule-visit'
  | 'contact-team'
  | 'urgent-care'
  | 'emergency';
export type SymptomSeverity = 'common' | 'moderate' | 'urgent' | 'emergency';

export interface SymptomItem {
  id: string;
  name: string;
  severity: SymptomSeverity;
  description?: string;
}

export interface BodyArea {
  id: string;
  name: string;
  icon: typeof Heart;
  description: string;
  symptoms: SymptomItem[];
}

export interface Assessment {
  urgency: UrgencyLevel;
  title: string;
  summary: string;
  detailedAssessment: string;
  selfCareTips: string[];
  warningSignsToWatch: string[];
  actions: Array<{ label: string; url: string; type: 'primary' | 'secondary' }>;
  followUpTimeframe: string;
}

export const BODY_AREAS: BodyArea[] = [
  {
    id: 'digestive',
    name: 'Stomach & Digestion',
    icon: Activity,
    description: 'Nausea, stomach pain, bowel changes',
    symptoms: [
      { id: 'nausea', name: 'Nausea', severity: 'common', description: 'Feeling sick or queasy' },
      {
        id: 'vomiting',
        name: 'Vomiting',
        severity: 'moderate',
        description: 'Actually throwing up',
      },
      {
        id: 'diarrhea',
        name: 'Diarrhea',
        severity: 'common',
        description: 'Loose or watery stools',
      },
      {
        id: 'constipation',
        name: 'Constipation',
        severity: 'common',
        description: 'Difficulty with bowel movements',
      },
      {
        id: 'stomach_pain',
        name: 'Stomach Pain',
        severity: 'moderate',
        description: 'Aching or cramping in abdomen',
      },
      {
        id: 'bloating',
        name: 'Bloating',
        severity: 'common',
        description: 'Feeling swollen or gassy',
      },
      {
        id: 'acid_reflux',
        name: 'Acid Reflux / Heartburn',
        severity: 'common',
        description: 'Burning feeling in chest/throat',
      },
      {
        id: 'loss_of_appetite',
        name: 'Loss of Appetite',
        severity: 'common',
        description: 'Not feeling hungry at all',
      },
      {
        id: 'severe_stomach_pain',
        name: 'Severe Abdominal Pain',
        severity: 'urgent',
        description: 'Intense, sharp, or radiating pain',
      },
      {
        id: 'blood_in_stool',
        name: 'Blood in Stool',
        severity: 'urgent',
        description: 'Visible blood or black/tarry stool',
      },
    ],
  },
  {
    id: 'injection_site',
    name: 'Injection Site',
    icon: Droplets,
    description: 'Redness, swelling, reactions',
    symptoms: [
      {
        id: 'redness',
        name: 'Redness',
        severity: 'common',
        description: 'Pink or red skin at injection site',
      },
      { id: 'swelling', name: 'Swelling', severity: 'common', description: 'Puffy or raised area' },
      {
        id: 'bruising',
        name: 'Bruising',
        severity: 'common',
        description: 'Blue/purple mark at site',
      },
      {
        id: 'itching',
        name: 'Itching',
        severity: 'common',
        description: 'Itchy feeling around injection',
      },
      {
        id: 'hard_lump',
        name: 'Hard Lump',
        severity: 'moderate',
        description: 'Firm bump under the skin',
      },
      {
        id: 'warmth',
        name: 'Warmth at Site',
        severity: 'moderate',
        description: 'Area feels hot to touch',
      },
      {
        id: 'spreading_redness',
        name: 'Spreading Redness',
        severity: 'urgent',
        description: 'Redness growing beyond injection area',
      },
      {
        id: 'pus_drainage',
        name: 'Pus or Drainage',
        severity: 'urgent',
        description: 'Yellow/green fluid from site',
      },
    ],
  },
  {
    id: 'head_neuro',
    name: 'Head & Neurological',
    icon: Brain,
    description: 'Headaches, dizziness, vision changes',
    symptoms: [
      {
        id: 'headache',
        name: 'Headache',
        severity: 'common',
        description: 'Pain or pressure in head',
      },
      {
        id: 'dizziness',
        name: 'Dizziness',
        severity: 'moderate',
        description: 'Feeling lightheaded or off-balance',
      },
      {
        id: 'brain_fog',
        name: 'Brain Fog',
        severity: 'common',
        description: 'Difficulty concentrating or thinking clearly',
      },
      {
        id: 'vision_changes',
        name: 'Vision Changes',
        severity: 'moderate',
        description: 'Blurry vision or seeing spots',
      },
      {
        id: 'severe_headache',
        name: 'Severe / Worst Headache',
        severity: 'urgent',
        description: 'Worst headache of your life',
      },
    ],
  },
  {
    id: 'energy_body',
    name: 'Energy & Body',
    icon: Zap,
    description: 'Fatigue, muscle pain, weakness',
    symptoms: [
      {
        id: 'fatigue',
        name: 'Fatigue',
        severity: 'common',
        description: 'Feeling unusually tired',
      },
      {
        id: 'weakness',
        name: 'Muscle Weakness',
        severity: 'moderate',
        description: 'Muscles feel weak or heavy',
      },
      {
        id: 'muscle_pain',
        name: 'Muscle or Joint Pain',
        severity: 'common',
        description: 'Aching muscles or joints',
      },
      {
        id: 'hair_changes',
        name: 'Hair Thinning',
        severity: 'common',
        description: 'Noticeable hair loss or thinning',
      },
      {
        id: 'low_blood_sugar',
        name: 'Low Blood Sugar Signs',
        severity: 'moderate',
        description: 'Shakiness, sweating, confusion',
      },
      {
        id: 'fever',
        name: 'Fever',
        severity: 'moderate',
        description: 'Temperature above 100.4°F',
      },
    ],
  },
  {
    id: 'heart_lungs',
    name: 'Heart & Breathing',
    icon: Heart,
    description: 'Heart rate, breathing, chest',
    symptoms: [
      {
        id: 'fast_heart',
        name: 'Rapid Heartbeat',
        severity: 'moderate',
        description: 'Heart racing or pounding',
      },
      {
        id: 'shortness_breath',
        name: 'Shortness of Breath',
        severity: 'moderate',
        description: 'Difficulty catching breath',
      },
      {
        id: 'chest_tightness',
        name: 'Chest Tightness',
        severity: 'urgent',
        description: 'Pressure or squeezing in chest',
      },
      {
        id: 'chest_pain',
        name: 'Chest Pain',
        severity: 'emergency',
        description: 'Pain or discomfort in chest area',
      },
      {
        id: 'difficulty_breathing',
        name: 'Severe Breathing Difficulty',
        severity: 'emergency',
        description: 'Cannot breathe adequately',
      },
    ],
  },
  {
    id: 'mood_mental',
    name: 'Mood & Mental Health',
    icon: Frown,
    description: 'Mood changes, anxiety, sleep',
    symptoms: [
      {
        id: 'mood_changes',
        name: 'Mood Changes',
        severity: 'common',
        description: 'Feeling more emotional than usual',
      },
      {
        id: 'anxiety',
        name: 'Increased Anxiety',
        severity: 'moderate',
        description: 'Excessive worry or nervousness',
      },
      {
        id: 'depression',
        name: 'Feeling Down / Depressed',
        severity: 'moderate',
        description: 'Persistent sadness or hopelessness',
      },
      {
        id: 'sleep_issues',
        name: 'Sleep Problems',
        severity: 'common',
        description: 'Trouble falling or staying asleep',
      },
      {
        id: 'irritability',
        name: 'Irritability',
        severity: 'common',
        description: 'Feeling easily frustrated or angry',
      },
      {
        id: 'suicidal_thoughts',
        name: 'Thoughts of Self-Harm',
        severity: 'emergency',
        description: 'Thoughts of hurting yourself',
      },
    ],
  },
  {
    id: 'skin_allergic',
    name: 'Skin & Allergic',
    icon: Shield,
    description: 'Rashes, hives, allergic reactions',
    symptoms: [
      { id: 'rash', name: 'Skin Rash', severity: 'moderate', description: 'New or unusual rash' },
      { id: 'hives', name: 'Hives', severity: 'moderate', description: 'Raised, itchy welts' },
      {
        id: 'dry_skin',
        name: 'Dry or Flaky Skin',
        severity: 'common',
        description: 'Unusually dry or peeling skin',
      },
      {
        id: 'face_swelling',
        name: 'Face / Throat Swelling',
        severity: 'emergency',
        description: 'Swelling of lips, tongue, or throat',
      },
      {
        id: 'severe_allergic',
        name: 'Severe Allergic Reaction',
        severity: 'emergency',
        description: 'Multiple symptoms: hives + swelling + difficulty breathing',
      },
    ],
  },
];

export const DURATION_OPTIONS = [
  { value: 'just-now', label: 'Just now', sublabel: 'Started within the hour', icon: '⚡' },
  { value: 'today', label: 'Today', sublabel: 'Started earlier today', icon: '🕐' },
  { value: 'few-days', label: 'A few days', sublabel: '2–4 days', icon: '📅' },
  { value: 'week', label: 'About a week', sublabel: '5–7 days', icon: '📆' },
  { value: 'more-than-week', label: '1–4 weeks', sublabel: 'Ongoing for weeks', icon: '🗓️' },
  { value: 'more-than-month', label: 'Over a month', sublabel: 'Long-standing', icon: '📋' },
] as const;

export const SEVERITY_OPTIONS = [
  {
    value: 'mild',
    label: 'Mild',
    sublabel: 'Noticeable but manageable — not affecting daily life much',
    color: 'emerald',
    emoji: '🟢',
  },
  {
    value: 'moderate',
    label: 'Moderate',
    sublabel: 'Uncomfortable and affecting some daily activities',
    color: 'amber',
    emoji: '🟡',
  },
  {
    value: 'severe',
    label: 'Severe',
    sublabel: 'Very difficult to manage — significantly impacting your day',
    color: 'red',
    emoji: '🔴',
  },
] as const;

export const PATTERN_OPTIONS = [
  'Worse after eating',
  'Worse in the morning',
  'Worse at night',
  'Comes and goes',
  'Getting worse over time',
  'Constant / always there',
  'Related to my injection',
  'Started after dose increase',
  'No clear pattern',
] as const;

export const URGENCY_STYLES: Record<
  UrgencyLevel,
  {
    gradient: string;
    bgLight: string;
    text: string;
    border: string;
    icon: typeof CheckCircle;
    label: string;
  }
> = {
  'self-care': {
    gradient: 'from-emerald-500 to-teal-500',
    bgLight: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: CheckCircle,
    label: 'Self-Care',
  },
  monitor: {
    gradient: 'from-sky-500 to-blue-500',
    bgLight: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    icon: Eye,
    label: 'Monitor',
  },
  'schedule-visit': {
    gradient: 'from-blue-500 to-indigo-500',
    bgLight: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: Calendar,
    label: 'Schedule Visit',
  },
  'contact-team': {
    gradient: 'from-amber-500 to-orange-500',
    bgLight: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: MessageCircle,
    label: 'Contact Team',
  },
  'urgent-care': {
    gradient: 'from-orange-500 to-red-500',
    bgLight: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    icon: AlertTriangle,
    label: 'Urgent',
  },
  emergency: {
    gradient: 'from-red-600 to-rose-600',
    bgLight: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: Phone,
    label: 'Emergency',
  },
};

export const STEPS: { key: Step; label: string; number: number }[] = [
  { key: 'body-area', label: 'Area', number: 1 },
  { key: 'symptoms', label: 'Symptoms', number: 2 },
  { key: 'details', label: 'Details', number: 3 },
  { key: 'result', label: 'Results', number: 4 },
];
