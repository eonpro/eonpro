"use client";

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import SendIntakeFormModal from './SendIntakeFormModal';
import { FileText, Download, ChevronDown, ChevronUp, User, Activity, Pill, Heart, Brain, ClipboardList, Pencil, Save, X, Loader2, Check } from 'lucide-react';

/**
 * Intake display sections - maps fields from WeightLossIntake
 */
const INTAKE_SECTIONS = [
  {
    title: "Patient Profile",
    icon: User,
    editable: false, // Patient profile is edited on the Profile tab
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
    title: "Physical Measurements",
    icon: Activity,
    editable: true,
    fields: [
      { id: "weight", label: "Starting Weight", aliases: ["startingweight", "currentweight"], inputType: "text", placeholder: "e.g., 180 lbs" },
      { id: "idealWeight", label: "Ideal Weight", aliases: ["idealweight", "goalweight", "targetweight"], inputType: "text", placeholder: "e.g., 150 lbs" },
      { id: "height", label: "Height", aliases: [], inputType: "text", placeholder: "e.g., 5'8\"" },
      { id: "bmi", label: "BMI", aliases: ["bodymassindex"], inputType: "text", placeholder: "e.g., 27.4" },
      { id: "bloodPressure", label: "Blood Pressure", aliases: ["bloodpressure", "bp"], inputType: "text", placeholder: "e.g., 120/80" },
    ],
  },
  {
    title: "Medical History",
    icon: Heart,
    editable: true,
    fields: [
      { id: "medicalConditions", label: "Medical Conditions", aliases: ["medicalconditions", "conditions"], inputType: "textarea", placeholder: "List any medical conditions..." },
      { id: "currentMedications", label: "Current Medications", aliases: ["currentmedications", "medications"], inputType: "textarea", placeholder: "List current medications..." },
      { id: "allergies", label: "Allergies", aliases: ["allergy"], inputType: "textarea", placeholder: "List any allergies..." },
      { id: "familyHistory", label: "Family Medical History", aliases: ["familyhistory", "familymedicalhistory"], inputType: "textarea", placeholder: "Family medical history..." },
      { id: "surgicalHistory", label: "Surgical History", aliases: ["surgicalhistory", "surgeries"], inputType: "textarea", placeholder: "List any surgeries..." },
    ],
  },
  {
    title: "Medical Flags",
    icon: Heart,
    editable: true,
    fields: [
      { id: "pregnancyStatus", label: "Pregnancy Status", aliases: ["pregnancystatus", "pregnant"], inputType: "select", options: ["Not Pregnant", "Pregnant", "Trying to Conceive", "N/A"] },
      { id: "hasDiabetes", label: "Has Diabetes", aliases: ["hasdiabetes", "diabetes", "type2diabetes"], inputType: "select", options: ["No", "Yes - Type 1", "Yes - Type 2", "Pre-diabetic"] },
      { id: "hasGastroparesis", label: "Has Gastroparesis", aliases: ["hasgastroparesis", "gastroparesis"], inputType: "select", options: ["No", "Yes"] },
      { id: "hasPancreatitis", label: "Has Pancreatitis", aliases: ["haspancreatitis", "pancreatitis"], inputType: "select", options: ["No", "Yes", "History of"] },
      { id: "hasThyroidCancer", label: "Has Thyroid Cancer", aliases: ["hasthyroidcancer", "thyroidcancer", "medularythyroid"], inputType: "select", options: ["No", "Yes", "Family History"] },
    ],
  },
  {
    title: "Mental Health",
    icon: Brain,
    editable: true,
    fields: [
      { id: "mentalHealthHistory", label: "Mental Health History", aliases: ["mentalhealthhistory", "mentalhealth"], inputType: "textarea", placeholder: "Mental health history..." },
    ],
  },
  {
    title: "Lifestyle",
    icon: Activity,
    editable: true,
    fields: [
      { id: "activityLevel", label: "Daily Physical Activity", aliases: ["activitylevel", "physicalactivity", "dailyphysicalactivity"], inputType: "select", options: ["Sedentary", "Lightly Active", "Moderately Active", "Very Active", "Extremely Active"] },
      { id: "alcoholUse", label: "Alcohol Intake", aliases: ["alcoholuse", "alcoholintake", "alcohol"], inputType: "select", options: ["None", "Occasional", "Moderate", "Heavy"] },
      { id: "recreationalDrugs", label: "Recreational Drug Use", aliases: ["recreationaldrugs", "recreationaldruguse", "druguse"], inputType: "select", options: ["None", "Occasional", "Regular"] },
      { id: "weightLossHistory", label: "Weight Loss History", aliases: ["weightlosshistory"], inputType: "textarea", placeholder: "Previous weight loss attempts..." },
    ],
  },
  {
    title: "GLP-1 Medications",
    icon: Pill,
    editable: true,
    fields: [
      { id: "glp1History", label: "GLP-1 Medication History", aliases: ["glp1history", "glp1medicationhistory"], inputType: "select", options: ["Never Used", "Currently Using", "Previously Used"] },
      { id: "glp1Type", label: "Current GLP-1 Medication", aliases: ["glp1type", "currentglp1medication", "currentglp1"], inputType: "select", options: ["None", "Semaglutide (Ozempic/Wegovy)", "Tirzepatide (Mounjaro/Zepbound)", "Liraglutide (Saxenda)", "Other"] },
      { id: "medicationPreference", label: "Medication Preference", aliases: ["medicationpreference"], inputType: "select", options: ["No Preference", "Semaglutide", "Tirzepatide", "Other"] },
      { id: "semaglutideDosage", label: "Semaglutide Dose", aliases: ["semaglutidedosage", "semaglutidedose"], inputType: "text", placeholder: "e.g., 0.5mg weekly" },
      { id: "tirzepatideDosage", label: "Tirzepatide Dose", aliases: ["tirzepatidedosage", "tirzepatidedose"], inputType: "text", placeholder: "e.g., 2.5mg weekly" },
      { id: "previousSideEffects", label: "Previous Side Effects", aliases: ["previoussideeffects", "sideeffects"], inputType: "textarea", placeholder: "Any side effects experienced..." },
    ],
  },
  {
    title: "Visit Information",
    icon: ClipboardList,
    editable: true,
    fields: [
      { id: "reasonForVisit", label: "Reason for Visit", aliases: ["reasonforvisit"], inputType: "textarea", placeholder: "Reason for visit..." },
      { id: "chiefComplaint", label: "Chief Complaint", aliases: ["chiefcomplaint"], inputType: "textarea", placeholder: "Chief complaint..." },
      { id: "healthGoals", label: "Health Goals", aliases: ["healthgoals", "goals"], inputType: "textarea", placeholder: "Health goals..." },
    ],
  },
  {
    title: "Referral & Metadata",
    icon: ClipboardList,
    editable: true,
    fields: [
      { id: "referralSource", label: "Referral Source", aliases: ["referralsource", "howdidyouhearaboutus"], inputType: "text", placeholder: "How did they hear about us?" },
      { id: "referredBy", label: "Referred By", aliases: ["referredby"], inputType: "text", placeholder: "Referred by..." },
      { id: "qualified", label: "Qualified Status", aliases: ["qualifiedstatus"], inputType: "select", options: ["Pending", "Qualified", "Not Qualified"] },
      { id: "language", label: "Preferred Language", aliases: ["preferredlanguage"], inputType: "select", options: ["English", "Spanish", "French", "Other"] },
      { id: "intakeSource", label: "Intake Source", aliases: ["intakesource"], inputType: "text", placeholder: "Source of intake..." },
      { id: "intakeNotes", label: "Intake Notes", aliases: ["intakenotes", "notes"], inputType: "textarea", placeholder: "Additional notes..." },
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
};

// Helper to normalize keys for matching
const normalizeKey = (value?: string) => {
  if (!value) return "";
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
};

// Helper to format answer values for display
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

// Helper to get raw value for editing
const getRawValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "" || value === "—") return "";
  return String(value).trim();
};

export default function PatientIntakeView({ patient, documents, intakeFormSubmissions = [] }: Props) {
  const router = useRouter();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(INTAKE_SECTIONS.map(s => s.title)));
  const [showSendModal, setShowSendModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  // Find and parse the latest intake document
  const intakeDoc = documents.find(
    (doc: any) => doc.category === "MEDICAL_INTAKE_FORM" && (doc.intakeData || doc.data)
  );

  let intakeData: IntakeData = {};

  if (intakeDoc) {
    if (intakeDoc.intakeData) {
      try {
        intakeData = typeof intakeDoc.intakeData === 'string' 
          ? JSON.parse(intakeDoc.intakeData) 
          : intakeDoc.intakeData;
      } catch (error: any) {
        logger.error('Error parsing intakeData field:', error);
      }
    } else if (intakeDoc.data) {
      try {
        let rawData = intakeDoc.data;
        
        if (Buffer.isBuffer(rawData)) {
          rawData = rawData.toString('utf8');
        } else if (typeof rawData === 'object' && rawData.type === 'Buffer' && Array.isArray(rawData.data)) {
          rawData = Buffer.from(rawData.data).toString('utf8');
        }
        
        if (typeof rawData === 'string') {
          const trimmed = rawData.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            intakeData = JSON.parse(trimmed);
          }
        } else if (typeof rawData === 'object' && !Buffer.isBuffer(rawData)) {
          intakeData = rawData as IntakeData;
        }
      } catch (error: any) {
        logger.debug('Data field does not contain JSON');
      }
    }
  }

  // Build a map of all answers from various sources
  const buildAnswerMap = useCallback(() => {
    const answerMap = new Map<string, string>();

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

    if (intakeData.answers && Array.isArray(intakeData.answers)) {
      for (const answer of intakeData.answers) {
        if (answer.id) answerMap.set(normalizeKey(answer.id), formatAnswerValue(answer.value));
        if (answer.label) answerMap.set(normalizeKey(answer.label), formatAnswerValue(answer.value));
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

    return answerMap;
  }, [intakeData, intakeFormSubmissions]);

  const answerMap = buildAnswerMap();

  // Find answer for a field
  const findAnswer = (field: { id: string; label: string; aliases?: string[] }): string => {
    const byId = answerMap.get(normalizeKey(field.id));
    if (byId && byId !== "—") return byId;

    const byLabel = answerMap.get(normalizeKey(field.label));
    if (byLabel && byLabel !== "—") return byLabel;

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

  // Get edited value or original
  const getFieldValue = (field: { id: string; label: string; aliases?: string[] }): string => {
    if (isEditing && field.id in editedValues) {
      return editedValues[field.id];
    }
    const answer = findAnswer(field);
    return getRawValue(answer);
  };

  // Handle field change
  const handleFieldChange = (fieldId: string, value: string) => {
    setEditedValues(prev => ({ ...prev, [fieldId]: value }));
  };

  // Start editing
  const startEditing = () => {
    // Pre-populate edited values with current values
    const currentValues: Record<string, string> = {};
    for (const section of INTAKE_SECTIONS) {
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
  const getAdditionalAnswers = () => {
    const usedKeys = new Set<string>();

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

    const additional: Array<{ label: string; value: string }> = [];

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
  const hasIntakeData = intakeDoc || intakeFormSubmissions.length > 0;

  // Render field input based on type
  const renderFieldInput = (field: any, value: string) => {
    const inputType = field.inputType || 'text';

    if (inputType === 'select' && field.options) {
      return (
        <select
          value={value}
          onChange={(e) => handleFieldChange(field.id, e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
        >
          <option value="">Select...</option>
          {field.options.map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
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
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent resize-none"
        />
      );
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(e) => handleFieldChange(field.id, e.target.value)}
        placeholder={field.placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
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
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={saveChanges}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-[#4fa77e] text-white rounded-lg text-sm font-medium hover:bg-[#3f8660] disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
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
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </a>
              )}
              <button
                onClick={startEditing}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Pencil className="w-4 h-4" />
                Edit Intake
              </button>
              <button
                onClick={() => setShowSendModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#4fa77e] text-white rounded-lg text-sm font-medium hover:bg-[#3f8660]"
              >
                <FileText className="w-4 h-4" />
                Send New Intake
              </button>
            </>
          )}
        </div>
      </div>

      {/* Save Success */}
      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800 flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>Intake data saved successfully! Refreshing...</span>
        </div>
      )}

      {/* Save Error */}
      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          <strong>Error:</strong> {saveError}
        </div>
      )}

      {/* Submission Info */}
      {intakeData.submissionId && !isEditing && (
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

      {/* Edit Mode Notice */}
      {isEditing && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <strong>Edit Mode:</strong> Make changes to intake fields below. Patient Profile is edited on the Profile tab.
        </div>
      )}

      {!hasIntakeData && !isEditing ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Intake Form Submitted</h3>
          <p className="text-gray-500 mb-4">This patient has not completed an intake form yet.</p>
          <div className="flex justify-center gap-2">
            <button
              onClick={startEditing}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              <Pencil className="w-4 h-4 inline mr-2" />
              Enter Manually
            </button>
            <button
              onClick={() => setShowSendModal(true)}
              className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg text-sm font-medium hover:bg-[#3f8660]"
            >
              Send Intake Form
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Predefined Sections */}
          {INTAKE_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isExpanded = expandedSections.has(section.title);
            const isPatientProfile = section.title === "Patient Profile";
            const isSectionEditable = section.editable && isEditing;

            return (
              <div key={section.title} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isSectionEditable ? 'bg-amber-100' : 'bg-[#4fa77e]/10'
                    }`}>
                      <Icon className={`w-5 h-5 ${isSectionEditable ? 'text-amber-600' : 'text-[#4fa77e]'}`} />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
                    {isSectionEditable && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Editing</span>
                    )}
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
                      {section.fields.map((field: any) => {
                        const displayValue = isPatientProfile
                          ? getPatientValue(field.id)
                          : findAnswer(field);
                        const editValue = getFieldValue(field);
                        const hasValue = displayValue !== "—";

                        return (
                          <div key={field.id} className="flex px-6 py-3 items-start">
                            <div className="w-1/3 text-sm text-gray-500 pt-2">{field.label}</div>
                            <div className="w-2/3">
                              {isSectionEditable ? (
                                renderFieldInput(field, editValue)
                              ) : (
                                <div className={`text-sm pt-2 ${hasValue ? 'text-gray-900' : 'text-gray-400'}`}>
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
