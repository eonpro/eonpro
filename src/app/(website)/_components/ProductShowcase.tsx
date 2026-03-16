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
  },
];

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

  return (
    <div
      className={`transition-all duration-700 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
      }`}
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      <div
        className={`flex flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-xl lg:flex-row ${
          isEven ? '' : 'lg:flex-row-reverse'
        }`}
      >
        {/* Content */}
        <div className="flex flex-1 flex-col justify-center p-8 sm:p-10 lg:p-12">
          <div className="mb-4 inline-flex items-center gap-2">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${product.gradient} text-white`}>
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
            {product.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm text-[#1f2933]/70">
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#4fa77e]" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* Visual */}
        <div className={`relative flex flex-1 items-center justify-center bg-gradient-to-br ${product.gradient} p-10 sm:p-14`}>
          <div className="relative flex h-48 w-48 items-center justify-center sm:h-56 sm:w-56">
            <div className="absolute inset-0 rounded-full bg-white/10 blur-2xl" />
            <Icon className="relative h-24 w-24 text-white/90 sm:h-28 sm:w-28" strokeWidth={1} />
          </div>
          <div className="pointer-events-none absolute inset-0 opacity-10">
            <div
              className="h-full w-full"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                backgroundSize: '28px 28px',
              }}
            />
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
