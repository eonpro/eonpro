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
}

interface QueueResponse {
  items: QueueItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Prescription form state
interface PrescriptionFormState {
  medicationKey: string;
  sig: string;
  quantity: string;
  refills: string;
  shippingMethod: string;
}

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
    medicationKey: "",
    sig: "",
    quantity: "1",
    refills: "0",
    shippingMethod: "8117", // UPS Overnight Saver
  });
  const [submittingPrescription, setSubmittingPrescription] = useState(false);

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

  const handleOpenPrescriptionPanel = async (item: QueueItem) => {
    const details = await fetchPatientDetails(item.invoiceId);
    if (details) {
      setPrescriptionPanel({ item, details });
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

    setPrescriptionForm((prev) => ({
      ...prev,
      medicationKey: matchedKey,
      sig: matchedSig || prev.sig,
      quantity: matchedQty,
      refills: matchedRefills,
    }));
  };

  const handleMedicationChange = (key: string) => {
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
      medicationKey: key,
      sig,
      quantity: qty,
      refills,
    }));
  };

  const handleSubmitPrescription = async () => {
    if (!prescriptionPanel || !prescriptionForm.medicationKey) return;

    setSubmittingPrescription(true);
    setError("");

    try {
      const { details } = prescriptionPanel;
      const med = MEDS[prescriptionForm.medicationKey];

      const payload = {
        patient: {
          firstName: details.patient.firstName,
          lastName: details.patient.lastName,
          dob: details.patient.dob,
          gender: details.patient.gender || "unknown",
          phone: details.patient.phone,
          email: details.patient.email,
          address1: details.patient.address1,
          address2: details.patient.address2 || "",
          city: details.patient.city,
          state: details.patient.state,
          zip: details.patient.zip,
        },
        rx: [
          {
            medicationKey: prescriptionForm.medicationKey,
            sig: prescriptionForm.sig,
            quantity: prescriptionForm.quantity,
            refills: prescriptionForm.refills,
          },
        ],
        shippingMethod: prescriptionForm.shippingMethod,
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
        setError(errorData.error || "Failed to submit prescription");
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg shadow-orange-500/20">
                <ClipboardList className="w-6 h-6 text-white" />
              </div>
              <div>
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
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
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
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent shadow-sm"
          />
        </div>

        {/* Queue Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
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
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-12 h-12 bg-gradient-to-br from-orange-100 to-orange-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-6 h-6 text-orange-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 truncate">
                            {item.patientName}
                          </h3>
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                            {item.patientDisplayId}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 truncate">{item.patientEmail}</p>
                      </div>
                    </div>

                    {/* Treatment */}
                    <div className="flex items-center gap-3 sm:min-w-[200px]">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <Pill className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[180px]">
                          {item.treatment}
                        </p>
                        <p className="text-xs text-gray-400">{item.invoiceNumber}</p>
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
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md font-medium text-sm"
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
                    </div>
                  </div>
                </div>

                {/* Expanded Patient Details */}
                {expandedItem === item.invoiceId && (
                  <div className="border-t border-gray-100 bg-gray-50 p-5">
                    {loadingDetails ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                      </div>
                    ) : patientDetails ? (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Patient Contact Info */}
                        <div className="space-y-4">
                          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                            <User className="w-4 h-4 text-orange-500" />
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

                        {/* Intake Data */}
                        <div className="lg:col-span-2 space-y-4">
                          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-orange-500" />
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

      {/* Prescription Slide-Over Panel */}
      {prescriptionPanel && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPrescriptionPanel(null)} />
          <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
            <div className="w-screen max-w-lg transform transition-transform duration-300 ease-in-out">
              <div className="flex h-full flex-col bg-white shadow-xl">
                {/* Panel Header */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <Send className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-white">Write Prescription</h2>
                        <p className="text-sm text-orange-100">
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
                      <User className="w-4 h-4 text-orange-500" />
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
                        <p className="font-medium">{prescriptionPanel.details.patient.phone}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Gender:</span>
                        <p className="font-medium capitalize">
                          {prescriptionPanel.details.patient.gender || "Not specified"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200 text-sm">
                      <span className="text-gray-500">Address:</span>
                      <p className="font-medium">
                        {prescriptionPanel.details.patient.address1},{" "}
                        {prescriptionPanel.details.patient.city},{" "}
                        {prescriptionPanel.details.patient.state}{" "}
                        {prescriptionPanel.details.patient.zip}
                      </p>
                    </div>
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

                  {/* Medication Selection */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-gray-900 flex items-center gap-2">
                      <Pill className="w-4 h-4 text-purple-500" />
                      Medication
                    </h3>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Select Medication *
                      </label>
                      <select
                        value={prescriptionForm.medicationKey}
                        onChange={(e) => handleMedicationChange(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                        value={prescriptionForm.sig}
                        onChange={(e) =>
                          setPrescriptionForm((prev) => ({ ...prev, sig: e.target.value }))
                        }
                        rows={3}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
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
                          value={prescriptionForm.quantity}
                          onChange={(e) =>
                            setPrescriptionForm((prev) => ({ ...prev, quantity: e.target.value }))
                          }
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Refills
                        </label>
                        <select
                          value={prescriptionForm.refills}
                          onChange={(e) =>
                            setPrescriptionForm((prev) => ({ ...prev, refills: e.target.value }))
                          }
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                              ? "border-orange-500 bg-orange-50"
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
                            className="w-4 h-4 text-orange-500 focus:ring-orange-500"
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
                        !prescriptionForm.medicationKey ||
                        !prescriptionForm.sig
                      }
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
                    >
                      {submittingPrescription ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Send to Pharmacy
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
