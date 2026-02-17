'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Shield,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  User,
  Mail,
  BadgeCheck,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import PermissionMatrix from '@/components/admin/permissions/PermissionMatrix';
import type {
  EffectivePermissionEntry,
  EffectiveFeatureEntry,
  PermissionCategoryDef,
} from '@/lib/auth/permissions';

interface UserInfo {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface PermissionsData {
  user: UserInfo;
  permissions: {
    effective: EffectivePermissionEntry[];
    roleDefaults: string[];
    overrides: { granted: string[]; revoked: string[] };
    categories: PermissionCategoryDef[];
  };
  features: {
    effective: EffectiveFeatureEntry[];
    roleDefaults: string[];
    overrides: { granted: string[]; revoked: string[] };
    allFeatures: { id: string; name: string; description: string }[];
  };
  meta: {
    allPermissions: string[];
    totalPermissions: number;
    totalFeatures: number;
    customPermissionCount: number;
    customFeatureCount: number;
  };
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  provider: 'Provider',
  staff: 'Staff',
  support: 'Support',
  patient: 'Patient',
  affiliate: 'Affiliate',
  sales_rep: 'Sales Rep',
};

export default function UserPermissionsPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.id as string;
  const userId = params.userId as string;

  const [data, setData] = useState<PermissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Local editable state derived from the fetched data
  const [localPermissions, setLocalPermissions] = useState<EffectivePermissionEntry[]>([]);
  const [localFeatures, setLocalFeatures] = useState<EffectiveFeatureEntry[]>([]);

  const fetchPermissions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(
        `/api/super-admin/clinics/${clinicId}/users/${userId}/permissions`,
      );
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to fetch permissions');
      }
      setData(json);
      setLocalPermissions(json.permissions.effective);
      setLocalFeatures(json.features.effective);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  }, [clinicId, userId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Track unsaved changes
  const hasChanges = useMemo(() => {
    if (!data) return false;
    const origPerms = data.permissions.effective;
    const origFeats = data.features.effective;

    const permChanged = localPermissions.some((lp) => {
      const orig = origPerms.find((op) => op.permission === lp.permission);
      return orig && orig.enabled !== lp.enabled;
    });
    const featChanged = localFeatures.some((lf) => {
      const orig = origFeats.find((of_) => of_.featureId === lf.featureId);
      return orig && orig.enabled !== lf.enabled;
    });

    return permChanged || featChanged;
  }, [data, localPermissions, localFeatures]);

  const handlePermissionToggle = useCallback(
    (permission: string, enabled: boolean) => {
      setLocalPermissions((prev) =>
        prev.map((p) => {
          if (p.permission !== permission) return p;
          const wasRoleDefault = data?.permissions.roleDefaults.includes(permission);
          let source: EffectivePermissionEntry['source'];
          if (enabled && !wasRoleDefault) source = 'custom_granted';
          else if (!enabled && wasRoleDefault) source = 'custom_revoked';
          else if (enabled && wasRoleDefault) source = 'role_default';
          else source = 'not_available';
          return { ...p, enabled, source };
        }),
      );
      setSaveSuccess(false);
    },
    [data],
  );

  const handleFeatureToggle = useCallback(
    (featureId: string, enabled: boolean) => {
      setLocalFeatures((prev) =>
        prev.map((f) => {
          if (f.featureId !== featureId) return f;
          const wasRoleDefault = data?.features.roleDefaults.includes(featureId);
          let source: EffectiveFeatureEntry['source'];
          if (enabled && !wasRoleDefault) source = 'custom_granted';
          else if (!enabled && wasRoleDefault) source = 'custom_revoked';
          else if (enabled && wasRoleDefault) source = 'role_default';
          else source = 'not_available';
          return { ...f, enabled, source };
        }),
      );
      setSaveSuccess(false);
    },
    [data],
  );

  const handleResetToDefaults = useCallback(() => {
    if (!data) return;
    setLocalPermissions(
      data.permissions.effective.map((p) => {
        const isDefault = data.permissions.roleDefaults.includes(p.permission);
        return {
          ...p,
          enabled: isDefault,
          source: isDefault ? ('role_default' as const) : ('not_available' as const),
        };
      }),
    );
    setLocalFeatures(
      data.features.effective.map((f) => {
        const isDefault = data.features.roleDefaults.includes(f.featureId);
        return {
          ...f,
          enabled: isDefault,
          source: isDefault ? ('role_default' as const) : ('not_available' as const),
        };
      }),
    );
    setSaveSuccess(false);
  }, [data]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSaveSuccess(false);

      const enabledPerms = localPermissions
        .filter((p) => p.enabled)
        .map((p) => p.permission);
      const enabledFeats = localFeatures
        .filter((f) => f.enabled)
        .map((f) => f.featureId);

      const response = await apiFetch(
        `/api/super-admin/clinics/${clinicId}/users/${userId}/permissions`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            permissions: enabledPerms,
            features: enabledFeats,
          }),
        },
      );

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to save permissions');
      }

      setSaveSuccess(true);
      // Refresh to get the canonical state from server
      await fetchPermissions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  // Diff summary
  const diffSummary = useMemo(() => {
    if (!data) return { added: 0, removed: 0 };
    const added =
      localPermissions.filter((p) => p.source === 'custom_granted').length +
      localFeatures.filter((f) => f.source === 'custom_granted').length;
    const removed =
      localPermissions.filter((p) => p.source === 'custom_revoked').length +
      localFeatures.filter((f) => f.source === 'custom_revoked').length;
    return { added, removed };
  }, [data, localPermissions, localFeatures]);

  // ─── Loading State ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-teal-600" />
          <p className="mt-3 text-sm text-gray-500">Loading user permissions...</p>
        </div>
      </div>
    );
  }

  // ─── Error State ────────────────────────────────────────────────────

  if (error && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
          <h2 className="mt-3 text-lg font-semibold text-gray-900">Failed to Load</h2>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
          <button
            onClick={fetchPermissions}
            className="mt-4 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const roleDisplay = ROLE_LABELS[data.user.role] ?? data.user.role;

  // ─── Main Render ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Left: Back + User Info */}
            <div className="flex items-center gap-4">
              <button
                onClick={() =>
                  router.push(`/super-admin/clinics/${clinicId}?tab=users`)
                }
                className="inline-flex items-center gap-1.5 rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">
                    Manage Permissions
                  </h1>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {data.user.firstName} {data.user.lastName}
                    </span>
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      {data.user.email}
                    </span>
                    <span className="flex items-center gap-1">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      {roleDisplay}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              {saveSuccess && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
              {error && data && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  {error}
                </span>
              )}

              <button
                onClick={() =>
                  router.push(`/super-admin/clinics/${clinicId}?tab=users`)
                }
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <PermissionMatrix
          categories={data.permissions.categories}
          permissions={localPermissions}
          features={localFeatures}
          roleLabel={roleDisplay}
          onPermissionToggle={handlePermissionToggle}
          onFeatureToggle={handleFeatureToggle}
          onResetToDefaults={handleResetToDefaults}
        />
      </div>

      {/* Sticky Footer with Diff Summary */}
      {hasChanges && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white shadow-lg">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-gray-700">
                Unsaved changes:
                {diffSummary.added > 0 && (
                  <span className="ml-1 font-medium text-emerald-600">
                    +{diffSummary.added} added
                  </span>
                )}
                {diffSummary.removed > 0 && (
                  <span className="ml-1 font-medium text-red-600">
                    -{diffSummary.removed} removed
                  </span>
                )}
                {diffSummary.added === 0 && diffSummary.removed === 0 && (
                  <span className="ml-1 text-gray-500">modified from defaults</span>
                )}
                <span className="ml-1 text-gray-500">
                  from {roleDisplay} defaults
                </span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleResetToDefaults}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
