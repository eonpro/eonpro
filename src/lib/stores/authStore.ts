'use client';

import { create } from 'zustand';
import { clearAuthTokens, redirectToLogin, isPublicRoute, SESSION_EXPIRED_EVENT } from '@/lib/api/fetch';
import { safeParseJsonString } from '@/lib/utils/safe-json';

export interface AuthUser {
  id: number;
  email?: string;
  firstName?: string;
  lastName?: string;
  role: string;
  clinicId?: number | null;
  providerId?: number | null;
  [key: string]: unknown;
}

export interface ClinicInfo {
  id: number;
  name?: string;
  subdomain?: string;
  logoUrl?: string | null;
  iconUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  role: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  activeClinicId: number | null;
  clinics: ClinicInfo[];

  hydrate: () => void;
  setAuth: (user: AuthUser, clinics?: ClinicInfo[], activeClinicId?: number | null) => void;
  clearAuth: () => void;
  switchClinic: (clinicId: number) => void;
}

function readUserFromStorage(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed = safeParseJsonString<Record<string, unknown>>(raw);
    if (!parsed || !parsed.role) return null;
    return {
      ...parsed,
      id: Number(parsed.id ?? 0),
      role: String(parsed.role).toLowerCase(),
    } as AuthUser;
  } catch {
    return null;
  }
}

function readClinicsFromStorage(): { clinics: ClinicInfo[]; activeClinicId: number | null } {
  if (typeof window === 'undefined') return { clinics: [], activeClinicId: null };
  try {
    const raw = localStorage.getItem('clinics');
    const activeRaw = localStorage.getItem('activeClinicId');
    const clinics = raw ? (JSON.parse(raw) as ClinicInfo[]) : [];
    const activeClinicId = activeRaw ? parseInt(activeRaw, 10) : null;
    return { clinics, activeClinicId: Number.isNaN(activeClinicId) ? null : activeClinicId };
  } catch {
    return { clinics: [], activeClinicId: null };
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  role: null,
  isAuthenticated: false,
  isHydrated: false,
  activeClinicId: null,
  clinics: [],

  hydrate: () => {
    if (get().isHydrated) return;
    const user = readUserFromStorage();
    const { clinics, activeClinicId } = readClinicsFromStorage();
    set({
      user,
      role: user?.role ?? null,
      isAuthenticated: !!user,
      isHydrated: true,
      clinics,
      activeClinicId,
    });
  },

  setAuth: (user, clinics, activeClinicId) => {
    set({
      user,
      role: user.role,
      isAuthenticated: true,
      isHydrated: true,
      clinics: clinics ?? get().clinics,
      activeClinicId: activeClinicId ?? get().activeClinicId,
    });
  },

  clearAuth: () => {
    clearAuthTokens();
    set({
      user: null,
      role: null,
      isAuthenticated: false,
      activeClinicId: null,
      clinics: [],
    });
  },

  switchClinic: (clinicId) => {
    localStorage.setItem('activeClinicId', String(clinicId));
    document.cookie = `selected-clinic=${clinicId}; path=/; max-age=31536000`;
    set({ activeClinicId: clinicId });
  },
}));

// ---------------------------------------------------------------------------
// Global side-effect: listen for session-expired events from apiFetch and
// sync them into the store. This replaces per-layout addEventListener calls.
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined') {
  window.addEventListener(SESSION_EXPIRED_EVENT, () => {
    if (isPublicRoute()) return;

    const { isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated) {
      useAuthStore.setState({
        user: null,
        role: null,
        isAuthenticated: false,
        activeClinicId: null,
        clinics: [],
      });
    }
    redirectToLogin('session_expired');
  });
}
