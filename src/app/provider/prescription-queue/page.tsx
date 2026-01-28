"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import {
  ClipboardList,
  Search,
  Check,
  Loader2,
  AlertCircle,
  User,
  Calendar,
  DollarSign,
  Pill,
  RefreshCw,
  Building2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
  MapPin,
  FileText,
  Send,
  X,
  Clock,
  Heart,
  Activity,
  Stethoscope,
  Scale,
  Ruler,
  ShieldAlert,
  Plus,
  Trash2,
  Sparkles,
  ClipboardCheck,
  FileWarning,
} from "lucide-react";
import { MEDS } from "@/lib/medications";
import { SHIPPING_METHODS } from "@/lib/shipping";

interface QueueItem {
  invoiceId: number;
  patientId: number;
  patientDisplayId: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  patientDob: string;
  treatment: string;
  plan: string;        // e.g., "Monthly", "Quarterly", "6-Month"
  planMonths: number;  // e.g., 1, 3, 6
  amount: number;
  amountFormatted: string;
  paidAt: string;
  createdAt: string;
  invoiceNumber: string;
  intakeCompletedAt: string | null;
  clinicId: number | null;
  clinic: {
    id: number;
    name: string;
    subdomain: string;
    lifefileEnabled: boolean;
    practiceName: string | null;
  } | null;
  // SOAP Note status - CRITICAL for clinical documentation
  hasSoapNote: boolean;
  soapNoteStatus: 'DRAFT' | 'APPROVED' | 'LOCKED' | 'MISSING';
  soapNote: {
    id: number;
    status: string;
    createdAt: string;
    approvedAt: string | null;
    isApproved: boolean;
  } | null;
}

interface PatientDetails {
  invoice: {
    id: number;
    status: string;
    amount: number;
    amountFormatted: string;
    paidAt: string;
    metadata: Record<string, unknown>;
    lineItems: Array<Record<string, unknown>>;
  };
  patient: {
    id: number;
    patientId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dob: string;
    gender: string;
    address1: string;
    address2: string | null;
    city: string;
    state: string;
    zip: string;
    allergies: string | null;
    notes: string | null;
  };
  clinic: {
    id: number;
    name: string;
    subdomain: string;
    lifefileEnabled: boolean;
    lifefilePracticeName: string | null;
  } | null;
  intake: {
    data: Record<string, unknown>;
    sections: Array<{
      section: string;
      questions: Array<{ question: string; answer: string }>;
    }>;
  };
  // SOAP Note for clinical documentation
  hasSoapNote: boolean;
  soapNoteStatus: string;
  soapNote: {
    id: number;
    status: string;
    createdAt: string;
    approvedAt: string | null;
    isApproved: boolean;
    sourceType: string;
    generatedByAI: boolean;
    content: {
      subjective: string;
      objective: string;
      assessment: string;
      plan: string;
      medicalNecessity: string | null;
    };
    approvedByProvider: {
      id: number;
      firstName: string;
      lastName: string;
    } | null;
  } | null;
}

interface QueueResponse {
  items: QueueItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Single medication item
interface MedicationItem {
  id: string; // unique id for React key
  medicationKey: string;
  sig: string;
  quantity: string;
  refills: string;
}

// Prescription form state
interface PrescriptionFormState {
  medications: MedicationItem[];
  shippingMethod: string;
  // Address fields (for editing if missing)
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
}

// Helper to create a new empty medication
const createEmptyMedication = (): MedicationItem => ({
  id: crypto.randomUUID(),
  medicationKey: "",
  sig: "",
  quantity: "1",
  refills: "0",
});

export default function PrescriptionQueuePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [total, setTotal] = useState(0);

  // Expanded patient details
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [patientDetails, setPatientDetails] = useState<PatientDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Prescription panel
  const [prescriptionPanel, setPrescriptionPanel] = useState<{
    item: QueueItem;
    details: PatientDetails;
  } | null>(null);
  const [prescriptionForm, setPrescriptionForm] = useState<PrescriptionFormState>({
    medications: [createEmptyMedication()],
    shippingMethod: "8115", // UPS - OVERNIGHT (numeric string, will be parsed)
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
  });
  const [submittingPrescription, setSubmittingPrescription] = useState(false);

  // SOAP Note generation state
  const [generatingSoapNote, setGeneratingSoapNote] = useState<number | null>(null);
  const [approvingSoapNote, setApprovingSoapNote] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Decline modal state
  const [declineModal, setDeclineModal] = useState<{
    item: QueueItem;
  } | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [declining, setDeclining] = useState(false);

  // Check user role on mount (for showing/hiding approve button)
  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        });
        if (response.ok) {
          const data = await response.json();
          setUserRole(data.user?.role || null);
        }
      } catch (err) {
        console.error("Error checking user role:", err);
      }
    };
    checkUserRole();
  }, []);

  const getAuthToken = () => {
    return localStorage.getItem("auth-token") || localStorage.getItem("provider-token");
  };

  const fetchQueue = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/provider/prescription-queue", {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (response.ok) {
        const data: QueueResponse = await response.json();
        setQueueItems(data.items || []);
        setTotal(data.total || 0);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to fetch queue");
      }
    } catch (err) {
      console.error("Error fetching prescription queue:", err);
      setError("Failed to fetch prescription queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const fetchPatientDetails = async (invoiceId: number) => {
    setLoadingDetails(true);
    try {
      const response = await fetch(`/api/provider/prescription-queue/${invoiceId}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (response.ok) {
        const data: PatientDetails = await response.json();
        setPatientDetails(data);
        return data;
      }
    } catch (err) {
      console.error("Error fetching patient details:", err);
    } finally {
      setLoadingDetails(false);
    }
    return null;
  };

  const handleExpandItem = async (invoiceId: number) => {
    if (expandedItem === invoiceId) {
      setExpandedItem(null);
      setPatientDetails(null);
    } else {
      setExpandedItem(invoiceId);
      await fetchPatientDetails(invoiceId);
    }
  };

  // Generate SOAP note for a patient
  const handleGenerateSoapNote = async (item: QueueItem) => {
    setGeneratingSoapNote(item.invoiceId);
    setError("");

    try {
      const response = await fetch("/api/soap-notes/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          patientId: item.patientId,
          invoiceId: item.invoiceId,
        }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        // Update the queue item with the new SOAP note
        setQueueItems((prev) =>
          prev.map((qi) =>
            qi.invoiceId === item.invoiceId
              ? {
                  ...qi,
                  hasSoapNote: true,
                  soapNoteStatus: data.soapNote?.status || 'DRAFT',
                  soapNote: data.soapNote,
                }
              : qi
          )
        );
        setSuccessMessage(`SOAP note generated for ${item.patientName}`);
        setTimeout(() => setSuccessMessage(""), 4000);

        // Refresh patient details if expanded
        if (expandedItem === item.invoiceId) {
          await fetchPatientDetails(item.invoiceId);
        }

        // Refresh prescription panel if open for this item
        if (prescriptionPanel && prescriptionPanel.item.invoiceId === item.invoiceId) {
          const updatedDetails = await fetchPatientDetails(item.invoiceId);
          if (updatedDetails) {
            setPrescriptionPanel({ item: prescriptionPanel.item, details: updatedDetails });
          }
        }
      } else {
        setError(data.error || data.message || "Failed to generate SOAP note");
      }
    } catch (err) {
      console.error("Error generating SOAP note:", err);
      setError("Failed to generate SOAP note. Please try again.");
    } finally {
      setGeneratingSoapNote(null);
    }
  };

  // Approve SOAP note (provider only)
  const handleApproveSoapNote = async (soapNoteId: number, item: QueueItem) => {
    if (!soapNoteId) return;
    
    setApprovingSoapNote(soapNoteId);
    setError("");

    try {
      const response = await fetch(`/api/soap-notes/${soapNoteId}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        // Update the queue item with approved status
        setQueueItems((prev) =>
          prev.map((qi) =>
            qi.invoiceId === item.invoiceId && qi.soapNote
              ? {
                  ...qi,
                  soapNoteStatus: 'APPROVED',
                  soapNote: {
                    ...qi.soapNote,
                    status: 'APPROVED',
                    isApproved: true,
                    approvedAt: new Date().toISOString(),
                  },
                }
              : qi
          )
        );
        setSuccessMessage(`SOAP note approved for ${item.patientName}`);
        setTimeout(() => setSuccessMessage(""), 4000);

        // Refresh patient details if expanded
        if (expandedItem === item.invoiceId) {
          await fetchPatientDetails(item.invoiceId);
        }

        // Refresh prescription panel if open
        if (prescriptionPanel && prescriptionPanel.item.invoiceId === item.invoiceId) {
          const updatedDetails = await fetchPatientDetails(item.invoiceId);
          if (updatedDetails) {
            setPrescriptionPanel({ item: prescriptionPanel.item, details: updatedDetails });
          }
        }
      } else {
        setError(data.error || "Failed to approve SOAP note");
      }
    } catch (err) {
      console.error("Error approving SOAP note:", err);
      setError("Failed to approve SOAP note. Please try again.");
    } finally {
      setApprovingSoapNote(null);
    }
  };

  // Check if current user can approve (provider or super_admin)
  const canApprove = userRole === 'provider' || userRole === 'super_admin';

  const handleOpenPrescriptionPanel = async (item: QueueItem) => {
    const details = await fetchPatientDetails(item.invoiceId);
    if (details) {
      setPrescriptionPanel({ item, details });
      // Reset form with fresh medication and pre-populate address from patient data
      setPrescriptionForm({
        medications: [createEmptyMedication()],
        shippingMethod: "8115",
        address1: details.patient.address1 || "",
        address2: details.patient.address2 || "",
        city: details.patient.city || "",
        state: details.patient.state || "",
        zip: details.patient.zip || "",
      });
      // Try to auto-select medication based on treatment
      autoSelectMedication(item.treatment, details);
    }
  };

  const autoSelectMedication = (treatment: string, details: PatientDetails) => {
    const treatmentLower = treatment.toLowerCase();
    const metadata = details.invoice.metadata as Record<string, string>;

    // Try to match medication from MEDS
    let matchedKey = "";
    let matchedSig = "";
    let matchedQty = "1";
    let matchedRefills = "0";

    Object.entries(MEDS).forEach(([key, med]) => {
      const nameLower = med.name.toLowerCase();
      if (
        treatmentLower.includes(nameLower) ||
        nameLower.includes(treatmentLower.split(" ")[0])
      ) {
        matchedKey = key;
        if (med.sigTemplates?.[0]) {
          matchedSig = med.sigTemplates[0].sig;
          matchedQty = med.sigTemplates[0].quantity;
          matchedRefills = med.sigTemplates[0].refills;
        } else if (med.defaultSig) {
          matchedSig = med.defaultSig;
          matchedQty = med.defaultQuantity || "1";
          matchedRefills = med.defaultRefills || "0";
        }
      }
    });

    // Also check metadata for product info
    if (!matchedKey && metadata?.product) {
      Object.entries(MEDS).forEach(([key, med]) => {
        if (med.name.toLowerCase().includes(metadata.product.toLowerCase())) {
          matchedKey = key;
        }
      });
    }

    // Update the first medication in the array
    setPrescriptionForm((prev) => ({
      ...prev,
      medications: [{
        ...prev.medications[0],
        medicationKey: matchedKey,
        sig: matchedSig || prev.medications[0].sig,
        quantity: matchedQty,
        refills: matchedRefills,
      }],
    }));
  };

  const handleMedicationChange = (index: number, key: string) => {
    const med = MEDS[key];
    let sig = "";
    let qty = "1";
    let refills = "0";

    if (med) {
      if (med.sigTemplates?.[0]) {
        sig = med.sigTemplates[0].sig;
        qty = med.sigTemplates[0].quantity;
        refills = med.sigTemplates[0].refills;
      } else if (med.defaultSig) {
        sig = med.defaultSig;
        qty = med.defaultQuantity || "1";
        refills = med.defaultRefills || "0";
      }
    }

    setPrescriptionForm((prev) => ({
      ...prev,
      medications: prev.medications.map((m, i) =>
        i === index ? { ...m, medicationKey: key, sig, quantity: qty, refills } : m
      ),
    }));
  };

  const updateMedicationField = (index: number, field: keyof MedicationItem, value: string) => {
    setPrescriptionForm((prev) => ({
      ...prev,
      medications: prev.medications.map((m, i) =>
        i === index ? { ...m, [field]: value } : m
      ),
    }));
  };

  const addMedication = () => {
    setPrescriptionForm((prev) => ({
      ...prev,
      medications: [...prev.medications, createEmptyMedication()],
    }));
  };

  const removeMedication = (index: number) => {
    setPrescriptionForm((prev) => ({
      ...prev,
      medications: prev.medications.filter((_, i) => i !== index),
    }));
  };

  // Check if address is complete
  const isAddressComplete = (form: PrescriptionFormState) => {
    return form.address1 && form.city && form.state && form.zip;
  };

  // Check if at least one medication is valid
  const hasValidMedication = () => {
    return prescriptionForm.medications.some(m => m.medicationKey && m.sig);
  };

  const handleSubmitPrescription = async () => {
    if (!prescriptionPanel || !hasValidMedication()) return;

    // Validate address
    if (!isAddressComplete(prescriptionForm)) {
      setError("Shipping address is required. Please fill in all address fields.");
      return;
    }

    setSubmittingPrescription(true);
    setError("");

    try {
      const { details } = prescriptionPanel;

      // Use address from form (may have been edited)
      // Normalize gender: validation schema expects 'm', 'f', or 'other'
      const normalizedGender = (() => {
        const g = (details.patient.gender || "").toLowerCase().trim();
        if (["m", "male", "man"].includes(g)) return "m";
        if (["f", "female", "woman"].includes(g)) return "f";
        return "other";
      })();

      const payload = {
        patient: {
          firstName: details.patient.firstName,
          lastName: details.patient.lastName,
          dob: details.patient.dob,
          gender: normalizedGender,
          phone: details.patient.phone,
          email: details.patient.email,
          address1: prescriptionForm.address1,
          address2: prescriptionForm.address2,
          city: prescriptionForm.city,
          state: prescriptionForm.state,
          zip: prescriptionForm.zip,
        },
        rxs: prescriptionForm.medications
          .filter(m => m.medicationKey && m.sig) // Only include medications with data
          .map(m => ({
            medicationKey: m.medicationKey,
            sig: m.sig,
            quantity: m.quantity,
            refills: m.refills,
          })),
        shippingMethod: parseInt(prescriptionForm.shippingMethod, 10),
        clinicId: details.clinic?.id,
        invoiceId: details.invoice.id,
        patientId: details.patient.id,
      };

      const response = await fetch("/api/prescriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        // Mark as processed
        await handleMarkProcessed(
          prescriptionPanel.item.invoiceId,
          prescriptionPanel.item.patientName,
          false
        );
        setPrescriptionPanel(null);
        setSuccessMessage(
          `Prescription for ${prescriptionPanel.item.patientName} sent to Lifefile successfully!`
        );
        setTimeout(() => setSuccessMessage(""), 5000);
      } else {
        const errorData = await response.json();
        // Build a more helpful error message
        let errorMessage = errorData.error || "Failed to submit prescription";
        if (errorData.details) {
          const detailMessages = Object.entries(errorData.details)
            .map(([field, errors]) => `${field}: ${(errors as string[]).join(', ')}`)
            .join('; ');
          if (detailMessages) {
            errorMessage += ` (${detailMessages})`;
          }
        }
        if (errorData.detail) {
          errorMessage += `: ${errorData.detail}`;
        }
        console.error('[Prescription Queue] Submission error:', errorData);
        setError(errorMessage);
      }
    } catch (err) {
      console.error("Error submitting prescription:", err);
      setError("Failed to submit prescription");
    } finally {
      setSubmittingPrescription(false);
    }
  };

  const handleMarkProcessed = async (
    invoiceId: number,
    patientName: string,
    showMessage = true
  ) => {
    setProcessing(invoiceId);
    if (showMessage) setError("");

    try {
      const response = await fetch("/api/provider/prescription-queue", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ invoiceId }),
      });

      if (response.ok) {
        setQueueItems((prev) => prev.filter((item) => item.invoiceId !== invoiceId));
        setTotal((prev) => prev - 1);
        if (showMessage) {
          setSuccessMessage(`Prescription for ${patientName} marked as processed`);
          setTimeout(() => setSuccessMessage(""), 3000);
        }
      } else {
        const errorData = await response.json();
        if (showMessage) setError(errorData.error || "Failed to mark as processed");
      }
    } catch (err) {
      console.error("Error marking prescription as processed:", err);
      if (showMessage) setError("Failed to mark prescription as processed");
    } finally {
      setProcessing(null);
    }
  };

  const handleDecline = async () => {
    if (!declineModal || !declineReason.trim()) return;

    setDeclining(true);
    setError("");

    try {
      const response = await fetch("/api/provider/prescription-queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          invoiceId: declineModal.item.invoiceId,
          reason: declineReason.trim(),
        }),
      });

      if (response.ok) {
        setQueueItems((prev) =>
          prev.filter((item) => item.invoiceId !== declineModal.item.invoiceId)
        );
        setTotal((prev) => prev - 1);
        setSuccessMessage(
          `Prescription for ${declineModal.item.patientName} has been declined`
        );
        setTimeout(() => setSuccessMessage(""), 4000);
        setDeclineModal(null);
        setDeclineReason("");
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to decline prescription");
      }
    } catch (err) {
      console.error("Error declining prescription:", err);
      setError("Failed to decline prescription");
    } finally {
      setDeclining(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatDob = (dob: string) => {
    if (!dob) return "-";
    const date = new Date(dob);
    const age = Math.floor(
      (Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );
    return `${date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })} (${age} yrs)`;
  };

  const filteredItems = queueItems.filter((item) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      item.patientName.toLowerCase().includes(searchLower) ||
      item.patientEmail.toLowerCase().includes(searchLower) ||
      item.treatment.toLowerCase().includes(searchLower) ||
      item.invoiceNumber.toLowerCase().includes(searchLower)
    );
  });

  // Group medications by category for the dropdown
  const medicationOptions = Object.entries(MEDS).map(([key, med]) => ({
    key,
    label: `${med.name} ${med.strength} (${med.formLabel})`,
    name: med.name,
  }));

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#efece7' }}>
      {/* Header */}
      <div className="border-b border-gray-200 sticky top-0 z-10" style={{ backgroundColor: '#efece7' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* MedLink Logo */}
              <svg width="120" height="32" viewBox="0 0 1975.06 435.89" xmlns="http://www.w3.org/2000/svg">
                <g>
                  <path d="M282.71 63.4c-1.5-2.26-4.59-4.65-7.77-4.3-27.14.25-54.41-.43-81.53.49-13.43 1.39-.74 50.12-6.74 60.76-3.5 3.91-34.92 2.46-40.73 1.23-.92-.32-1.3-.77-1.34-1.5-.04-1.8-.03-6.21-.07-11.57.25-11.46-.72-22.1.26-32.58 12.23-57.73 56.69-62.77 107.49-59.33 49.51-2.23 76.7 36.47 74.82 82.82 2.42 2.09 7.94.85 11.35 1.11 22.78-1.67 46.16 10.47 59.35 28.97 16.37 23.14 11.66 52.74 11.49 79.39 3.97 38.98-28.44 72.55-66.91 73.26-28.16-.09-94.79.18-131.52.13-31.2.02-54.5.06-62.97.06-1.42-.04-1.27 2.19-1.63 3.6-1.95 22.22 1.14 46.34.13 68.85-.16 2.66.13 5.54 2.12 7.49 1.21 1.3 3.05 2.39 4.67 2.11 3.16 0 11.13 0 20.92.01 14.22.03 33.28 0 47.24.03 8.95-.78 14.42 2.49 19.49-3.61 1.2-1.78 1.41-3.97 1.41-6.09-.15-14.38.33-28.77.12-43.17.39-3.31-2.1-9.07 2.72-9.8 10.04-1.19 22.86-.99 33.51-.5 3.18.42 7.25-.09 6.39 4.7.02 10.47.03 23.72.05 34.31-.92 33.69-26.83 62.3-60.73 66.47-43.07 3.28-97.71 5.63-116.18-42.62-4.25-10.71-5.07-22.24-5.11-33.65-.17-2.13.64-5-.89-6.72-6.45-2.15-15.88.29-22.72-1.03-32.92-3.6-60.69-33.58-59.46-67.15.12-7-.05-13.99-.22-21.01-5.59-48.16 15.49-90.38 67.79-93.12 15.04.27 157.97-.16 193.71.04.41.04 1.98-.59 1.98-1.51-.44-7.59.84-68.65-.46-76.49l-.06-.08ZM144.3 280.66c.18-4.59.04-66.95.08-74.62-.06-2.03 2.88-2.21 4.58-2.41 9.96-.35 20.06.05 30.07-.08 2.51-.08 5.89-.57 7.82 1.16 1.8 3.76.27 8.18.75 13.32.37 6.63-.77 15.5.49 21.05 26.08.91 163.76-.01 173.58.31 1.7-.37 4.67-3.36 5.47-5.43.59-26.3 1.69-54.36.85-80.59.14-4.31-2.79-9.65-7-10.41-6.49-.04-54.16-.08-70.39-.13-2.05-.03-4.29-.38-5.15 1.91-1.15 16.96-.23 65.47-.64 72.84-1.48 3.86-7.53 1.37-12.37 2.04-8.22 0-20.86.02-28.22-.02-1.95-.03-1.93-2.79-2.14-4.36-.75-9.78 1.48-20.95-.35-30.82-1.28-.57-6.15-.02-14.2-.21-40.8.01-155.45-.02-160.4.02-1.56.9-3.8 3.03-4.38 5.4-1.27 28.27-.95 57.01-.24 85.31 1.04 2.58 2.96 5.4 5.17 5.81 7.22-.1 71.59.17 76.6-.08h.01Z" fill="#d46c7b"/>
                  <path d="M811.27 356.91h-35.54l-25.56-209.68-87.46 179.72h-31.55L542.9 147.23l-25.16 209.68H482.2l33.55-275.18h32.75l98.25 204.08L744.6 81.73h32.75l33.95 275.18Z" fill="#000000"/>
                  <path d="M1026.95 278.63H875.18c5.19 33.15 29.15 50.32 61.11 50.32 22.76 0 43.53-10.38 54.32-29.15l29.95 11.98c-15.97 32.35-49.52 49.92-85.47 49.92-53.12 0-95.85-39.54-95.85-98.65s42.73-97.45 95.85-97.45 92.66 38.34 92.66 97.45c0 5.19-.4 10.38-.8 15.58M993 248.68c-4.39-31.95-27.16-50.32-57.91-50.32s-53.92 16.77-59.51 50.32z" fill="#000000"/>
                  <path d="M1212.66 68.95h34.75v287.96h-34.75v-29.15c-12.38 21.17-39.54 33.95-66.3 33.95-51.12 0-93.46-39.54-93.46-98.25s41.93-97.85 93.06-97.85c27.96 0 54.32 11.98 66.7 33.95zm0 194.1c0-40.34-32.75-64.7-63.5-64.7-33.95 0-61.11 27.16-61.11 64.7s27.16 65.9 61.11 65.9 63.5-25.96 63.5-65.9" fill="#000000"/>
                  <path d="M1342.46 323.36h112.63v33.55h-148.97V81.73h36.34z" fill="#000000"/>
                  <path d="M1476.65 101.7c0-13.18 11.18-23.16 24.36-23.16s24.76 9.98 24.76 23.16-11.18 23.16-24.76 23.16-24.36-9.98-24.36-23.16m7.19 255.21V170.4h34.75v186.51z" fill="#000000"/>
                  <path d="M1740.64 249.08v107.83h-34.75V251.07c0-31.15-19.17-51.12-45.13-51.12s-57.11 15.58-57.11 55.91V356.9h-34.75V170.39h34.75v28.36c11.18-22.77 41.54-33.15 61.9-33.15 46.33 0 75.48 31.15 75.08 83.47Z" fill="#000000"/>
                  <path d="M1955.91 356.91h-46.73l-85.87-91.06v91.06h-34.75V68.95h34.75v167.34l64.7-65.9h48.33l-79.88 80.68z" fill="#000000"/>
                </g>
              </svg>
              <div className="border-l border-gray-300 pl-4">
                <h1 className="text-xl font-bold text-gray-900">Rx Queue</h1>
                <p className="text-sm text-gray-500">
                  {total} patient{total !== 1 ? "s" : ""} awaiting prescriptions
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setLoading(true);
                fetchQueue();
              }}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-white/50 rounded-lg transition-all border border-gray-300"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Success/Error Messages */}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 animate-in slide-in-from-top duration-300">
            <div className="p-1.5 bg-green-100 rounded-full">
              <Check className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-green-800 font-medium">{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-800">{error}</span>
            <button onClick={() => setError("")} className="ml-auto text-red-600 hover:text-red-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by patient name, email, treatment, or invoice..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-transparent shadow-sm"
          />
        </div>

        {/* Queue Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchTerm ? "No matching results" : "All caught up!"}
            </h3>
            <p className="text-gray-500">
              {searchTerm
                ? "Try adjusting your search terms"
                : "No prescriptions pending. Great work!"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div
                key={item.invoiceId}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all hover:shadow-md"
              >
                {/* Main Card Content */}
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Patient Info */}
                    <div className="flex items-center gap-4 min-w-[200px]">
                      <div className="w-12 h-12 bg-gradient-to-br from-rose-100 to-rose-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-6 h-6 text-rose-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {item.patientName}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                            {item.patientDisplayId}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 truncate max-w-[180px]">{item.patientEmail}</p>
                      </div>
                    </div>

                    {/* Treatment & Plan */}
                    <div className="flex items-center gap-3 sm:min-w-[220px]">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <Pill className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[180px]">
                          {item.treatment}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                            item.planMonths >= 6 
                              ? 'bg-emerald-100 text-emerald-700' 
                              : item.planMonths >= 3 
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-gray-200 text-gray-700'
                          }`}>
                            {item.plan} ({item.planMonths} {item.planMonths === 1 ? 'mo' : 'mos'})
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{item.invoiceNumber}</p>
                      </div>
                    </div>

                    {/* Clinic */}
                    <div className="hidden lg:flex items-center gap-2 min-w-[140px]">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-700">{item.clinic?.name || "Unknown"}</p>
                        {item.clinic?.lifefileEnabled ? (
                          <span className="inline-flex items-center text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                            Lifefile ✓
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                            <AlertTriangle className="w-3 h-3" />
                            No Lifefile
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Amount & Date */}
                    <div className="hidden md:block text-right min-w-[100px]">
                      <p className="text-sm font-semibold text-green-600">{item.amountFormatted}</p>
                      <p className="text-xs text-gray-400">{formatDate(item.paidAt)}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 sm:ml-4">
                      <button
                        onClick={() => handleExpandItem(item.invoiceId)}
                        className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        title="View patient details"
                      >
                        {expandedItem === item.invoiceId ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleOpenPrescriptionPanel(item)}
                        disabled={!item.clinic?.lifefileEnabled}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-xl hover:from-rose-600 hover:to-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md font-medium text-sm"
                        title={
                          item.clinic?.lifefileEnabled
                            ? "Write and send prescription"
                            : "Lifefile not configured for this clinic"
                        }
                      >
                        <Send className="w-4 h-4" />
                        <span className="hidden sm:inline">Write Rx</span>
                      </button>
                      <button
                        onClick={() => handleMarkProcessed(item.invoiceId, item.patientName)}
                        disabled={processing === item.invoiceId}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 disabled:opacity-50 transition-all font-medium text-sm"
                      >
                        {processing === item.invoiceId ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">Done</span>
                      </button>
                      <button
                        onClick={() => setDeclineModal({ item })}
                        className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all font-medium text-sm border border-red-200"
                        title="Decline prescription request"
                      >
                        <X className="w-4 h-4" />
                        <span className="hidden sm:inline">Decline</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Patient Details */}
                {expandedItem === item.invoiceId && (
                  <div className="border-t border-gray-100 bg-gray-50 p-5">
                    {loadingDetails ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
                      </div>
                    ) : patientDetails ? (
                      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        {/* Patient Contact Info */}
                        <div className="space-y-4">
                          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                            <User className="w-4 h-4 text-rose-500" />
                            Patient Information
                          </h4>
                          <div className="space-y-3 text-sm">
                            <div className="flex items-center gap-2 text-gray-600">
                              <Phone className="w-4 h-4 text-gray-400" />
                              {patientDetails.patient.phone || "No phone"}
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                              <Mail className="w-4 h-4 text-gray-400" />
                              {patientDetails.patient.email}
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              {formatDob(patientDetails.patient.dob)}
                            </div>
                            <div className="flex items-start gap-2 text-gray-600">
                              <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                              <div>
                                {patientDetails.patient.address1}
                                {patientDetails.patient.address2 && (
                                  <>, {patientDetails.patient.address2}</>
                                )}
                                <br />
                                {patientDetails.patient.city}, {patientDetails.patient.state}{" "}
                                {patientDetails.patient.zip}
                              </div>
                            </div>
                            {patientDetails.patient.allergies && (
                              <div className="flex items-start gap-2 text-red-600 bg-red-50 p-2 rounded-lg">
                                <ShieldAlert className="w-4 h-4 mt-0.5" />
                                <div>
                                  <span className="font-medium">Allergies:</span>{" "}
                                  {patientDetails.patient.allergies}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* SOAP Note Section */}
                        <div className="space-y-4">
                          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                            <ClipboardCheck className="w-4 h-4 text-rose-500" />
                            SOAP Note
                            {patientDetails.soapNote && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                patientDetails.soapNote.isApproved
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}>
                                {patientDetails.soapNoteStatus}
                              </span>
                            )}
                          </h4>
                          {patientDetails.soapNote ? (
                            <div className="space-y-3">
                              {patientDetails.soapNote.generatedByAI && (
                                <div className="flex items-center gap-2 text-xs text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg w-fit">
                                  <Sparkles className="w-3.5 h-3.5" />
                                  AI Generated
                                </div>
                              )}
                              <div className="bg-white rounded-xl p-4 border border-gray-200 space-y-3 text-sm">
                                <div>
                                  <span className="font-semibold text-rose-600">S - Subjective:</span>
                                  <p className="text-gray-700 mt-1 line-clamp-3">{patientDetails.soapNote.content.subjective}</p>
                                </div>
                                <div>
                                  <span className="font-semibold text-blue-600">O - Objective:</span>
                                  <p className="text-gray-700 mt-1 line-clamp-3">{patientDetails.soapNote.content.objective}</p>
                                </div>
                                <div>
                                  <span className="font-semibold text-green-600">A - Assessment:</span>
                                  <p className="text-gray-700 mt-1 line-clamp-3">{patientDetails.soapNote.content.assessment}</p>
                                </div>
                                <div>
                                  <span className="font-semibold text-purple-600">P - Plan:</span>
                                  <p className="text-gray-700 mt-1 line-clamp-3">{patientDetails.soapNote.content.plan}</p>
                                </div>
                              </div>
                              <a
                                href={`/patients/${patientDetails.patient.id}?tab=soap`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                              >
                                View Full SOAP Note →
                              </a>
                            </div>
                          ) : (
                            <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                              <div className="flex items-start gap-3">
                                <FileWarning className="w-5 h-5 text-amber-500 mt-0.5" />
                                <div>
                                  <p className="font-medium text-amber-800">No SOAP Note</p>
                                  <p className="text-sm text-amber-700 mt-1">
                                    Clinical documentation is required before prescribing.
                                  </p>
                                  <button
                                    onClick={() => {
                                      const queueItem = queueItems.find(qi => qi.invoiceId === expandedItem);
                                      if (queueItem) handleGenerateSoapNote(queueItem);
                                    }}
                                    disabled={generatingSoapNote === expandedItem}
                                    className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium disabled:opacity-50"
                                  >
                                    {generatingSoapNote === expandedItem ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Sparkles className="w-4 h-4" />
                                    )}
                                    Generate SOAP Note
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Intake Data */}
                        <div className="lg:col-span-2 space-y-4">
                          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-rose-500" />
                            Intake Information
                          </h4>
                          {patientDetails.intake.sections.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {patientDetails.intake.sections.map((section, idx) => (
                                <div
                                  key={idx}
                                  className="bg-white rounded-xl p-4 border border-gray-200"
                                >
                                  <h5 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                                    {section.section === "Treatment" && (
                                      <Pill className="w-4 h-4 text-purple-500" />
                                    )}
                                    {section.section === "Medical History" && (
                                      <Heart className="w-4 h-4 text-red-500" />
                                    )}
                                    {section.section === "Personal Information" && (
                                      <User className="w-4 h-4 text-blue-500" />
                                    )}
                                    {section.section}
                                  </h5>
                                  <div className="space-y-2">
                                    {section.questions.map((q, qIdx) => (
                                      <div key={qIdx} className="text-sm">
                                        <span className="text-gray-500">{q.question}:</span>{" "}
                                        <span className="text-gray-900 font-medium">
                                          {q.answer || "-"}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="bg-white rounded-xl p-6 border border-gray-200 text-center text-gray-500">
                              <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                              <p>No intake data available</p>
                              <p className="text-xs mt-1">
                                Patient may have used external intake form
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-center text-gray-500 py-4">
                        Unable to load patient details
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Decline Modal */}
      {declineModal && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => {
              setDeclineModal(null);
              setDeclineReason("");
            }}
          />
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ pointerEvents: 'none' }}>
            <div 
              className="bg-white rounded-2xl shadow-xl max-w-md w-full"
              style={{ pointerEvents: 'auto' }}
            >
              {/* Modal Header */}
              <div className="bg-red-50 px-6 py-4 rounded-t-2xl border-b border-red-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <X className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      Decline Prescription
                    </h2>
                    <p className="text-sm text-gray-600">
                      {declineModal.item.patientName}
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">This action cannot be undone.</p>
                    <p className="mt-1">
                      The patient will be removed from the prescription queue. Please provide a
                      clear reason for declining.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason for Declining *
                  </label>
                  <textarea
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none"
                    placeholder="Please explain why you are declining this prescription request (e.g., medical contraindication, incomplete information, patient needs evaluation, etc.)"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Minimum 10 characters required
                  </p>
                </div>

                {/* Patient Info Summary */}
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-gray-500">Treatment:</span>
                      <p className="font-medium">{declineModal.item.treatment}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Plan:</span>
                      <p className="font-medium">{declineModal.item.plan}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Amount:</span>
                      <p className="font-medium">{declineModal.item.amountFormatted}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Invoice:</span>
                      <p className="font-medium text-xs">{declineModal.item.invoiceNumber}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDeclineModal(null);
                    setDeclineReason("");
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={declining || declineReason.trim().length < 10}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
                >
                  {declining ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Declining...
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4" />
                      Decline Prescription
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Prescription Slide-Over Panel */}
      {prescriptionPanel && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPrescriptionPanel(null)} />
          <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
            <div className="w-screen max-w-lg transform transition-transform duration-300 ease-in-out">
              <div className="flex h-full flex-col bg-white shadow-xl">
                {/* Panel Header */}
                <div className="bg-gradient-to-r from-rose-500 to-rose-600 px-6 py-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <Send className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-white">Write Prescription</h2>
                        <p className="text-sm text-rose-100">
                          {prescriptionPanel.item.patientName}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setPrescriptionPanel(null)}
                      className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Panel Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Patient Summary */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                      <User className="w-4 h-4 text-rose-500" />
                      Patient
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500">Name:</span>
                        <p className="font-medium">
                          {prescriptionPanel.details.patient.firstName}{" "}
                          {prescriptionPanel.details.patient.lastName}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">DOB:</span>
                        <p className="font-medium">{prescriptionPanel.details.patient.dob}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Phone:</span>
                        <p className="font-medium">{prescriptionPanel.details.patient.phone || "Not provided"}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Gender:</span>
                        <p className="font-medium capitalize">
                          {prescriptionPanel.details.patient.gender || "Not specified"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* SOAP Note Status - CRITICAL */}
                  {prescriptionPanel.details.hasSoapNote ? (
                    <div className={`rounded-xl p-4 border ${
                      prescriptionPanel.details.soapNote?.isApproved
                        ? 'bg-green-50 border-green-200'
                        : 'bg-amber-50 border-amber-200'
                    }`}>
                      <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        <ClipboardCheck className={`w-4 h-4 ${
                          prescriptionPanel.details.soapNote?.isApproved ? 'text-green-600' : 'text-amber-600'
                        }`} />
                        Clinical Documentation
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          prescriptionPanel.details.soapNote?.isApproved
                            ? 'bg-green-200 text-green-800'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {prescriptionPanel.details.soapNoteStatus}
                        </span>
                      </h3>
                      
                      {/* Show approval warning for draft notes */}
                      {!prescriptionPanel.details.soapNote?.isApproved && (
                        <div className="mb-3 p-2 bg-amber-100 rounded-lg text-sm text-amber-800 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          <span>SOAP note requires provider approval before prescribing.</span>
                        </div>
                      )}
                      
                      <p className={`text-sm ${prescriptionPanel.details.soapNote?.isApproved ? 'text-green-700' : 'text-amber-700'}`}>
                        SOAP note available for this patient.
                        {prescriptionPanel.details.soapNote?.generatedByAI && (
                          <span className="ml-2 inline-flex items-center gap-1 text-purple-600">
                            <Sparkles className="w-3 h-3" /> AI Generated
                          </span>
                        )}
                      </p>
                      
                      {/* Provider Approve Button */}
                      {!prescriptionPanel.details.soapNote?.isApproved && canApprove && prescriptionPanel.details.soapNote?.id && (
                        <button
                          onClick={() => handleApproveSoapNote(
                            prescriptionPanel.details.soapNote!.id, 
                            prescriptionPanel.item
                          )}
                          disabled={approvingSoapNote === prescriptionPanel.details.soapNote.id}
                          className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50"
                        >
                          {approvingSoapNote === prescriptionPanel.details.soapNote.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          Approve SOAP Note
                        </button>
                      )}
                      
                      {/* Approved badge */}
                      {prescriptionPanel.details.soapNote?.isApproved && prescriptionPanel.details.soapNote?.approvedByProvider && (
                        <p className="mt-2 text-xs text-green-600">
                          Approved by {prescriptionPanel.details.soapNote.approvedByProvider.firstName} {prescriptionPanel.details.soapNote.approvedByProvider.lastName}
                        </p>
                      )}
                      
                      <details className="mt-3">
                        <summary className={`text-sm cursor-pointer font-medium ${
                          prescriptionPanel.details.soapNote?.isApproved ? 'text-green-800 hover:text-green-900' : 'text-amber-800 hover:text-amber-900'
                        }`}>
                          View SOAP Note Summary
                        </summary>
                        <div className={`mt-3 space-y-2 text-sm bg-white rounded-lg p-3 border ${
                          prescriptionPanel.details.soapNote?.isApproved ? 'border-green-200' : 'border-amber-200'
                        }`}>
                          <div>
                            <span className="font-semibold text-rose-600">S:</span>{" "}
                            <span className="text-gray-700 line-clamp-2">{prescriptionPanel.details.soapNote?.content.subjective}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-blue-600">O:</span>{" "}
                            <span className="text-gray-700 line-clamp-2">{prescriptionPanel.details.soapNote?.content.objective}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-green-600">A:</span>{" "}
                            <span className="text-gray-700 line-clamp-2">{prescriptionPanel.details.soapNote?.content.assessment}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-purple-600">P:</span>{" "}
                            <span className="text-gray-700 line-clamp-2">{prescriptionPanel.details.soapNote?.content.plan}</span>
                          </div>
                        </div>
                      </details>
                    </div>
                  ) : (
                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                      <h3 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
                        <FileWarning className="w-4 h-4 text-amber-600" />
                        Missing SOAP Note
                      </h3>
                      <p className="text-sm text-amber-700 mb-3">
                        Clinical documentation is recommended before prescribing.
                      </p>
                      <button
                        onClick={() => handleGenerateSoapNote(prescriptionPanel.item)}
                        disabled={generatingSoapNote === prescriptionPanel.item.invoiceId}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        {generatingSoapNote === prescriptionPanel.item.invoiceId ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        Generate SOAP Note
                      </button>
                    </div>
                  )}

                  {/* Shipping Address - Editable */}
                  <div className={`rounded-xl p-4 ${isAddressComplete(prescriptionForm) ? "bg-gray-50" : "bg-red-50 border border-red-200"}`}>
                    <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                      <MapPin className={`w-4 h-4 ${isAddressComplete(prescriptionForm) ? "text-rose-500" : "text-red-500"}`} />
                      Shipping Address
                      {!isAddressComplete(prescriptionForm) && (
                        <span className="text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded-full ml-2">
                          Required for shipping
                        </span>
                      )}
                    </h3>
                    
                    {!isAddressComplete(prescriptionForm) && (
                      <div className="mb-3 p-2 bg-red-100 rounded-lg text-sm text-red-700 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Address is missing or incomplete. Please fill in below.
                      </div>
                    )}

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Street Address *
                        </label>
                        <input
                          type="text"
                          value={prescriptionForm.address1}
                          onChange={(e) =>
                            setPrescriptionForm((prev) => ({ ...prev, address1: e.target.value }))
                          }
                          placeholder="123 Main Street"
                          className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-rose-400 focus:border-transparent ${
                            !prescriptionForm.address1 ? "border-red-300 bg-red-50" : "border-gray-300"
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Apt/Suite/Unit
                        </label>
                        <input
                          type="text"
                          value={prescriptionForm.address2}
                          onChange={(e) =>
                            setPrescriptionForm((prev) => ({ ...prev, address2: e.target.value }))
                          }
                          placeholder="Apt 4B (optional)"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-400 focus:border-transparent"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            City *
                          </label>
                          <input
                            type="text"
                            value={prescriptionForm.city}
                            onChange={(e) =>
                              setPrescriptionForm((prev) => ({ ...prev, city: e.target.value }))
                            }
                            placeholder="Miami"
                            className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-rose-400 focus:border-transparent ${
                              !prescriptionForm.city ? "border-red-300 bg-red-50" : "border-gray-300"
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            State *
                          </label>
                          <input
                            type="text"
                            value={prescriptionForm.state}
                            onChange={(e) =>
                              setPrescriptionForm((prev) => ({ ...prev, state: e.target.value.toUpperCase().slice(0, 2) }))
                            }
                            placeholder="FL"
                            maxLength={2}
                            className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-rose-400 focus:border-transparent ${
                              !prescriptionForm.state ? "border-red-300 bg-red-50" : "border-gray-300"
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            ZIP *
                          </label>
                          <input
                            type="text"
                            value={prescriptionForm.zip}
                            onChange={(e) =>
                              setPrescriptionForm((prev) => ({ ...prev, zip: e.target.value }))
                            }
                            placeholder="33101"
                            className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-rose-400 focus:border-transparent ${
                              !prescriptionForm.zip ? "border-red-300 bg-red-50" : "border-gray-300"
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Plan Duration Info - Important for prescribing */}
                  <div className="rounded-xl p-4 border border-gray-200 bg-rose-50">
                    <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-rose-600" />
                      Prescription Duration
                    </h3>
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold ${
                        prescriptionPanel.item.planMonths >= 6 
                          ? 'bg-emerald-200 text-emerald-800' 
                          : prescriptionPanel.item.planMonths >= 3 
                            ? 'bg-rose-200 text-rose-800'
                            : 'bg-gray-200 text-gray-800'
                      }`}>
                        {prescriptionPanel.item.plan}
                      </span>
                      <span className="text-sm text-gray-700">
                        Prescribe <strong>{prescriptionPanel.item.planMonths} {prescriptionPanel.item.planMonths === 1 ? 'month' : 'months'}</strong> supply
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">
                      Patient paid for {prescriptionPanel.item.planMonths}-month plan. Adjust quantity accordingly.
                    </p>
                  </div>

                  {/* Clinic Info */}
                  <div className="bg-green-50 rounded-xl p-4">
                    <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-green-600" />
                      Pharmacy Routing
                    </h3>
                    <p className="text-sm text-gray-600">
                      Prescription will be sent via{" "}
                      <span className="font-semibold text-green-700">
                        {prescriptionPanel.details.clinic?.lifefilePracticeName ||
                          prescriptionPanel.details.clinic?.name}
                      </span>{" "}
                      Lifefile account
                    </p>
                  </div>

                  {/* Medications Selection - Multiple */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900 flex items-center gap-2">
                        <Pill className="w-4 h-4 text-purple-500" />
                        Medications ({prescriptionForm.medications.length})
                      </h3>
                      <button
                        type="button"
                        onClick={addMedication}
                        className="text-sm text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" /> Add Medication
                      </button>
                    </div>

                    {prescriptionForm.medications.map((medication, index) => (
                      <div
                        key={medication.id}
                        className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50 relative"
                      >
                        {/* Medication Header */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-600">
                            Medication #{index + 1}
                          </span>
                          {prescriptionForm.medications.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeMedication(index)}
                              className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors"
                              title="Remove this medication"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Select Medication *
                          </label>
                          <select
                            value={medication.medicationKey}
                            onChange={(e) => handleMedicationChange(index, e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-transparent bg-white"
                          >
                            <option value="">Select a medication...</option>
                            {medicationOptions.map((med) => (
                              <option key={med.key} value={med.key}>
                                {med.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Sig (Directions) *
                          </label>
                          <textarea
                            value={medication.sig}
                            onChange={(e) => updateMedicationField(index, 'sig', e.target.value)}
                            rows={2}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-transparent resize-none bg-white"
                            placeholder="Enter directions for use..."
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Quantity *
                            </label>
                            <input
                              type="text"
                              value={medication.quantity}
                              onChange={(e) => updateMedicationField(index, 'quantity', e.target.value)}
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-transparent bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Refills
                            </label>
                            <select
                              value={medication.refills}
                              onChange={(e) => updateMedicationField(index, 'refills', e.target.value)}
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-transparent bg-white"
                            >
                              {[0, 1, 2, 3, 4, 5, 6, 11].map((n) => (
                                <option key={n} value={String(n)}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Quick Add Another Button at bottom */}
                    <button
                      type="button"
                      onClick={addMedication}
                      className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-rose-400 hover:text-rose-600 transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-5 h-5" />
                      Add Another Medication
                    </button>
                  </div>

                  {/* Shipping Method */}
                  <div className="space-y-3">
                    <h3 className="font-medium text-gray-900 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-500" />
                      Shipping Method
                    </h3>
                    <div className="space-y-2">
                      {SHIPPING_METHODS.map((method) => (
                        <label
                          key={method.id}
                          className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all ${
                            prescriptionForm.shippingMethod === String(method.id)
                              ? "border-rose-400 bg-rose-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="shippingMethod"
                            value={String(method.id)}
                            checked={prescriptionForm.shippingMethod === String(method.id)}
                            onChange={(e) =>
                              setPrescriptionForm((prev) => ({
                                ...prev,
                                shippingMethod: e.target.value,
                              }))
                            }
                            className="w-4 h-4 text-rose-500 focus:ring-rose-400"
                          />
                          <p className="font-medium text-gray-900">{method.label}</p>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Panel Footer */}
                <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
                  <div className="flex gap-3">
                    <button
                      onClick={() => setPrescriptionPanel(null)}
                      className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmitPrescription}
                      disabled={
                        submittingPrescription ||
                        !hasValidMedication() ||
                        !isAddressComplete(prescriptionForm)
                      }
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-xl hover:from-rose-600 hover:to-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
                    >
                      {submittingPrescription ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Sending...
                        </>
                      ) : !isAddressComplete(prescriptionForm) ? (
                        <>
                          <AlertCircle className="w-4 h-4" />
                          Address Required
                        </>
                      ) : !hasValidMedication() ? (
                        <>
                          <AlertCircle className="w-4 h-4" />
                          Add Medication
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Send {prescriptionForm.medications.filter(m => m.medicationKey && m.sig).length} Rx{prescriptionForm.medications.filter(m => m.medicationKey && m.sig).length > 1 ? 's' : ''} to Pharmacy
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
