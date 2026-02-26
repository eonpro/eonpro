'use client';

import Link from 'next/link';
import {
  TrendingUp,
  Users,
  BarChart3,
  PieChart,
  LineChart,
  Wallet,
  RefreshCcw,
  FileBarChart,
  Plus,
  ArrowRight,
  Sparkles,
  Download,
  Calendar,
  Receipt,
} from 'lucide-react';

// Report catalog — one-click access to every report
const REPORTS = [
  {
    id: 'revenue',
    name: 'Revenue Analytics',
    description: 'Gross revenue, MRR, trends, forecast & payment methods',
    href: '/admin/finance/revenue',
    icon: TrendingUp,
    accent: 'emerald',
    featured: true,
  },
  {
    id: 'demographics',
    name: 'Patient Demographics',
    description: 'Patients by state, age, gender — M/F ratio & export',
    href: '/admin/finance/reports/demographics',
    icon: Users,
    accent: 'teal',
    featured: true,
  },
  {
    id: 'sales-transactions',
    name: 'Sales Transactions',
    description: 'Every transaction with patient name — by day, week, month, or custom dates',
    href: '/admin/finance/reports/sales',
    icon: Receipt,
    accent: 'blue',
    featured: true,
  },
  {
    id: 'incoming-payments',
    name: 'Incoming Payments',
    description: 'Stripe payment stream, reconciliation status',
    href: '/admin/finance/incoming-payments',
    icon: Download,
    accent: 'blue',
    featured: false,
  },
  {
    id: 'reconciliation',
    name: 'Payment Reconciliation',
    description: 'Unmatched payments, match history, retry',
    href: '/admin/finance/reconciliation',
    icon: RefreshCcw,
    accent: 'amber',
    featured: false,
  },
  {
    id: 'invoices',
    name: 'Invoices',
    description: 'Invoice list, status, amounts',
    href: '/admin/finance/invoices',
    icon: FileBarChart,
    accent: 'purple',
    featured: false,
  },
  {
    id: 'builder',
    name: 'Report Builder',
    description: 'Custom metrics, charts, dimensions & schedules',
    href: '/admin/finance/reports/builder',
    icon: Plus,
    accent: 'slate',
    featured: true,
  },
];

const accentStyles: Record<string, string> = {
  emerald:
    'from-emerald-500/10 to-emerald-600/5 border-emerald-200/60 text-emerald-700 hover:border-emerald-300',
  teal: 'from-teal-500/10 to-teal-600/5 border-teal-200/60 text-teal-700 hover:border-teal-300',
  blue: 'from-blue-500/10 to-blue-600/5 border-blue-200/60 text-blue-700 hover:border-blue-300',
  amber: 'from-amber-500/10 to-amber-600/5 border-amber-200/60 text-amber-700 hover:border-amber-300',
  purple: 'from-[var(--brand-primary-light)] to-[var(--brand-primary-light)] border-[var(--brand-primary-medium)] text-[var(--brand-primary)] hover:border-[var(--brand-primary)]',
  slate: 'from-slate-500/10 to-slate-600/5 border-slate-200/60 text-slate-700 hover:border-slate-300',
};

const iconBgStyles: Record<string, string> = {
  emerald: 'bg-emerald-500/12 text-emerald-600',
  teal: 'bg-teal-500/12 text-teal-600',
  blue: 'bg-blue-500/12 text-blue-600',
  amber: 'bg-amber-500/12 text-amber-600',
  purple: 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]',
  slate: 'bg-slate-500/12 text-slate-600',
};

export default function ReportsPage() {
  const featured = REPORTS.filter((r) => r.featured);
  const others = REPORTS.filter((r) => !r.featured);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-8 py-10 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-emerald-200">
              <Sparkles className="h-4 w-4" />
              Report Center
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Insights at a glance
            </h1>
            <p className="mt-2 max-w-xl text-base text-gray-300">
              One-click access to revenue, demographics, payments & custom reports. Export anytime.
            </p>
          </div>
          <div className="hidden sm:flex">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5">
              <BarChart3 className="h-10 w-10 text-emerald-400/80" />
            </div>
          </div>
        </div>
      </div>

      {/* Featured Reports */}
      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Quick Access
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((report) => {
            const Icon = report.icon;
            const accent = accentStyles[report.accent] ?? accentStyles.slate;
            const iconBg = iconBgStyles[report.accent] ?? iconBgStyles.slate;
            return (
              <Link
                key={report.id}
                href={report.href}
                className={`group relative flex cursor-pointer flex-col gap-4 rounded-xl border bg-gradient-to-br p-6 transition-all duration-200 ${accent} hover:shadow-lg`}
              >
                <div className="flex items-start justify-between">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconBg}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-400 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">{report.name}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                    {report.description}
                  </p>
                </div>
                <span className="text-sm font-medium opacity-0 transition-opacity group-hover:opacity-100">
                  View report →
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* All Reports */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
          All Reports
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((report) => {
            const Icon = report.icon;
            const accent = accentStyles[report.accent] ?? accentStyles.slate;
            const iconBg = iconBgStyles[report.accent] ?? iconBgStyles.slate;
            return (
              <Link
                key={report.id}
                href={report.href}
                className={`group relative flex cursor-pointer items-center gap-4 rounded-xl border bg-white p-5 transition-all duration-200 ${accent} hover:shadow-md`}
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900">{report.name}</h3>
                  <p className="mt-0.5 truncate text-sm text-gray-500">{report.description}</p>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-1" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* Tip */}
      <div className="mt-10 rounded-xl border border-gray-200 bg-gray-50/50 px-6 py-4">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
            <Calendar className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Date ranges</h3>
            <p className="mt-1 text-sm text-gray-600">
              Each report supports flexible date ranges: day, week, month, quarter, semester, year,
              and custom. Use the date picker inside each report to filter data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
