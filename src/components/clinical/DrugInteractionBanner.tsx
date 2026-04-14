'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

import { apiFetch } from '@/lib/api/fetch';

interface InteractionResult {
  drug1: string;
  drug2: string;
  severity: 'low' | 'moderate' | 'high';
  description: string;
  source: string;
}

interface AllergyWarning {
  allergy: string;
  medication: string;
  reason: string;
  severity: 'high' | 'moderate';
}

interface Props {
  medications: string[];
  allergies: string[];
}

export default function DrugInteractionBanner({ medications, allergies }: Props) {
  const [interactions, setInteractions] = useState<InteractionResult[]>([]);
  const [allergyWarnings, setAllergyWarnings] = useState<AllergyWarning[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastCheckRef = useRef('');

  const checkInteractions = useCallback(async () => {
    const meds = medications.filter((m) => m.trim().length > 1);
    const allergy = allergies.filter((a) => a.trim().length > 1);
    if (meds.length === 0) return;

    const checkKey = JSON.stringify({ meds, allergy });
    if (checkKey === lastCheckRef.current) return;
    lastCheckRef.current = checkKey;

    setLoading(true);
    setDismissed(false);
    try {
      const res = await apiFetch('/api/clinical/interaction-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medications: meds, allergies: allergy }),
      });
      if (res.ok) {
        const data = await res.json();
        setInteractions(data.interactions ?? []);
        setAllergyWarnings(data.allergyWarnings ?? []);
        setAiSummary(data.aiSummary ?? null);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [medications, allergies]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(checkInteractions, 1500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [checkInteractions]);

  const hasWarnings = interactions.length > 0 || allergyWarnings.length > 0;
  if (!hasWarnings || dismissed) return null;

  const hasSevere =
    interactions.some((i) => i.severity === 'high') ||
    allergyWarnings.some((w) => w.severity === 'high');
  const borderColor = hasSevere ? 'border-red-300' : 'border-amber-300';
  const bgColor = hasSevere ? 'bg-red-50' : 'bg-amber-50';
  const iconColor = hasSevere ? 'text-red-600' : 'text-amber-600';
  const textColor = hasSevere ? 'text-red-800' : 'text-amber-800';

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <svg
            className={`mt-0.5 h-5 w-5 flex-shrink-0 ${iconColor}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <div>
            <p className={`text-sm font-semibold ${textColor}`}>
              {hasSevere ? 'Critical Safety Alert' : 'Drug Interaction Warning'}
            </p>
            <p className={`mt-0.5 text-xs ${textColor} opacity-80`}>
              {interactions.length} interaction{interactions.length !== 1 ? 's' : ''} found
              {allergyWarnings.length > 0 &&
                `, ${allergyWarnings.length} allergy warning${allergyWarnings.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className={`rounded px-2 py-1 text-xs font-medium ${textColor} hover:bg-white/50`}
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded p-1 text-gray-400 hover:text-gray-600"
            title="Dismiss"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {allergyWarnings.map((w, i) => (
            <div key={`aw-${i}`} className="rounded-lg border border-red-200 bg-white p-2.5">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                  ALLERGY
                </span>
                <span className="text-xs font-semibold text-red-800">
                  {w.medication} vs {w.allergy}
                </span>
              </div>
              <p className="mt-1 text-xs text-red-700">{w.reason}</p>
            </div>
          ))}

          {interactions.map((int, i) => {
            const sevColor =
              int.severity === 'high'
                ? 'bg-red-100 text-red-700'
                : int.severity === 'moderate'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-blue-100 text-blue-700';
            return (
              <div key={`int-${i}`} className="rounded-lg border border-gray-200 bg-white p-2.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${sevColor}`}
                  >
                    {int.severity}
                  </span>
                  <span className="text-xs font-semibold text-gray-800">
                    {int.drug1} + {int.drug2}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-600">{int.description}</p>
                <p className="mt-0.5 text-[10px] text-gray-400">Source: {int.source}</p>
              </div>
            );
          })}

          {aiSummary && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2.5">
              <p className="text-[10px] font-semibold uppercase text-indigo-500">
                Clinical Summary
              </p>
              <p className="mt-1 text-xs text-indigo-800">{aiSummary}</p>
            </div>
          )}
        </div>
      )}

      {loading && (
        <p className="mt-2 text-[10px] text-gray-400">Checking for additional interactions...</p>
      )}
    </div>
  );
}
