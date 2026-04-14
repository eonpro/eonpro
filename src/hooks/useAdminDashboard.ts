'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/fetch';

interface DashboardStats {
  totalIntakes: number;
  totalPatients: number;
  totalPrescriptions: number;
  conversionRate: number;
  totalRevenue: number;
  recurringRevenue: number;
  recentIntakes: number;
  recentPrescriptions: number;
  recentRevenue: number;
}

interface PatientIntake {
  id: number;
  patientId?: string | null;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  tags: string[];
  createdAt: string;
}

interface DashboardData {
  stats: DashboardStats;
  recentIntakes: PatientIntake[];
}

interface GeoData {
  stateData: Record<
    string,
    {
      total: number;
      clinics: Array<{ clinicId: number; clinicName: string; color: string; count: number }>;
    }
  >;
  clinics: Array<{ id: number; name: string; color: string; totalPatients: number }>;
}

async function fetchDashboard(): Promise<DashboardData> {
  const res = await apiFetch('/api/admin/dashboard');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to load dashboard');
  }
  const data = await res.json();
  return {
    stats: data.stats ?? {
      totalIntakes: 0,
      totalPatients: 0,
      totalPrescriptions: 0,
      conversionRate: 0,
      totalRevenue: 0,
      recurringRevenue: 0,
      recentIntakes: 0,
      recentPrescriptions: 0,
      recentRevenue: 0,
    },
    recentIntakes: data.recentIntakes ?? [],
  };
}

async function fetchGeo(): Promise<GeoData | null> {
  try {
    const res = await apiFetch('/api/admin/dashboard/geo');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * React Query hook for the admin dashboard.
 * Caches data so navigating away and back shows instant content.
 */
export function useAdminDashboard(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: fetchDashboard,
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function useAdminGeo(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'dashboard', 'geo'],
    queryFn: fetchGeo,
    enabled,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}
