import EditPatientForm from "@/components/EditPatientForm";
import PatientProfileView from "@/components/PatientProfileView";
import PatientIntakeView from "@/components/PatientIntakeView";
import { PatientBillingView } from "@/components/PatientBillingView";
import PatientPaymentMethods from "@/components/PatientPaymentMethods";
import PatientSOAPNotesView from "@/components/PatientSOAPNotesView";
import PatientChatView from "@/components/PatientChatView";
import PatientAppointmentsView from "@/components/PatientAppointmentsView";
import PatientProgressView from "@/components/PatientProgressView";
import PatientTimeline, { TimelineEvent } from "@/components/PatientTimeline";
import Breadcrumb from "@/components/Breadcrumb";
import { prisma } from "@/lib/db";
import { SHIPPING_METHODS } from "@/lib/shipping";
import Link from "next/link";
import { logger } from '@/lib/logger';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

type Params = {
  params: { id: string };
};

const PRACTICE_NAME = process.env.LIFEFILE_PRACTICE_NAME ?? "APOLLO BASED HEALTH LLC";
const PRACTICE_LOCATION = process.env.LIFEFILE_LOCATION_ID ?? "110396";
const PRACTICE_VENDOR = process.env.LIFEFILE_VENDOR_ID ?? "11596";

import PatientPrescriptionsTab from "@/components/PatientPrescriptionsTab";
import PatientDocumentsView from "@/components/PatientDocumentsView";
import { Patient, Provider, Order } from '@/types/models';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string; submitted?: string; admin?: string }>;
};

export default async function PatientDetailPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const id = Number(resolvedParams.id);
  
  // Validate the ID
  if (isNaN(id) || id <= 0) {
    return (
      <div className="p-10">
        <p className="text-red-600">Invalid patient ID.</p>
        <Link href="/patients" className="text-[#4fa77e] underline mt-4 block">
          ← Back to patients
        </Link>
      </div>
    );
  }
  
  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        include: {
          rxs: true,
          provider: true,
          events: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
      documents: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          filename: true,
          mimeType: true,
          createdAt: true,
          externalUrl: true,
          category: true,
          sourceSubmissionId: true,
          data: true,  // Include data field for intake display
        },
      },
      intakeSubmissions: {
        orderBy: { createdAt: "desc" },
        include: {
          template: true,
          responses: {
            include: {
              question: true,
            },
          },
        },
      },
      auditEntries: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!patient) {
    return (
      <div className="p-10">
        <p className="text-red-600">Patient not found.</p>
        <Link href="/patients" className="text-[#4fa77e] underline mt-4 block">
          ← Back to patients
        </Link>
      </div>
    );
  }

  // Decrypt PHI fields for display
  const decryptedPatient = decryptPatientPHI(patient, ['email', 'phone', 'dob', 'ssn']);
  const patientWithDecryptedPHI = {
    ...patient,
    ...decryptedPatient
  };

  // Parse intake document data from Buffer to JSON
  const documentsWithParsedData = patientWithDecryptedPHI.documents.map((doc: any) => {
    if (doc.data && doc.category === 'MEDICAL_INTAKE_FORM') {
      try {
        // If data is already parsed, use it as is
        if (typeof doc.data === 'object' && !Buffer.isBuffer(doc.data) && !doc.data.type) {
          return doc;
        }
        
        // If data is a Buffer-like object, convert it to string and parse JSON
        let dataStr: string;
        if (typeof doc.data === 'object' && doc.data.type === 'Buffer' && Array.isArray(doc.data.data)) {
          // Prisma returns Buffer as {type: 'Buffer', data: number[]}
          dataStr = Buffer.from(doc.data.data).toString('utf8');
        } else if (Buffer.isBuffer(doc.data)) {
          dataStr = doc.data.toString('utf8');
        } else if (typeof doc.data === 'string') {
          dataStr = doc.data;
        } else {
          // If it's some other format, try to handle it
          dataStr = JSON.stringify(doc.data);
        }
        
        // Parse the JSON string
        const parsedData = JSON.parse(dataStr);
        return {
          ...doc,
          data: parsedData
        };
      } catch (err: any) {
    // @ts-ignore
   
        logger.error('Failed to parse document data:', err);
        logger.error('Data type:', typeof doc.data);
        logger.error('Data sample:', doc.data ? JSON.stringify(doc.data).substring(0, 100) : 'null');
        return doc;
      }
    }
    return doc;
  });

  // Format gender - handles "m", "f", "male", "female", "man", "woman"
  const formatGenderValue = (gender: string | null | undefined): string => {
    if (!gender) return "Not set";
    const g = gender.toLowerCase().trim();
    if (g === 'm' || g === 'male' || g === 'man') return 'Male';
    if (g === 'f' || g === 'female' || g === 'woman') return 'Female';
    return gender;
  };
  const genderLabel = formatGenderValue(patientWithDecryptedPHI.gender);
  const patientTags = Array.isArray(patientWithDecryptedPHI.tags)
    ? (patientWithDecryptedPHI.tags as string[]).map((tag: any) => tag.replace(/^#/, ""))
    : [];
  
  // Generate consistent colors for hashtags
  const getTagColor = (tag: string) => {
    const colors = [
      { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
      { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
      { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700' },
      { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700' },
      { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
      { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
      { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
      { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' },
      { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
    ];
    
    // Generate a consistent hash from the tag string
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = ((hash << 5) - hash) + tag.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return colors[Math.abs(hash) % colors.length];
  };
  const shippingLabelMap = new Map(
    SHIPPING_METHODS.map((method: any) => [method.id, method.label])
  );
  const resolvedSearchParams = await searchParams;
  const activeTab = resolvedSearchParams?.tab || "profile";
  const validTabs = ["profile", "intake", "prescriptions", "soap-notes", "appointments", "progress", "billing", "chat", "documents"];
  const currentTab = validTabs.includes(activeTab) ? activeTab : "profile";
  const submittedFlag = resolvedSearchParams?.submitted === "1";

  // Generate timeline events from patient data
  const timelineEvents: TimelineEvent[] = [];
  
  // Add intake form submissions
  patientWithDecryptedPHI.intakeSubmissions.forEach((submission: any) => {
    timelineEvents.push({
      id: `intake-${submission.id}`,
      date: new Date(submission.createdAt),
      type: 'intake',
      title: 'Patient intake',
      description: submission.template?.name || 'Intake form submitted'
    });
  });

  // Add prescriptions/orders
  patientWithDecryptedPHI.orders.forEach((order: any) => {
    timelineEvents.push({
      id: `rx-${order.id}`,
      date: new Date(order.createdAt),
      type: 'prescription',
      title: 'Patient paid for rx',
      description: `Order #${order.id} - ${order.rxs?.length || 0} prescriptions`
    });
  });

  // Add documents
  patientWithDecryptedPHI.documents.forEach((doc: any) => {
    if (doc.category !== 'MEDICAL_INTAKE_FORM') {
      timelineEvents.push({
        id: `doc-${doc.id}`,
        date: new Date(doc.createdAt),
        type: 'document',
        title: 'Document uploaded',
        description: doc.filename
      });
    }
  });

  // Add pharmacy tracking info
  patientWithDecryptedPHI.orders.forEach((order: any) => {
    order.events?.forEach((event: any) => {
      if (event.type === 'TRACKING_UPDATE') {
        timelineEvents.push({
          id: `tracking-${event.id}`,
          date: new Date(event.createdAt),
          type: 'prescription',
          title: 'Pharmacy tracking info',
          description: event.status
        });
      }
    });
  });

  // Extract vitals from multiple sources:
  // 1. Document data (JSON with sections array) - from eonpro-intake, heyflow-intake-v2
  // 2. IntakeSubmissions responses - from intake form system
  // 3. Flat key-value in document data
  const extractVitals = () => {
    const result: {
      height?: string | null;
      weight?: string | null;
      bmi?: string | null;
      bloodPressure?: string | null;
      idealWeight?: string | null;
    } = {};
    
    // Helper to find value by label in various data sources
    const findValue = (...labels: string[]): string | null => {
      // Source 1: Document data with sections array (must be parsed JSON, not Buffer)
      const intakeDoc = documentsWithParsedData.find((d: any) => 
        d.category === 'MEDICAL_INTAKE_FORM' && 
        d.data && 
        typeof d.data === 'object' &&
        !Buffer.isBuffer(d.data) &&
        !(d.data.type === 'Buffer') // Prisma serialized buffer format
      );
      
      if (intakeDoc?.data) {
        // Check sections array
        if (intakeDoc.data.sections && Array.isArray(intakeDoc.data.sections)) {
          for (const section of intakeDoc.data.sections) {
            if (section.entries && Array.isArray(section.entries)) {
              for (const entry of section.entries) {
                const entryLabel = (entry.label || '').toLowerCase();
                for (const label of labels) {
                  if (entryLabel.includes(label.toLowerCase()) && entry.value && entry.value !== '') {
                    return String(entry.value);
                  }
                }
              }
            }
          }
        }
        
        // Also check answers array directly (some webhooks store this way)
        if (intakeDoc.data.answers && Array.isArray(intakeDoc.data.answers)) {
          for (const answer of intakeDoc.data.answers) {
            const answerLabel = (answer.label || '').toLowerCase();
            for (const label of labels) {
              if (answerLabel.includes(label.toLowerCase()) && answer.value && answer.value !== '') {
                return String(answer.value);
              }
            }
          }
        }
      }
      
      // Source 2: IntakeSubmissions responses
      if (patientWithDecryptedPHI.intakeSubmissions?.length > 0) {
        for (const submission of patientWithDecryptedPHI.intakeSubmissions) {
          if (submission.responses && Array.isArray(submission.responses)) {
            for (const response of submission.responses) {
              const questionText = (response.question?.text || response.question?.label || '').toLowerCase();
              for (const label of labels) {
                if (questionText.includes(label.toLowerCase()) && response.value && response.value !== '') {
                  return String(response.value);
                }
              }
            }
          }
        }
      }
      
      // Source 3: Flat key-value in document data
      if (intakeDoc?.data && typeof intakeDoc.data === 'object') {
        for (const label of labels) {
          const searchKey = label.toLowerCase().replace(/[^a-z0-9]/g, '');
          for (const [key, value] of Object.entries(intakeDoc.data)) {
            const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedKey.includes(searchKey) && value && value !== '') {
              return String(value);
            }
          }
        }
      }
      
      return null;
    };
    
    // Extract height from feet/inches
    const heightFeet = findValue('height (feet)', 'height feet', 'heightfeet');
    const heightInches = findValue('height (inches)', 'height inches', 'heightinches');
    if (heightFeet) {
      result.height = heightInches ? `${heightFeet}'${heightInches}"` : `${heightFeet}'0"`;
    }
    
    // Extract weight
    result.weight = findValue('starting weight', 'current weight', 'weight');
    
    // Extract BMI
    result.bmi = findValue('bmi');
    
    // Extract blood pressure
    const bp = findValue('blood pressure', 'bloodpressure');
    result.bloodPressure = bp && bp.toLowerCase() !== 'unknown' ? bp : null;
    
    // Extract ideal weight
    result.idealWeight = findValue('ideal weight', 'goal weight', 'target weight');
    
    return result;
  };
  
  const vitals = extractVitals();

  // Navigation items for sidebar
  const navItems = [
    { id: 'profile', label: 'Profile', icon: 'Pp', color: 'bg-purple-500' },
    { id: 'intake', label: 'Intake', icon: 'Pi', color: 'bg-gray-400' },
    { id: 'prescriptions', label: 'Prescriptions', icon: 'Rx', color: 'bg-gray-400' },
    { id: 'soap-notes', label: 'Soap Notes', icon: 'Sn', color: 'bg-gray-400' },
    { id: 'progress', label: 'Progress', icon: 'Ps', color: 'bg-gray-400' },
    { id: 'billing', label: 'Invoices', icon: '$', color: 'bg-gray-400' },
    { id: 'chat', label: 'Chat', icon: 'Ch', color: 'bg-gray-400' },
    { id: 'documents', label: 'Documents', icon: 'Dc', color: 'bg-gray-400' },
    { id: 'appointments', label: 'Appointments', icon: 'Ap', color: 'bg-gray-400' },
  ];

  // Calculate age
  const calculateAge = (dob: string) => {
    if (!dob) return '';
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const formatPhone = (phone: string) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `+1(${cleaned.slice(0, 3)})${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+1(${cleaned.slice(1, 4)})${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  const age = calculateAge(patientWithDecryptedPHI.dob);
  const cityStateZip = [patientWithDecryptedPHI.city, `${patientWithDecryptedPHI.state} ${patientWithDecryptedPHI.zip}`].filter(Boolean).join(', ');
  const fullAddress = [patientWithDecryptedPHI.address1, patientWithDecryptedPHI.address2, cityStateZip].filter(Boolean).join(', ');
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

  return (
    <div className="min-h-screen bg-[#efece7] p-6">
      <div className="flex gap-6">
        {/* Left Sidebar - Patient Info & Navigation */}
        <div className="w-72 flex-shrink-0 bg-white rounded-2xl border border-gray-200 p-6 h-fit sticky top-6">
          {/* Avatar and Edit */}
          <div className="flex items-start justify-between mb-4">
            <div className="w-20 h-20 rounded-full bg-[#4fa77e]/10 flex items-center justify-center">
              <svg className="w-12 h-12 text-[#4fa77e]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            <Link
              href={`/patients/${patientWithDecryptedPHI.id}?tab=profile&edit=true`}
              className="text-[#4fa77e] text-sm font-medium hover:underline"
            >
              Edit
            </Link>
          </div>

          {/* Name and basic info */}
          <h2 className="text-xl font-bold text-gray-900">{patientWithDecryptedPHI.firstName} {patientWithDecryptedPHI.lastName}</h2>
          <p className="text-sm text-gray-500 mb-3">{age}, {genderLabel}</p>

          {/* Contact info */}
          <div className="space-y-1 text-sm text-gray-600 mb-3">
            <p><span className="text-gray-500">DOB:</span> {formatDob(patientWithDecryptedPHI.dob)}</p>
            <p>{patientWithDecryptedPHI.email}</p>
            <p>{formatPhone(patientWithDecryptedPHI.phone)}</p>
          </div>

          {/* ID */}
          <p className="text-sm font-medium text-gray-900 mb-3">
            ID #{patientWithDecryptedPHI.patientId || String(patientWithDecryptedPHI.id).padStart(6, '0')}
          </p>

          {/* Address */}
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-600 hover:text-[#4fa77e] block mb-6"
          >
            {patientWithDecryptedPHI.address1 && <p>{patientWithDecryptedPHI.address1}</p>}
            {patientWithDecryptedPHI.address2 && <p>{patientWithDecryptedPHI.address2}</p>}
            {cityStateZip && <p>{cityStateZip}</p>}
          </a>

          {/* Navigation */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <Link
                  key={item.id}
                  href={`/patients/${patientWithDecryptedPHI.id}?tab=${item.id}`}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive ? 'bg-gray-100' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                    isActive ? 'bg-purple-500' : 'bg-gray-400'
                  }`}>
                    {item.icon}
                  </div>
                  <span className={`text-sm ${isActive ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          {submittedFlag && (currentTab === "profile" || currentTab === "prescriptions") && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Prescription submitted successfully.
            </div>
          )}

          {currentTab === "profile" ? (
            <div className="space-y-6">
              {/* Title */}
              <h1 className="text-2xl font-bold text-gray-900">Patient Overview</h1>

              {/* Vitals Section */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <h2 className="text-lg font-semibold text-gray-900">Vitals</h2>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-[#efece7] rounded-xl p-4">
                    <p className="text-sm text-gray-500 mb-1">Height</p>
                    <p className="text-2xl font-bold text-gray-900">{vitals.height || '—'}</p>
                    <div className="mt-3 h-2 bg-gray-300 rounded-full overflow-hidden">
                      <div className="h-full bg-gray-500 rounded-full" style={{ width: '60%' }} />
                    </div>
                  </div>
                  <div className="bg-[#efece7] rounded-xl p-4">
                    <p className="text-sm text-gray-500 mb-1">Weight</p>
                    <p className="text-2xl font-bold text-gray-900">{vitals.weight ? `${vitals.weight}lbs` : '—'}</p>
                    <div className="mt-3 h-2 bg-gray-300 rounded-full overflow-hidden">
                      <div className="h-full bg-gray-500 rounded-full" style={{ width: '70%' }} />
                    </div>
                  </div>
                  <div className="bg-[#efece7] rounded-xl p-4">
                    <p className="text-sm text-gray-500 mb-1">BMI</p>
                    <p className="text-2xl font-bold text-gray-900">{vitals.bmi || '—'}</p>
                    <div className="mt-3 h-2 bg-gray-300 rounded-full overflow-hidden">
                      <div className="h-full bg-gray-500 rounded-full" style={{ width: '55%' }} />
                    </div>
                  </div>
                  <div className="bg-[#efece7] rounded-xl p-4">
                    <p className="text-sm text-gray-500 mb-1">Blood pressure</p>
                    <p className="text-2xl font-bold text-gray-900">{vitals.bloodPressure || '—'}</p>
                    <div className="mt-3 h-2 bg-gray-300 rounded-full overflow-hidden">
                      <div className="h-full bg-gray-500 rounded-full" style={{ width: '45%' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Tags and Overview */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                {patientTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-6">
                    {patientTags.map((tag: string) => {
                      const tagLower = tag.toLowerCase();
                      let tagStyle = 'bg-gray-100 text-gray-700 border-gray-200';
                      if (tagLower.includes('weightloss') || tagLower.includes('weight')) {
                        tagStyle = 'bg-[#efece7] text-gray-700 border-gray-300';
                      } else if (tagLower.includes('english') || tagLower.includes('language')) {
                        tagStyle = 'bg-[#4fa77e] text-white border-[#4fa77e]';
                      } else if (tagLower.includes('glp')) {
                        tagStyle = 'bg-rose-100 text-rose-700 border-rose-200';
                      } else if (tagLower.includes('eonmeds')) {
                        tagStyle = 'bg-blue-100 text-blue-700 border-blue-200';
                      }
                      return (
                        <span
                          key={tag}
                          className={`px-4 py-2 rounded-full text-sm font-medium border ${tagStyle}`}
                        >
                          #{tag}
                        </span>
                      );
                    })}
                  </div>
                )}

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Overview</h3>
                  <p className="text-sm text-gray-600">Total prescriptions: {patientWithDecryptedPHI.orders.length}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Last updated: {new Date(patientWithDecryptedPHI.createdAt).toLocaleString()}
                  </p>
                </div>

                {/* Weight Chart Placeholder */}
                <div className="mt-6 bg-[#efece7] rounded-xl p-4 h-48 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <p className="text-sm">Weight tracking chart</p>
                    <p className="text-xs">Data will appear as weight is logged</p>
                  </div>
                </div>
              </div>

              {/* Audit Log for admins */}
              {resolvedSearchParams?.admin === "true" && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Patient Audit Log</h2>
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Admin Only</span>
                  </div>
                  {patientWithDecryptedPHI.auditEntries.length === 0 ? (
                    <p className="text-sm text-gray-500">No edits recorded yet.</p>
                  ) : (
                    <div className="space-y-3 text-sm">
                      {patientWithDecryptedPHI.auditEntries.map((entry: any) => (
                        <div key={entry.id} className="border rounded-lg p-3 bg-[#efece7]">
                          <div className="flex justify-between text-xs text-gray-500 mb-2">
                            <span>{entry.actorEmail ?? "Unknown actor"}</span>
                            <span>{new Date(entry.createdAt).toLocaleString()}</span>
                          </div>
                          <pre className="text-xs whitespace-pre-wrap bg-white rounded p-2 border">
                            {JSON.stringify(entry.diff, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : currentTab === "intake" ? (
            <PatientIntakeView
              patient={patientWithDecryptedPHI}
              documents={documentsWithParsedData}
              intakeFormSubmissions={patientWithDecryptedPHI.intakeSubmissions}
            />
          ) : currentTab === "soap-notes" ? (
            <PatientSOAPNotesView 
              patientId={patientWithDecryptedPHI.id}
              currentProviderId={1}
            />
          ) : currentTab === "appointments" ? (
            <PatientAppointmentsView patient={patientWithDecryptedPHI} />
          ) : currentTab === "progress" ? (
            <PatientProgressView patient={patientWithDecryptedPHI} />
          ) : currentTab === "prescriptions" ? (
            <PatientPrescriptionsTab
              patient={patientWithDecryptedPHI}
              orders={patientWithDecryptedPHI.orders}
              shippingLabelMap={shippingLabelMap}
            />
          ) : currentTab === "billing" ? (
            <div className="space-y-6">
              <PatientBillingView 
                patientId={patientWithDecryptedPHI.id} 
                patientName={`${patientWithDecryptedPHI.firstName} ${patientWithDecryptedPHI.lastName}`}
              />
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold mb-4 pb-3 border-b border-gray-200">Payment Methods</h3>
                <PatientPaymentMethods
                  patientId={patientWithDecryptedPHI.id}
                  patientName={`${patientWithDecryptedPHI.firstName} ${patientWithDecryptedPHI.lastName}`}
                />
              </div>
            </div>
          ) : currentTab === "documents" ? (
            <PatientDocumentsView
              patientId={patientWithDecryptedPHI.id}
              patientName={`${patientWithDecryptedPHI.firstName} ${patientWithDecryptedPHI.lastName}`}
            />
          ) : currentTab === "chat" ? (
            <PatientChatView patient={patientWithDecryptedPHI} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatDob(dob: string | null) {
  if (!dob) return "—";
  const clean = dob.trim();
  if (!clean) return "—";
  if (clean.includes("/")) return clean;
  const parts = clean.split("-");
  if (parts.length === 3) {
    const [yyyy, mm, dd] = parts;
    if (yyyy && mm && dd) {
      return `${mm.padStart(2, "0")}/${dd.padStart(2, "0")}/${yyyy}`;
    }
  }
  return clean;
}