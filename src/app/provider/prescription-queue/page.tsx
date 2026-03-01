'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  ClipboardList,
  Check as CheckIcon,
  CheckCircle2,
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
} from 'lucide-react';
import { MEDS, GLP1_PRODUCT_IDS } from '@/lib/medications';
import { SHIPPING_METHODS } from '@/lib/shipping';
import SigBuilder from '@/components/SigBuilder';
import MedicationSelector, { getGLP1SubCategory } from '@/components/MedicationSelector';
import OrderSetSelector, { AppliedMedication } from '@/components/OrderSetSelector';
import {
  getGlp1Preselection,
  findOrderSetByName,
} from '@/lib/prescriptions/glp1-preselection';
import {
  parseAddressString,
  isApartmentString,
  isStateName,
  isZipCode,
  normalizeState,
  extractCityState,
} from '@/lib/address/client';
import type { ParsedAddress } from '@/lib/address/client';
import { AddressInput, type AddressData } from '@/components/AddressAutocomplete';
import { apiFetch } from '@/lib/api/fetch';
import { smartSearch } from '@/lib/utils/search';

// ============================================================================
// ADDRESS PARSING UTILITIES
// Uses shared @/lib/address; fixes corrupted data (apt in city, state in zip).
// ============================================================================

/**
 * Get parsed address from patient data, handling combined strings and corrupted fields
 */
function getPatientAddress(patient: {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): ParsedAddress {
  const addr1 = patient.address1 || '';
  const addr2 = patient.address2 || '';
  const city = patient.city || '';
  const state = patient.state || '';
  const zip = patient.zip || '';

  // Check if existing data looks INVALID and needs re-parsing
  // This handles cases where data was incorrectly stored from a combined string
  const zipLooksInvalid = zip && !isZipCode(zip) && !isStateName(zip); // zip="Texas" is invalid
  const stateLooksInvalid = state && state.length > 2 && !isStateName(state); // state="Texas" when it should be "TX"
  const stateLooksLikeZip = state && isZipCode(state); // state="95425" is wrong
  const cityLooksLikeApt = city && isApartmentString(city); // city="130" or "APT F" is wrong
  const zipIsStateName = zip && isStateName(zip); // zip="Texas" means state got put in zip field

  const dataLooksCorrupted =
    zipLooksInvalid || stateLooksInvalid || stateLooksLikeZip || cityLooksLikeApt || zipIsStateName;

  // Check if address1 looks like a combined string that needs parsing
  const hasSeparateComponents = city || state || zip || addr2;
  const looksLikeCombined = addr1 && addr1.includes(',') && !hasSeparateComponents;

  // Parse if: no separate components, OR data looks corrupted and addr1 has commas
  if (looksLikeCombined || (dataLooksCorrupted && addr1 && addr1.includes(','))) {
    return parseAddressString(addr1);
  }

  // If data looks corrupted but addr1 doesn't have commas, try to fix what we can
  if (dataLooksCorrupted) {
    let fixedCity = city;
    let fixedState = state;
    let fixedZip = zip;
    let fixedAddr2 = addr2;

    // If zip contains a state name (like "Texas"), move it to state
    // And use the original state value as city (e.g., "HO" might be Houston)
    if (zipIsStateName) {
      // Before overwriting state, check if original state could be the city
      // (e.g., state="HO" could be city abbreviation for Houston)
      const originalState = state;
      const originalStateIsNotValidState = originalState && !isStateName(originalState);

      fixedState = normalizeState(zip);
      fixedZip = '';

      // Use original state as city if it's not a valid state code and city is empty/apt
      if (originalStateIsNotValidState && (!fixedCity || cityLooksLikeApt)) {
        // Original state might be city abbreviation (HO = Houston)
        if (!fixedCity || cityLooksLikeApt) {
          fixedCity = originalState;
        }
      }
    }

    // If city looks like an apartment number, move it to address2
    if (cityLooksLikeApt && !fixedAddr2) {
      fixedAddr2 = city;
      // Only clear city if we haven't already set it from the state field
      if (fixedCity === city) {
        fixedCity = '';
      }
    }

    // If state looks invalid but could be part of "City State", try to extract
    if (stateLooksInvalid && city && !cityLooksLikeApt) {
      const combined = `${city} ${state}`;
      const cityState = extractCityState(combined);
      if (cityState) {
        fixedCity = cityState.city;
        fixedState = cityState.state;
      }
    }

    return {
      address1: addr1,
      address2: fixedAddr2,
      city: fixedCity,
      state: fixedState,
      zip: fixedZip,
    };
  }

  return { address1: addr1, address2: addr2, city, state, zip };
}

// ============================================================================

interface QueueItem {
  queueType?: 'invoice' | 'refill' | 'queued_order';
  invoiceId: number | null;
  orderId?: number;
  refillId?: number | null;
  patientId: number;
  patientDisplayId: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  patientDob: string;
  treatment: string;
  plan: string; // e.g., "Monthly", "Quarterly", "6-Month"
  planMonths: number; // e.g., 1, 3, 6
  amount: number | null;
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
  // GLP-1 history info for prescribing decisions
  glp1Info: {
    usedGlp1: boolean;
    glp1Type: string | null;
    lastDose: string | null;
  };
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
  // Queued order only: admin-queued prescription awaiting provider approve-and-send
  rxs?: Array<{
    medicationKey: string;
    medName: string;
    strength: string;
    form: string;
    quantity: string;
    refills: string;
    sig: string;
  }>;
  requestJson?: string | null;
  queuedByUserId?: number | null;
  // Hold status (provider needs more information)
  holdReason?: string | null;
  heldAt?: string | null;
  // Duplicate prescription safeguard
  recentPrescription?: {
    hasDuplicate: boolean;
    orders: Array<{
      orderId: number;
      createdAt: string;
      status: string | null;
      primaryMedName: string | null;
      primaryMedStrength: string | null;
      providerName?: string;
    }>;
    windowDays: number;
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
  // Clinical context for prescribing decisions
  clinicalContext?: {
    healthConditions: string[];
    contraindications: string[];
    currentMedications: string | null;
    allergies: string | null;
    vitals: { heightFt: string | null; heightIn: string | null; weightLbs: string | null; bmi: string | null };
    reproductiveStatus: string | null;
    glp1History: { used: boolean; type: string | null; dose: string | null; sideEffects: string | null };
    preferredMedication: string | null;
    thyroidIssues: string | null;
    alcoholUse: string | null;
    exerciseFrequency: string | null;
    weightGoal: string | null;
  };
  // Shipment schedule for multi-month plans
  shipmentSchedule?: {
    totalShipments: number;
    planName: string | null;
    shipments: Array<{
      shipmentNumber: number;
      date: string;
      status: string;
      medication: string | null;
    }>;
  } | null;
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
  daysSupply: string;
}

// Prescription form state
interface PrescriptionFormState {
  medications: MedicationItem[];
  shippingMethod: string;
  // Pharmacy gender: Lifefile only accepts 'm' or 'f'
  // When patient gender is 'other' or unknown, provider must select biological sex
  pharmacyGender: 'm' | 'f' | '';
  // Address fields (for editing if missing)
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
}

// WellMedR default: FedEx 2 Day (not UPS 2 Day)
const WELLMEDR_DEFAULT_SHIPPING_ID = '8234'; // FEDEX- 2 DAY

// Helper to create a new empty medication
const createEmptyMedication = (): MedicationItem => ({
  id: crypto.randomUUID(),
  medicationKey: '',
  sig: '',
  quantity: '1',
  refills: '0',
  daysSupply: '30',
});

export default function PrescriptionQueuePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [fetchFailed, setFetchFailed] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [total, setTotal] = useState(0);

  // Expanded patient details
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [patientDetails, setPatientDetails] = useState<PatientDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Prescription panel
  const [prescriptionPanel, setPrescriptionPanel] = useState<{
    item: QueueItem;
    details: PatientDetails;
  } | null>(null);
  const [prescriptionForm, setPrescriptionForm] = useState<PrescriptionFormState>({
    medications: [createEmptyMedication()],
    shippingMethod: '8115', // Default UPS Overnight; Wellmedr → FedEx 2 Day (8234) set in useEffect
    pharmacyGender: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
  });
  const [submittingPrescription, setSubmittingPrescription] = useState(false);
  const [approvingOrderId, setApprovingOrderId] = useState<number | null>(null);
  const [autoSelectedOrderSetId, setAutoSelectedOrderSetId] = useState<number | null>(null);

  // SOAP Note generation state
  const [generatingSoapNote, setGeneratingSoapNote] = useState<number | null>(null);
  const [approvingSoapNote, setApprovingSoapNote] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Decline modal state
  const [declineModal, setDeclineModal] = useState<{
    item: QueueItem;
  } | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declining, setDeclining] = useState(false);

  // Hold for info state
  const [resuming, setResuming] = useState<number | null>(null);

  // Queue tab state
  const [activeTab, setActiveTab] = useState<'ready' | 'needs_info'>('ready');

  // Check user role on mount (for showing/hiding approve button)
  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const response = await apiFetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        });
        if (response.ok) {
          const data = await response.json();
          setUserRole(data.user?.role || null);
        }
      } catch (err) {
        console.error('Error checking user role:', err);
      }
    };
    checkUserRole();
  }, []);

  // Wellmedr RX queue: preselect FedEx 2 Day (8234), not UPS 2 Day
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hostname.toLowerCase().includes('wellmedr')) {
      setPrescriptionForm((prev) => ({ ...prev, shippingMethod: WELLMEDR_DEFAULT_SHIPPING_ID }));
    }
  }, []);

  const getAuthToken = () => {
    return localStorage.getItem('auth-token') || localStorage.getItem('provider-token');
  };

  const fetchQueue = useCallback(async (retryAttempt = 0) => {
    const MAX_RETRIES = 2;
    try {
      if (retryAttempt === 0) {
        setError('');
        setFetchFailed(false);
      }
      const response = await apiFetch('/api/provider/prescription-queue', {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (response.ok) {
        const data: QueueResponse = await response.json();
        setQueueItems(data.items || []);
        setTotal(data.total || 0);
        setFetchFailed(false);
        setError('');
      } else if (response.status === 503 && retryAttempt < MAX_RETRIES) {
        // Service temporarily busy - auto-retry after short delay
        await new Promise((r) => setTimeout(r, 2000 * (retryAttempt + 1)));
        return fetchQueue(retryAttempt + 1);
      } else {
        const errorData = await response.json();
        const msg = errorData.error || 'Failed to fetch queue';
        setError(msg);
        setFetchFailed(true);
        setQueueItems([]);
      }
    } catch (err) {
      if (retryAttempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * (retryAttempt + 1)));
        return fetchQueue(retryAttempt + 1);
      }
      console.error('Error fetching prescription queue:', err);
      setError('Failed to fetch prescription queue. Please check your connection and try again.');
      setFetchFailed(true);
      setQueueItems([]);
    } finally {
      if (retryAttempt === 0 || retryAttempt >= MAX_RETRIES) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const fetchPatientDetails = async (invoiceId: number) => {
    setLoadingDetails(true);
    try {
      const response = await apiFetch(`/api/provider/prescription-queue/${invoiceId}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (response.ok) {
        const data: PatientDetails = await response.json();
        setPatientDetails(data);
        return data;
      }
    } catch (err) {
      console.error('Error fetching patient details:', err);
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
      setExpandedOrderId(null);
      await fetchPatientDetails(invoiceId);
    }
  };

  const handleExpandOrderItem = (orderId: number) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
    } else {
      setExpandedOrderId(orderId);
      setExpandedItem(null);
      setPatientDetails(null);
    }
  };

  // Generate SOAP note for a patient
  const handleGenerateSoapNote = async (item: QueueItem) => {
    setGeneratingSoapNote(item.invoiceId);
    setError('');

    try {
      const response = await apiFetch('/api/soap-notes/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
        setTimeout(() => setSuccessMessage(''), 4000);

        // Refresh patient details if expanded
        if (expandedItem === item.invoiceId && item.invoiceId != null) {
          await fetchPatientDetails(item.invoiceId);
        }

        // Refresh prescription panel if open for this item
        if (prescriptionPanel && prescriptionPanel.item.invoiceId === item.invoiceId && item.invoiceId != null) {
          const updatedDetails = await fetchPatientDetails(item.invoiceId);
          if (updatedDetails) {
            setPrescriptionPanel({ item: prescriptionPanel.item, details: updatedDetails });
          }
        }
      } else {
        setError(data.error || data.message || 'Failed to generate SOAP note');
      }
    } catch (err) {
      console.error('Error generating SOAP note:', err);
      setError('Failed to generate SOAP note. Please try again.');
    } finally {
      setGeneratingSoapNote(null);
    }
  };

  // Approve SOAP note (provider only)
  const handleApproveSoapNote = async (soapNoteId: number, item: QueueItem) => {
    if (!soapNoteId) return;

    setApprovingSoapNote(soapNoteId);
    setError('');

    try {
      const response = await apiFetch(`/api/soap-notes/${soapNoteId}/approve`, {
        method: 'POST',
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
        setTimeout(() => setSuccessMessage(''), 4000);

        // Refresh patient details if expanded
        if (expandedItem === item.invoiceId && item.invoiceId != null) {
          await fetchPatientDetails(item.invoiceId);
        }

        // Refresh prescription panel if open
        if (prescriptionPanel && prescriptionPanel.item.invoiceId === item.invoiceId && item.invoiceId != null) {
          const updatedDetails = await fetchPatientDetails(item.invoiceId);
          if (updatedDetails) {
            setPrescriptionPanel({ item: prescriptionPanel.item, details: updatedDetails });
          }
        }
      } else {
        setError(data.error || 'Failed to approve SOAP note');
      }
    } catch (err) {
      console.error('Error approving SOAP note:', err);
      setError('Failed to approve SOAP note. Please try again.');
    } finally {
      setApprovingSoapNote(null);
    }
  };

  // Check if current user can approve (provider or super_admin)
  const canApprove = userRole === 'provider' || userRole === 'super_admin';

  // Approve and send admin-queued order to pharmacy (provider only)
  const handleApproveAndSendOrder = async (orderId: number, patientName: string) => {
    setApprovingOrderId(orderId);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${orderId}/approve-and-send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setQueueItems((prev) => prev.filter((i) => (i as QueueItem).orderId !== orderId));
        setTotal((prev) => Math.max(0, prev - 1));
        setPrescriptionPanel(null);
        setSuccessMessage(`Prescription for ${patientName} approved and sent to pharmacy.`);
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        setError(data.error || data.details || 'Failed to send to pharmacy');
      }
    } catch (err) {
      setError('Failed to approve and send prescription');
    } finally {
      setApprovingOrderId(null);
    }
  };

  // Decline an admin-queued order
  const handleDeclineOrder = async (orderId: number, patientName: string, reason: string) => {
    setDeclining(true);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${orderId}/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setQueueItems((prev) => prev.filter((i) => (i as QueueItem).orderId !== orderId));
        setTotal((prev) => Math.max(0, prev - 1));
        setDeclineModal(null);
        setDeclineReason('');
        setExpandedOrderId(null);
        setSuccessMessage(`Prescription for ${patientName} declined.`);
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        setError(data.error || 'Failed to decline order');
      }
    } catch {
      setError('Failed to decline prescription. Please try again.');
    } finally {
      setDeclining(false);
    }
  };

  const handleOpenPrescriptionPanel = async (item: QueueItem) => {
    if (item.queueType === 'queued_order') return;
    const details = await fetchPatientDetails(item.invoiceId!);
    if (details) {
      setPrescriptionPanel({ item, details });
      setAutoSelectedOrderSetId(null);
      const parsedAddress = getPatientAddress(details.patient);
      const isWellmedr =
        item.clinic?.subdomain?.toLowerCase().includes('wellmedr') ||
        (typeof window !== 'undefined' && window.location.hostname.toLowerCase().includes('wellmedr'));

      const patientGender = (details.patient.gender || '').toLowerCase().trim();
      let pharmacyGender: 'm' | 'f' | '' = '';
      if (['m', 'male', 'man'].includes(patientGender)) pharmacyGender = 'm';
      else if (['f', 'female', 'woman'].includes(patientGender)) pharmacyGender = 'f';

      setPrescriptionForm({
        medications: [createEmptyMedication()],
        shippingMethod: isWellmedr ? WELLMEDR_DEFAULT_SHIPPING_ID : '8115',
        pharmacyGender,
        address1: parsedAddress.address1,
        address2: parsedAddress.address2,
        city: parsedAddress.city,
        state: parsedAddress.state,
        zip: parsedAddress.zip,
      });

      const glp1Info = item.glp1Info || { usedGlp1: false, glp1Type: null, lastDose: null };
      const preselection = getGlp1Preselection(item.treatment, glp1Info);

      if (preselection) {
        const isMultiMonth = (item.planMonths ?? 1) > 1;

        if (!isMultiMonth) {
          // 1-month: pre-select individual medication + dose based on GLP-1 history
          const ps = preselection.oneMonth;
          setPrescriptionForm((prev) => ({
            ...prev,
            medications: [
              {
                id: crypto.randomUUID(),
                medicationKey: ps.medicationKey,
                sig: ps.sig,
                quantity: ps.quantity,
                refills: ps.refills,
                daysSupply: ps.daysSupply,
              },
            ],
          }));
        } else {
          // 3/6/12-month: auto-apply matching order set
          try {
            const res = await apiFetch('/api/clinic/order-sets', {
              headers: { Authorization: `Bearer ${getAuthToken()}` },
            });
            if (res.ok) {
              const data = await res.json();
              const orderSets = data.orderSets || [];
              const matched = findOrderSetByName(orderSets, preselection.multiMonth.orderSetName);
              if (matched) {
                const fullSet = orderSets.find((s: any) => s.id === matched.id);
                if (fullSet?.items?.length) {
                  setAutoSelectedOrderSetId(fullSet.id);
                  setPrescriptionForm((prev) => ({
                    ...prev,
                    medications: fullSet.items.map((os: any) => ({
                      id: crypto.randomUUID(),
                      medicationKey: os.medicationKey,
                      sig: os.sig,
                      quantity: os.quantity,
                      refills: os.refills,
                      daysSupply: String(os.daysSupply || '28'),
                    })),
                  }));
                }
              }
            }
          } catch {
            // Order set fetch failed silently; provider can select manually
          }
        }
      } else {
        // Non-GLP-1 medication: fall back to generic treatment matching
        autoSelectNonGlp1Medication(item.treatment, details);
      }
    }
  };

  /** Fallback pre-selection for non-GLP-1 medications (e.g., testosterone, sermorelin). */
  const autoSelectNonGlp1Medication = (treatment: string, details: PatientDetails) => {
    const treatmentLower = treatment.toLowerCase();
    const metadata = details.invoice.metadata as Record<string, string>;

    let matchedKey = '';
    let matchedSig = '';
    let matchedQty = '1';
    let matchedRefills = '0';

    for (const [key, med] of Object.entries(MEDS)) {
      const nameLower = med.name.toLowerCase();
      const firstWord = treatmentLower.split(' ')[0];
      if (treatmentLower.includes(nameLower) || nameLower.includes(firstWord)) {
        matchedKey = key;
        if (med.sigTemplates?.[0]) {
          matchedSig = med.sigTemplates[0].sig;
          matchedQty = med.sigTemplates[0].quantity;
          matchedRefills = med.sigTemplates[0].refills;
        } else if (med.defaultSig) {
          matchedSig = med.defaultSig;
          matchedQty = med.defaultQuantity || '1';
          matchedRefills = med.defaultRefills || '0';
        }
        break;
      }
    }

    if (!matchedKey && metadata?.product) {
      const productLower = metadata.product.toLowerCase();
      for (const [key, med] of Object.entries(MEDS)) {
        const nameLower = med.name.toLowerCase();
        if (nameLower.includes(productLower) || productLower.includes(nameLower.split('/')[0])) {
          matchedKey = key;
          break;
        }
      }
    }

    if (matchedKey) {
      setPrescriptionForm((prev) => ({
        ...prev,
        medications: [
          {
            ...prev.medications[0],
            medicationKey: matchedKey,
            sig: matchedSig || prev.medications[0].sig,
            quantity: matchedQty,
            refills: matchedRefills,
          },
        ],
      }));
    }
  };

  const handleMedicationChange = (index: number, key: string) => {
    const med = MEDS[key];
    let sig = '';
    let qty = '1';
    let refills = '0';
    let daysSupply = '30';

    if (med) {
      if (med.sigTemplates?.[0]) {
        sig = med.sigTemplates[0].sig;
        qty = med.sigTemplates[0].quantity;
        refills = med.sigTemplates[0].refills;
        if (med.sigTemplates[0].daysSupply != null) {
          daysSupply = String(med.sigTemplates[0].daysSupply);
        }
      } else if (med.defaultSig) {
        sig = med.defaultSig;
        qty = med.defaultQuantity || '1';
        refills = med.defaultRefills || '0';
      }
    }

    setPrescriptionForm((prev) => ({
      ...prev,
      medications: prev.medications.map((m, i) =>
        i === index ? { ...m, medicationKey: key, sig, quantity: qty, refills, daysSupply } : m
      ),
    }));
  };

  const updateMedicationField = (index: number, field: keyof MedicationItem, value: string) => {
    setPrescriptionForm((prev) => ({
      ...prev,
      medications: prev.medications.map((m, i) => (i === index ? { ...m, [field]: value } : m)),
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
    return prescriptionForm.medications.some((m) => m.medicationKey && m.sig);
  };

  const handleSubmitPrescription = async () => {
    if (!prescriptionPanel || !hasValidMedication()) return;

    // Validate address
    if (!isAddressComplete(prescriptionForm)) {
      setError('Shipping address is required. Please fill in all address fields.');
      return;
    }

    // Validate pharmacy gender (Lifefile requires 'm' or 'f')
    if (!prescriptionForm.pharmacyGender) {
      setError('Biological sex (Male/Female) is required by the pharmacy for prescription processing. Please select one.');
      return;
    }

    setSubmittingPrescription(true);
    setError('');

    try {
      const { item, details } = prescriptionPanel;

      const buildPayload = (overrideVialSafeguard = false) => ({
        patient: {
          firstName: details.patient.firstName,
          lastName: details.patient.lastName,
          dob: details.patient.dob,
          gender: prescriptionForm.pharmacyGender,
          phone: details.patient.phone,
          email: details.patient.email,
          address1: prescriptionForm.address1,
          address2: prescriptionForm.address2,
          city: prescriptionForm.city,
          state: prescriptionForm.state,
          zip: prescriptionForm.zip,
        },
        rxs: prescriptionForm.medications
          .filter((m) => m.medicationKey && m.sig)
          .map((m) => ({
            medicationKey: m.medicationKey,
            sig: m.sig,
            quantity: m.quantity,
            refills: m.refills,
            daysSupply: m.daysSupply || '30',
          })),
        shippingMethod: parseInt(prescriptionForm.shippingMethod, 10),
        clinicId: details.clinic?.id,
        invoiceId: details.invoice.id,
        patientId: details.patient.id,
        refillId: item.refillId || null,
        planMonths: item.planMonths,
        overrideVialSafeguard,
      });

      const payload = buildPayload(false);

      let response = await apiFetch('/api/prescriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(payload),
      });

      // Handle vial safeguards: prompt user to confirm override
      if (!response.ok) {
        const peek = await response.clone().json().catch(() => null);

        if (peek?.code === 'VIAL_QUANTITY_SAFEGUARD') {
          const confirmed = window.confirm(
            `⚠️ 1-Month Treatment Safeguard\n\n` +
            `This is a 1-month plan but ${peek.totalGlp1Vials} GLP-1 vials are being sent.\n` +
            `Typically only 1 vial is needed for a 1-month supply.\n\n` +
            `Do you want to proceed anyway?`
          );
          if (!confirmed) {
            setSubmittingPrescription(false);
            return;
          }
          response = await apiFetch('/api/prescriptions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${getAuthToken()}`,
            },
            body: JSON.stringify(buildPayload(true)),
          });
        } else if (peek?.code === 'MULTI_MONTH_VIAL_MINIMUM') {
          const confirmed = window.confirm(
            `⚠️ Multi-Month Treatment Safeguard\n\n` +
            `This is a ${peek.planMonths}-month plan but only ${peek.totalGlp1Vials} GLP-1 vial is being sent.\n` +
            `Multi-month plans typically require more than 1 vial.\n\n` +
            `Do you want to proceed anyway?`
          );
          if (!confirmed) {
            setSubmittingPrescription(false);
            return;
          }
          response = await apiFetch('/api/prescriptions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${getAuthToken()}`,
            },
            body: JSON.stringify(buildPayload(true)),
          });
        }
      }

      if (response.ok) {
        // Remove item from queue immediately (backend auto-marks invoice as processed)
        // Handle all queue types: invoice, refill, queued_order
        if (item.queueType === 'refill' && item.refillId) {
          setQueueItems((prev) => prev.filter((qi) => !(qi.queueType === 'refill' && qi.refillId === item.refillId)));
        } else if (item.invoiceId) {
          setQueueItems((prev) => prev.filter((qi) => qi.invoiceId !== item.invoiceId));
        }
        setTotal((prev) => Math.max(0, prev - 1));


        setPrescriptionPanel(null);
        setSuccessMessage(
          `Prescription for ${item.patientName} sent to Lifefile successfully!`
        );
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        const errorData = await response.json();
        // Build a message that includes the reason so the user can correct it
        let errorMessage = errorData.error || 'Failed to submit prescription';

        if (errorData.code === 'INVALID_PHARMACY_GENDER') {
          errorMessage = 'Pharmacy requires biological sex (Male or Female). Please select one in the prescription form.';
          if (errorData.detail) errorMessage += ` ${errorData.detail}`;
        } else if (errorData.code === 'MISSING_PATIENT_INFO') {
          errorMessage = errorData.error || 'Patient profile is missing information required by the pharmacy.';
          if (errorData.detail) errorMessage += ` ${errorData.detail}`;
          errorMessage += ' Update the patient profile (date of birth, full address), then try again.';
        } else if (errorData.code === 'LIFEFILE_SUBMISSION_FAILED') {
          errorMessage = errorData.error || 'The pharmacy could not accept this order.';
          if (errorData.detail) errorMessage += ` Reason: ${errorData.detail}`;
          errorMessage += ' Check the patient profile (date of birth, address) and try again.';
        } else if (response.status === 503) {
          errorMessage = errorData.error || 'Service temporarily busy. Please try again in a moment.';
        } else {
          if (errorData.details) {
            const detailMessages = Object.entries(errorData.details)
              .map(([field, errors]) => `${field}: ${(errors as string[]).join(', ')}`)
              .join('; ');
            if (detailMessages) errorMessage += ` (${detailMessages})`;
          }
          if (errorData.detail) errorMessage += ` Reason: ${errorData.detail}`;
        }
        console.error('[Prescription Queue] Submission error:', errorData);
        setError(errorMessage);
      }
    } catch (err) {
      console.error('Error submitting prescription:', err);
      setError('Failed to submit prescription');
    } finally {
      setSubmittingPrescription(false);
    }
  };

  const handleMarkProcessed = async (item: QueueItem, showMessage = true) => {
    const trackingId = item.refillId || item.invoiceId || item.orderId;
    setProcessing(trackingId ?? null);
    if (showMessage) setError('');

    try {
      const body: Record<string, unknown> =
        item.queueType === 'refill' && item.refillId
          ? { refillId: item.refillId }
          : { invoiceId: item.invoiceId };

      const response = await apiFetch('/api/provider/prescription-queue', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setQueueItems((prev) =>
          prev.filter((qi) => {
            if (item.queueType === 'refill' && item.refillId) {
              return !(qi.queueType === 'refill' && qi.refillId === item.refillId);
            }
            return qi.invoiceId !== item.invoiceId;
          })
        );
        setTotal((prev) => Math.max(0, prev - 1));
        if (showMessage) {
          setSuccessMessage(`Prescription for ${item.patientName} marked as processed`);
          setTimeout(() => setSuccessMessage(''), 3000);
        }
      } else {
        const errorData = await response.json();
        if (showMessage) setError(errorData.error || 'Failed to mark as processed');
      }
    } catch (err) {
      console.error('Error marking prescription as processed:', err);
      if (showMessage) setError('Failed to mark prescription as processed');
    } finally {
      setProcessing(null);
    }
  };

  const handleDecline = async () => {
    if (!declineModal || !declineReason.trim()) return;

    const isOrderDecline = declineModal.item.queueType === 'queued_order' && declineModal.item.orderId;

    if (isOrderDecline) {
      await handleDeclineOrder(declineModal.item.orderId!, declineModal.item.patientName, declineReason.trim());
      return;
    }

    setDeclining(true);
    setError('');

    try {
      const response = await apiFetch('/api/provider/prescription-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
        setSuccessMessage(`Prescription for ${declineModal.item.patientName} has been declined`);
        setTimeout(() => setSuccessMessage(''), 4000);
        setDeclineModal(null);
        setDeclineReason('');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to decline prescription');
      }
    } catch (err) {
      console.error('Error declining prescription:', err);
      setError('Failed to decline prescription');
    } finally {
      setDeclining(false);
    }
  };

  const handleHoldForInfo = async (item: QueueItem) => {
    const reason = window.prompt(
      `Hold ${item.patientName} for more information?\n\nDescribe what additional info is needed (min 10 characters):`
    );
    if (!reason || reason.trim().length < 10) {
      if (reason !== null) {
        setError('Hold reason must be at least 10 characters.');
      }
      return;
    }

    const trackingId = item.refillId || item.invoiceId || item.orderId;
    setProcessing(trackingId ?? null);
    setError('');

    try {
      const body: Record<string, unknown> = {
        action: 'hold_for_info',
        reason: reason.trim(),
      };
      if (item.queueType === 'refill' && item.refillId) body.refillId = item.refillId;
      else if (item.queueType === 'queued_order' && item.orderId) body.orderId = item.orderId;
      else body.invoiceId = item.invoiceId;

      const response = await apiFetch('/api/provider/prescription-queue', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setQueueItems((prev) =>
          prev.map((qi) => {
            const match =
              (item.refillId && qi.refillId === item.refillId) ||
              (item.orderId && qi.orderId === item.orderId) ||
              (item.invoiceId && qi.invoiceId === item.invoiceId);
            return match
              ? { ...qi, holdReason: reason.trim(), heldAt: new Date().toISOString() }
              : qi;
          })
        );
        setSuccessMessage(`${item.patientName} moved to Needs Info`);
        setTimeout(() => setSuccessMessage(''), 4000);
        setActiveTab('needs_info');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to hold prescription');
      }
    } catch {
      setError('Failed to hold prescription for more info');
    } finally {
      setProcessing(null);
    }
  };

  const handleResumeFromHold = async (item: QueueItem) => {
    const trackingId = item.refillId || item.invoiceId || item.orderId;
    setResuming(trackingId ?? null);
    setError('');

    try {
      const body: Record<string, unknown> = { action: 'resume_from_hold' };
      if (item.queueType === 'refill' && item.refillId) body.refillId = item.refillId;
      else if (item.queueType === 'queued_order' && item.orderId) body.orderId = item.orderId;
      else body.invoiceId = item.invoiceId;

      const response = await apiFetch('/api/provider/prescription-queue', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setQueueItems((prev) =>
          prev.map((qi) => {
            const match =
              (item.refillId && qi.refillId === item.refillId) ||
              (item.orderId && qi.orderId === item.orderId) ||
              (item.invoiceId && qi.invoiceId === item.invoiceId);
            return match ? { ...qi, holdReason: null, heldAt: null } : qi;
          })
        );
        setSuccessMessage(`${item.patientName} returned to Ready queue`);
        setTimeout(() => setSuccessMessage(''), 4000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to resume prescription');
      }
    } catch {
      setError('Failed to resume prescription');
    } finally {
      setResuming(null);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${month}/${day}/${year} at ${hour12}:${minutes} ${ampm}`;
  };

  const formatDob = (dob: string) => {
    if (!dob) return '-';
    const date = new Date(dob);
    const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${month}/${day}/${year} (${age} yrs)`;
  };

  const searchResult = smartSearch(queueItems, searchTerm, (item) => [
    item.patientName,
    item.patientEmail,
    item.treatment,
    item.invoiceNumber,
    item.patientDisplayId,
  ]);
  const allFilteredItems = searchResult.matches;
  const readyItems = allFilteredItems.filter((i) => !i.holdReason);
  const needsInfoItems = allFilteredItems.filter((i) => !!i.holdReason);
  const filteredItems = activeTab === 'ready' ? readyItems : needsInfoItems;

  return (
    <div className="min-h-[100dvh]" style={{ backgroundColor: '#efece7' }}>
      {/* Header - mobile-optimized: compact on small screens */}
      <div
        className="sticky top-0 z-10 border-b border-gray-200"
        style={{ backgroundColor: '#efece7' }}
      >
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
              {/* MedLink Logo - hide on very small, show compact on sm+ */}
              <svg
                className="hidden h-8 w-24 flex-shrink-0 sm:block"
                width="120"
                height="32"
                viewBox="0 0 1975.06 435.89"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <g>
                  <path
                    d="M282.71 63.4c-1.5-2.26-4.59-4.65-7.77-4.3-27.14.25-54.41-.43-81.53.49-13.43 1.39-.74 50.12-6.74 60.76-3.5 3.91-34.92 2.46-40.73 1.23-.92-.32-1.3-.77-1.34-1.5-.04-1.8-.03-6.21-.07-11.57.25-11.46-.72-22.1.26-32.58 12.23-57.73 56.69-62.77 107.49-59.33 49.51-2.23 76.7 36.47 74.82 82.82 2.42 2.09 7.94.85 11.35 1.11 22.78-1.67 46.16 10.47 59.35 28.97 16.37 23.14 11.66 52.74 11.49 79.39 3.97 38.98-28.44 72.55-66.91 73.26-28.16-.09-94.79.18-131.52.13-31.2.02-54.5.06-62.97.06-1.42-.04-1.27 2.19-1.63 3.6-1.95 22.22 1.14 46.34.13 68.85-.16 2.66.13 5.54 2.12 7.49 1.21 1.3 3.05 2.39 4.67 2.11 3.16 0 11.13 0 20.92.01 14.22.03 33.28 0 47.24.03 8.95-.78 14.42 2.49 19.49-3.61 1.2-1.78 1.41-3.97 1.41-6.09-.15-14.38.33-28.77.12-43.17.39-3.31-2.1-9.07 2.72-9.8 10.04-1.19 22.86-.99 33.51-.5 3.18.42 7.25-.09 6.39 4.7.02 10.47.03 23.72.05 34.31-.92 33.69-26.83 62.3-60.73 66.47-43.07 3.28-97.71 5.63-116.18-42.62-4.25-10.71-5.07-22.24-5.11-33.65-.17-2.13.64-5-.89-6.72-6.45-2.15-15.88.29-22.72-1.03-32.92-3.6-60.69-33.58-59.46-67.15.12-7-.05-13.99-.22-21.01-5.59-48.16 15.49-90.38 67.79-93.12 15.04.27 157.97-.16 193.71.04.41.04 1.98-.59 1.98-1.51-.44-7.59.84-68.65-.46-76.49l-.06-.08ZM144.3 280.66c.18-4.59.04-66.95.08-74.62-.06-2.03 2.88-2.21 4.58-2.41 9.96-.35 20.06.05 30.07-.08 2.51-.08 5.89-.57 7.82 1.16 1.8 3.76.27 8.18.75 13.32.37 6.63-.77 15.5.49 21.05 26.08.91 163.76-.01 173.58.31 1.7-.37 4.67-3.36 5.47-5.43.59-26.3 1.69-54.36.85-80.59.14-4.31-2.79-9.65-7-10.41-6.49-.04-54.16-.08-70.39-.13-2.05-.03-4.29-.38-5.15 1.91-1.15 16.96-.23 65.47-.64 72.84-1.48 3.86-7.53 1.37-12.37 2.04-8.22 0-20.86.02-28.22-.02-1.95-.03-1.93-2.79-2.14-4.36-.75-9.78 1.48-20.95-.35-30.82-1.28-.57-6.15-.02-14.2-.21-40.8.01-155.45-.02-160.4.02-1.56.9-3.8 3.03-4.38 5.4-1.27 28.27-.95 57.01-.24 85.31 1.04 2.58 2.96 5.4 5.17 5.81 7.22-.1 71.59.17 76.6-.08h.01Z"
                    fill="#d46c7b"
                  />
                  <path
                    d="M811.27 356.91h-35.54l-25.56-209.68-87.46 179.72h-31.55L542.9 147.23l-25.16 209.68H482.2l33.55-275.18h32.75l98.25 204.08L744.6 81.73h32.75l33.95 275.18Z"
                    fill="#000000"
                  />
                  <path
                    d="M1026.95 278.63H875.18c5.19 33.15 29.15 50.32 61.11 50.32 22.76 0 43.53-10.38 54.32-29.15l29.95 11.98c-15.97 32.35-49.52 49.92-85.47 49.92-53.12 0-95.85-39.54-95.85-98.65s42.73-97.45 95.85-97.45 92.66 38.34 92.66 97.45c0 5.19-.4 10.38-.8 15.58M993 248.68c-4.39-31.95-27.16-50.32-57.91-50.32s-53.92 16.77-59.51 50.32z"
                    fill="#000000"
                  />
                  <path
                    d="M1212.66 68.95h34.75v287.96h-34.75v-29.15c-12.38 21.17-39.54 33.95-66.3 33.95-51.12 0-93.46-39.54-93.46-98.25s41.93-97.85 93.06-97.85c27.96 0 54.32 11.98 66.7 33.95zm0 194.1c0-40.34-32.75-64.7-63.5-64.7-33.95 0-61.11 27.16-61.11 64.7s27.16 65.9 61.11 65.9 63.5-25.96 63.5-65.9"
                    fill="#000000"
                  />
                  <path d="M1342.46 323.36h112.63v33.55h-148.97V81.73h36.34z" fill="#000000" />
                  <path
                    d="M1476.65 101.7c0-13.18 11.18-23.16 24.36-23.16s24.76 9.98 24.76 23.16-11.18 23.16-24.76 23.16-24.36-9.98-24.36-23.16m7.19 255.21V170.4h34.75v186.51z"
                    fill="#000000"
                  />
                  <path
                    d="M1740.64 249.08v107.83h-34.75V251.07c0-31.15-19.17-51.12-45.13-51.12s-57.11 15.58-57.11 55.91V356.9h-34.75V170.39h34.75v28.36c11.18-22.77 41.54-33.15 61.9-33.15 46.33 0 75.48 31.15 75.08 83.47Z"
                    fill="#000000"
                  />
                  <path
                    d="M1955.91 356.91h-46.73l-85.87-91.06v91.06h-34.75V68.95h34.75v167.34l64.7-65.9h48.33l-79.88 80.68z"
                    fill="#000000"
                  />
                </g>
              </svg>
              <div className="min-w-0 flex-1 border-l border-gray-300 pl-3 sm:pl-4">
                <h1 className="text-lg font-bold text-gray-900 sm:text-xl">Rx Queue</h1>
                <p className="truncate text-sm text-gray-500">
                  {loading ? 'Loading...' : fetchFailed ? 'Failed to load' : `${total} patient${total !== 1 ? 's' : ''} awaiting`}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setLoading(true);
                fetchQueue();
              }}
              className="flex min-h-[44px] touch-manipulation items-center justify-center gap-2 self-end rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-gray-600 transition-all hover:bg-white/80 hover:text-gray-900 active:bg-gray-100 sm:self-auto"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 pb-28 sm:px-6 sm:pb-6 lg:px-8">
        {/* Success/Error Messages */}
        {successMessage && (
          <div className="animate-in slide-in-from-top flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 duration-300">
            <div className="rounded-full bg-green-100 p-1.5">
              <CheckIcon className="h-4 w-4 text-green-600" />
            </div>
            <span className="font-medium text-green-800">{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span className="text-red-800">{error}</span>
            <button
              onClick={() => setError('')}
              className="ml-auto text-red-600 hover:text-red-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Search - touch-friendly height on mobile */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search by patient name, email, treatment, or invoice..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              const pasted = e.clipboardData.getData('text');
              setSearchTerm(pasted.replace(/\s+/g, ' ').trim());
            }}
            className="min-h-[48px] w-full touch-manipulation rounded-xl border border-gray-200 bg-white py-3 pl-4 pr-10 text-base shadow-sm focus:border-transparent focus:ring-2 focus:ring-rose-400"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 touch-manipulation items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
          <button
            onClick={() => setActiveTab('ready')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === 'ready'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            Ready to Prescribe
            {readyItems.length > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                activeTab === 'ready' ? 'bg-rose-100 text-rose-700' : 'bg-gray-200 text-gray-600'
              }`}>
                {readyItems.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('needs_info')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === 'needs_info'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileWarning className="h-4 w-4" />
            Needs Info
            {needsInfoItems.length > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                activeTab === 'needs_info' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'
              }`}>
                {needsInfoItems.length}
              </span>
            )}
          </button>
        </div>

        {/* Queue Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
          </div>
        ) : fetchFailed ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              Failed to load prescriptions
            </h3>
            <p className="text-gray-500">
              {error || 'The prescription queue could not be loaded. This is usually temporary.'}
            </p>
            <button
              onClick={() => {
                setLoading(true);
                setFetchFailed(false);
                setError('');
                fetchQueue();
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        ) : filteredItems.length === 0 && searchResult.closeMatches.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckIcon className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              {searchTerm
                ? 'No matching results'
                : activeTab === 'needs_info'
                  ? 'No items waiting for info'
                  : 'All caught up!'}
            </h3>
            <p className="text-gray-500">
              {searchTerm
                ? 'No patients match your search. Try a different name or check the spelling.'
                : activeTab === 'needs_info'
                  ? 'No prescriptions are currently on hold for more information.'
                  : 'No prescriptions pending. Great work!'}
            </p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
              >
                <X className="h-3.5 w-3.5" />
                Clear search
              </button>
            )}
          </div>
        ) : filteredItems.length === 0 && searchResult.closeMatches.length > 0 ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-amber-800">
                  <span className="font-medium">No exact matches found.</span>{' '}
                  Showing {searchResult.closeMatches.length} close match{searchResult.closeMatches.length !== 1 ? 'es' : ''} for &ldquo;{searchTerm.trim()}&rdquo;
                </p>
                <button
                  onClick={() => setSearchTerm('')}
                  className="ml-3 text-sm font-medium text-amber-700 hover:text-amber-900"
                >
                  Clear
                </button>
              </div>
            </div>
            {searchResult.closeMatches.map((item) => {
              const itemKey = item.orderId ?? item.invoiceId ?? item.refillId ?? item.patientId;
              const isQueuedOrder = item.queueType === 'queued_order';
              return (
                <div
                  key={itemKey}
                  className={`overflow-hidden rounded-2xl border shadow-sm transition-all hover:shadow-md ${
                    isQueuedOrder
                      ? 'border-amber-200 bg-amber-50/30'
                      : 'border-gray-100 bg-white'
                  }`}
                  style={{ opacity: 0.85 }}
                >
                  <div className="p-3 sm:p-4">
                    <div className="grid grid-cols-[200px_180px_100px_100px_100px_auto] items-center gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                          isQueuedOrder
                            ? 'bg-gradient-to-br from-amber-100 to-amber-200'
                            : 'bg-gradient-to-br from-rose-100 to-rose-200'
                        }`}>
                          <User className={`h-4 w-4 ${isQueuedOrder ? 'text-amber-600' : 'text-rose-600'}`} />
                        </div>
                        <div className="min-w-0 overflow-hidden">
                          <h3 className="truncate text-xs font-semibold text-gray-900">
                            {item.patientName}
                          </h3>
                          <p className="truncate text-[10px] text-gray-500">{item.patientDisplayId}</p>
                        </div>
                      </div>
                      <div className="truncate text-xs text-gray-600">{item.treatment}</div>
                      <div className="text-xs text-gray-600">{item.plan}</div>
                      <div className="text-xs font-medium text-gray-900">{item.amountFormatted}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(item.paidAt).toLocaleDateString()}
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            setSearchTerm(item.patientName);
                          }}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                        >
                          Search this patient
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const itemKey = item.orderId ?? item.invoiceId ?? item.refillId ?? item.patientId;
              const isQueuedOrder = item.queueType === 'queued_order';
              return (
                <div
                  key={itemKey}
                  className={`overflow-hidden rounded-2xl border shadow-sm transition-all hover:shadow-md ${
                    isQueuedOrder
                      ? 'border-amber-200 bg-amber-50/30'
                      : 'border-gray-100 bg-white'
                  }`}
                >
                  {/* Main Card Content - stacked on mobile, grid on xl */}
                  <div className="p-3 sm:p-4">
                    <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[200px_180px_100px_100px_100px_auto] xl:items-center xl:gap-2">
                      {/* Patient Info - Col 1 */}
                      <div className="flex min-w-0 items-center gap-2">
                        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                          isQueuedOrder
                            ? 'bg-gradient-to-br from-amber-100 to-amber-200'
                            : 'bg-gradient-to-br from-rose-100 to-rose-200'
                        }`}>
                          <User className={`h-4 w-4 ${isQueuedOrder ? 'text-amber-600' : 'text-rose-600'}`} />
                        </div>
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="truncate text-base font-semibold text-gray-900 sm:text-xs xl:text-xs">
                              {item.patientName}
                            </h3>
                            {isQueuedOrder && (
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                                <ClipboardCheck className="h-2.5 w-2.5" />
                                Admin Queued
                              </span>
                            )}
                            {item.recentPrescription?.hasDuplicate && (
                              <span
                                className="inline-flex items-center gap-0.5 rounded-full border border-red-300 bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700"
                                title={`${item.recentPrescription.orders.length} prescription(s) in the last ${item.recentPrescription.windowDays} days`}
                              >
                                <ShieldAlert className="h-2.5 w-2.5" />
                                Recent Rx
                              </span>
                            )}
                            <span
                              className="hidden items-center rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 xl:inline-flex"
                              title="Clinic"
                            >
                              {item.clinic?.name || 'Unknown clinic'}
                            </span>
                          </div>
                          <span className="hidden rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-400 xl:inline">
                            {item.patientDisplayId}
                          </span>
                          <p className="hidden truncate text-[10px] text-gray-500 xl:block">
                            {item.patientEmail && !item.patientEmail.includes('unknown')
                              ? item.patientEmail
                              : ''}
                          </p>
                          {/* Mobile: one-line summary (treatment • plan • amount) */}
                          <p className="mt-0.5 text-sm text-gray-600 xl:mt-0 xl:hidden">
                            {item.treatment}
                            <span className="mx-1.5 text-gray-400">•</span>
                            <span className="font-medium text-gray-700">{item.plan}</span>
                            <span className="mx-1.5 text-gray-400">•</span>
                            <span className="text-green-600">{item.amountFormatted}</span>
                          </p>
                        </div>
                      </div>

                      {/* Treatment & Plan - Col 2 (hidden on mobile; summary in patient block) */}
                      <div className="hidden min-w-0 items-center gap-2 xl:flex">
                        {/* Medication type icon - color coded */}
                        <div
                          className={`flex-shrink-0 rounded p-1 ${
                            item.treatment.toLowerCase().includes('tirzepatide')
                              ? 'bg-[var(--brand-primary-light)]'
                              : item.treatment.toLowerCase().includes('semaglutide')
                                ? 'bg-teal-100'
                                : 'bg-[var(--brand-primary-light)]'
                          }`}
                        >
                          <Pill
                            className={`h-3 w-3 ${
                              item.treatment.toLowerCase().includes('tirzepatide')
                                ? 'text-[var(--brand-primary)]'
                                : item.treatment.toLowerCase().includes('semaglutide')
                                  ? 'text-teal-600'
                                  : 'text-[var(--brand-primary)]'
                            }`}
                          />
                        </div>
                        <div className="min-w-0 overflow-hidden">
                          {/* Medication type badge */}
                          <div className="mb-0.5 flex items-center gap-1">
                            {item.treatment.toLowerCase().includes('tirzepatide') && (
                              <span className="inline-flex items-center rounded border border-[var(--brand-primary-medium)] bg-[var(--brand-primary-light)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--brand-primary)]">
                                🟣 TIRZ
                              </span>
                            )}
                            {item.treatment.toLowerCase().includes('semaglutide') && (
                              <span className="inline-flex items-center rounded border border-teal-200 bg-teal-100 px-1.5 py-0.5 text-[9px] font-bold text-teal-700">
                                🟢 SEMA
                              </span>
                            )}
                            <span
                              className={`inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold ${
                                item.planMonths >= 6
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : item.planMonths >= 3
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-gray-200 text-gray-700'
                              }`}
                            >
                              {item.planMonths}mo
                            </span>
                          </div>
                          <p className="truncate text-[10px] text-gray-500">{item.treatment}</p>
                          <p className="truncate text-[9px] text-gray-400">{item.invoiceNumber}</p>
                        </div>
                      </div>

                      {/* GLP-1 History - Col 3 (hidden on mobile to reduce density) */}
                      <div className="hidden min-w-0 items-center gap-1.5 xl:flex">
                        <div
                          className={`rounded p-1 ${item.glp1Info?.usedGlp1 ? 'bg-blue-100' : 'bg-gray-100'}`}
                        >
                          <Activity
                            className={`h-3 w-3 ${item.glp1Info?.usedGlp1 ? 'text-blue-600' : 'text-gray-400'}`}
                          />
                        </div>
                        <div className="min-w-0">
                          {item.glp1Info?.usedGlp1 ? (
                            <>
                              <p className="truncate text-[10px] font-semibold text-blue-700">
                                {item.glp1Info.glp1Type || 'Prior GLP-1'}
                              </p>
                              <p className="text-[10px] text-blue-600">
                                {item.glp1Info.lastDose
                                  ? `${item.glp1Info.lastDose}mg`
                                  : 'Has history'}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-[10px] font-medium text-gray-600">New Patient</p>
                              <p className="text-[10px] text-gray-400">No GLP-1 history</p>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Clinic - Col 4 (hidden on mobile) */}
                      <div className="hidden min-w-0 items-center gap-1.5 xl:flex">
                        <Building2 className="h-3 w-3 flex-shrink-0 text-gray-400" />
                        <div className="min-w-0 overflow-hidden">
                          <p className="truncate text-[10px] text-gray-700">
                            {item.clinic?.name || 'Unknown'}
                          </p>
                          {item.clinic?.lifefileEnabled ? (
                            <span className="inline-flex items-center rounded bg-green-100 px-1 py-0.5 text-[10px] text-green-700">
                              Lifefile ✓
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              No Lifefile
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Amount & Date - Col 5 (hidden on mobile; amount in patient summary) */}
                      <div className="hidden xl:contents">
                        <div className="xl:text-right">
                        <p className="text-xs font-semibold text-green-600">
                          {item.amountFormatted}
                        </p>
                        <p className="text-[10px] text-gray-400">{formatDate(item.paidAt)}</p>
                        </div>
                      </div>

                      {/* Actions - Col 6 - full-width touch-friendly on mobile */}
                      <div className="flex flex-wrap items-stretch justify-end gap-2 border-t border-gray-100 pt-3 xl:border-t-0 xl:pt-0">
                        {!isQueuedOrder && activeTab === 'ready' && (
                          <>
                            <button
                              onClick={() => handleExpandItem(item.invoiceId!)}
                              className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                              title="View patient details"
                            >
                              {expandedItem === item.invoiceId ? (
                                <ChevronUp className="h-5 w-5" />
                              ) : (
                                <ChevronDown className="h-5 w-5" />
                              )}
                            </button>
                            <button
                              onClick={() => handleOpenPrescriptionPanel(item)}
                              disabled={!item.clinic?.lifefileEnabled}
                              className="flex min-h-[48px] min-w-0 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:from-rose-600 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-initial"
                              title={
                                item.clinic?.lifefileEnabled
                                  ? 'Write and send prescription'
                                  : 'Lifefile not configured for this clinic'
                              }
                            >
                              <Send className="h-4 w-4 flex-shrink-0" />
                              <span>Write Rx</span>
                            </button>
                            <button
                              onClick={() => handleMarkProcessed(item)}
                              disabled={processing === (item.refillId || item.invoiceId || item.orderId)}
                              className="flex min-h-[48px] min-w-0 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 disabled:opacity-50 sm:flex-initial"
                              title="Mark as done"
                            >
                              {processing === (item.refillId || item.invoiceId || item.orderId) ? (
                                <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                              ) : (
                                <CheckIcon className="h-4 w-4 flex-shrink-0" />
                              )}
                              <span>Done</span>
                            </button>
                            <button
                              onClick={() => handleHoldForInfo(item)}
                              className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-700 transition-all hover:bg-amber-100"
                              title="More information needed"
                            >
                              <FileWarning className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeclineModal({ item })}
                              className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 transition-all hover:bg-red-100"
                              title="Decline prescription request"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {!isQueuedOrder && activeTab === 'needs_info' && (
                          <>
                            <button
                              onClick={() => handleResumeFromHold(item)}
                              disabled={resuming === (item.refillId || item.invoiceId || item.orderId)}
                              className="flex min-h-[48px] min-w-0 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 sm:flex-initial"
                              title="Return to ready queue"
                            >
                              {resuming === (item.refillId || item.invoiceId || item.orderId) ? (
                                <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                              ) : (
                                <RefreshCw className="h-4 w-4 flex-shrink-0" />
                              )}
                              <span>Resume</span>
                            </button>
                            <button
                              onClick={() => handleOpenPrescriptionPanel(item)}
                              disabled={!item.clinic?.lifefileEnabled}
                              className="flex min-h-[48px] min-w-0 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:from-rose-600 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-initial"
                              title="Write and send prescription"
                            >
                              <Send className="h-4 w-4 flex-shrink-0" />
                              <span>Write Rx</span>
                            </button>
                            <button
                              onClick={() => setDeclineModal({ item })}
                              className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 transition-all hover:bg-red-100"
                              title="Decline prescription request"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {isQueuedOrder && activeTab === 'ready' && (
                          <>
                            <button
                              onClick={() => item.orderId && handleExpandOrderItem(item.orderId)}
                              className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                              title="View prescription details"
                            >
                              {expandedOrderId === item.orderId ? (
                                <ChevronUp className="h-5 w-5" />
                              ) : (
                                <ChevronDown className="h-5 w-5" />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Approve and send this prescription for ${item.patientName} to the pharmacy? This will be logged for compliance.`
                                  )
                                ) {
                                  item.orderId &&
                                    handleApproveAndSendOrder(item.orderId, item.patientName);
                                }
                              }}
                              disabled={
                                !item.clinic?.lifefileEnabled || approvingOrderId === item.orderId
                              }
                              className="flex min-h-[48px] min-w-0 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:from-amber-600 hover:to-amber-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-initial"
                              title="Approve and send to pharmacy (queued by admin)"
                            >
                              {approvingOrderId === item.orderId ? (
                                <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                              ) : (
                                <ClipboardCheck className="h-4 w-4 flex-shrink-0" />
                              )}
                              <span>Approve & Send</span>
                            </button>
                            <button
                              onClick={() => handleHoldForInfo(item)}
                              className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-700 transition-all hover:bg-amber-100"
                              title="More information needed"
                            >
                              <FileWarning className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeclineModal({ item })}
                              className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 transition-all hover:bg-red-100"
                              title="Decline this queued prescription"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {isQueuedOrder && activeTab === 'needs_info' && (
                          <>
                            <button
                              onClick={() => handleResumeFromHold(item)}
                              disabled={resuming === (item.refillId || item.invoiceId || item.orderId)}
                              className="flex min-h-[48px] min-w-0 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 sm:flex-initial"
                              title="Return to ready queue"
                            >
                              {resuming === (item.refillId || item.invoiceId || item.orderId) ? (
                                <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                              ) : (
                                <RefreshCw className="h-4 w-4 flex-shrink-0" />
                              )}
                              <span>Resume</span>
                            </button>
                            <button
                              onClick={() => setDeclineModal({ item })}
                              className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 transition-all hover:bg-red-100"
                              title="Decline this queued prescription"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Hold Reason Banner (Needs Info tab) */}
                  {activeTab === 'needs_info' && item.holdReason && (
                    <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-4 py-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                          More Information Needed
                        </p>
                        <p className="mt-0.5 text-sm text-amber-900">{item.holdReason}</p>
                        {item.heldAt && (
                          <p className="mt-1 text-xs text-amber-600">
                            Held on {new Date(item.heldAt).toLocaleDateString()} at{' '}
                            {new Date(item.heldAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Duplicate Prescription Warning Banner */}
                  {item.recentPrescription?.hasDuplicate && (
                    <div className="flex items-start gap-2 border-t border-red-200 bg-red-50 px-4 py-3">
                      <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                          Duplicate Prescription Warning
                        </p>
                        <p className="mt-0.5 text-sm text-red-900">
                          This patient has {item.recentPrescription.orders.length} prescription{item.recentPrescription.orders.length > 1 ? 's' : ''} in the last {item.recentPrescription.windowDays} days:
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {item.recentPrescription.orders.slice(0, 3).map((order) => (
                            <li key={order.orderId} className="text-xs text-red-800">
                              <span className="font-medium">{order.primaryMedName || 'Unknown'}</span>
                              {order.primaryMedStrength && ` ${order.primaryMedStrength}`}
                              {' — '}
                              {new Date(order.createdAt).toLocaleDateString()}{' '}
                              {order.providerName && <span className="text-red-600">by {order.providerName}</span>}
                              {order.status && (
                                <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[9px] font-medium uppercase text-red-700">
                                  {order.status}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1.5 text-[10px] font-medium text-red-600">
                          Please verify this is not a duplicate before prescribing.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Expanded Patient Details (invoice/refill only) */}
                  {!isQueuedOrder && expandedItem === item.invoiceId && (
                    <div className="border-t border-gray-100 bg-gray-50 p-5">
                      {loadingDetails ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
                        </div>
                      ) : patientDetails ? (
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
                          {/* Patient Contact Info */}
                          <div className="space-y-4">
                            <h4 className="flex items-center gap-2 font-semibold text-gray-900">
                              <User className="h-4 w-4 text-rose-500" />
                              Patient Information
                            </h4>
                            <div className="space-y-3 text-sm">
                              <div className="flex items-center gap-2 text-gray-600">
                                <Phone className="h-4 w-4 text-gray-400" />
                                {patientDetails.patient.phone && patientDetails.patient.phone !== '0000000000'
                                  ? patientDetails.patient.phone
                                  : <span className="italic text-gray-400">No phone</span>}
                              </div>
                              <div className="flex items-center gap-2 text-gray-600">
                                <Mail className="h-4 w-4 text-gray-400" />
                                {patientDetails.patient.email && !patientDetails.patient.email.includes('unknown')
                                  ? patientDetails.patient.email
                                  : <span className="italic text-gray-400">No email</span>}
                              </div>
                              <div className="flex items-center gap-2 text-gray-600">
                                <Calendar className="h-4 w-4 text-gray-400" />
                                {patientDetails.patient.dob && patientDetails.patient.dob !== '1900-01-01'
                                  ? formatDob(patientDetails.patient.dob)
                                  : <span className="italic text-gray-400">No DOB</span>}
                              </div>
                              <div className="flex items-center gap-2 text-gray-600">
                                <User className="h-4 w-4 text-gray-400" />
                                {(() => {
                                  const g = patientDetails.patient.gender?.toLowerCase().trim();
                                  if (g === 'f' || g === 'female' || g === 'woman') return 'Female';
                                  if (g === 'm' || g === 'male' || g === 'man') return 'Male';
                                  return patientDetails.patient.gender || <span className="italic text-gray-400">No gender</span>;
                                })()}
                              </div>
                              <div className="flex items-start gap-2 text-gray-600">
                                <MapPin className="mt-0.5 h-4 w-4 text-gray-400" />
                                {patientDetails.patient.address1 && patientDetails.patient.address1.toLowerCase() !== 'pending' ? (
                                  <div>
                                    {patientDetails.patient.address1}
                                    {patientDetails.patient.address2 && (
                                      <>, {patientDetails.patient.address2}</>
                                    )}
                                    <br />
                                    {patientDetails.patient.city}, {patientDetails.patient.state}{' '}
                                    {patientDetails.patient.zip}
                                  </div>
                                ) : (
                                  <span className="italic text-gray-400">No address</span>
                                )}
                              </div>
                              {patientDetails.patient.allergies && (
                                <div className="flex items-start gap-2 rounded-lg bg-red-50 p-2 text-red-600">
                                  <ShieldAlert className="mt-0.5 h-4 w-4" />
                                  <div>
                                    <span className="font-medium">Allergies:</span>{' '}
                                    {patientDetails.patient.allergies}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Clinical Context (from intake) */}
                          {patientDetails.clinicalContext && (
                            <div className="space-y-4">
                              <h4 className="flex items-center gap-2 font-semibold text-gray-900">
                                <Stethoscope className="h-4 w-4 text-rose-500" />
                                Clinical Summary
                              </h4>
                              <div className="space-y-3 text-sm">
                                {/* Contraindications — RED alert */}
                                {patientDetails.clinicalContext.contraindications.length > 0 && (
                                  <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                                    <div className="flex items-center gap-2 font-semibold text-red-700 mb-1">
                                      <ShieldAlert className="h-4 w-4" />
                                      Contraindications
                                    </div>
                                    {patientDetails.clinicalContext.contraindications.map((c, i) => (
                                      <div key={i} className="text-red-600">• {c}</div>
                                    ))}
                                  </div>
                                )}

                                {/* Vitals */}
                                {(patientDetails.clinicalContext.vitals.heightFt || patientDetails.clinicalContext.vitals.weightLbs) && (
                                  <div className="flex flex-wrap gap-3">
                                    {patientDetails.clinicalContext.vitals.heightFt && (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-blue-700">
                                        <Ruler className="h-3.5 w-3.5" />
                                        {patientDetails.clinicalContext.vitals.heightFt}&apos;{patientDetails.clinicalContext.vitals.heightIn || '0'}&quot;
                                      </span>
                                    )}
                                    {patientDetails.clinicalContext.vitals.weightLbs && (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-blue-700">
                                        <Scale className="h-3.5 w-3.5" />
                                        {patientDetails.clinicalContext.vitals.weightLbs} lbs
                                      </span>
                                    )}
                                    {patientDetails.clinicalContext.vitals.bmi && (
                                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${
                                        parseFloat(patientDetails.clinicalContext.vitals.bmi) >= 30
                                          ? 'bg-amber-50 text-amber-700'
                                          : 'bg-green-50 text-green-700'
                                      }`}>
                                        BMI: {patientDetails.clinicalContext.vitals.bmi}
                                      </span>
                                    )}
                                    {patientDetails.clinicalContext.weightGoal && (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-1 text-gray-600">
                                        Goal: {patientDetails.clinicalContext.weightGoal} lbs
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* GLP-1 History */}
                                <div className="rounded-lg bg-purple-50 border border-purple-100 p-3">
                                  <div className="flex items-center gap-2 font-medium text-purple-700 mb-1">
                                    <Pill className="h-4 w-4" />
                                    GLP-1 History
                                  </div>
                                  {patientDetails.clinicalContext.glp1History.used ? (
                                    <div className="space-y-1 text-purple-600">
                                      <div>Used in last 30 days: <span className="font-medium">Yes</span></div>
                                      {patientDetails.clinicalContext.glp1History.type && (
                                        <div>Type: <span className="font-medium">{patientDetails.clinicalContext.glp1History.type}</span></div>
                                      )}
                                      {patientDetails.clinicalContext.glp1History.dose && (
                                        <div>Last Dose: <span className="font-medium">{patientDetails.clinicalContext.glp1History.dose}mg</span></div>
                                      )}
                                      {patientDetails.clinicalContext.glp1History.sideEffects && (
                                        <div>Side Effects: <span className="font-medium">{patientDetails.clinicalContext.glp1History.sideEffects}</span></div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-purple-600">No prior GLP-1 use (new patient)</div>
                                  )}
                                  {patientDetails.clinicalContext.preferredMedication && (
                                    <div className="mt-1 text-purple-600">
                                      Preferred: <span className="font-medium">{patientDetails.clinicalContext.preferredMedication}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Health Conditions */}
                                {patientDetails.clinicalContext.healthConditions.length > 0 && (
                                  <div>
                                    <span className="font-medium text-gray-700">Health Conditions:</span>
                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                      {patientDetails.clinicalContext.healthConditions.map((cond, i) => (
                                        <span key={i} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">
                                          {cond}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Current Meds & Allergies */}
                                {patientDetails.clinicalContext.currentMedications && (
                                  <div>
                                    <span className="font-medium text-gray-700">Current Medications:</span>
                                    <span className="ml-1 text-gray-600">{patientDetails.clinicalContext.currentMedications}</span>
                                  </div>
                                )}
                                {patientDetails.clinicalContext.allergies && (
                                  <div className="rounded-lg bg-red-50 p-2 text-red-600">
                                    <span className="font-medium">Allergies:</span> {patientDetails.clinicalContext.allergies}
                                  </div>
                                )}

                                {/* Reproductive Status */}
                                {patientDetails.clinicalContext.reproductiveStatus && patientDetails.clinicalContext.reproductiveStatus.toLowerCase() !== 'no' && (
                                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-700 font-medium">
                                    ⚠ Pregnant/Nursing: {patientDetails.clinicalContext.reproductiveStatus}
                                  </div>
                                )}
                              </div>

                              {/* Shipment Schedule */}
                              {patientDetails.shipmentSchedule && patientDetails.shipmentSchedule.totalShipments > 1 && (
                                <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 mt-3">
                                  <div className="flex items-center gap-2 font-medium text-indigo-700 mb-2">
                                    <Clock className="h-4 w-4" />
                                    Shipment Schedule ({patientDetails.shipmentSchedule.totalShipments} shipments)
                                  </div>
                                  <div className="space-y-1 text-sm">
                                    {patientDetails.shipmentSchedule.shipments.map((s) => (
                                      <div key={s.shipmentNumber} className="flex items-center justify-between text-indigo-600">
                                        <span>Shipment {s.shipmentNumber}: {new Date(s.date).toLocaleDateString()}</span>
                                        <span className={`rounded-full px-2 py-0.5 text-xs ${
                                          s.status === 'COMPLETED' || s.status === 'PRESCRIBED' ? 'bg-green-100 text-green-700'
                                          : s.status === 'PENDING_PROVIDER' ? 'bg-amber-100 text-amber-700'
                                          : 'bg-indigo-100 text-indigo-600'
                                        }`}>
                                          {s.status.replace(/_/g, ' ')}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* SOAP Note Section */}
                          <div className="space-y-4">
                            <h4 className="flex items-center gap-2 font-semibold text-gray-900">
                              <ClipboardCheck className="h-4 w-4 text-rose-500" />
                              SOAP Note
                              {patientDetails.soapNote && (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs ${
                                    patientDetails.soapNote.isApproved
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  {patientDetails.soapNoteStatus}
                                </span>
                              )}
                            </h4>
                            {patientDetails.soapNote ? (
                              <div className="space-y-3">
                                {patientDetails.soapNote.generatedByAI && (
                                  <div className="flex w-fit items-center gap-2 rounded-lg bg-[var(--brand-primary-light)] px-3 py-1.5 text-xs text-[var(--brand-primary)]">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    AI Generated
                                  </div>
                                )}
                                <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 text-sm">
                                  <div>
                                    <span className="font-semibold text-rose-600">
                                      S - Subjective:
                                    </span>
                                    <p className="mt-1 line-clamp-3 text-gray-700">
                                      {patientDetails.soapNote.content.subjective}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-blue-600">
                                      O - Objective:
                                    </span>
                                    <p className="mt-1 line-clamp-3 text-gray-700">
                                      {patientDetails.soapNote.content.objective}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-green-600">
                                      A - Assessment:
                                    </span>
                                    <p className="mt-1 line-clamp-3 text-gray-700">
                                      {patientDetails.soapNote.content.assessment}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-[var(--brand-primary)]">P - Plan:</span>
                                    <p className="mt-1 line-clamp-3 text-gray-700">
                                      {patientDetails.soapNote.content.plan}
                                    </p>
                                  </div>
                                </div>
                                <a
                                  href={`/provider/patients/${patientDetails.patient.id}?tab=soap`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-medium text-rose-600 hover:text-rose-700"
                                >
                                  View Full SOAP Note →
                                </a>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                                <div className="flex items-start gap-3">
                                  <FileWarning className="mt-0.5 h-5 w-5 text-amber-500" />
                                  <div>
                                    <p className="font-medium text-amber-800">No SOAP Note</p>
                                    <p className="mt-1 text-sm text-amber-700">
                                      Clinical documentation is required before prescribing.
                                    </p>
                                    <button
                                      onClick={() => {
                                        const queueItem = queueItems.find(
                                          (qi) => qi.invoiceId === expandedItem
                                        );
                                        if (queueItem) handleGenerateSoapNote(queueItem);
                                      }}
                                      disabled={generatingSoapNote === expandedItem}
                                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                                    >
                                      {generatingSoapNote === expandedItem ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Sparkles className="h-4 w-4" />
                                      )}
                                      Generate SOAP Note
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Intake Data */}
                          <div className="space-y-4">
                            <h4 className="flex items-center gap-2 font-semibold text-gray-900">
                              <FileText className="h-4 w-4 text-rose-500" />
                              Intake Information
                            </h4>
                            {patientDetails.intake.sections.length > 0 ? (
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                {patientDetails.intake.sections.map((section, idx) => (
                                  <div
                                    key={idx}
                                    className="rounded-xl border border-gray-200 bg-white p-4"
                                  >
                                    <h5 className="mb-3 flex items-center gap-2 font-medium text-gray-800">
                                      {section.section === 'Treatment' && (
                                        <Pill className="h-4 w-4 text-[var(--brand-primary)]" />
                                      )}
                                      {section.section === 'Medical History' && (
                                        <Heart className="h-4 w-4 text-red-500" />
                                      )}
                                      {section.section === 'Personal Information' && (
                                        <User className="h-4 w-4 text-blue-500" />
                                      )}
                                      {section.section}
                                    </h5>
                                    <div className="space-y-2">
                                      {section.questions.map((q, qIdx) => (
                                        <div key={qIdx} className="text-sm">
                                          <span className="text-gray-500">{q.question}:</span>{' '}
                                          <span className="font-medium text-gray-900">
                                            {q.answer || '-'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">
                                <FileText className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                                <p>No intake data available</p>
                                <p className="mt-1 text-xs">
                                  Patient may have used external intake form
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="py-4 text-center text-gray-500">
                          Unable to load patient details
                        </p>
                      )}
                    </div>
                  )}

                  {/* Expanded Details for Admin-Queued Orders */}
                  {isQueuedOrder && expandedOrderId === item.orderId && (
                    <div className="border-t border-amber-200 bg-amber-50/50 p-5">
                      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        {/* Patient Contact Info */}
                        <div className="space-y-3">
                          <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                            <User className="h-4 w-4 text-amber-600" />
                            Patient Information
                          </h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-gray-600">
                              <Mail className="h-3.5 w-3.5 text-gray-400" />
                              {item.patientEmail || 'No email'}
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                              <Phone className="h-3.5 w-3.5 text-gray-400" />
                              {item.patientPhone || 'No phone'}
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                              <Calendar className="h-3.5 w-3.5 text-gray-400" />
                              {item.patientDob ? formatDob(item.patientDob) : 'No DOB'}
                            </div>
                          </div>
                          {/* SOAP Note status */}
                          <div className="mt-3 pt-3 border-t border-amber-200">
                            <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
                              <FileText className="h-4 w-4 text-amber-600" />
                              SOAP Note
                            </h4>
                            {item.hasSoapNote && item.soapNote ? (
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                                item.soapNote.isApproved
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-yellow-100 text-yellow-700'
                              }`}>
                                {item.soapNote.isApproved ? (
                                  <><CheckCircle2 className="h-3 w-3" /> Approved</>
                                ) : (
                                  <><Clock className="h-3 w-3" /> {item.soapNote.status}</>
                                )}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500">
                                <FileWarning className="h-3 w-3" /> No SOAP note
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Queued Prescription Details (Rx items) */}
                        <div className="lg:col-span-2 space-y-3">
                          <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                            <Pill className="h-4 w-4 text-amber-600" />
                            Queued Prescription
                            <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-300">
                              Queued by Admin
                            </span>
                          </h4>

                          {item.rxs && item.rxs.length > 0 ? (
                            <div className="space-y-2">
                              {item.rxs.map((rx, rxIdx) => (
                                <div
                                  key={rxIdx}
                                  className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm"
                                >
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-gray-900">
                                          {rx.medName}
                                        </span>
                                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                          {rx.strength}
                                        </span>
                                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                                          {rx.form}
                                        </span>
                                      </div>
                                      <p className="mt-1.5 text-sm text-gray-600">
                                        <span className="font-medium text-gray-700">Sig:</span>{' '}
                                        {rx.sig || 'Not specified'}
                                      </p>
                                    </div>
                                    <div className="text-right text-xs text-gray-500">
                                      <p>Qty: <span className="font-semibold text-gray-700">{rx.quantity}</span></p>
                                      <p>Refills: <span className="font-semibold text-gray-700">{rx.refills}</span></p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-amber-200 bg-white p-4 text-center text-sm text-gray-500">
                              No Rx items found for this order
                            </div>
                          )}

                          {/* Action reminder */}
                          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                            <p className="text-xs text-amber-800">
                              Review the prescription details above carefully before approving.
                              Once approved, the prescription will be sent directly to the pharmacy
                              via Lifefile and cannot be reversed.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Decline Modal */}
      {declineModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            // Close when clicking backdrop (not modal content)
            if (e.target === e.currentTarget) {
              setDeclineModal(null);
              setDeclineReason('');
            }
          }}
        >
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl">
            {/* Close X button */}
            <button
              type="button"
              onClick={() => {
                setDeclineModal(null);
                setDeclineReason('');
              }}
              className="absolute right-4 top-4 z-10 rounded p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Modal Header */}
            <div className="rounded-t-2xl border-b border-red-100 bg-red-50 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-red-100 p-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Decline Prescription</h2>
                  <p className="text-sm text-gray-600">{declineModal.item.patientName}</p>
                </div>
              </div>
            </div>

            {/* Modal Content */}
            <div className="space-y-4 p-6">
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">This action cannot be undone.</p>
                  <p className="mt-1">
                    The patient will be removed from the prescription queue. Please provide a clear
                    reason for declining.
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Reason for Declining *
                </label>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-red-400"
                  placeholder="Please explain why you are declining this prescription request (e.g., medical contraindication, incomplete information, patient needs evaluation, etc.)"
                />
                <p className="mt-1 text-xs text-gray-500">Minimum 10 characters required</p>
              </div>

              {/* Patient Info Summary */}
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
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
                    <p className="text-xs font-medium">{declineModal.item.invoiceNumber}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer - touch-friendly on mobile */}
            <div className="flex flex-col gap-3 rounded-b-2xl border-t border-gray-100 bg-gray-50 px-4 py-4 sm:flex-row sm:px-6">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDeclineModal(null);
                  setDeclineReason('');
                }}
                className="min-h-[48px] flex-1 touch-manipulation rounded-xl border border-gray-300 px-4 py-2.5 text-base font-medium text-gray-700 transition-colors hover:bg-gray-100 active:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (!declining && declineReason.trim().length >= 10) {
                    handleDecline();
                  }
                }}
                disabled={declining || declineReason.trim().length < 10}
                className="flex min-h-[48px] flex-1 touch-manipulation items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-base font-medium text-white transition-all hover:bg-red-700 active:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {declining ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Declining...
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4" />
                    Decline Prescription
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prescription Slide-Over Panel */}
      {prescriptionPanel && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop - closes panel when clicked directly */}
          <div
            className="absolute inset-0 z-0 bg-black/50"
            aria-hidden
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setPrescriptionPanel(null);
              }
            }}
          />
          {/* Panel container - stops ALL event propagation to prevent backdrop interference */}
          <div
            className="absolute inset-y-0 right-0 z-10 flex max-w-full pl-4 sm:pl-10"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-lg transform transition-transform duration-300 ease-in-out sm:w-screen">
              <div className="flex h-full flex-col bg-white shadow-xl">
                {/* Panel Header - touch-friendly close on mobile */}
                <div
                  className={`px-4 py-4 sm:px-6 sm:py-5 ${prescriptionPanel.item.queueType === 'queued_order' ? 'bg-gradient-to-r from-amber-500 to-amber-600' : 'bg-gradient-to-r from-rose-500 to-rose-600'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/20">
                        {prescriptionPanel.item.queueType === 'queued_order' ? (
                          <ClipboardCheck className="h-5 w-5 text-white" />
                        ) : (
                          <Send className="h-5 w-5 text-white" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-semibold text-white sm:text-lg">
                          {prescriptionPanel.item.queueType === 'queued_order'
                            ? 'Approve & send to pharmacy'
                            : 'Write Prescription'}
                        </h2>
                        <p className="truncate text-sm text-rose-100">
                          {prescriptionPanel.item.patientName}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPrescriptionPanel(null)}
                      className="flex min-h-[44px] min-w-[44px] touch-manipulation flex-shrink-0 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                      aria-label="Close"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Panel Content - safe scroll, touch-friendly padding */}
                <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
                  {prescriptionPanel.item.queueType === 'queued_order' ? (
                    <div className="space-y-6">
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-sm text-amber-800">
                          This prescription was queued by an admin for your review. Review the
                          details below, then approve and send to the pharmacy. This action is
                          logged for compliance.
                        </p>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-4">
                        <h3 className="mb-3 flex items-center gap-2 font-medium text-gray-900">
                          <User className="h-4 w-4 text-rose-500" />
                          Patient
                        </h3>
                        <p className="font-medium">{prescriptionPanel.item.patientName}</p>
                        <p className="text-sm text-gray-500">
                          {prescriptionPanel.item.patientDisplayId}
                        </p>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-4">
                        <h3 className="mb-3 flex items-center gap-2 font-medium text-gray-900">
                          <Pill className="h-4 w-4 text-rose-500" />
                          Medications
                        </h3>
                        <ul className="space-y-2">
                          {prescriptionPanel.item.rxs?.map(
                            (
                              rx: {
                                medName: string;
                                strength: string;
                                form: string;
                                quantity: string;
                                refills: string;
                                sig: string;
                              },
                              i: number
                            ) => (
                              <li
                                key={i}
                                className="border-b border-gray-100 pb-2 text-sm last:border-0"
                              >
                                <span className="font-medium">
                                  {rx.medName} {rx.strength} {rx.form}
                                </span>
                                <p className="text-gray-600">
                                  Qty: {rx.quantity}, Refills: {rx.refills}
                                </p>
                                <p className="italic text-gray-500">{rx.sig}</p>
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                      {error && (
                        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
                      )}
                      <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => setPrescriptionPanel(null)}
                          className="min-h-[48px] flex-1 touch-manipulation rounded-xl border border-gray-300 px-4 py-2.5 text-base font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            prescriptionPanel.item.orderId &&
                            handleApproveAndSendOrder(
                              prescriptionPanel.item.orderId,
                              prescriptionPanel.item.patientName
                            )
                          }
                          disabled={
                            approvingOrderId === prescriptionPanel.item.orderId ||
                            !prescriptionPanel.item.clinic?.lifefileEnabled
                          }
                          className="flex min-h-[48px] flex-1 touch-manipulation items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-base font-medium text-white hover:bg-amber-600 active:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {approvingOrderId === prescriptionPanel.item.orderId ? (
                            <>
                              <Loader2 className="h-5 w-5 animate-spin" />
                              Sending to pharmacy...
                            </>
                          ) : (
                            <>
                              <ClipboardCheck className="h-5 w-5" />
                              Approve and send to pharmacy
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Patient Summary */}
                      <div className="rounded-xl bg-gray-50 p-4">
                        <h3 className="mb-3 flex items-center gap-2 font-medium text-gray-900">
                          <User className="h-4 w-4 text-rose-500" />
                          Patient
                        </h3>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-gray-500">Name:</span>
                            <p className="font-medium">
                              {prescriptionPanel.details.patient.firstName}{' '}
                              {prescriptionPanel.details.patient.lastName}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">DOB:</span>
                            <p className="font-medium">
                              {prescriptionPanel.details.patient.dob && prescriptionPanel.details.patient.dob !== '1900-01-01'
                                ? prescriptionPanel.details.patient.dob
                                : 'Not provided'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Phone:</span>
                            <p className="font-medium">
                              {prescriptionPanel.details.patient.phone && prescriptionPanel.details.patient.phone !== '0000000000'
                                ? prescriptionPanel.details.patient.phone
                                : 'Not provided'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Gender:</span>
                            <p className="font-medium">
                              {(() => {
                                const g = prescriptionPanel.details.patient.gender?.toLowerCase().trim();
                                if (g === 'f' || g === 'female' || g === 'woman') return 'Female';
                                if (g === 'm' || g === 'male' || g === 'man') return 'Male';
                                return prescriptionPanel.details.patient.gender || 'Not Specified';
                              })()}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Email:</span>
                            <p className="font-medium">
                              {prescriptionPanel.details.patient.email && !prescriptionPanel.details.patient.email.includes('unknown')
                                ? prescriptionPanel.details.patient.email
                                : 'Not provided'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Patient ID:</span>
                            <p className="font-medium text-gray-500">
                              {prescriptionPanel.details.patient.patientId}
                            </p>
                          </div>
                        </div>
                        {prescriptionPanel.details.patient.allergies && (
                          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-2 text-sm text-red-600">
                            <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            <div>
                              <span className="font-medium">Allergies:</span>{' '}
                              {prescriptionPanel.details.patient.allergies}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* SOAP Note Status - CRITICAL */}
                      {prescriptionPanel.details.hasSoapNote ? (
                        <div
                          className={`rounded-xl border p-4 ${
                            prescriptionPanel.details.soapNote?.isApproved
                              ? 'border-green-200 bg-green-50'
                              : 'border-amber-200 bg-amber-50'
                          }`}
                        >
                          <h3 className="mb-2 flex items-center gap-2 font-medium text-gray-900">
                            <ClipboardCheck
                              className={`h-4 w-4 ${
                                prescriptionPanel.details.soapNote?.isApproved
                                  ? 'text-green-600'
                                  : 'text-amber-600'
                              }`}
                            />
                            Clinical Documentation
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs ${
                                prescriptionPanel.details.soapNote?.isApproved
                                  ? 'bg-green-200 text-green-800'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {prescriptionPanel.details.soapNoteStatus}
                            </span>
                          </h3>

                          {/* Show approval warning for draft notes */}
                          {!prescriptionPanel.details.soapNote?.isApproved && (
                            <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-100 p-2 text-sm text-amber-800">
                              <AlertTriangle className="h-4 w-4" />
                              <span>SOAP note requires provider approval before prescribing.</span>
                            </div>
                          )}

                          <p
                            className={`text-sm ${prescriptionPanel.details.soapNote?.isApproved ? 'text-green-700' : 'text-amber-700'}`}
                          >
                            SOAP note available for this patient.
                            {prescriptionPanel.details.soapNote?.generatedByAI && (
                              <span className="ml-2 inline-flex items-center gap-1 text-[var(--brand-primary)]">
                                <Sparkles className="h-3 w-3" /> AI Generated
                              </span>
                            )}
                          </p>

                          {/* Provider Approve Button */}
                          {!prescriptionPanel.details.soapNote?.isApproved &&
                            canApprove &&
                            prescriptionPanel.details.soapNote?.id && (
                              <button
                                onClick={() =>
                                  handleApproveSoapNote(
                                    prescriptionPanel.details.soapNote!.id,
                                    prescriptionPanel.item
                                  )
                                }
                                disabled={
                                  approvingSoapNote === prescriptionPanel.details.soapNote.id
                                }
                                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                              >
                                {approvingSoapNote === prescriptionPanel.details.soapNote.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckIcon className="h-4 w-4" />
                                )}
                                Approve SOAP Note
                              </button>
                            )}

                          {/* Approved badge */}
                          {prescriptionPanel.details.soapNote?.isApproved &&
                            prescriptionPanel.details.soapNote?.approvedByProvider && (
                              <p className="mt-2 text-xs text-green-600">
                                Approved by{' '}
                                {prescriptionPanel.details.soapNote.approvedByProvider.firstName}{' '}
                                {prescriptionPanel.details.soapNote.approvedByProvider.lastName}
                              </p>
                            )}

                          <details className="mt-3">
                            <summary
                              className={`cursor-pointer text-sm font-medium ${
                                prescriptionPanel.details.soapNote?.isApproved
                                  ? 'text-green-800 hover:text-green-900'
                                  : 'text-amber-800 hover:text-amber-900'
                              }`}
                            >
                              View SOAP Note Summary
                            </summary>
                            <div
                              className={`mt-3 space-y-2 rounded-lg border bg-white p-3 text-sm ${
                                prescriptionPanel.details.soapNote?.isApproved
                                  ? 'border-green-200'
                                  : 'border-amber-200'
                              }`}
                            >
                              <div>
                                <span className="font-semibold text-rose-600">S:</span>{' '}
                                <span className="line-clamp-2 text-gray-700">
                                  {prescriptionPanel.details.soapNote?.content.subjective}
                                </span>
                              </div>
                              <div>
                                <span className="font-semibold text-blue-600">O:</span>{' '}
                                <span className="line-clamp-2 text-gray-700">
                                  {prescriptionPanel.details.soapNote?.content.objective}
                                </span>
                              </div>
                              <div>
                                <span className="font-semibold text-green-600">A:</span>{' '}
                                <span className="line-clamp-2 text-gray-700">
                                  {prescriptionPanel.details.soapNote?.content.assessment}
                                </span>
                              </div>
                              <div>
                                <span className="font-semibold text-[var(--brand-primary)]">P:</span>{' '}
                                <span className="line-clamp-2 text-gray-700">
                                  {prescriptionPanel.details.soapNote?.content.plan}
                                </span>
                              </div>
                            </div>
                          </details>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                          <h3 className="mb-2 flex items-center gap-2 font-medium text-amber-800">
                            <FileWarning className="h-4 w-4 text-amber-600" />
                            Missing SOAP Note
                          </h3>
                          <p className="mb-3 text-sm text-amber-700">
                            Clinical documentation is recommended before prescribing.
                          </p>
                          <button
                            onClick={() => handleGenerateSoapNote(prescriptionPanel.item)}
                            disabled={generatingSoapNote === prescriptionPanel.item.invoiceId}
                            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                          >
                            {generatingSoapNote === prescriptionPanel.item.invoiceId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                            Generate SOAP Note
                          </button>
                        </div>
                      )}

                      {/* Previous Dosage & Amount Paid cards */}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {/* Previous Dosage Card */}
                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-800">
                            <Pill className="h-4 w-4 text-blue-600" />
                            Previous Dosage
                          </h3>
                          {(() => {
                            const glp1 = prescriptionPanel.item.glp1Info;
                            const ctx = prescriptionPanel.details.clinicalContext?.glp1History;
                            const medType = ctx?.type || glp1?.glp1Type;
                            const dose = ctx?.dose || glp1?.lastDose;
                            const hasHistory = glp1?.usedGlp1 || ctx?.used;

                            if (hasHistory && (medType || dose)) {
                              return (
                                <div>
                                  <p className="text-2xl font-bold text-blue-900">
                                    {dose ? `${dose}mg` : 'N/A'}
                                  </p>
                                  <p className="mt-1 text-sm font-medium text-blue-700">
                                    {medType || 'GLP-1 Medication'}
                                  </p>
                                  {ctx?.sideEffects && (
                                    <p className="mt-2 text-xs text-blue-600">
                                      Side effects: {ctx.sideEffects}
                                    </p>
                                  )}
                                </div>
                              );
                            }
                            return (
                              <p className="text-lg font-semibold text-blue-400">
                                No prior GLP-1 history
                              </p>
                            );
                          })()}
                        </div>

                        {/* Amount Paid Card */}
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-800">
                            <DollarSign className="h-4 w-4 text-emerald-600" />
                            Patient Paid
                          </h3>
                          <p className="text-2xl font-bold text-emerald-900">
                            {prescriptionPanel.details.invoice?.amountFormatted ||
                              prescriptionPanel.item.amountFormatted ||
                              '-'}
                          </p>
                          <p className="mt-1 text-sm font-medium text-emerald-700">
                            {prescriptionPanel.item.treatment || 'Treatment'}
                          </p>
                          {prescriptionPanel.item.plan && prescriptionPanel.item.plan !== 'N/A' && (
                            <p className="mt-1 text-xs text-emerald-600">
                              Plan: {prescriptionPanel.item.plan}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Shipping Address - Editable */}
                      <div
                        className={`rounded-xl p-4 ${isAddressComplete(prescriptionForm) ? 'bg-gray-50' : 'border border-red-200 bg-red-50'}`}
                      >
                        <h3 className="mb-3 flex items-center gap-2 font-medium text-gray-900">
                          <MapPin
                            className={`h-4 w-4 ${isAddressComplete(prescriptionForm) ? 'text-rose-500' : 'text-red-500'}`}
                          />
                          Shipping Address
                          {!isAddressComplete(prescriptionForm) && (
                            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                              Required for shipping
                            </span>
                          )}
                        </h3>

                        {!isAddressComplete(prescriptionForm) && (
                          <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-100 p-2 text-sm text-red-700">
                            <AlertCircle className="h-4 w-4" />
                            Address is missing or incomplete. Please fill in below.
                          </div>
                        )}

                        <div className="space-y-3">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              Street Address *
                            </label>
                            <AddressInput
                              value={prescriptionForm.address1}
                              onChange={(value: string, parsed?: AddressData) => {
                                if (parsed) {
                                  setPrescriptionForm((prev) => ({
                                    ...prev,
                                    address1: parsed.address1,
                                    city: parsed.city,
                                    state: parsed.state,
                                    zip: parsed.zip,
                                  }));
                                } else {
                                  setPrescriptionForm((prev) => ({ ...prev, address1: value }));
                                }
                              }}
                              placeholder="123 Main Street"
                              className={`w-full ${
                                !prescriptionForm.address1
                                  ? '[&_input]:border-red-300 [&_input]:bg-red-50'
                                  : ''
                              }`}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              Apt/Suite/Unit
                            </label>
                            <input
                              type="text"
                              value={prescriptionForm.address2}
                              onChange={(e) =>
                                setPrescriptionForm((prev) => ({
                                  ...prev,
                                  address2: e.target.value,
                                }))
                              }
                              placeholder="Apt 4B (optional)"
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-rose-400"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-600">
                                City *
                              </label>
                              <input
                                type="text"
                                value={prescriptionForm.city}
                                onChange={(e) =>
                                  setPrescriptionForm((prev) => ({ ...prev, city: e.target.value }))
                                }
                                placeholder="Miami"
                                className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-rose-400 ${
                                  !prescriptionForm.city
                                    ? 'border-red-300 bg-red-50'
                                    : 'border-gray-300'
                                }`}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-600">
                                State *
                              </label>
                              <input
                                type="text"
                                value={prescriptionForm.state}
                                onChange={(e) =>
                                  setPrescriptionForm((prev) => ({
                                    ...prev,
                                    state: e.target.value.toUpperCase().slice(0, 2),
                                  }))
                                }
                                placeholder="FL"
                                maxLength={2}
                                className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-rose-400 ${
                                  !prescriptionForm.state
                                    ? 'border-red-300 bg-red-50'
                                    : 'border-gray-300'
                                }`}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-600">
                                ZIP *
                              </label>
                              <input
                                type="text"
                                value={prescriptionForm.zip}
                                onChange={(e) =>
                                  setPrescriptionForm((prev) => ({ ...prev, zip: e.target.value }))
                                }
                                placeholder="33101"
                                className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-rose-400 ${
                                  !prescriptionForm.zip
                                    ? 'border-red-300 bg-red-50'
                                    : 'border-gray-300'
                                }`}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Plan Duration Info - Important for prescribing */}
                      <div className="rounded-xl border border-gray-200 bg-rose-50 p-4">
                        <h3 className="mb-2 flex items-center gap-2 font-medium text-gray-900">
                          <Calendar className="h-4 w-4 text-rose-600" />
                          Prescription Duration
                        </h3>
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-bold ${
                              prescriptionPanel.item.planMonths >= 6
                                ? 'bg-emerald-200 text-emerald-800'
                                : prescriptionPanel.item.planMonths >= 3
                                  ? 'bg-rose-200 text-rose-800'
                                  : 'bg-gray-200 text-gray-800'
                            }`}
                          >
                            {prescriptionPanel.item.plan}
                          </span>
                          <span className="text-sm text-gray-700">
                            Prescribe{' '}
                            <strong>
                              {prescriptionPanel.item.planMonths}{' '}
                              {prescriptionPanel.item.planMonths === 1 ? 'month' : 'months'}
                            </strong>{' '}
                            supply
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-gray-600">
                          Patient paid for {prescriptionPanel.item.planMonths}-month plan. Adjust
                          quantity accordingly.
                        </p>
                      </div>

                      {/* Clinic Info */}
                      <div className="rounded-xl bg-green-50 p-4">
                        <h3 className="mb-2 flex items-center gap-2 font-medium text-gray-900">
                          <Building2 className="h-4 w-4 text-green-600" />
                          Pharmacy Routing
                        </h3>
                        <p className="text-sm text-gray-600">
                          Prescription will be sent via{' '}
                          <span className="font-semibold text-green-700">
                            {prescriptionPanel.details.clinic?.lifefilePracticeName ||
                              prescriptionPanel.details.clinic?.name}
                          </span>{' '}
                          Lifefile account
                        </p>
                      </div>

                      {/* Order Set Selector */}
                      <OrderSetSelector
                        externalSelectedId={autoSelectedOrderSetId}
                        onApply={(medications: AppliedMedication[]) => {
                          setAutoSelectedOrderSetId(null);
                          setPrescriptionForm((prev) => ({
                            ...prev,
                            medications: medications.map((m) => ({
                              id: crypto.randomUUID(),
                              medicationKey: m.medicationKey,
                              sig: m.sig,
                              quantity: m.quantity,
                              refills: m.refills,
                              daysSupply: m.daysSupply,
                            })),
                          }));
                        }}
                      />

                      {/* Medications Selection - Multiple */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="flex items-center gap-2 font-medium text-gray-900">
                            <Pill className="h-4 w-4 text-[var(--brand-primary)]" />
                            Medications ({prescriptionForm.medications.length})
                          </h3>
                          <button
                            type="button"
                            onClick={addMedication}
                            className="flex items-center gap-1 text-sm font-medium text-rose-600 hover:text-rose-700"
                          >
                            <Plus className="h-4 w-4" /> Add Medication
                          </button>
                        </div>

                        {prescriptionForm.medications.map((medication, index) => (
                          <div
                            key={medication.id}
                            className="relative space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4"
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
                                  className="rounded p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                                  title="Remove this medication"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700">
                                Select Medication *
                              </label>
                              {/* Expected medication type indicator */}
                              {prescriptionPanel?.item.treatment && (
                                <div className="mb-2">
                                  {prescriptionPanel.item.treatment
                                    .toLowerCase()
                                    .includes('tirzepatide') && (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-primary)] bg-[var(--brand-primary-light)] px-3 py-1 text-sm font-medium text-[var(--brand-primary)]">
                                      🟣 Expected: Tirzepatide
                                    </span>
                                  )}
                                  {prescriptionPanel.item.treatment
                                    .toLowerCase()
                                    .includes('semaglutide') && (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-300 bg-teal-100 px-3 py-1 text-sm font-medium text-teal-800">
                                      🟢 Expected: Semaglutide
                                    </span>
                                  )}
                                </div>
                              )}
                              <MedicationSelector
                                value={medication.medicationKey}
                                onChange={(key) => handleMedicationChange(index, key)}
                                expectedMedicationType={
                                  prescriptionPanel?.item.treatment
                                    ?.toLowerCase()
                                    .includes('tirzepatide')
                                    ? 'Tirzepatide'
                                    : prescriptionPanel?.item.treatment
                                          ?.toLowerCase()
                                          .includes('semaglutide')
                                      ? 'Semaglutide'
                                      : undefined
                                }
                                showCategoryBadge={true}
                              />
                            </div>

                            {/* Quantity / Refills / Days Supply - always visible for all medications */}
                            <div className="grid grid-cols-3 gap-4">
                              <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">
                                  Quantity *
                                </label>
                                <input
                                  type="text"
                                  value={medication.quantity}
                                  onChange={(e) =>
                                    updateMedicationField(index, 'quantity', e.target.value)
                                  }
                                  className={`w-full rounded-xl border bg-white px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-rose-400 ${
                                    prescriptionPanel?.item.planMonths === 1 &&
                                    medication.medicationKey &&
                                    MEDS[medication.medicationKey] &&
                                    GLP1_PRODUCT_IDS.has(MEDS[medication.medicationKey].id) &&
                                    Number(medication.quantity) > 1
                                      ? 'border-amber-500 ring-2 ring-amber-200'
                                      : 'border-gray-300'
                                  }`}
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">
                                  Refills
                                </label>
                                <select
                                  value={medication.refills}
                                  onChange={(e) =>
                                    updateMedicationField(index, 'refills', e.target.value)
                                  }
                                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-rose-400"
                                >
                                  {[0, 1, 2, 3, 4, 5, 6, 11].map((n) => (
                                    <option key={n} value={String(n)}>
                                      {n}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">
                                  Days Supply
                                </label>
                                <select
                                  value={medication.daysSupply || '30'}
                                  onChange={(e) =>
                                    updateMedicationField(index, 'daysSupply', e.target.value)
                                  }
                                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-rose-400"
                                >
                                  <option value="7">7 days</option>
                                  <option value="14">14 days</option>
                                  <option value="28">28 days</option>
                                  <option value="30">30 days</option>
                                  <option value="60">60 days</option>
                                  <option value="90">90 days</option>
                                  <option value="120">120 days</option>
                                  <option value="180">180 days</option>
                                </select>
                              </div>
                            </div>

                            {/* 1-Month Vial Safeguard Warning */}
                            {prescriptionPanel?.item.planMonths === 1 &&
                              medication.medicationKey &&
                              MEDS[medication.medicationKey] &&
                              GLP1_PRODUCT_IDS.has(MEDS[medication.medicationKey].id) &&
                              Number(medication.quantity) > 1 && (
                                <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
                                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                                  <div className="text-sm">
                                    <p className="font-semibold text-amber-800">
                                      1-month plan: only 1 vial recommended
                                    </p>
                                    <p className="mt-0.5 text-amber-700">
                                      This patient paid for a 1-month plan but quantity is set to{' '}
                                      <strong>{medication.quantity}</strong>. Reduce to 1 or confirm
                                      the override when submitting.
                                    </p>
                                  </div>
                                </div>
                              )}

                            {/* Enhanced SigBuilder Component */}
                            <SigBuilder
                              medicationKey={medication.medicationKey}
                              initialSig={medication.sig}
                              initialQuantity={medication.quantity}
                              initialRefills={medication.refills}
                              onSigChange={(sig) => updateMedicationField(index, 'sig', sig)}
                              onQuantityChange={(quantity) =>
                                updateMedicationField(index, 'quantity', quantity)
                              }
                              onRefillsChange={(refills) =>
                                updateMedicationField(index, 'refills', refills)
                              }
                              onDaysSupplyChange={(ds) =>
                                updateMedicationField(index, 'daysSupply', ds)
                              }
                              disabled={!medication.medicationKey}
                            />
                          </div>
                        ))}

                        {/* Quick Add Another Button at bottom */}
                        <button
                          type="button"
                          onClick={addMedication}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-3 text-gray-500 transition-colors hover:border-rose-400 hover:text-rose-600"
                        >
                          <Plus className="h-5 w-5" />
                          Add Another Medication
                        </button>
                      </div>

                      {/* Pharmacy Gender - shown when patient gender is not clearly m/f */}
                      {!prescriptionForm.pharmacyGender && (
                        <div className="space-y-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                          <h3 className="flex items-center gap-2 font-medium text-amber-900">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            Biological Sex Required for Pharmacy
                          </h3>
                          <p className="text-sm text-amber-700">
                            The pharmacy requires biological sex for prescription processing.
                            Patient gender is not set or is &quot;Other&quot;. Please select:
                          </p>
                          <div className="flex gap-3" role="radiogroup" aria-label="Biological Sex">
                            {[
                              { value: 'm' as const, label: 'Male' },
                              { value: 'f' as const, label: 'Female' },
                            ].map((option) => (
                              <div
                                key={option.value}
                                role="radio"
                                aria-checked={prescriptionForm.pharmacyGender === option.value}
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPrescriptionForm((prev) => ({
                                    ...prev,
                                    pharmacyGender: option.value,
                                  }));
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === ' ' || e.key === 'Enter') {
                                    e.preventDefault();
                                    setPrescriptionForm((prev) => ({
                                      ...prev,
                                      pharmacyGender: option.value,
                                    }));
                                  }
                                }}
                                className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 p-3 transition-colors ${
                                  prescriptionForm.pharmacyGender === option.value
                                    ? 'border-rose-500 bg-rose-50 shadow-sm ring-2 ring-rose-200'
                                    : 'border-gray-200 bg-white hover:border-gray-300'
                                }`}
                              >
                                <span className={`font-medium ${
                                  prescriptionForm.pharmacyGender === option.value
                                    ? 'text-rose-900'
                                    : 'text-gray-700'
                                }`}>
                                  {option.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Shipping Method */}
                      <div className="space-y-3">
                        <h3 className="flex items-center gap-2 font-medium text-gray-900">
                          <Clock className="h-4 w-4 text-blue-500" />
                          Shipping Method
                        </h3>
                        <div className="space-y-2" role="radiogroup" aria-label="Shipping Method">
                          {SHIPPING_METHODS.map((method) => {
                            const isSelected =
                              prescriptionForm.shippingMethod === String(method.id);
                            return (
                              <div
                                key={method.id}
                                role="radio"
                                aria-checked={isSelected}
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPrescriptionForm((prev) => ({
                                    ...prev,
                                    shippingMethod: String(method.id),
                                  }));
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === ' ' || e.key === 'Enter') {
                                    e.preventDefault();
                                    setPrescriptionForm((prev) => ({
                                      ...prev,
                                      shippingMethod: String(method.id),
                                    }));
                                  }
                                }}
                                className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 p-3 transition-colors ${
                                  isSelected
                                    ? 'border-rose-500 bg-rose-50 shadow-sm ring-2 ring-rose-200'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                <div
                                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
                                    isSelected
                                      ? 'border-emerald-600 bg-emerald-600 text-white ring-2 ring-emerald-300 shadow-md'
                                      : 'border-gray-300 bg-white'
                                  }`}
                                >
                                  {isSelected ? (
                                    <CheckCircle2 className="h-6 w-6" strokeWidth={2.5} />
                                  ) : (
                                    <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                                  )}
                                </div>
                                <p
                                  className={`font-medium ${
                                    isSelected ? 'text-rose-900' : 'text-gray-900'
                                  }`}
                                >
                                  {method.label}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Panel Footer - still inside space-y-6 (else branch) */}
                      <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
                        <div className="flex gap-3">
                          <button
                            onClick={() => setPrescriptionPanel(null)}
                            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSubmitPrescription}
                            disabled={
                              submittingPrescription ||
                              !hasValidMedication() ||
                              !isAddressComplete(prescriptionForm) ||
                              !prescriptionForm.pharmacyGender
                            }
                            className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-3 font-medium text-white transition-all hover:from-rose-600 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {submittingPrescription ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Sending...
                              </>
                            ) : !prescriptionForm.pharmacyGender ? (
                              <>
                                <AlertCircle className="h-4 w-4" />
                                Select Biological Sex
                              </>
                            ) : !isAddressComplete(prescriptionForm) ? (
                              <>
                                <AlertCircle className="h-4 w-4" />
                                Address Required
                              </>
                            ) : !hasValidMedication() ? (
                              <>
                                <AlertCircle className="h-4 w-4" />
                                Add Medication
                              </>
                            ) : (
                              <>
                                <Send className="h-4 w-4" />
                                Send{' '}
                                {
                                  prescriptionForm.medications.filter(
                                    (m) => m.medicationKey && m.sig
                                  ).length
                                }{' '}
                                Rx
                                {prescriptionForm.medications.filter(
                                  (m) => m.medicationKey && m.sig
                                ).length > 1
                                  ? 's'
                                  : ''}{' '}
                                to Pharmacy
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
