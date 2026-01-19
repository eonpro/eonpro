"use client";

import { useState } from 'react';
import { logger } from '@/lib/logger';
import SendIntakeFormModal from './SendIntakeFormModal';
import { FileText, Download, ChevronDown, ChevronUp, User, Activity, Pill, Heart, Brain, ClipboardList } from 'lucide-react';

// Complete intake field configuration - ALL questions
const INTAKE_SECTIONS = [
  {
    title: "Patient Profile",
    icon: User,
    fields: [
      { id: "patient-name", label: "Full Name" },
      { id: "patient-dob", label: "Date of Birth" },
      { id: "patient-gender", label: "Gender" },
      { id: "patient-phone", label: "Phone" },
      { id: "patient-email", label: "Email" },
      { id: "patient-address", label: "Address" },
    ],
  },
  {
    title: "Vitals & Goals",
    icon: Activity,
    fields: [
      { id: "id-703227a8", label: "Starting Weight", aliases: ["weight", "current weight", "starting weight"] },
      { id: "id-cf20e7c9", label: "Ideal Weight", aliases: ["ideal weight", "goal weight", "target weight"] },
      { id: "id-3a7e6f11", label: "Height (feet)", aliases: ["height feet", "heightfeet"] },
      { id: "id-4a4a1f48", label: "Height (inches)", aliases: ["height inches", "heightinches"] },
      { id: "bmi", label: "BMI", aliases: ["bmi", "body mass index"] },
      { id: "lbs to lose", label: "Pounds to Lose", aliases: ["lbs to lose", "pounds to lose", "weight to lose"] },
    ],
  },
  {
    title: "Medical History",
    icon: Heart,
    fields: [
      { id: "id-c6194df4", label: "Chronic Diseases History", aliases: ["chronic diseases", "chronic illness history"] },
      { id: "id-2ce042cd", label: "Chronic Illness", aliases: ["chronic illness", "chronic condition"] },
      { id: "id-481f7d3f", label: "Chronic Illness Details", aliases: ["chronic illness details"] },
      { id: "id-aa863a43", label: "Current Conditions", aliases: ["current conditions", "medical conditions"] },
      { id: "id-49e5286f", label: "Family History", aliases: ["family history", "family medical history"] },
      { id: "id-88c19c78", label: "Medullary Thyroid Cancer History", aliases: ["thyroid cancer", "medullary thyroid"] },
      { id: "id-4bacb2db", label: "MEN Type-2 History", aliases: ["men type 2", "men type-2"] },
      { id: "id-eee84ce3", label: "Gastroparesis History", aliases: ["gastroparesis"] },
      { id: "id-22f7904b", label: "Type 2 Diabetes", aliases: ["type 2 diabetes", "diabetes"] },
      { id: "id-4dce53c7", label: "Pregnant or Breastfeeding", aliases: ["pregnant", "breastfeeding", "pregnancy"] },
      { id: "id-ddff6d53", label: "Surgeries or Procedures", aliases: ["surgeries", "procedures", "surgical history"] },
      { id: "mc-819b3225", label: "Blood Pressure", aliases: ["blood pressure", "bp"] },
      { id: "id-c4320836", label: "Weight Loss Procedures", aliases: ["weight loss procedures", "bariatric"] },
      { id: "id-3e6b8a5b", label: "Allergies", aliases: ["allergies", "allergy"] },
      { id: "id-04e1c88e", label: "List of Allergies", aliases: ["list of allergies", "allergy list"] },
    ],
  },
  {
    title: "Mental Health",
    icon: Brain,
    fields: [
      { id: "id-d79f4058", label: "Mental Health Diagnosis", aliases: ["mental health diagnosis", "mental health"] },
      { id: "id-2835be1b", label: "Mental Health Details", aliases: ["mental health details"] },
    ],
  },
  {
    title: "Lifestyle & Activity",
    icon: Activity,
    fields: [
      { id: "id-74efb442", label: "Daily Physical Activity", aliases: ["physical activity", "exercise", "activity level"] },
      { id: "id-d560c374", label: "Alcohol Intake", aliases: ["alcohol", "alcohol intake", "drinking"] },
    ],
  },
  {
    title: "Medications & GLP-1 History",
    icon: Pill,
    fields: [
      { id: "id-d2f1eaa4", label: "GLP-1 Medication History", aliases: ["glp-1 history", "glp1 history", "medication history"] },
      { id: "id-c5f1c21a", label: "Current GLP-1 Medication", aliases: ["current glp-1", "current medication"] },
      { id: "id-6a9fff95", label: "Side Effects When Starting Medication", aliases: ["side effects starting", "initial side effects"] },
      { id: "id-4b98a487", label: "Interested in Personalized Plan for Side Effects", aliases: ["personalized plan", "side effects plan"] },
      { id: "id-5001f3ff", label: "Semaglutide Dose", aliases: ["semaglutide dose", "semaglutide dosage"] },
      { id: "id-9d592571", label: "Semaglutide Side Effects", aliases: ["semaglutide side effects"] },
      { id: "id-5e696841", label: "Semaglutide Success", aliases: ["semaglutide success", "semaglutide results"] },
      { id: "id-57f65753", label: "Tirzepatide Dose", aliases: ["tirzepatide dose", "tirzepatide dosage"] },
      { id: "id-0fdd1b5a", label: "Tirzepatide Success", aliases: ["tirzepatide success", "tirzepatide results"] },
      { id: "id-709d58cb", label: "Tirzepatide Side Effects", aliases: ["tirzepatide side effects"] },
      { id: "id-f38d521b", label: "Satisfied with Current GLP-1 Dose", aliases: ["satisfied dose", "dose satisfaction"] },
      { id: "id-d95d25bd", label: "Current Medications/Supplements", aliases: ["current medications", "supplements"] },
      { id: "id-bc8ed703", label: "Medication/Supplement Details", aliases: ["medication details", "supplement details"] },
    ],
  },
  {
    title: "Motivation & Consent",
    icon: ClipboardList,
    fields: [
      { id: "id-3fa4d158", label: "How would your life change by losing weight?", aliases: ["life change", "motivation"] },
      { id: "id-f69d896b", label: "Terms of Use / Consents", aliases: ["terms", "consents", "agreement"] },
      { id: "select-83c9e357", label: "State of Residence", aliases: ["state", "residence"] },
      { id: "id-e48dcf94", label: "Marketing Consent", aliases: ["marketing consent", "marketing"] },
    ],
  },
  {
    title: "Referral Source",
    icon: ClipboardList,
    fields: [
      { id: "id-345ac6b2", label: "How did you hear about us?", aliases: ["hear about us", "referral source"] },
      { id: "utm_source", label: "UTM Source", aliases: ["utm source"] },
      { id: "utm_medium", label: "UTM Medium", aliases: ["utm medium"] },
      { id: "utm_campaign", label: "UTM Campaign", aliases: ["utm campaign"] },
      { id: "utm_content", label: "UTM Content", aliases: ["utm content"] },
      { id: "utm_term", label: "UTM Term", aliases: ["utm term"] },
      { id: "fbclid", label: "FBCLID", aliases: ["fbclid", "facebook id"] },
    ],
  },
];

type IntakeData = {
  submissionId?: string;
  submittedAt?: Date;
  receivedAt?: string;
  source?: string;
  sections?: Array<{
    title: string;
    entries: Array<{ id?: string; label?: string; value?: any }>;
  }>;
  answers?: Array<{ id?: string; label?: string; value?: any }>;
  patient?: any;
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
    data?: any;  // Legacy: PDF bytes or JSON (before migration)
    intakeData?: any;  // New: Structured intake form answers
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
};

// Helper to normalize keys for matching
const normalizeKey = (value?: string) => {
  if (!value) return "";
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
};

// Helper to format answer values
const formatAnswerValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";

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
      if ('checked' in parsed) return parsed.checked ? "Yes" : "No";
      if (Array.isArray(parsed)) {
        return parsed.filter((item: any) => item && item !== "None of the above").join(", ") || "None";
      }
      return Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join(", ");
    }
  } catch {
    // Not JSON
  }

  if (cleanValue === "true" || cleanValue === "True") return "Yes";
  if (cleanValue === "false" || cleanValue === "False") return "No";

  return cleanValue.replace(/\s+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
};

export default function PatientIntakeView({ patient, documents, intakeFormSubmissions = [] }: Props) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(INTAKE_SECTIONS.map(s => s.title)));
  const [showSendModal, setShowSendModal] = useState(false);

  // Find and parse the latest intake document
  // Priority 1: Look for documents with intakeData field (new format)
  // Priority 2: Fall back to parsing data field (legacy format)
  const intakeDoc = documents.find(
    (doc: any) => doc.category === "MEDICAL_INTAKE_FORM" && (doc.intakeData || doc.data)
  );

  let intakeData: IntakeData = {};

  if (intakeDoc) {
    // New format: intakeData is already JSON
    if (intakeDoc.intakeData) {
      try {
        intakeData = typeof intakeDoc.intakeData === 'string' 
          ? JSON.parse(intakeDoc.intakeData) 
          : intakeDoc.intakeData;
        logger.debug('Loaded intake data from intakeData field');
      } catch (error: any) {
        logger.error('Error parsing intakeData field:', error);
      }
    }
    // Legacy format: data field contains JSON (before PDF storage fix)
    else if (intakeDoc.data) {
      try {
        let rawData = intakeDoc.data;
        
        // Handle Buffer types
        if (Buffer.isBuffer(rawData)) {
          rawData = rawData.toString('utf8');
        } else if (typeof rawData === 'object' && rawData.type === 'Buffer' && Array.isArray(rawData.data)) {
          rawData = Buffer.from(rawData.data).toString('utf8');
        }
        
        // Try to parse as JSON (only works for legacy documents)
        if (typeof rawData === 'string') {
          // Check if it's JSON (starts with { or [)
          const trimmed = rawData.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            intakeData = JSON.parse(trimmed);
            logger.debug('Loaded intake data from legacy data field (JSON)');
          }
        } else if (typeof rawData === 'object' && !Buffer.isBuffer(rawData)) {
          intakeData = rawData as IntakeData;
          logger.debug('Loaded intake data from legacy data field (object)');
        }
      } catch (error: any) {
        // This is expected for new documents where data contains PDF bytes
        logger.debug('Data field does not contain JSON (likely PDF bytes)');
      }
    }
  }

  // Build a map of all answers from various sources
  const buildAnswerMap = () => {
    const answerMap = new Map<string, string>();

    // Source 1: Sections from document data
    if (intakeData.sections && Array.isArray(intakeData.sections)) {
      for (const section of intakeData.sections) {
        if (section.entries && Array.isArray(section.entries)) {
          for (const entry of section.entries) {
            if (entry.id) answerMap.set(normalizeKey(entry.id), formatAnswerValue(entry.value));
            if (entry.label) answerMap.set(normalizeKey(entry.label), formatAnswerValue(entry.value));
          }
        }
      }
    }

    // Source 2: Answers array from document data
    if (intakeData.answers && Array.isArray(intakeData.answers)) {
      for (const answer of intakeData.answers) {
        if (answer.id) answerMap.set(normalizeKey(answer.id), formatAnswerValue(answer.value));
        if (answer.label) answerMap.set(normalizeKey(answer.label), formatAnswerValue(answer.value));
      }
    }

    // Source 3: IntakeFormSubmissions responses
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

    return answerMap;
  };

  const answerMap = buildAnswerMap();

  // Find answer for a field
  const findAnswer = (field: { id: string; label: string; aliases?: string[] }): string => {
    // Check by ID first
    const byId = answerMap.get(normalizeKey(field.id));
    if (byId && byId !== "—") return byId;

    // Check by label
    const byLabel = answerMap.get(normalizeKey(field.label));
    if (byLabel && byLabel !== "—") return byLabel;

    // Check aliases
    if (field.aliases) {
      for (const alias of field.aliases) {
        const byAlias = answerMap.get(normalizeKey(alias));
        if (byAlias && byAlias !== "—") return byAlias;
      }
    }

    return "—";
  };

  // Get patient profile data
  const getPatientValue = (fieldId: string): string => {
    switch (fieldId) {
      case "patient-name": return `${patient.firstName} ${patient.lastName}`;
      case "patient-dob": return formatDob(patient.dob);
      case "patient-gender": return formatGender(patient.gender);
      case "patient-phone": return patient.phone || "—";
      case "patient-email": return patient.email || "—";
      case "patient-address": return buildAddress();
      default: return "—";
    }
  };

  const formatDob = (dob: string) => {
    if (!dob) return "—";
    if (dob.includes("/")) return dob;
    const parts = dob.split("-");
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    return dob;
  };

  const formatGender = (gender?: string | null) => {
    if (!gender) return "—";
    const g = gender.toLowerCase().trim();
    if (g === 'f' || g === 'female' || g === 'woman') return "Female";
    if (g === 'm' || g === 'male' || g === 'man') return "Male";
    return gender;
  };

  const buildAddress = () => {
    const parts = [
      patient.address1,
      patient.address2,
      [patient.city, patient.state].filter(Boolean).join(", "),
      patient.zip
    ].filter(Boolean);
    return parts.join(", ") || "—";
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

  // Collect any additional answers not in our predefined sections
  const getAdditionalAnswers = () => {
    const usedKeys = new Set<string>();

    // Mark all predefined field keys as used
    for (const section of INTAKE_SECTIONS) {
      for (const field of section.fields) {
        usedKeys.add(normalizeKey(field.id));
        usedKeys.add(normalizeKey(field.label));
        if (field.aliases) {
          for (const alias of field.aliases) {
            usedKeys.add(normalizeKey(alias));
          }
        }
      }
    }

    // Find unused answers
    const additional: Array<{ label: string; value: string }> = [];

    // From sections
    if (intakeData.sections) {
      for (const section of intakeData.sections) {
        if (section.entries) {
          for (const entry of section.entries) {
            const key = normalizeKey(entry.id || entry.label);
            if (!usedKeys.has(key) && entry.value) {
              additional.push({
                label: entry.label || entry.id || "Unknown Field",
                value: formatAnswerValue(entry.value)
              });
              usedKeys.add(key);
            }
          }
        }
      }
    }

    // From answers array
    if (intakeData.answers) {
      for (const answer of intakeData.answers) {
        const key = normalizeKey(answer.id || answer.label);
        if (!usedKeys.has(key) && answer.value) {
          additional.push({
            label: answer.label || answer.id || "Unknown Field",
            value: formatAnswerValue(answer.value)
          });
          usedKeys.add(key);
        }
      }
    }

    return additional;
  };

  const additionalAnswers = getAdditionalAnswers();

  // Check if we have actual parseable intake data, not just a document
  const hasParsedIntakeData = (
    (intakeData.sections && intakeData.sections.length > 0) ||
    (intakeData.answers && intakeData.answers.length > 0) ||
    intakeFormSubmissions.length > 0
  );

  // Show intake sections if we have a document OR have form submissions
  // (The Patient Profile section will always show patient data from the patient record)
  const hasIntakeData = intakeDoc || intakeFormSubmissions.length > 0 || hasParsedIntakeData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Medical Intake</h1>
        <div className="flex gap-2">
          {intakeDoc?.externalUrl && (
            <a
              href={intakeDoc.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </a>
          )}
          <button
            onClick={() => setShowSendModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#4fa77e] text-white rounded-lg text-sm font-medium hover:bg-[#3f8660]"
          >
            <FileText className="w-4 h-4" />
            Send New Intake
          </button>
        </div>
      </div>

      {/* Submission Info */}
      {intakeData.submissionId && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <span><strong>Submission ID:</strong> {intakeData.submissionId}</span>
            {intakeData.source && <span><strong>Source:</strong> {intakeData.source}</span>}
            {intakeData.receivedAt && (
              <span><strong>Received:</strong> {new Date(intakeData.receivedAt).toLocaleString()}</span>
            )}
          </div>
        </div>
      )}

      {!hasIntakeData ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Intake Form Submitted</h3>
          <p className="text-gray-500 mb-4">This patient has not completed an intake form yet.</p>
          <button
            onClick={() => setShowSendModal(true)}
            className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg text-sm font-medium hover:bg-[#3f8660]"
          >
            Send Intake Form
          </button>
        </div>
      ) : (
        <>
        {/* Show notice if intake exists but answers couldn't be parsed */}
        {intakeDoc && !hasParsedIntakeData && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            <p className="font-medium">Detailed intake responses not available</p>
            <p className="text-amber-700 mt-1">
              This patient&apos;s intake was processed before the detailed data system was implemented.
              Basic patient information is shown from their profile. To capture detailed responses,
              send a new intake form.
            </p>
          </div>
        )}
          {/* Predefined Sections */}
          {INTAKE_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isExpanded = expandedSections.has(section.title);
            const isPatientProfile = section.title === "Patient Profile";

            return (
              <div key={section.title} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#4fa77e]/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-[#4fa77e]" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <div className="divide-y divide-gray-100">
                      {section.fields.map((field) => {
                        const value = isPatientProfile
                          ? getPatientValue(field.id)
                          : findAnswer(field);
                        const hasValue = value !== "—";

                        return (
                          <div key={field.id} className="flex px-6 py-3">
                            <div className="w-1/3 text-sm text-gray-500">{field.label}</div>
                            <div className={`w-2/3 text-sm ${hasValue ? 'text-gray-900' : 'text-gray-400'}`}>
                              {value}
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
          {additionalAnswers.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => toggleSection("Additional Responses")}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <ClipboardList className="w-5 h-5 text-purple-600" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">Additional Responses</h2>
                  <span className="text-sm text-gray-500">({additionalAnswers.length} items)</span>
                </div>
                {expandedSections.has("Additional Responses") ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {expandedSections.has("Additional Responses") && (
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
        <SendIntakeFormModal
          patient={patient}
          onClose={() => setShowSendModal(false)}
        />
      )}
    </div>
  );
}
