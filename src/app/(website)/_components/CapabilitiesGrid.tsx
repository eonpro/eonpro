'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Video,
  BrainCircuit,
  Pill,
  Activity,
  ClipboardList,
  CreditCard,
  Users,
  Palette,
  Building2,
  ToggleRight,
  Truck,
  MessageSquare,
  CalendarDays,
  ShieldCheck,
  Smartphone,
  Trophy,
  FlaskConical,
  Headphones,
} from 'lucide-react';

const CAPABILITIES = [
  { icon: Video, label: 'Telehealth', description: 'Zoom-integrated video visits' },
  { icon: BrainCircuit, label: 'AI Scribe', description: 'AI-powered SOAP note generation' },
  { icon: Pill, label: 'E-Prescribing', description: 'DoseSpot-integrated Rx workflows' },
  { icon: Activity, label: 'Progress Tracking', description: 'Weight, vitals, and wellness logs' },
  { icon: ClipboardList, label: 'Intake Forms', description: 'Custom form builder engine' },
  { icon: CreditCard, label: 'Billing & Payments', description: 'Stripe-powered subscriptions' },
  { icon: Users, label: 'Affiliate Program', description: 'Referral tracking and commissions' },
  { icon: Palette, label: 'White-Label', description: 'Per-clinic branding and domains' },
  { icon: Building2, label: 'Multi-Tenant', description: 'Clinic isolation at every layer' },
  { icon: ToggleRight, label: 'Feature Flags', description: 'Per-clinic feature toggles' },
  { icon: Truck, label: 'Shipment Tracking', description: 'FedEx integration with notifications' },
  { icon: MessageSquare, label: 'Care Comms', description: 'Twilio SMS and in-app chat' },
  { icon: CalendarDays, label: 'Scheduling', description: 'Appointments and calendar sync' },
  { icon: ShieldCheck, label: 'PHI Encryption', description: 'AES-256 encryption at rest' },
  { icon: Smartphone, label: 'Patient PWA', description: 'Mobile-first progressive web app' },
  { icon: Trophy, label: 'Gamification', description: 'Streaks, achievements, and challenges' },
  { icon: FlaskConical, label: 'Lab Integration', description: 'Bloodwork parsing and results' },
  { icon: Headphones, label: 'Support System', description: 'Ticketing with SLA and CSAT' },
];

export default function CapabilitiesGrid() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section ref={ref} className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div
          className={`mx-auto mb-14 max-w-3xl text-center transition-all duration-700 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          <p className="text-sm font-semibold tracking-wide text-[#4fa77e]">
            EXPLORE ALL CAPABILITIES
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#1f2933] sm:text-4xl">
            Built for every aspect of clinic operations
          </h2>
        </div>

        <div
          className={`grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 transition-all duration-700 delay-200 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          {CAPABILITIES.map((cap, i) => {
            const Icon = cap.icon;
            return (
              <div
                key={cap.label}
                className="group flex flex-col items-center rounded-2xl border border-gray-100 bg-[#fafaf8] p-5 text-center transition-all hover:border-[#4fa77e]/30 hover:bg-[#4fa77e]/5 hover:shadow-md"
                style={{ transitionDelay: `${i * 30}ms` }}
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#4fa77e]/10 text-[#4fa77e] transition-colors group-hover:bg-[#4fa77e] group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-[#1f2933]">{cap.label}</h3>
                <p className="mt-1 text-xs leading-snug text-[#1f2933]/45">{cap.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
