'use client';

import { Package } from 'lucide-react';
import PlatformPageLayout from '../_components/PlatformPageLayout';

function PharmacyMockup() {
  return (
    <div className="w-full max-w-[380px] overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-[#1e293b] px-5 py-3">
        <span className="text-sm font-semibold text-white">Rx Queue</span>
        <div className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
          12 PENDING
        </div>
      </div>
      <div className="p-4">
        {[
          { n: 'Sarah M.', rx: 'Semaglutide 0.5mg', st: 'Verified', sc: '#4fa77e' },
          { n: 'James K.', rx: 'Testosterone Cypionate 200mg', st: 'Filling', sc: '#3b82f6' },
          { n: 'Maria L.', rx: 'Tirzepatide 2.5mg', st: 'Shipped', sc: '#8b5cf6' },
          { n: 'David R.', rx: 'Semaglutide 1.0mg', st: 'Pending', sc: '#f59e0b' },
        ].map((rx) => (
          <div
            key={rx.n}
            className="flex items-center justify-between border-t border-gray-100 py-3 first:border-0 first:pt-0"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-500">
                Rx
              </div>
              <div>
                <p className="text-xs font-medium text-gray-900">{rx.n}</p>
                <p className="text-[10px] text-gray-400">{rx.rx}</p>
              </div>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ color: rx.sc, backgroundColor: `${rx.sc}15` }}
            >
              {rx.st}
            </span>
          </div>
        ))}
        <div className="mt-2 rounded-xl bg-amber-50 p-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            <p className="text-[10px] font-medium text-amber-700">
              FedEx tracking: 3 shipments in transit
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PharmacyIntegrationContent() {
  return (
    <PlatformPageLayout
      badge="PHARMACY INTEGRATION"
      title="From prescription to patient doorstep"
      highlightedWord="patient doorstep"
      subtitle="Integrates pharmacy operations directly into the care journey with e-prescriptions, automated fulfillment, real-time shipment tracking, and proactive patient communication."
      gradient="from-[#f59e0b] to-[#d97706]"
      icon={Package}
      mockup={<PharmacyMockup />}
      capabilities={[
        'Lifefile pharmacy integration',
        'Automated Rx fulfillment',
        'FedEx shipment tracking',
        'Refill queue management',
        'Duplicate Rx detection',
        'Package photo verification',
        'Patient SMS notifications',
        'Pharmacy analytics',
        'Controlled substance logging',
      ]}
      features={[
        {
          title: 'E-Prescription Pipeline',
          description:
            'Prescriptions flow from provider to pharmacy electronically. DoseSpot integration handles PDMP checks and controlled substance compliance.',
        },
        {
          title: 'Automated Fulfillment',
          description:
            'Rx queue management with status tracking from verification through compounding, packaging, and shipping.',
        },
        {
          title: 'FedEx Shipment Tracking',
          description:
            'Real-time package tracking with automated patient notifications at each milestone — shipped, in transit, and delivered.',
        },
        {
          title: 'Duplicate Detection',
          description:
            'Automatic detection of duplicate prescriptions to prevent errors and ensure patient safety across providers.',
        },
        {
          title: 'Photo Verification',
          description:
            'Package photos captured at fulfillment for quality assurance and dispute resolution. Stored securely with audit trail.',
        },
        {
          title: 'Refill Management',
          description:
            'Automated refill reminders, provider approval workflows, and patient self-service refill requests from the portal.',
        },
      ]}
    />
  );
}
