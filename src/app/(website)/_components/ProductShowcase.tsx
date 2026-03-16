'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Smartphone,
  Stethoscope,
  LayoutDashboard,
  Package,
  ArrowRight,
} from 'lucide-react';

const PRODUCTS = [
  {
    icon: Smartphone,
    badge: 'Powered by EonPro',
    title: 'Patient Portal',
    description:
      'A single stop for patients to message providers, track progress, manage medications, schedule telehealth visits, log vitals, and access their medical records — all from a mobile-first PWA.',
    features: [
      'Progress tracking & gamification',
      'Medication reminders',
      'Telehealth video visits',
      'Wearable device sync',
      'In-app symptom checker',
      'Secure document access',
    ],
    gradient: 'from-[#4fa77e] to-[#3d9470]',
    mockup: 'patient-portal',
  },
  {
    icon: Stethoscope,
    badge: 'Powered by EonPro',
    title: 'Provider Dashboard',
    description:
      'A patient-centric clinical workspace that combines an EMR, AI-assisted SOAP notes, e-prescribing, telehealth tools, and clinical calculators — so providers can focus on delivering care.',
    features: [
      'AI Scribe for SOAP notes',
      'DoseSpot e-prescribing',
      'Zoom telehealth integration',
      'Drug reference & ICD lookup',
      'Clinical calculators',
      'Patient messaging',
    ],
    gradient: 'from-[#3b82f6] to-[#2563eb]',
    mockup: 'provider',
  },
  {
    icon: LayoutDashboard,
    badge: 'Powered by EonPro',
    title: 'Clinic Admin',
    description:
      'A comprehensive operations hub for clinic owners. Manage patients, orders, billing, intake forms, affiliate programs, analytics, and multi-clinic configurations from one place.',
    features: [
      'Multi-clinic management',
      'Intake form builder',
      'Revenue & analytics dashboards',
      'Affiliate & referral program',
      'Subscription management',
      'White-label branding',
    ],
    gradient: 'from-[#8b5cf6] to-[#7c3aed]',
    mockup: 'admin',
  },
  {
    icon: Package,
    badge: 'Powered by EonPro',
    title: 'Pharmacy Integration',
    description:
      'Integrates pharmacy operations directly into the care journey with e-prescriptions, automated fulfillment, real-time shipment tracking, and proactive patient communication.',
    features: [
      'Lifefile pharmacy integration',
      'Automated Rx fulfillment',
      'FedEx shipment tracking',
      'Refill queue management',
      'Duplicate Rx detection',
      'Package photo verification',
    ],
    gradient: 'from-[#f59e0b] to-[#d97706]',
    mockup: 'pharmacy',
  },
];

function PatientPortalMockup() {
  return (
    <div className="w-full max-w-[340px] animate-fade-in-up overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-[#4fa77e] px-5 py-3">
        <span className="text-sm font-semibold text-white">Patient Portal</span>
        <div className="flex gap-1.5">
          <div className="h-2 w-2 rounded-full bg-white/40" />
          <div className="h-2 w-2 rounded-full bg-white/40" />
          <div className="h-2 w-2 rounded-full bg-white/60" />
        </div>
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4fa77e]/10 text-sm font-bold text-[#4fa77e]">JD</div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Welcome back, Jane</p>
            <p className="text-xs text-gray-400">Weight Loss Program &middot; Week 12</p>
          </div>
        </div>
        <div className="mb-3 rounded-xl bg-gray-50 p-3">
          <p className="mb-2 text-xs font-semibold text-gray-500">WEIGHT TREND</p>
          <div className="flex items-end gap-1">
            {[68, 60, 55, 48, 42, 38, 35, 30].map((h, i) => (
              <div key={i} className="flex-1 rounded-t" style={{ height: `${h}px`, background: i === 7 ? '#4fa77e' : '#e5e7eb', transition: 'height 0.5s', transitionDelay: `${i * 80}ms` }} />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-400">8 weeks</span>
            <span className="text-xs font-bold text-[#4fa77e]">-18.2 lbs</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[{ l: 'Meds', v: '2 active', c: '#4fa77e' }, { l: 'Next Visit', v: 'Mar 22', c: '#3b82f6' }, { l: 'Streak', v: '14 days', c: '#f59e0b' }].map((s) => (
            <div key={s.l} className="rounded-lg bg-gray-50 p-2 text-center">
              <p className="text-[10px] text-gray-400">{s.l}</p>
              <p className="text-xs font-bold" style={{ color: s.c }}>{s.v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProviderMockup() {
  return (
    <div className="w-full max-w-[380px] animate-fade-in-up overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-[#1e293b] px-5 py-3">
        <span className="text-sm font-semibold text-white">SOAP Note — AI Scribe</span>
        <div className="rounded-md bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-400">AI ASSISTED</div>
      </div>
      <div className="p-4">
        <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-blue-500">Subjective</p>
          <p className="text-xs leading-relaxed text-gray-700">Patient reports consistent weight loss of 4.2 lbs over the past 2 weeks. Tolerating semaglutide 0.5mg well. No nausea or GI side effects.</p>
        </div>
        <div className="mb-3 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">Assessment</p>
          <p className="text-xs leading-relaxed text-gray-700">BMI 31.2 (down from 33.8). Responding well to current regimen. Ready for dose escalation.</p>
        </div>
        <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-violet-500">Plan</p>
          <p className="text-xs leading-relaxed text-gray-700">Increase semaglutide to 1.0mg weekly. Continue current diet plan. Follow up in 4 weeks.</p>
        </div>
      </div>
    </div>
  );
}

function AdminMockup() {
  return (
    <div className="w-full max-w-[380px] animate-fade-in-up overflow-hidden rounded-2xl bg-white shadow-2xl">
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
              <span className="text-[10px] font-semibold" style={{ color: s.c }}>{s.d}</span>
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
            <div key={p.n} className="flex items-center justify-between border-t border-gray-100 py-2 first:border-0 first:pt-0">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-[#4fa77e]/10 text-center text-[10px] font-bold leading-6 text-[#4fa77e]">{p.n[0]}</div>
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

function PharmacyMockup() {
  return (
    <div className="w-full max-w-[380px] animate-fade-in-up overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-[#1e293b] px-5 py-3">
        <span className="text-sm font-semibold text-white">Rx Queue</span>
        <div className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">12 PENDING</div>
      </div>
      <div className="p-4">
        {[
          { n: 'Sarah M.', rx: 'Semaglutide 0.5mg', st: 'Verified', sc: '#4fa77e', sb: '#4fa77e' },
          { n: 'James K.', rx: 'Testosterone Cypionate 200mg', st: 'Filling', sc: '#3b82f6', sb: '#3b82f6' },
          { n: 'Maria L.', rx: 'Tirzepatide 2.5mg', st: 'Shipped', sc: '#8b5cf6', sb: '#8b5cf6' },
          { n: 'David R.', rx: 'Semaglutide 1.0mg', st: 'Pending', sc: '#f59e0b', sb: '#f59e0b' },
        ].map((rx, i) => (
          <div key={rx.n} className="flex items-center justify-between border-t border-gray-100 py-3 first:border-0 first:pt-0">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-500">Rx</div>
              <div>
                <p className="text-xs font-medium text-gray-900">{rx.n}</p>
                <p className="text-[10px] text-gray-400">{rx.rx}</p>
              </div>
            </div>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: rx.sc, backgroundColor: `${rx.sb}15` }}>{rx.st}</span>
          </div>
        ))}
        <div className="mt-2 rounded-xl bg-amber-50 p-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            <p className="text-[10px] font-medium text-amber-700">FedEx tracking: 3 shipments in transit</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const MOCKUP_MAP: Record<string, () => JSX.Element> = {
  'patient-portal': PatientPortalMockup,
  provider: ProviderMockup,
  admin: AdminMockup,
  pharmacy: PharmacyMockup,
};

function ProductCard({
  product,
  index,
  visible,
}: {
  product: (typeof PRODUCTS)[number];
  index: number;
  visible: boolean;
}) {
  const Icon = product.icon;
  const isEven = index % 2 === 0;
  const Mockup = MOCKUP_MAP[product.mockup];

  return (
    <div
      className={`transition-all duration-700 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
      }`}
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      <div
        className={`group flex flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-xl lg:flex-row ${
          isEven ? '' : 'lg:flex-row-reverse'
        }`}
      >
        <div className="flex flex-1 flex-col justify-center p-8 sm:p-10 lg:p-12">
          <div className="mb-4 inline-flex items-center gap-2">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${product.gradient} text-white transition-transform duration-300 group-hover:scale-110`}>
              <Icon className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium text-[#1f2933]/40">
              {product.badge}
            </span>
          </div>

          <h3 className="text-2xl font-bold text-[#1f2933] sm:text-3xl">
            {product.title}
          </h3>
          <p className="mt-4 text-base leading-relaxed text-[#1f2933]/55">
            {product.description}
          </p>

          <ul className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {product.features.map((feature, fi) => (
              <li
                key={feature}
                className={`flex items-start gap-2 text-sm text-[#1f2933]/70 transition-all duration-500 ${
                  visible ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'
                }`}
                style={{ transitionDelay: `${index * 150 + fi * 60 + 300}ms` }}
              >
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#4fa77e]" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* Real UI mockup */}
        <div className={`relative flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-br ${product.gradient} p-8 sm:p-10`}>
          <div className="pointer-events-none absolute inset-0 opacity-[0.07]">
            <div
              className="h-full w-full"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                backgroundSize: '24px 24px',
              }}
            />
          </div>
          <div className="relative z-10 transition-transform duration-500 group-hover:-translate-y-2 group-hover:scale-[1.02]">
            {Mockup && <Mockup />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductShowcase() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.05 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section id="features" ref={ref} className="bg-[#efece7] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <p className="text-sm font-semibold tracking-wide text-[#4fa77e]">
            EXPLORE ALL EONPRO APPS
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#1f2933] sm:text-4xl">
            Everything your clinic needs, in one platform
          </h2>
        </div>

        <div className="flex flex-col gap-10">
          {PRODUCTS.map((product, i) => (
            <ProductCard key={product.title} product={product} index={i} visible={visible} />
          ))}
        </div>
      </div>
    </section>
  );
}
