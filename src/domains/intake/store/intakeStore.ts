'use client';

/**
 * Intake Form Store — Zustand with Dual Persistence
 *
 * Client-side state management for the intake form engine.
 * Persists to localStorage for anonymous users and syncs to
 * the server draft API when authenticated.
 *
 * @module domains/intake/store
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { IntakeSessionData } from '../types/form-engine';

function generateSessionId(): string {
  return `INT-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function createInitialState(): IntakeSessionData {
  return {
    sessionId: generateSessionId(),
    templateId: '',
    clinicSlug: '',
    currentStep: '',
    completedSteps: [],
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    responses: {},
    qualified: undefined,
    disqualificationReason: undefined,
    refCode: null,
  };
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface IntakeStore extends IntakeSessionData {
  setCurrentStep: (stepId: string) => void;
  markStepCompleted: (stepId: string) => void;
  goBack: (prevStepId: string) => void;

  setResponse: (key: string, value: unknown) => void;
  setResponses: (responses: Record<string, unknown>) => void;
  setQualified: (qualified: boolean, reason?: string) => void;
  setRefCode: (code: string | null) => void;

  initSession: (templateId: string, clinicSlug: string, startStep: string) => void;
  resetIntake: () => void;
  getSessionData: () => IntakeSessionData;

  getProgress: (totalSteps: number) => number;
  isStepCompleted: (stepId: string) => boolean;

  /** Server sync flag — when true, the store will attempt to POST drafts to the API. */
  serverSyncEnabled: boolean;
  setServerSyncEnabled: (enabled: boolean) => void;
  patientId: number | null;
  setPatientId: (id: number | null) => void;

  /** Hydrate from a server-side draft (e.g. on page load for authenticated users). */
  hydrateFromDraft: (draft: IntakeSessionData) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useIntakeStore = create<IntakeStore>()(
  persist(
    (set, get) => ({
      ...createInitialState(),
      serverSyncEnabled: false,
      patientId: null,

      // ---- Navigation ----

      setCurrentStep: (stepId: string) => {
        set({
          currentStep: stepId,
          lastUpdatedAt: new Date().toISOString(),
        });
        scheduleDraftSync(get);
      },

      markStepCompleted: (stepId: string) => {
        const { completedSteps } = get();
        if (!completedSteps.includes(stepId)) {
          set({
            completedSteps: [...completedSteps, stepId],
            lastUpdatedAt: new Date().toISOString(),
          });
          scheduleDraftSync(get);
          scheduleAirtableSync(get);
        }
      },

      goBack: (prevStepId: string) => {
        set({
          currentStep: prevStepId,
          lastUpdatedAt: new Date().toISOString(),
        });
      },

      // ---- Data ----

      setResponse: (key: string, value: unknown) => {
        set((state) => ({
          responses: { ...state.responses, [key]: value },
          lastUpdatedAt: new Date().toISOString(),
        }));
        persistResponsesToSession(get);
        scheduleDraftSync(get);
        scheduleAirtableSync(get);
      },

      setResponses: (newResponses: Record<string, unknown>) => {
        set((state) => ({
          responses: { ...state.responses, ...newResponses },
          lastUpdatedAt: new Date().toISOString(),
        }));
        persistResponsesToSession(get);
        scheduleDraftSync(get);
        scheduleAirtableSync(get);
      },

      setQualified: (qualified: boolean, reason?: string) => {
        set({
          qualified,
          disqualificationReason: reason,
          lastUpdatedAt: new Date().toISOString(),
        });
      },

      setRefCode: (code: string | null) => {
        set({ refCode: code });
        if (code && typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('intake_refCode', code);
        }
      },

      // ---- Session ----

      initSession: (templateId: string, clinicSlug: string, startStep: string) => {
        const existing = get();
        if (
          existing.templateId === templateId &&
          existing.clinicSlug === clinicSlug &&
          existing.currentStep
        ) {
          // Session exists but responses may have been lost on rehydration
          if (!existing.responses || Object.keys(existing.responses).length === 0) {
            const restored = restoreResponsesFromSession();
            if (Object.keys(restored).length > 0) {
              set({ responses: restored });
            }
          }
          return;
        }
        const restoredResponses = restoreResponsesFromSession();
        set({
          ...createInitialState(),
          templateId,
          clinicSlug,
          currentStep: startStep,
          responses: restoredResponses,
        });
      },

      resetIntake: () => {
        set(createInitialState());
      },

      getSessionData: () => {
        const s = get();
        return {
          sessionId: s.sessionId,
          templateId: s.templateId,
          clinicSlug: s.clinicSlug,
          currentStep: s.currentStep,
          completedSteps: s.completedSteps,
          startedAt: s.startedAt,
          lastUpdatedAt: s.lastUpdatedAt,
          responses: s.responses,
          qualified: s.qualified,
          disqualificationReason: s.disqualificationReason,
          refCode: s.refCode,
        };
      },

      // ---- Computed ----

      getProgress: (totalSteps: number) => {
        const { completedSteps } = get();
        if (totalSteps === 0) return 0;
        return Math.round((completedSteps.length / totalSteps) * 100);
      },

      isStepCompleted: (stepId: string) => {
        return get().completedSteps.includes(stepId);
      },

      // ---- Server sync ----

      setServerSyncEnabled: (enabled: boolean) => set({ serverSyncEnabled: enabled }),
      setPatientId: (id: number | null) => set({ patientId: id }),

      hydrateFromDraft: (draft: IntakeSessionData) => {
        set({
          ...draft,
          lastUpdatedAt: new Date().toISOString(),
        });
      },
    }),
    {
      name: 'intake-form-storage',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      partialize: (state) => ({
        sessionId: state.sessionId,
        templateId: state.templateId,
        clinicSlug: state.clinicSlug,
        currentStep: state.currentStep,
        completedSteps: state.completedSteps,
        startedAt: state.startedAt,
        lastUpdatedAt: state.lastUpdatedAt,
        qualified: state.qualified,
        disqualificationReason: state.disqualificationReason,
        refCode: state.refCode,
        // HIPAA: responses contain PHI (name, DOB, email, phone, address)
        // and must NOT be persisted to localStorage. They are kept in-memory
        // and synced server-side via the draft API. On hydration, responses
        // are reloaded from the server draft.
      }),
    }
  )
);

// ---------------------------------------------------------------------------
// Session-based response persistence (for WellMedR intake)
// Responses contain PHI and are excluded from localStorage persistence.
// We use sessionStorage instead — it's ephemeral (cleared on tab close)
// but survives across client-side route changes within the same tab.
// ---------------------------------------------------------------------------

function persistResponsesToSession(getState: () => IntakeStore) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const state = getState();
    if (!state.responses || Object.keys(state.responses).length === 0) return;
    sessionStorage.setItem('wm_intake_responses', JSON.stringify(state.responses));
  } catch { /* quota exceeded or unavailable */ }
}

function restoreResponsesFromSession(): Record<string, unknown> {
  try {
    if (typeof sessionStorage === 'undefined') return {};
    const stored = sessionStorage.getItem('wm_intake_responses');
    if (stored) return JSON.parse(stored);
  } catch { /* parse error */ }
  return {};
}

// ---------------------------------------------------------------------------
// Server draft sync (debounced)
// ---------------------------------------------------------------------------

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleDraftSync(getState: () => IntakeStore) {
  if (syncTimeout) clearTimeout(syncTimeout);

  syncTimeout = setTimeout(async () => {
    const state = getState();
    if (!state.serverSyncEnabled || !state.sessionId || !state.templateId) return;

    try {
      await fetch('/api/intake-forms/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.sessionId,
          templateId: state.templateId,
          clinicSlug: state.clinicSlug,
          currentStep: state.currentStep,
          completedSteps: state.completedSteps,
          responses: state.responses,
        }),
      });
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.warn('[IntakeStore] Draft sync failed (best-effort)', err);
      }
    }
  }, 2000);
}

// ---------------------------------------------------------------------------
// Airtable sync (debounced, fire-and-forget)
// ---------------------------------------------------------------------------

let airtableSyncTimeout: ReturnType<typeof setTimeout> | null = null;
let airtableRecordId: string | null = typeof sessionStorage !== 'undefined'
  ? sessionStorage.getItem('wm_airtable_record_id')
  : null;

function scheduleAirtableSync(getState: () => IntakeStore) {
  if (airtableSyncTimeout) clearTimeout(airtableSyncTimeout);

  airtableSyncTimeout = setTimeout(async () => { // 200ms debounce for fast sync before navigation
    const state = getState();
    if (!state.sessionId || state.clinicSlug !== 'wellmedr') return;

    try {
      const res = await fetch('/api/wellmedr/airtable-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.sessionId,
          recordId: airtableRecordId,
          responses: state.responses,
        }),
      });
      const data = await res.json();
      if (data.recordId) {
        airtableRecordId = data.recordId;
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('wm_airtable_record_id', data.recordId);
        }
      }
    } catch {
      // Non-blocking — errors don't affect the intake flow
    }
  }, 200);
}

// ---------------------------------------------------------------------------
// Selector hooks
// ---------------------------------------------------------------------------

export const useSessionId = () => useIntakeStore((s) => s.sessionId);
export const useCurrentStep = () => useIntakeStore((s) => s.currentStep);
export const useCompletedSteps = () => useIntakeStore((s) => s.completedSteps);
export const useResponses = () => useIntakeStore((s) => s.responses);
export const useResponse = (key: string) => useIntakeStore((s) => s.responses[key]);

export const useIntakeActions = () => {
  const setCurrentStep = useIntakeStore((s) => s.setCurrentStep);
  const markStepCompleted = useIntakeStore((s) => s.markStepCompleted);
  const goBack = useIntakeStore((s) => s.goBack);
  const setResponse = useIntakeStore((s) => s.setResponse);
  const setResponses = useIntakeStore((s) => s.setResponses);
  const setQualified = useIntakeStore((s) => s.setQualified);
  const initSession = useIntakeStore((s) => s.initSession);
  const resetIntake = useIntakeStore((s) => s.resetIntake);
  const getSessionData = useIntakeStore((s) => s.getSessionData);

  return {
    setCurrentStep,
    markStepCompleted,
    goBack,
    setResponse,
    setResponses,
    setQualified,
    initSession,
    resetIntake,
    getSessionData,
  };
};
