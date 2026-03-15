'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import {
  ArrowLeft,
  Syringe,
  Check,
  Clock,
  AlertCircle,
  Info,
  CalendarDays,
  RotateCw,
  MapPin,
} from 'lucide-react';
import {
  INJECTION_SITES,
  INJECTION_TIPS,
  getNextInjectionSite,
  type InjectionSite,
} from '@/lib/calculators';
import { safeParseJsonString } from '@/lib/utils/safe-json';
import { ringColorStyle } from '@/lib/utils/css-ring-color';

interface InjectionLog {
  id: string;
  site: InjectionSite;
  date: string;
  notes?: string;
}

const SITE_POSITIONS: Record<InjectionSite, { x: number; y: number; label: string }> = {
  abdomen_left: { x: 35, y: 45, label: 'Left Abdomen' },
  abdomen_right: { x: 65, y: 45, label: 'Right Abdomen' },
  thigh_left: { x: 35, y: 75, label: 'Left Thigh' },
  thigh_right: { x: 65, y: 75, label: 'Right Thigh' },
  upper_arm_left: { x: 15, y: 35, label: 'Left Arm' },
  upper_arm_right: { x: 85, y: 35, label: 'Right Arm' },
};

export default function InjectionTrackerPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';

  const [history, setHistory] = useState<InjectionLog[]>([]);
  const [selectedSite, setSelectedSite] = useState<InjectionSite | null>(null);
  const [showTips, setShowTips] = useState(false);
  const [notes, setNotes] = useState('');

  // Load history from localStorage (safe parse to avoid crash on malformed data)
  useEffect(() => {
    const saved = localStorage.getItem('injection-history');
    const parsed = safeParseJsonString<InjectionLog[]>(saved);
    if (parsed && Array.isArray(parsed)) setHistory(parsed);
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('injection-history', JSON.stringify(history));
  }, [history]);

  const recentSites = useMemo(() => {
    return history.slice(0, 6).map((h) => h.site);
  }, [history]);

  const suggestedSite = useMemo(() => {
    return getNextInjectionSite(recentSites);
  }, [recentSites]);

  const lastInjection = history[0];
  const daysSinceLastInjection = useMemo(() => {
    if (!lastInjection) return null;
    const lastDate = new Date(lastInjection.date);
    const now = new Date();
    return Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }, [lastInjection]);

  const isOverdue = daysSinceLastInjection !== null && daysSinceLastInjection >= 7;

  const logInjection = () => {
    if (!selectedSite) return;

    const newLog: InjectionLog = {
      id: Date.now().toString(),
      site: selectedSite,
      date: new Date().toISOString(),
      notes: notes || undefined,
    };

    setHistory([newLog, ...history]);
    setSelectedSite(null);
    setNotes('');
  };

  const getSiteStatus = (site: InjectionSite): 'suggested' | 'recent' | 'available' => {
    if (site === suggestedSite) return 'suggested';
    if (recentSites.slice(0, 2).includes(site)) return 'recent';
    return 'available';
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-[100dvh] px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`${PATIENT_PORTAL_PATH}/calculators`}
          className="group mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back to Tools
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Injection Site Tracker</h1>
        <p className="mt-1 text-gray-500">Track and rotate your injection sites for best results</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-5">
          {/* Status Card */}
          {lastInjection ? (
            <div
              className={`rounded-2xl p-5 ${
                isOverdue
                  ? 'border-2 border-amber-200 bg-amber-50'
                  : 'bg-white shadow-lg shadow-gray-100'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="mb-1 text-sm text-gray-500">Last Injection</p>
                  <p className="text-xl font-semibold text-gray-900">
                    {formatDate(lastInjection.date)}
                  </p>
                  <p className="text-sm text-gray-600">
                    {SITE_POSITIONS[lastInjection.site].label}
                  </p>
                </div>
                <div
                  className={`rounded-xl p-3 ${isOverdue ? 'bg-amber-100' : ''}`}
                  style={!isOverdue ? { backgroundColor: `${primaryColor}15` } : {}}
                >
                  {isOverdue ? (
                    <AlertCircle className="h-6 w-6 text-amber-600" />
                  ) : (
                    <Clock className="h-6 w-6" style={{ color: primaryColor }} />
                  )}
                </div>
              </div>
              {daysSinceLastInjection !== null && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p
                    className={`text-sm font-medium ${isOverdue ? 'text-amber-700' : 'text-gray-600'}`}
                  >
                    {daysSinceLastInjection === 0 && 'Injection logged today'}
                    {daysSinceLastInjection === 1 && '1 day ago'}
                    {daysSinceLastInjection > 1 && `${daysSinceLastInjection} days ago`}
                    {isOverdue && ' — Time for your next dose!'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-white p-5 shadow-lg shadow-gray-100">
              <div className="flex items-center gap-3">
                <div className="rounded-xl p-3" style={{ backgroundColor: `${primaryColor}15` }}>
                  <Syringe className="h-6 w-6" style={{ color: primaryColor }} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">No injections logged yet</p>
                  <p className="text-sm text-gray-500">
                    Tap on the body diagram to log your first injection
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Body Diagram */}
          <div className="rounded-2xl bg-white p-5 shadow-lg shadow-gray-100">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Select Injection Site</h3>
              <div className="flex items-center gap-2 text-xs">
                <span className="flex items-center gap-1">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: primaryColor }} />
                  Suggested
                </span>
                <span className="flex items-center gap-1">
                  <div className="h-3 w-3 rounded-full bg-amber-400" />
                  Recent
                </span>
              </div>
            </div>

            {/* Body Outline with Clickable Sites */}
            <div className="relative mx-auto aspect-[3/4] w-full max-w-xs">
              <svg viewBox="0 0 100 130" className="h-full w-full">
                <defs>
                  <radialGradient id="bodyHL" cx="0.5" cy="0.35" r="0.55">
                    <stop offset="0%" stopColor="#eef0f3" />
                    <stop offset="100%" stopColor="#dde0e5" />
                  </radialGradient>
                  <linearGradient id="bodyLimb" x1="0.5" y1="0" x2="0.5" y2="1">
                    <stop offset="0%" stopColor="#e4e7ec" />
                    <stop offset="100%" stopColor="#d0d4da" />
                  </linearGradient>
                  <filter id="bodySoft" x="-2%" y="-1%" width="104%" height="102%">
                    <feDropShadow dx="0" dy="0.5" stdDeviation="0.8" floodColor="#000" floodOpacity="0.06" />
                  </filter>
                </defs>

                {/* Head */}
                <ellipse cx="50" cy="10.5" rx="7.5" ry="8.5" fill="url(#bodyHL)" stroke="#c8ccd2" strokeWidth="0.5" filter="url(#bodySoft)" />

                {/* Neck */}
                <path
                  d="M 45 18.5 C 45 17.5 47 17 50 17 C 53 17 55 17.5 55 18.5 L 55 23 C 55 23.5 53 24 50 24 C 47 24 45 23.5 45 23 Z"
                  fill="url(#bodyLimb)"
                />

                {/* Torso (shoulders through hips) */}
                <path
                  d="M 50 23 C 43 23 34 24.5 30 27 C 26 29.5 26 32 27 36 L 29 48 C 30 53 32 57 35 60 C 37 62.5 37 65 36 68 C 35 70.5 36 72 38 73 C 41 74.5 45 75 50 75 C 55 75 59 74.5 62 73 C 64 72 65 70.5 64 68 C 63 65 63 62.5 65 60 C 68 57 70 53 71 48 L 73 36 C 74 32 74 29.5 70 27 C 66 24.5 57 23 50 23 Z"
                  fill="url(#bodyHL)"
                  stroke="#c8ccd2"
                  strokeWidth="0.5"
                  filter="url(#bodySoft)"
                />

                {/* Left Arm */}
                <path
                  d="M 28 28 C 23 29.5 18 33 16 38 C 14 43 12 49 11 55 C 10.5 58.5 11 60.5 13 61 C 15 61.5 17 59 18 55 C 19.5 50 21 44 23 38 L 25 33 C 26.5 30 28.5 28.5 30 28 Z"
                  fill="url(#bodyLimb)"
                  stroke="#c8ccd2"
                  strokeWidth="0.5"
                  filter="url(#bodySoft)"
                />

                {/* Right Arm */}
                <path
                  d="M 72 28 C 77 29.5 82 33 84 38 C 86 43 88 49 89 55 C 89.5 58.5 89 60.5 87 61 C 85 61.5 83 59 82 55 C 80.5 50 79 44 77 38 L 75 33 C 73.5 30 71.5 28.5 70 28 Z"
                  fill="url(#bodyLimb)"
                  stroke="#c8ccd2"
                  strokeWidth="0.5"
                  filter="url(#bodySoft)"
                />

                {/* Left Leg */}
                <path
                  d="M 37 73 C 36 80 34 90 33 100 C 32 110 32.5 117 34 121 C 35 123.5 37 125 39.5 125 C 42 125 43.5 123 43.5 121 C 44.5 117 44.5 110 44 100 C 43.5 90 44 80 45 73 Z"
                  fill="url(#bodyLimb)"
                  stroke="#c8ccd2"
                  strokeWidth="0.5"
                  filter="url(#bodySoft)"
                />

                {/* Right Leg */}
                <path
                  d="M 55 73 C 56 80 56.5 90 56 100 C 55.5 110 55.5 117 56.5 121 C 57 123.5 58 125 60.5 125 C 63 125 65 123 66 121 C 67.5 117 68 110 67 100 C 66 90 64 80 63 73 Z"
                  fill="url(#bodyLimb)"
                  stroke="#c8ccd2"
                  strokeWidth="0.5"
                  filter="url(#bodySoft)"
                />
              </svg>

              {/* Clickable injection site markers */}
              {Object.entries(SITE_POSITIONS).map(([site, pos]) => {
                const siteKey = site as InjectionSite;
                const status = getSiteStatus(siteKey);
                const isSelected = selectedSite === siteKey;

                let bgColor = '#E5E7EB';

                if (status === 'suggested') {
                  bgColor = primaryColor;
                } else if (status === 'recent') {
                  bgColor = '#FBBF24';
                }

                return (
                  <button
                    key={site}
                    onClick={() => setSelectedSite(siteKey)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 transform transition-transform hover:scale-110"
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                    }}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition-all ${
                        isSelected ? 'scale-110' : ''
                      }`}
                      style={{
                        backgroundColor: bgColor,
                        boxShadow: isSelected ? '0 0 0 4px #1F2937' : 'none',
                      }}
                    >
                      {isSelected && <Check className="h-4 w-4 text-white" />}
                      {status === 'suggested' && !isSelected && (
                        <MapPin className="h-4 w-4 text-white" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected Site Info */}
            {selectedSite && (
              <div className="mt-4 rounded-xl bg-gray-50 p-4">
                <p className="mb-1 font-medium text-gray-900">
                  {SITE_POSITIONS[selectedSite].label}
                </p>
                <p className="text-sm text-gray-600">
                  {INJECTION_SITES.find((s) => s.site === selectedSite)?.instructions}
                </p>
              </div>
            )}

            {/* Suggested Site Notice */}
            {!selectedSite && (
              <div className="mt-4 rounded-xl p-4" style={{ backgroundColor: `${primaryColor}15` }}>
                <p className="text-sm font-medium" style={{ color: primaryColor }}>
                  <RotateCw className="mr-1 inline h-4 w-4" />
                  Suggested next site: {SITE_POSITIONS[suggestedSite].label}
                </p>
              </div>
            )}

            {/* Notes Input */}
            {selectedSite && (
              <div className="mt-4">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes (optional)..."
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                  style={ringColorStyle(primaryColor)}
                  rows={2}
                />
              </div>
            )}

            {/* Log Button */}
            <button
              onClick={logInjection}
              disabled={!selectedSite}
              className={`mt-4 w-full rounded-xl py-4 font-semibold transition-all ${
                selectedSite
                  ? 'text-white shadow-lg hover:shadow-xl'
                  : 'cursor-not-allowed bg-gray-100 text-gray-400'
              }`}
              style={selectedSite ? { backgroundColor: primaryColor } : {}}
            >
              {selectedSite ? 'Log Injection' : 'Select a site to log'}
            </button>
          </div>

          {/* Injection Tips */}
          <div className="rounded-2xl bg-white p-5 shadow-lg shadow-gray-100">
            <button
              onClick={() => setShowTips(!showTips)}
              className="flex w-full items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg p-2" style={{ backgroundColor: `${primaryColor}15` }}>
                  <Info className="h-5 w-5" style={{ color: primaryColor }} />
                </div>
                <span className="font-semibold text-gray-900">Injection Tips</span>
              </div>
              <ArrowLeft
                className={`h-5 w-5 text-gray-400 transition-transform ${
                  showTips ? 'rotate-90' : '-rotate-90'
                }`}
              />
            </button>

            {showTips && (
              <ul className="mt-4 space-y-3">
                {INJECTION_TIPS.map((tip, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                    <span
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {i + 1}
                    </span>
                    {tip}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right Column - History */}
        <div className="space-y-5">
          {/* History */}
          <div className="rounded-2xl bg-white p-5 shadow-lg shadow-gray-100">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                <CalendarDays className="h-5 w-5 text-gray-400" />
                Injection History
              </h3>
              {history.length > 0 && (
                <span className="text-sm text-gray-500">{history.length} logged</span>
              )}
            </div>

            {history.length === 0 ? (
              <div className="py-8 text-center">
                <Syringe className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="text-gray-500">No injections logged yet</p>
                <p className="mt-1 text-sm text-gray-400">
                  Your injection history will appear here
                </p>
              </div>
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto">
                {history.map((log, index) => (
                  <div
                    key={log.id}
                    className={`rounded-xl p-4 ${index === 0 ? 'bg-gray-100' : 'bg-gray-50'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {SITE_POSITIONS[log.site].label}
                        </p>
                        <p className="text-sm text-gray-500">{formatDate(log.date)}</p>
                        {log.notes && (
                          <p className="mt-1 text-sm italic text-gray-600">{log.notes}</p>
                        )}
                      </div>
                      {index === 0 && (
                        <span
                          className="rounded-full px-2 py-1 text-xs font-medium text-white"
                          style={{ backgroundColor: primaryColor }}
                        >
                          Latest
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rotation Guide */}
          <div className="rounded-2xl p-5" style={{ backgroundColor: accentColor }}>
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
              <RotateCw className="h-5 w-5" />
              Site Rotation Pattern
            </h3>
            <div className="space-y-2">
              {INJECTION_SITES.map((site, i) => (
                <div key={site.site} className="flex items-center gap-3 rounded-lg bg-white/50 p-2">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-800">{site.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-gray-700">
              Following a consistent rotation pattern helps prevent lipohypertrophy (lumps under the
              skin) and ensures consistent medication absorption.
            </p>
          </div>

          {/* Link to Dose Calculator */}
          <Link
            href={`${PATIENT_PORTAL_PATH}/calculators/semaglutide`}
            className="block rounded-2xl bg-white p-5 shadow-lg shadow-gray-100 transition-shadow hover:shadow-xl"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-xl p-3" style={{ backgroundColor: `${primaryColor}15` }}>
                <Syringe className="h-6 w-6" style={{ color: primaryColor }} />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Dose Calculator</p>
                <p className="text-sm text-gray-500">Calculate your injection dose in units</p>
              </div>
              <ArrowLeft className="ml-auto h-5 w-5 rotate-180 text-gray-400" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
