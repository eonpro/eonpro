'use client';

import { LayoutDashboard } from 'lucide-react';
import PlatformPageLayout from '../_components/PlatformPageLayout';

function AdminMockup() {
  return (
    <div className="w-full max-w-[380px] overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-[#1e293b] px-5 py-3">
        <span className="text-sm font-semibold text-white">Clinic Dashboard</span>
        <span className="text-[10px] text-white/50">Last 7 days</span>
      </div>
      <div className="p-4">
        <div className="mb-3 grid grid-cols-2 gap-2">
          {[
            { l: 'New Intakes', v: '142', d: '+23%', c: '#4fa77e' },
            { l: 'Revenue', v: '$48.2K', d: '+18%', c: '#3b82f6' },
            { l: 'Active Rx', v: '1,247', d: '+8%', c: '#8b5cf6' },
            { l: 'MRR', v: '$124K', d: '+12%', c: '#f59e0b' },
          ].map((s) => (
            <div key={s.l} className="rounded-xl bg-gray-50 p-3">
              <p className="text-[10px] text-gray-400">{s.l}</p>
              <p className="text-lg font-bold text-gray-900">{s.v}</p>
              <span className="text-[10px] font-semibold" style={{ color: s.c }}>
                {s.d}
              </span>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase text-gray-400">Recent Intakes</p>
          {[
            { n: 'Sarah M.', t: '2m ago', s: 'Weight Loss' },
            { n: 'James K.', t: '15m ago', s: 'Testosterone' },
            { n: 'Maria L.', t: '1h ago', s: 'Peptides' },
          ].map((p) => (
            <div
              key={p.n}
              className="flex items-center justify-between border-t border-gray-100 py-2 first:border-0 first:pt-0"
            >
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-[#4fa77e]/10 text-center text-[10px] font-bold leading-6 text-[#4fa77e]">
                  {p.n[0]}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-900">{p.n}</p>
                  <p className="text-[10px] text-gray-400">{p.s}</p>
                </div>
              </div>
              <span className="text-[10px] text-gray-400">{p.t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ClinicAdminContent() {
  return (
    <PlatformPageLayout
      badge="CLINIC ADMIN"
      title="Run your entire clinic from one dashboard"
      highlightedWord="one dashboard"
      subtitle="A comprehensive operations hub for clinic owners. Manage patients, orders, billing, intake forms, affiliate programs, analytics, and multi-clinic configurations from one place."
      gradient="from-[#8b5cf6] to-[#7c3aed]"
      icon={LayoutDashboard}
      mockup={<AdminMockup />}
      capabilities={[
        'Multi-clinic management',
        'Intake form builder',
        'Revenue & analytics dashboards',
        'Affiliate & referral program',
        'Subscription management',
        'White-label branding',
        'Role-based access control',
        'Patient CRM',
        'Feature flags per clinic',
      ]}
      features={[
        {
          title: 'Multi-Clinic Management',
          description:
            'Manage multiple clinic brands, each with their own domain, branding, providers, and patient pools — all from one admin panel.',
        },
        {
          title: 'Intake Form Builder',
          description:
            'Drag-and-drop form engine to build custom intake flows. Supports medical history, consent forms, insurance capture, and BMI calculators.',
        },
        {
          title: 'Revenue Analytics',
          description:
            'Real-time dashboards for MRR, new intakes, active prescriptions, churn rate, and revenue per patient.',
        },
        {
          title: 'Affiliate Program',
          description:
            'Built-in referral tracking with unique codes, commission tiers, payout management, and performance analytics.',
        },
        {
          title: 'White-Label Branding',
          description:
            'Custom domains, logos, colors, and email templates per clinic. Your brand, powered by EonPro infrastructure.',
        },
        {
          title: 'Subscription Management',
          description:
            'Stripe-powered recurring billing with automated invoicing, payment retries, and patient self-service plan changes.',
        },
      ]}
    />
  );
}
