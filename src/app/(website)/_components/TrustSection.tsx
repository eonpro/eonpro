'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  FileSearch,
  Building2,
  KeyRound,
  Eye,
} from 'lucide-react';

const TRUST_ITEMS = [
  {
    icon: ShieldCheck,
    title: 'HIPAA Compliant',
    description:
      'Every layer of EonPro is designed to meet HIPAA requirements — from encrypted data storage to audit-logged access controls.',
  },
  {
    icon: Lock,
    title: 'PHI Encryption',
    description:
      'Patient health information is encrypted at rest using AES-256. Fields like name, DOB, phone, and email are individually encrypted.',
  },
  {
    icon: FileSearch,
    title: 'Full Audit Trails',
    description:
      'Every PHI access, modification, and export is logged with user ID, timestamp, IP address, and action type for compliance auditing.',
  },
  {
    icon: Building2,
    title: 'Multi-Tenant Isolation',
    description:
      'Clinic data is strictly isolated at the database query level. Cross-tenant access is blocked for all non-super-admin roles.',
  },
  {
    icon: KeyRound,
    title: 'Role-Based Access',
    description:
      'Granular permissions for admins, providers, staff, patients, and affiliates — each with precisely scoped data visibility.',
  },
  {
    icon: Eye,
    title: 'No PHI in Logs',
    description:
      'Structured logging sanitizes all protected fields automatically. Only non-identifying IDs appear in application logs.',
  },
];

export default function TrustSection() {
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
    <section id="security" ref={ref} className="bg-[#1f2933] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div
          className={`mx-auto mb-16 max-w-3xl text-center transition-all duration-700 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          <p className="text-sm font-semibold tracking-wide text-[#4fa77e]">
            ENTERPRISE-GRADE SECURITY
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Built for trust, designed for compliance
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-white/50">
            Healthcare data demands the highest standards. EonPro treats every
            byte of patient data as sacred — encrypted, audited, and isolated.
          </p>
        </div>

        <div
          className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 transition-all duration-700 delay-200 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          {TRUST_ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-8 transition-colors hover:bg-white/10"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#4fa77e]/15 text-[#4fa77e]">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/50">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
