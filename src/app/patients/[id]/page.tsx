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

  const genderLabel =
    patientWithDecryptedPHI.gender === "m"
      ? "Male"
      : patientWithDecryptedPHI.gender === "f"
      ? "Female"
      : "Not set";
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

  // Tab configuration with icons
  const tabs = [
    { id: 'profile', label: 'Patient Profile', icon: 'Pp', color: 'bg-purple-500' },
    { id: 'intake', label: 'Patient Intake', icon: 'Pi', color: 'bg-green-500' },
    { id: 'prescriptions', label: 'Prescriptions', icon: 'Rx', color: 'bg-orange-500' },
    { id: 'soap-notes', label: 'Soap Notes', icon: 'Sn', color: 'bg-blue-500' },
    { id: 'appointments', label: 'Appointments', icon: 'Ap', color: 'bg-indigo-500' },
    { id: 'progress', label: 'Progress', icon: 'Ps', color: 'bg-pink-500' },
    { id: 'billing', label: 'Billing', icon: '$', color: 'bg-emerald-500' },
    { id: 'chat', label: 'Chat', icon: '💬', color: 'bg-red-500' },
    { id: 'documents', label: 'Documents', icon: 'Dc', color: 'bg-amber-500' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/patients"
            className="text-[#4fa77e] hover:text-[#3f8660] text-sm font-medium"
          >
            ← Back to patients
          </Link>
        </div>
        
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-gray-900">
            {patientWithDecryptedPHI.firstName} {patientWithDecryptedPHI.lastName}
          </h1>
          <div className="text-sm text-gray-600 space-y-0.5">
            <p>Patient ID #{patientWithDecryptedPHI.patientId ?? patientWithDecryptedPHI.id} • DOB: {formatDob(patientWithDecryptedPHI.dob)} • Gender: {genderLabel}</p>
            <p>Phone: {patientWithDecryptedPHI.phone} • Email: {patientWithDecryptedPHI.email}</p>
            <p>
            {(() => {
              // Check if address1 already contains city/state/zip
              const hasFullAddress = patientWithDecryptedPHI.address1 && 
                (patientWithDecryptedPHI.address1.includes(patientWithDecryptedPHI.city) || 
                 patientWithDecryptedPHI.address1.includes(patientWithDecryptedPHI.state) ||
                 patientWithDecryptedPHI.address1.includes(patientWithDecryptedPHI.zip));
              
              if (hasFullAddress) {
                return patientWithDecryptedPHI.address1 + (patientWithDecryptedPHI.address2 ? `, ${patientWithDecryptedPHI.address2}` : "");
              }
              
              return `${patientWithDecryptedPHI.address1}${patientWithDecryptedPHI.address2 ? `, ${patientWithDecryptedPHI.address2}` : ""}, ${patientWithDecryptedPHI.city}, ${patientWithDecryptedPHI.state} ${patientWithDecryptedPHI.zip}`;
            })()}
          </p>
        </div>
      </div>

        {/* Tabs with icons - Medical File Folder Style */}
        <div className="flex items-end gap-0 mt-5">
          {tabs.map((tab, index) => (
        <Link
              key={tab.id}
              href={`/patients/${patientWithDecryptedPHI.id}?tab=${tab.id}`}
              className={`
                relative px-3 transition-all duration-200 flex-1
                ${currentTab === tab.id 
                  ? 'bg-white z-20' 
                  : 'bg-gray-100 hover:bg-gray-50 z-10'
                }
              `}
              style={{
                paddingTop: '10px',
                paddingBottom: '10px',
                marginLeft: index === 0 ? '0' : '-1px',
                borderTopLeftRadius: '10px',
                borderTopRightRadius: '10px',
                border: '1px solid #e5e7eb',
                borderBottom: currentTab === tab.id ? '1px solid white' : '1px solid #e5e7eb',
                boxShadow: currentTab === tab.id 
                  ? '0 -2px 8px rgba(0,0,0,0.05)' 
                  : 'inset 0 -1px 2px rgba(0,0,0,0.05)',
                transform: currentTab === tab.id ? 'translateY(1px)' : 'none',
                maxWidth: '120px'
              }}
            >
              <div className="flex flex-col items-center gap-1">
                <span className={`
                  text-[11px] font-semibold whitespace-nowrap
                  ${currentTab === tab.id ? 'text-gray-900' : 'text-gray-600'}
                `}>
                  {tab.label.replace('Patient ', '')}
                </span>
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm
                  shadow-sm transition-all duration-200
                  ${currentTab === tab.id ? tab.color : 'bg-gray-400'}
                `}>
                  {tab.icon}
                </div>
              </div>
        </Link>
          ))}
        </div>
      </div>

      {submittedFlag && (currentTab === "profile" || currentTab === "prescriptions") && (
        <div className="mx-6 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          ✅ Prescription submitted successfully.
        </div>
      )}

      {/* Main content area with Timeline - File Folder Style */}
      <div className="bg-white border-x border-b border-gray-200 min-h-[600px]" style={{ marginTop: '-1px' }}>
        <div className="flex gap-6 p-6">
          {/* Timeline sidebar */}
          <div className="w-80 flex-shrink-0">
            <PatientTimeline 
              events={timelineEvents}
              patientCreatedAt={new Date(patientWithDecryptedPHI.createdAt)}
            />
          </div>

          {/* Main content */}
          <div className="flex-1">
          {currentTab === "profile" ? (
            <div className="space-y-6">
              {/* Overview Card */}
              <section className="bg-gray-50 rounded-lg p-6">
                <h2 className="text-lg font-semibold mb-4">Overview</h2>
                <div className="space-y-2 text-sm">
                  <p>Total prescriptions: {patientWithDecryptedPHI.orders.length}</p>
                  <p>Last updated: {new Date(patientWithDecryptedPHI.createdAt).toLocaleString()}</p>
                  {patientWithDecryptedPHI.tags && '#hormone' === patientWithDecryptedPHI.tags ? (
                    <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                      #hormone
                    </span>
                  ) : null}
                </div>
              </section>

              {/* Patient Information Card */}
              <section className="bg-gray-50 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Patient Information</h2>
                  <button className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg text-sm font-medium hover:bg-[#3f8660] transition-colors">
                    Edit Profile
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs text-gray-500 uppercase font-medium">First Name</label>
                    <p className="mt-1 text-sm font-medium">{patientWithDecryptedPHI.firstName}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase font-medium">Phone</label>
                    <p className="mt-1 text-sm font-medium">{patientWithDecryptedPHI.phone}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase font-medium">Last Name</label>
                    <p className="mt-1 text-sm font-medium">{patientWithDecryptedPHI.lastName}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase font-medium">Email</label>
                    <p className="mt-1 text-sm font-medium">{patientWithDecryptedPHI.email}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase font-medium">Date of Birth</label>
                    <p className="mt-1 text-sm font-medium">{formatDob(patientWithDecryptedPHI.dob)}</p>
                  </div>
              <div>
                    <label className="text-xs text-gray-500 uppercase font-medium">Address</label>
                    <p className="mt-1 text-sm font-medium text-[#4fa77e]">
                      {(() => {
                        const hasFullAddress = patientWithDecryptedPHI.address1 && 
                          (patientWithDecryptedPHI.address1.includes(patientWithDecryptedPHI.city) || 
                           patientWithDecryptedPHI.address1.includes(patientWithDecryptedPHI.state) ||
                           patientWithDecryptedPHI.address1.includes(patientWithDecryptedPHI.zip));
                        
                        if (hasFullAddress) {
                          return patientWithDecryptedPHI.address1 + (patientWithDecryptedPHI.address2 ? `, ${patientWithDecryptedPHI.address2}` : "");
                        }
                        
                        return `${patientWithDecryptedPHI.address1}${patientWithDecryptedPHI.address2 ? `, ${patientWithDecryptedPHI.address2}` : ""}, ${patientWithDecryptedPHI.city}, ${patientWithDecryptedPHI.state} ${patientWithDecryptedPHI.zip}`;
                      })()}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase font-medium">Gender</label>
                    <p className="mt-1 text-sm font-medium">{genderLabel}</p>
                  </div>
                </div>

                {patientWithDecryptedPHI.notes && (
                  <div className="mt-6 pt-6 border-t">
                    <label className="text-xs text-gray-500 uppercase font-medium">Notes</label>
                    <p className="mt-2 text-sm whitespace-pre-line">{patientWithDecryptedPHI.notes}</p>
                  </div>
                )}

                {patientTags.length > 0 && (
                  <div className="mt-6 pt-6 border-t">
                    <label className="text-xs text-gray-500 uppercase font-medium mb-2 block">Tags</label>
                    <div className="flex flex-wrap gap-2">
                    {patientTags.map((tag: any) => {
                      const color = getTagColor(tag);
                      return (
                        <span
                          key={tag}
                            className={`text-xs ${color.bg} ${color.border} ${color.text} border px-2 py-1 rounded-full font-medium`}
                        >
                          {tag.startsWith("#") ? tag : `#${tag}`}
                        </span>
                      );
                    })}
                    </div>
                  </div>
                )}
          </section>


          {/* Patient Audit Log - Only visible to super admins */}
          {resolvedSearchParams?.admin === "true" && (
                <section className="bg-gray-50 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Patient Audit Log</h2>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Admin Only</span>
              </div>
              {patientWithDecryptedPHI.auditEntries.length === 0 ? (
                <p className="text-sm text-gray-500">No edits recorded yet.</p>
              ) : (
                <div className="space-y-3 text-sm">
                  {patientWithDecryptedPHI.auditEntries.map((entry: any) => (
                    <div key={entry.id} className="border rounded-lg p-3 bg-gray-50">
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
            </section>
          )}
            </div>
      ) : currentTab === "intake" ? (
            <div>
        <PatientIntakeView
          patient={patientWithDecryptedPHI}
          documents={documentsWithParsedData}
          intakeFormSubmissions={patientWithDecryptedPHI.intakeSubmissions}
        />
            </div>
      ) : currentTab === "soap-notes" ? (
            <div>
          <PatientSOAPNotesView 
            patientId={patientWithDecryptedPHI.id}
            currentProviderId={1} // TODO: Get current provider from session
          />
            </div>
          ) : currentTab === "appointments" ? (
            <div>
              <PatientAppointmentsView
                patient={patientWithDecryptedPHI}
              />
            </div>
          ) : currentTab === "progress" ? (
            <div>
              <PatientProgressView
                patient={patientWithDecryptedPHI}
              />
            </div>
      ) : currentTab === "prescriptions" ? (
            <div>
        <PatientPrescriptionsTab
          patient={patientWithDecryptedPHI}
          orders={patientWithDecryptedPHI.orders}
          shippingLabelMap={shippingLabelMap}
        />
            </div>
        ) : currentTab === "billing" ? (
            <div className="space-y-6">
              {/* Billing section with Payment Methods included */}
              <div className="bg-gray-50 rounded-lg p-6">
          <PatientBillingView 
            patientId={patientWithDecryptedPHI.id} 
            patientName={`${patientWithDecryptedPHI.firstName} ${patientWithDecryptedPHI.lastName}`}
          />
              </div>
              
              {/* Payment Methods as a subsection of Billing */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4 pb-3 border-b">Payment Methods</h3>
          <PatientPaymentMethods
            patientId={patientWithDecryptedPHI.id}
            patientName={`${patientWithDecryptedPHI.firstName} ${patientWithDecryptedPHI.lastName}`}
          />
              </div>
            </div>
        ) : currentTab === "documents" ? (
            <div>
          <PatientDocumentsView
            patientId={patientWithDecryptedPHI.id}
            patientName={`${patientWithDecryptedPHI.firstName} ${patientWithDecryptedPHI.lastName}`}
          />
            </div>
          ) : currentTab === "chat" ? (
            <div>
          <PatientChatView
            patient={patientWithDecryptedPHI}
          />
            </div>
          ) : null}
          </div>
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