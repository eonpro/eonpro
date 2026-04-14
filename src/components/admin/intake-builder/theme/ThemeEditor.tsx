'use client';

import React from 'react';
import { Image, Palette } from 'lucide-react';
import type { FormBranding } from '../state/builderTypes';

const FONT_OPTIONS = [
  { value: '', label: 'System Default' },
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: '"DM Sans", sans-serif', label: 'DM Sans' },
  { value: '"Plus Jakarta Sans", sans-serif', label: 'Plus Jakarta Sans' },
  { value: 'Lato, sans-serif', label: 'Lato' },
  { value: '"Open Sans", sans-serif', label: 'Open Sans' },
] as const;

export interface ThemeEditorProps {
  branding: FormBranding;
  onChange: (updates: Partial<FormBranding>) => void;
}

function ColorPickerRow({
  label,
  value,
  onChange,
  placeholder = '#6366f1',
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const hexValue = value || '';

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <div className="relative flex-shrink-0">
          <input
            type="color"
            value={hexValue || '#6366f1'}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-12 cursor-pointer overflow-hidden rounded border border-gray-200 bg-transparent"
          />
        </div>
        <input
          type="text"
          value={hexValue}
          onChange={(e) => onChange(e.target.value ?? '')}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>
    </div>
  );
}

export default function ThemeEditor({ branding, onChange }: ThemeEditorProps) {
  const logo = branding.logo ?? '';
  const primaryColor = branding.primaryColor ?? '#6366f1';
  const secondaryColor = branding.secondaryColor ?? '#64748b';
  const accentColor = branding.accentColor ?? '#8b5cf6';
  const fontFamily = branding.fontFamily ?? '';
  const borderRadiusNum =
    typeof branding.borderRadius === 'string'
      ? parseInt(branding.borderRadius.replace(/\D/g, ''), 10) || 0
      : 0;
  const borderRadius = Math.min(24, Math.max(0, isNaN(borderRadiusNum) ? 0 : borderRadiusNum));

  const handleBorderRadiusChange = (v: number) => {
    const clamped = Math.min(24, Math.max(0, v));
    onChange({ borderRadius: `${clamped}px` });
  };

  const previewStyle: React.CSSProperties = {
    '--intake-primary': primaryColor,
    '--intake-secondary': secondaryColor,
    '--intake-accent': accentColor,
    fontFamily: fontFamily || 'inherit',
    borderRadius: `${borderRadius}px`,
  } as React.CSSProperties;

  return (
    <div className="flex flex-col gap-4">
      {/* Logo */}
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
          Logo
        </label>
        <div className="flex items-start gap-3">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {logo ? (
              <img
                src={logo}
                alt="Logo preview"
                className="h-full w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-gray-400">
                <Image className="mb-0.5 h-6 w-6" />
                <span className="text-[10px]">No logo</span>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <input
              type="url"
              value={logo}
              onChange={(e) => onChange({ logo: e.target.value || undefined })}
              placeholder="https://example.com/logo.png"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>
      </div>

      {/* Color pickers */}
      <div className="space-y-3">
        <ColorPickerRow
          label="Primary Color"
          value={primaryColor}
          onChange={(v) => onChange({ primaryColor: v })}
          placeholder="#6366f1"
        />
        <ColorPickerRow
          label="Secondary Color"
          value={secondaryColor}
          onChange={(v) => onChange({ secondaryColor: v })}
          placeholder="#64748b"
        />
        <ColorPickerRow
          label="Accent Color"
          value={accentColor}
          onChange={(v) => onChange({ accentColor: v })}
          placeholder="#8b5cf6"
        />
      </div>

      {/* Font selector */}
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
          Font Family
        </label>
        <select
          value={fontFamily}
          onChange={(e) => onChange({ fontFamily: e.target.value || undefined })}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          {FONT_OPTIONS.map((opt) => (
            <option key={opt.value || 'default'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Border radius */}
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
          Border Radius
          <span className="ml-2 font-normal normal-case text-gray-500">{borderRadius}</span>
        </label>
        <input
          type="range"
          min={0}
          max={24}
          value={borderRadius}
          onChange={(e) => handleBorderRadiusChange(parseInt(e.target.value, 10))}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-indigo-600"
        />
      </div>

      {/* Live mini-preview */}
      <div className="mt-2 border-t border-gray-200 pt-4">
        <div className="mb-3 flex items-center gap-2">
          <Palette className="h-4 w-4 text-gray-500" />
          <span className="text-xs font-medium uppercase tracking-wider text-gray-600">
            Preview
          </span>
        </div>
        <div
          className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4"
          style={previewStyle}
        >
          <button
            type="button"
            className="w-full rounded-full px-4 py-2.5 text-sm font-medium text-white transition-colors"
            style={{
              backgroundColor: primaryColor,
              borderRadius: `${borderRadius}px`,
            }}
          >
            Continue
          </button>
          <div
            className="cursor-pointer rounded-lg border p-3 transition-colors hover:border-opacity-80"
            style={{
              borderColor: secondaryColor,
              color: primaryColor,
              borderRadius: `${borderRadius}px`,
            }}
          >
            <span className="text-sm font-medium">Sample option card</span>
          </div>
        </div>
      </div>
    </div>
  );
}
