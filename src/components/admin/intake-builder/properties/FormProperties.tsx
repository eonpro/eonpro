'use client';

import React from 'react';
import { FileText, Palette } from 'lucide-react';
import type { FormConfig, FormBranding } from '../state/builderTypes';

interface FormPropertiesProps {
  config: FormConfig;
  rightPanelTab: 'content' | 'validation' | 'logic' | 'design';
  onTabChange: (tab: 'content' | 'validation' | 'logic' | 'design') => void;
  onUpdateForm: (updates: Partial<FormConfig>) => void;
  onUpdateBranding: (updates: Partial<FormBranding>) => void;
}

export default function FormProperties({
  config,
  rightPanelTab,
  onTabChange,
  onUpdateForm,
  onUpdateBranding,
}: FormPropertiesProps) {
  const branding = config.branding ?? {};
  const isContent = rightPanelTab === 'content';
  const isDesign = rightPanelTab === 'design';

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => onTabChange('content')}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
            isContent
              ? 'border-b-2 border-indigo-600 bg-white text-indigo-600'
              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          Content
        </button>
        <button
          type="button"
          onClick={() => onTabChange('design')}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
            isDesign
              ? 'border-b-2 border-indigo-600 bg-white text-indigo-600'
              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
          }`}
        >
          <Palette className="h-3.5 w-3.5" />
          Design
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {isContent && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
                Form Name
              </label>
              <input
                type="text"
                value={config.name}
                onChange={(e) => onUpdateForm({ name: e.target.value })}
                placeholder="My Intake Form"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
                Description
              </label>
              <textarea
                value={config.description ?? ''}
                onChange={(e) => onUpdateForm({ description: e.target.value || undefined })}
                placeholder="Brief description of this form"
                rows={3}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
                Treatment Type
              </label>
              <input
                type="text"
                value={config.treatmentType ?? ''}
                onChange={(e) => onUpdateForm({ treatmentType: e.target.value || undefined })}
                placeholder="e.g. GLP-1, TRT"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
                Version
              </label>
              <input
                type="text"
                value={config.version}
                onChange={(e) => onUpdateForm({ version: e.target.value })}
                placeholder="1"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </>
        )}

        {isDesign && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
                Primary Color
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={branding.primaryColor ?? '#6366f1'}
                  onChange={(e) => onUpdateBranding({ primaryColor: e.target.value })}
                  className="h-9 w-14 cursor-pointer rounded border border-gray-200"
                />
                <input
                  type="text"
                  value={branding.primaryColor ?? ''}
                  onChange={(e) => onUpdateBranding({ primaryColor: e.target.value || undefined })}
                  placeholder="#6366f1"
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
                Accent Color
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={branding.accentColor ?? '#8b5cf6'}
                  onChange={(e) => onUpdateBranding({ accentColor: e.target.value })}
                  className="h-9 w-14 cursor-pointer rounded border border-gray-200"
                />
                <input
                  type="text"
                  value={branding.accentColor ?? ''}
                  onChange={(e) => onUpdateBranding({ accentColor: e.target.value || undefined })}
                  placeholder="#8b5cf6"
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
                Border Radius
              </label>
              <input
                type="text"
                value={branding.borderRadius ?? ''}
                onChange={(e) => onUpdateBranding({ borderRadius: e.target.value || undefined })}
                placeholder="e.g. 0.5rem"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
                Font Family
              </label>
              <input
                type="text"
                value={branding.fontFamily ?? ''}
                onChange={(e) => onUpdateBranding({ fontFamily: e.target.value || undefined })}
                placeholder="e.g. Inter, sans-serif"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
                Logo URL
              </label>
              <input
                type="url"
                value={branding.logo ?? ''}
                onChange={(e) => onUpdateBranding({ logo: e.target.value || undefined })}
                placeholder="https://..."
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
