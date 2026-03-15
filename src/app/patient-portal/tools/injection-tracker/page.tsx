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
                  <linearGradient id="bodyFill" x1="0.5" y1="0" x2="0.5" y2="1">
                    <stop offset="0%" stopColor="#e6e9ed" />
                    <stop offset="100%" stopColor="#d3d7dd" />
                  </linearGradient>
                  <filter id="bodyGlow" x="-3%" y="-1.5%" width="106%" height="103%">
                    <feDropShadow dx="0" dy="0.3" stdDeviation="0.5" floodColor="#8a919b" floodOpacity="0.12" />
                  </filter>
                </defs>

                <g filter="url(#bodyGlow)">
                  {/* Head */}
                  <ellipse cx="50" cy="7" rx="5.5" ry="6.5" fill="url(#bodyFill)" />

                  {/* Neck */}
                  <path
                    d="M 47.5 13 L 47 22 Q 47 23 50 23 Q 53 23 53 22 L 52.5 13 Z"
                    fill="url(#bodyFill)"
                  />

                  {/* Torso + Legs (single connected shape) */}
                  <path
                    d="M 50 21 C 45 21 40 22 36 24 C 33 26 32 29 33 33 C 34 39 36 45 38 49 C 39 52 40 55 39 58 C 38 61 38 63 39 65 C 38 70 37 78 36 87 C 35 95 35 103 36 110 C 37 116 38 121 39 124 C 40 126 42 127 43 125 C 44 122 45 118 45 113 C 46 106 46 98 46 90 C 46 82 47 74 47.5 68 C 48 66 49 65 50 65 C 51 65 52 66 52.5 68 C 53 74 54 82 54 90 C 54 98 55 106 56 113 C 57 118 58 122 59 125 C 60 127 62 126 63 124 C 64 121 65 116 65 110 C 66 103 65 95 64 87 C 63 78 62 70 62 65 C 63 63 62 61 61 58 C 60 55 61 52 62 49 C 64 45 66 39 67 33 C 68 29 67 26 64 24 C 60 22 55 21 50 21 Z"
                    fill="url(#bodyFill)"
                  />

                  {/* Left Arm */}
                  <path
                    d="M 34 25 C 30 28 25 35 21 43 C 18 50 16 56 15 61 C 14 65 15 69 15 72 C 15 74 17 75 18 74 C 20 73 20 71 20 68 C 21 64 22 60 23 55 C 25 49 27 43 29 38 C 31 33 33 29 35 26 Z"
                    fill="url(#bodyFill)"
                  />

                  {/* Right Arm */}
                  <path
                    d="M 66 25 C 70 28 75 35 79 43 C 82 50 84 56 85 61 C 86 65 85 69 85 72 C 85 74 83 75 82 74 C 80 73 80 71 80 68 C 79 64 78 60 77 55 C 75 49 73 43 71 38 C 69 33 67 29 65 26 Z"
                    fill="url(#bodyFill)"
                  />
                </g>
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
