"use client";

import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';
import SendIntakeFormModal from './SendIntakeFormModal';

// PDF Section Configuration matching intakePdfService.ts exactly
type SectionFieldConfig = {
  id: string;
  label: string;
};

type SectionConfig = {
  title: string;
  fields: SectionFieldConfig[];
};

const PDF_SECTION_CONFIG: SectionConfig[] = [
  {
    title: "Motivation & Consent",
    fields: [
      { id: "id-3fa4d158", label: "How would your life change by losing weight?" },
      { id: "id-f69d896b", label: "Terms of Use / Consents" },
      { id: "select-83c9e357", label: "State of Residence" },
      { id: "id-e48dcf94", label: "Marketing Consent" },
    ],
  },
  {
    title: "Vitals & Goals",
    fields: [
      { id: "id-cf20e7c9", label: "Ideal Weight" },
      { id: "id-703227a8", label: "Starting Weight" },
      { id: "id-3a7e6f11", label: "Height (feet)" },
      { id: "id-4a4a1f48", label: "Height (inches)" },
      { id: "bmi", label: "BMI" },
      { id: "lbs to lose", label: "Pounds to Lose" },
    ],
  },
  {
    title: "Lifestyle & Activity",
    fields: [
      { id: "id-74efb442", label: "Daily Physical Activity" },
      { id: "id-d560c374", label: "Alcohol Intake" },
    ],
  },
  {
    title: "Medical & Mental Health History",
    fields: [
      { id: "id-d79f4058", label: "Mental Health Diagnosis" },
      { id: "id-2835be1b", label: "Mental Health Details" },
      { id: "id-2ce042cd", label: "Chronic Illness" },
      { id: "id-481f7d3f", label: "Chronic Illness Details" },
      { id: "id-c6194df4", label: "Chronic Diseases History" },
      { id: "id-aa863a43", label: "Current Conditions" },
      { id: "id-49e5286f", label: "Family History" },
      { id: "id-88c19c78", label: "Medullary Thyroid Cancer History" },
      { id: "id-4bacb2db", label: "MEN Type-2 History" },
      { id: "id-eee84ce3", label: "Gastroparesis History" },
      { id: "id-22f7904b", label: "Type 2 Diabetes" },
      { id: "id-4dce53c7", label: "Pregnant or Breastfeeding" },
      { id: "id-ddff6d53", label: "Surgeries or Procedures" },
      { id: "mc-819b3225", label: "Blood Pressure" },
      { id: "id-c4320836", label: "Weight Loss Procedures" },
      { id: "id-3e6b8a5b", label: "Allergies" },
      { id: "id-04e1c88e", label: "List of Allergies" },
    ],
  },
  {
    title: "Medications & GLP-1 History",
    fields: [
      { id: "id-d2f1eaa4", label: "GLP-1 Medication History" },
      { id: "id-6a9fff95", label: "Side Effects When Starting Medication" },
      { id: "id-4b98a487", label: "Interested in Personalized Plan for Side Effects" },
      { id: "id-c5f1c21a", label: "Current GLP-1 Medication" },
      { id: "id-5001f3ff", label: "Semaglutide Dose" },
      { id: "id-9d592571", label: "Semaglutide Side Effects" },
      { id: "id-5e696841", label: "Semaglutide Success" },
      { id: "id-f38d521b", label: "Satisfied with Current GLP-1 Dose" },
      { id: "id-d95d25bd", label: "Current Medications/Supplements" },
      { id: "id-bc8ed703", label: "Medication/Supplement Details" },
      { id: "id-57f65753", label: "Tirzepatide Dose" },
      { id: "id-0fdd1b5a", label: "Tirzepatide Success" },
      { id: "id-709d58cb", label: "Tirzepatide Side Effects" },
    ],
  },
  {
    title: "Referral Source",
    fields: [
      { id: "id-345ac6b2", label: "How did you hear about us?" },
      { id: "utm_source", label: "UTM Source" },
      { id: "utm_medium", label: "UTM Medium" },
      { id: "utm_campaign", label: "UTM Campaign" },
      { id: "utm_content", label: "UTM Content" },
      { id: "utm_term", label: "UTM Term" },
      { id: "fbclid", label: "FBCLID" },
    ],
  },
];

const LEGAL_TEXT = [
  "Privacy Policy & HIPAA Compliance: I understand my health data is stored securely in accordance with HIPAA regulations and will be used solely for treatment coordination. I acknowledge that my protected health information (PHI) will be shared only with authorized healthcare providers and pharmacy partners involved in my care.",
  "Weight-Loss Treatment Consent: I authorize EONMEDS and its affiliated medical professionals to review my intake form, laboratory results, vital signs, and medical history to determine candidacy for GLP-1 receptor agonists and adjunct therapies. I understand that treatment recommendations are based on medical evaluation and may be modified or discontinued based on clinical response.",
  "Telehealth Services Agreement: I consent to receive healthcare services via telehealth technology and understand that these services are subject to the same standards of care as in-person visits. I acknowledge that technical issues may occasionally affect service delivery and that alternative arrangements will be made when necessary.",
  "Financial Responsibility & Cancellation Policy: I understand that cancellations or rescheduling within 24 hours of scheduled appointments may incur fees up to the full consultation cost. I acknowledge responsibility for all charges not covered by insurance and agree to the payment terms outlined in the financial agreement.",
  "Informed Consent & Risk Acknowledgment: I have been informed of the potential risks, benefits, and alternatives to GLP-1 therapy. I understand that individual results may vary and that no specific outcome is guaranteed. I agree to report any adverse effects immediately to my healthcare provider.",
];

type IntakeData = {
  submissionId?: string;
  submittedAt?: Date;
  answers?: Array<{
    id?: string;
    label?: string;
    value?: any;
  }>;
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
      responseText?: string | null;
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

// Helper function to normalize keys for matching
const normalizeKey = (value?: string) => {
  if (!value) return "";
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
};

// Helper function to format answer values exactly like the PDF
const formatAnswerValue = (value: unknown): string => {
  if (!value) return "—";
  
  // Clean up any encoding issues and common corruptions
  let cleanValue = String(value)
    .replace(/Enj8ying/gi, "Enjoying")
    .replace(/weigh\w*ying/gi, "weight? Enjoying")
    .replace(/\u00e2\u0080\u0099/g, "'")
    .replace(/\u00e2\u0080\u009c/g, '"')
    .replace(/\u00e2\u0080\u009d/g, '"')
    .replace(/\u00e2\u0080\u0093/g, '-')
    .replace(/\u00e2\u0080\u0094/g, '--')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim();
  
  // Try to parse JSON values
  try {
    const parsed = JSON.parse(cleanValue);
    if (typeof parsed === 'object' && parsed !== null) {
      // Handle checkbox/boolean values
      if ('checked' in parsed) {
        return parsed.checked ? "Yes" : "No";
      }
      // Handle arrays
      if (Array.isArray(parsed)) {
        return parsed.filter((item: any) => item && item !== "None of the above").join(", ") || "None";
      }
      // Handle other objects - stringify nicely
      return Object.entries(parsed)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
    }
  } catch {
    // Not JSON, use as-is
  }
  
  // Clean up common patterns
  if (cleanValue === "true" || cleanValue === "True" || cleanValue === "TRUE" || cleanValue === "✔") return "Yes";
  if (cleanValue === "false" || cleanValue === "False" || cleanValue === "FALSE") return "No";
  
  // Final cleanup for display
  return cleanValue
    .replace(/\s+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
};

export default function PatientIntakeView({ patient, documents, intakeFormSubmissions = [] }: Props) {
  // Find the latest intake document
  const intakeDoc = documents.find(
    (doc: any) => doc.category === "MEDICAL_INTAKE_FORM" && doc.data
  );

  let intakeData: IntakeData = {};
  
  if (intakeDoc?.data) {
    try {
      const dataStr = intakeDoc.data.toString('utf8');
      
      // Check if data is stored as comma-separated bytes (SQLite format)
      if (dataStr.includes(',') && dataStr.split(',').every((v: string) => !isNaN(parseInt(v.trim())))) {
        // Data is stored as comma-separated byte values
        const bytes = dataStr.split(',').map((b: string) => parseInt(b.trim()));
        const buffer = Buffer.from(bytes);
        intakeData = JSON.parse(buffer.toString('utf8'));
      } else if (typeof intakeDoc.data === 'string') {
        intakeData = JSON.parse(intakeDoc.data);
      } else if (Buffer.isBuffer(intakeDoc.data)) {
        intakeData = JSON.parse(intakeDoc.data.toString('utf8'));
      } else if (typeof intakeDoc.data === 'object') {
        // Handle case where data might be a Buffer-like object from Prisma
        if (intakeDoc.data.type === 'Buffer' && Array.isArray(intakeDoc.data.data)) {
          const buffer = Buffer.from(intakeDoc.data.data);
          intakeData = JSON.parse(buffer.toString('utf8'));
        } else {
          intakeData = intakeDoc.data as IntakeData;
        }
      }
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('Error parsing intake data:', error);
      intakeData = {};
    }
  }

  const formatDob = (dob: string) => {
    if (!dob) return "—";
    const trimmed = dob.trim();
    if (!trimmed) return "—";
    if (trimmed.includes("/")) return trimmed;
    const parts = trimmed.split("-");
    if (parts.length === 3) {
      const [year, month, day] = parts;
      if (year && month && day) {
        return `${month.padStart(2, "0")}/${day.padStart(2, "0")}/${year}`;
      }
    }
    return trimmed;
  };

  const formatGender = (gender?: string | null) => {
    if (!gender) return "—";
    const normalized = gender.trim().toUpperCase();
    if (normalized.startsWith("F")) return "Female";
    if (normalized.startsWith("M")) return "Male";
    return gender;
  };

  const buildAddress = () => {
    const lines: string[] = [];
    if (patient.address1) {
      lines.push(patient.address1);
    }
    if (patient.address2) {
      lines.push(patient.address2);
    }
    const cityState = [patient.city, patient.state].filter(Boolean).join(", ");
    const locality = [cityState, patient.zip].filter(Boolean).join(" ").trim();
    if (locality) {
      const normalized = lines.join(" ").toLowerCase();
      if (!normalized.includes(locality.toLowerCase())) {
        lines.push(locality);
      }
    }
    return lines.join("\n");
  };

  // Build sections exactly like PDF does
  const buildDisplaySections = () => {
    const answerMap = new Map<string, any>();
    const answersList: Array<{ id?: string; label?: string; value?: any }> = [];
    
    if (intakeData.answers) {
      intakeData.answers.forEach((entry: any) => {
        const normalizedId = normalizeKey(entry.id);
        if (normalizedId) {
          answerMap.set(normalizedId, entry);
        }
        answersList.push(entry);
      });
    }

    const used = new Set<string>();
    const sections: Array<{ title: string; entries: Array<{ label: string; value: string }> }> = [];

    // Build sections from PDF_SECTION_CONFIG
    PDF_SECTION_CONFIG.forEach((sectionConfig: any) => {
      const entries = sectionConfig.fields
        .map((field: any) => {
          const normalizedId = normalizeKey(field.id);
          const directMatch = answerMap.get(normalizedId);
          if (directMatch && directMatch.value) {
            used.add(normalizeKey(directMatch.id));
            return { label: field.label ?? directMatch.label, value: formatAnswerValue(directMatch.value) };
          }
          // Try to match by label
          const labelKey = normalizeKey(field.label ?? "");
          if (labelKey) {
            const labelMatch = answersList.find(
              (entry: any) =>
                entry.value &&
                entry.label &&
                normalizeKey(entry.label).includes(labelKey) &&
                !used.has(normalizeKey(entry.id))
            );
            if (labelMatch) {
              used.add(normalizeKey(labelMatch.id));
              return { label: field.label ?? labelMatch.label, value: formatAnswerValue(labelMatch.value) };
            }
          }
          return null;
        })
        .filter(Boolean) as Array<{ label: string; value: string }>;

      if (entries.length > 0) {
        sections.push({
          title: sectionConfig.title,
          entries,
        });
      }
    });

    // Fields to exclude from Additional Responses
    const excludeFromAdditional = [
      'address [country]',
      'address [state]', 
      'address [city]',
      'address [street]',
      'address [house]',
      'address [state_code]',
      'address [latitude]',
      'address [longitude]',
      'firstname',
      'lastname',
      'dob',
      'email',
      'phone',
      'address'
    ];
    
    const remainingEntries = answersList
      .filter((entry: any) => {
        // Skip if already used
        if (!entry.value || used.has(normalizeKey(entry.id))) return false;
        
        // Skip unwanted address subfields
        const labelLower = entry.label?.toLowerCase() || '';
        if (excludeFromAdditional.some((exclude: any) => labelLower.includes(exclude.toLowerCase()))) {
          return false;
        }
        
        return true;
      })
      .map((entry: any) => {
        // Rename "address [zip]" to "Zip Code"
        let displayLabel = entry.label || "";
        if (displayLabel.toLowerCase().includes('address [zip]')) {
          displayLabel = 'Zip Code';
        }
        
        return {
          label: displayLabel,
          value: formatAnswerValue(entry.value),
        };
      });

    if (remainingEntries.length > 0) {
      sections.push({
        title: "Additional Responses",
        entries: remainingEntries,
      });
    }

    return sections;
  };

  const sections = buildDisplaySections();

  return (
    <div className="space-y-6">
      {/* Send Intake Form Button */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900">Intake Forms</h2>
        <button
          onClick={() => {
            const modal = document.getElementById('send-intake-modal');
            if (modal) {
              modal.classList.remove('hidden');
            }
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Send New Intake Form
        </button>
      </div>

      {/* New Intake Forms - Display at top if any exist */}
      {intakeFormSubmissions && intakeFormSubmissions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Completed Forms</h3>
          {intakeFormSubmissions.map((submission: any) => (
            <div key={submission.id} className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{submission.template.name}</h3>
                  {submission.template.description && (
                    <p className="text-sm text-gray-600 mt-1">{submission.template.description}</p>
                  )}
                  <p className="text-sm text-gray-500 mt-2">
                    Submitted: {new Date(submission.completedAt || submission.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // Toggle expand/collapse for this submission
                      const element = document.getElementById(`submission-${submission.id}`);
                      if (element) {
                        element.classList.toggle('hidden');
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                  >
                    View Responses
                  </button>
                  <a
                    href={`/documents/intake-forms/${submission.id}.pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] transition text-sm font-medium"
                  >
                    View PDF
                  </a>
                </div>
              </div>
              
              {/* Expandable Responses Section */}
              <div id={`submission-${submission.id}`} className="hidden mt-6 space-y-4 border-t pt-4">
                {/* Group responses by section */}
                {(() => {
                  const responsesBySection: Record<string, typeof submission.responses> = {};
                  submission.responses.forEach((response: any) => {
                    const section = response.question.section || 'General Information';
                    if (!responsesBySection[section]) {
                      responsesBySection[section] = [];
                    }
                    responsesBySection[section].push(response);
                  });
                  
                  return Object.entries(responsesBySection).map(([section, responses]) => (
                    <div key={section} className="space-y-2">
                      <h4 className="font-semibold text-gray-800">{section}</h4>
                      <div className="pl-4 space-y-2">
                        {responses.map((response: any) => (
                          <div key={response.id} className="grid grid-cols-3 gap-4 py-2 border-b last:border-0">
                            <div className="col-span-1">
                              <p className="text-sm font-medium text-gray-600">
                                {response.question.questionText}
                                {response.question.isRequired && <span className="text-red-500 ml-1">*</span>}
                              </p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-sm text-gray-900">
                                {response.responseText || '—'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legacy HeyFlow Intake Forms */}
      {intakeDoc && (
        <>
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Legacy Medical Intake Summary</h2>
                {intakeDoc?.sourceSubmissionId && (
                  <p className="text-sm text-gray-500 mt-1">
                    Submission ID: {intakeDoc.sourceSubmissionId}
                  </p>
                )}
              </div>
              {intakeDoc && (
                <button
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem('auth-token') || '';
                      const response = await fetch(`/api/patients/${patient.id}/documents/${intakeDoc.id}`, {
                        credentials: 'include',
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      if (response.ok) {
                        const blob = await response.blob();
                        window.open(URL.createObjectURL(blob), "_blank");
                      } else {
                        alert('Failed to view document');
                      }
                    } catch (err) {
                      logger.error('View PDF error:', err);
                      alert('Failed to view document');
                    }
                  }}
                  className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] transition text-sm font-medium"
                >
                  View PDF
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Patient Profile Section - Always First */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="bg-gray-50 px-6 py-3 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Patient Profile</h3>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            <div className="border-b pb-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">PATIENT</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-900">{patient.firstName} {patient.lastName}</p>
                </div>
              </div>
            </div>
            <div className="border-b pb-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">DOB</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-900">{formatDob(patient.dob)}</p>
                </div>
              </div>
            </div>
            <div className="border-b pb-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">GENDER</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-900">{formatGender(patient.gender)}</p>
                </div>
              </div>
            </div>
            <div className="border-b pb-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">PHONE</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-900">{patient.phone || "—"}</p>
                </div>
              </div>
            </div>
            <div className="border-b pb-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">EMAIL</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-900">{patient.email || "—"}</p>
                </div>
              </div>
            </div>
            <div className="last:border-0 pb-0">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">ADDRESS</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-900 whitespace-pre-line">{buildAddress()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Sections from intake data */}
      {sections.map((section: any) => (
        <div key={section.title} className="bg-white rounded-lg border overflow-hidden">
          <div className="bg-gray-50 px-6 py-3 border-b">
            <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
          </div>
          <div className="p-6">
            {section.entries.length > 0 ? (
              <div className="space-y-4">
                {section.entries.map((entry: { label: string; value: string }, idx: number) => (
                  <div key={idx} className="border-b last:border-0 pb-4 last:pb-0">
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="md:col-span-1">
                        <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                          {entry.label}
                        </p>
                      </div>
                      <div className="md:col-span-2">
                        <p className="text-sm text-gray-900 whitespace-pre-line">
                          {entry.value || "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">No data available for this section</p>
            )}
          </div>
        </div>
      ))}

      {/* Legal Disclosures - Full Text */}
      {intakeDoc && (
        <div className="bg-gray-50 rounded-lg border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Legal Disclosures & Consents</h3>
          <div className="text-sm text-gray-700 space-y-3">
            {LEGAL_TEXT.map((text, idx) => (
              <p key={idx} className="leading-relaxed">• {text}</p>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t">
            <div className="bg-white rounded-lg p-4 inline-block border border-[#4fa77e]">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Digitally signed by</p>
              <p className="text-base font-semibold text-gray-900 mt-1">{patient.firstName} {patient.lastName}</p>
              <p className="text-xs text-gray-600 mt-2">
                {intakeDoc.createdAt ? new Date(intakeDoc.createdAt).toLocaleString() : ""}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Submission ID: {intakeDoc.sourceSubmissionId}
              </p>
            </div>
          </div>
        </div>
      )}

      {!intakeDoc && (!intakeFormSubmissions || intakeFormSubmissions.length === 0) && (
        <div className="bg-gray-50 rounded-lg border p-8 text-center">
          <p className="text-gray-500">No intake forms have been completed yet.</p>
          <p className="text-sm text-gray-400 mt-2">Use the button above to send an intake form to the patient.</p>
        </div>
      )}

      {/* Send Intake Form Modal */}
      <SendIntakeFormModal patient={patient} />
    </div>
  );
}
