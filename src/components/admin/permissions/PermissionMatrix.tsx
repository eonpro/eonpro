'use client';

import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Shield,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Search,
  RotateCcw,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  EffectivePermissionEntry,
  EffectiveFeatureEntry,
  PermissionCategoryDef,
} from '@/lib/auth/permissions';
import { PERMISSION_META, FEATURES } from '@/lib/auth/permissions';
import { normalizedIncludes } from '@/lib/utils/search';

// ─── Types ──────────────────────────────────────────────────────────────

export type PermissionSource =
  | 'role_default'
  | 'custom_granted'
  | 'custom_revoked'
  | 'not_available';

interface PermissionMatrixProps {
  categories: PermissionCategoryDef[];
  permissions: EffectivePermissionEntry[];
  features: EffectiveFeatureEntry[];
  roleLabel: string;
  onPermissionToggle: (permission: string, enabled: boolean) => void;
  onFeatureToggle: (featureId: string, enabled: boolean) => void;
  onResetToDefaults: () => void;
  readOnly?: boolean;
}

// ─── Source Badge ────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: PermissionSource }) {
  switch (source) {
    case 'role_default':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
          <Shield className="h-3 w-3" />
          Role Default
        </span>
      );
    case 'custom_granted':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
          <ShieldCheck className="h-3 w-3" />
          Custom Grant
        </span>
      );
    case 'custom_revoked':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
          <ShieldX className="h-3 w-3" />
          Custom Revoke
        </span>
      );
    default:
      return null;
  }
}

// ─── Permission Row ─────────────────────────────────────────────────────

function PermissionRow({
  permValue,
  label,
  description,
  enabled,
  source,
  onToggle,
  readOnly,
}: {
  permValue: string;
  label: string;
  description: string;
  enabled: boolean;
  source: PermissionSource;
  onToggle: (enabled: boolean) => void;
  readOnly?: boolean;
}) {
  const isCustom = source === 'custom_granted' || source === 'custom_revoked';

  return (
    <div
      className={cn(
        'group flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors',
        isCustom ? 'bg-amber-50/50' : 'hover:bg-gray-50',
        source === 'custom_revoked' && 'bg-red-50/30',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {/* Toggle */}
        <label className="relative mt-0.5 inline-flex flex-shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            disabled={readOnly}
            className="peer sr-only"
          />
          <div
            className={cn(
              'h-5 w-9 rounded-full transition-colors duration-200',
              'after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4',
              'after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-teal-500 peer-focus-visible:ring-offset-2',
              enabled
                ? 'bg-teal-600 after:translate-x-full'
                : 'bg-gray-300 after:translate-x-0',
              readOnly && 'cursor-not-allowed opacity-60',
            )}
          />
        </label>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-sm font-medium',
                enabled ? 'text-gray-900' : 'text-gray-500',
                source === 'custom_revoked' && 'text-red-600 line-through',
              )}
            >
              {label}
            </span>
            <SourceBadge source={source} />
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
      </div>

      <span className="ml-2 hidden font-mono text-[10px] text-gray-400 group-hover:block">
        {permValue}
      </span>
    </div>
  );
}

// ─── Permission Category ────────────────────────────────────────────────

function PermissionCategory({
  category,
  permissionEntries,
  onToggle,
  readOnly,
}: {
  category: PermissionCategoryDef;
  permissionEntries: EffectivePermissionEntry[];
  onToggle: (perm: string, enabled: boolean) => void;
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const enabledCount = permissionEntries.filter((p) => p.enabled).length;
  const totalCount = permissionEntries.length;
  const hasCustom = permissionEntries.some(
    (p) => p.source === 'custom_granted' || p.source === 'custom_revoked',
  );

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Category Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50',
          hasCustom && 'border-l-4 border-l-amber-400',
        )}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{category.label}</h3>
            <p className="text-xs text-gray-500">{category.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasCustom && (
            <ShieldAlert className="h-4 w-4 text-amber-500" />
          )}
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-semibold',
              enabledCount === totalCount
                ? 'bg-teal-100 text-teal-800'
                : enabledCount === 0
                  ? 'bg-gray-100 text-gray-600'
                  : 'bg-blue-100 text-blue-800',
            )}
          >
            {enabledCount}/{totalCount}
          </span>
        </div>
      </button>

      {/* Permission List */}
      {expanded && (
        <div className="divide-y divide-gray-100 border-t border-gray-100 px-1 py-1">
          {category.permissions.map((pDef) => {
            const entry = permissionEntries.find(
              (e) => e.permission === pDef.value,
            );
            if (!entry) return null;

            return (
              <PermissionRow
                key={pDef.value}
                permValue={pDef.value}
                label={pDef.label}
                description={pDef.description}
                enabled={entry.enabled}
                source={entry.source}
                onToggle={(enabled) => onToggle(pDef.value, enabled)}
                readOnly={readOnly}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Feature Toggle ─────────────────────────────────────────────────────

function FeatureToggleRow({
  featureId,
  name,
  description,
  enabled,
  source,
  onToggle,
  readOnly,
}: {
  featureId: string;
  name: string;
  description: string;
  enabled: boolean;
  source: PermissionSource;
  onToggle: (enabled: boolean) => void;
  readOnly?: boolean;
}) {
  const isCustom = source === 'custom_granted' || source === 'custom_revoked';

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors',
        isCustom ? 'bg-amber-50/50' : 'hover:bg-gray-50',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <label className="relative mt-0.5 inline-flex flex-shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            disabled={readOnly}
            className="peer sr-only"
          />
          <div
            className={cn(
              'h-5 w-9 rounded-full transition-colors duration-200',
              'after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4',
              'after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-teal-500 peer-focus-visible:ring-offset-2',
              enabled
                ? 'bg-teal-600 after:translate-x-full'
                : 'bg-gray-300 after:translate-x-0',
              readOnly && 'cursor-not-allowed opacity-60',
            )}
          />
        </label>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-sm font-medium',
                enabled ? 'text-gray-900' : 'text-gray-500',
              )}
            >
              {name}
            </span>
            <SourceBadge source={source} />
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Permission Summary ─────────────────────────────────────────────────

export function PermissionSummary({
  permissions,
  features,
  roleLabel,
}: {
  permissions: EffectivePermissionEntry[];
  features: EffectiveFeatureEntry[];
  roleLabel: string;
}) {
  const permGranted = permissions.filter(
    (p) => p.source === 'custom_granted',
  ).length;
  const permRevoked = permissions.filter(
    (p) => p.source === 'custom_revoked',
  ).length;
  const featGranted = features.filter(
    (f) => f.source === 'custom_granted',
  ).length;
  const featRevoked = features.filter(
    (f) => f.source === 'custom_revoked',
  ).length;

  const totalEnabled = permissions.filter((p) => p.enabled).length;
  const totalFeatsEnabled = features.filter((f) => f.enabled).length;
  const totalCustom = permGranted + permRevoked + featGranted + featRevoked;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">
            Access Level Summary
          </h4>
          <p className="mt-0.5 text-xs text-gray-500">
            Based on <span className="font-medium capitalize">{roleLabel}</span>{' '}
            role
            {totalCustom > 0 && (
              <span className="text-amber-600">
                {' '}
                with {totalCustom} custom override{totalCustom !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="text-center">
            <div className="text-lg font-bold text-teal-700">{totalEnabled}</div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">
              Permissions
            </div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-teal-700">
              {totalFeatsEnabled}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">
              Features
            </div>
          </div>
        </div>
      </div>

      {totalCustom > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {permGranted > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              +{permGranted} permission{permGranted !== 1 ? 's' : ''} added
            </span>
          )}
          {permRevoked > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              -{permRevoked} permission{permRevoked !== 1 ? 's' : ''} removed
            </span>
          )}
          {featGranted > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              +{featGranted} feature{featGranted !== 1 ? 's' : ''} added
            </span>
          )}
          {featRevoked > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              -{featRevoked} feature{featRevoked !== 1 ? 's' : ''} removed
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Permission Matrix ─────────────────────────────────────────────

export default function PermissionMatrix({
  categories,
  permissions,
  features,
  roleLabel,
  onPermissionToggle,
  onFeatureToggle,
  onResetToDefaults,
  readOnly = false,
}: PermissionMatrixProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    return categories
      .map((cat) => ({
        ...cat,
        permissions: cat.permissions.filter(
          (p) =>
            normalizedIncludes(p.label, searchQuery) ||
            normalizedIncludes(p.description, searchQuery) ||
            normalizedIncludes(p.value, searchQuery),
        ),
      }))
      .filter((cat) => cat.permissions.length > 0);
  }, [categories, searchQuery]);

  const filteredFeatures = useMemo(() => {
    if (!searchQuery.trim()) return features;
    return features.filter((f) => {
      const meta = Object.values(FEATURES).find((feat) => feat.id === f.featureId);
      return (
        normalizedIncludes(f.featureId, searchQuery) ||
        (meta?.name && normalizedIncludes(meta.name, searchQuery)) ||
        (meta?.description && normalizedIncludes(meta.description, searchQuery))
      );
    });
  }, [features, searchQuery]);

  const totalCustom =
    permissions.filter(
      (p) => p.source === 'custom_granted' || p.source === 'custom_revoked',
    ).length +
    features.filter(
      (f) => f.source === 'custom_granted' || f.source === 'custom_revoked',
    ).length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <PermissionSummary
        permissions={permissions}
        features={features}
        roleLabel={roleLabel}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search permissions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        {!readOnly && totalCustom > 0 && (
          <button
            type="button"
            onClick={onResetToDefaults}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Role Defaults
          </button>
        )}
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
        <p className="text-xs text-blue-800">
          Toggles in <span className="font-medium">gray</span> are role defaults
          for <span className="font-medium capitalize">{roleLabel}</span>.
          Changing a toggle creates a custom override that persists even if the
          role defaults change later.
        </p>
      </div>

      {/* Two-column layout: Permissions + Features */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Permissions - takes 2/3 */}
        <div className="space-y-4 xl:col-span-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Shield className="h-5 w-5 text-teal-600" />
            Permissions
          </h2>
          {filteredCategories.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              No permissions match your search.
            </p>
          ) : (
            filteredCategories.map((cat) => {
              const catPerms = permissions.filter((p) =>
                cat.permissions.some((cp) => cp.value === p.permission),
              );
              return (
                <PermissionCategory
                  key={cat.id}
                  category={cat}
                  permissionEntries={catPerms}
                  onToggle={onPermissionToggle}
                  readOnly={readOnly}
                />
              );
            })
          )}
        </div>

        {/* Features - takes 1/3 */}
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <ShieldCheck className="h-5 w-5 text-teal-600" />
            Features
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="divide-y divide-gray-100 px-1 py-1">
              {filteredFeatures.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">
                  No features match your search.
                </p>
              ) : (
                filteredFeatures.map((f) => {
                  const meta = Object.values(FEATURES).find(
                    (feat) => feat.id === f.featureId,
                  );
                  return (
                    <FeatureToggleRow
                      key={f.featureId}
                      featureId={f.featureId}
                      name={meta?.name ?? f.featureId}
                      description={meta?.description ?? ''}
                      enabled={f.enabled}
                      source={f.source}
                      onToggle={(enabled) => onFeatureToggle(f.featureId, enabled)}
                      readOnly={readOnly}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
