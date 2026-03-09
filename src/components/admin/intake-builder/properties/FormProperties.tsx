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
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => onTabChange('content')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
            isContent
              ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Content
        </button>
        <button
          type="button"
          onClick={() => onTabChange('design')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
            isDesign
              ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          Design
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isContent && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5">
                Form Name
              </label>
              <input
                type="text"
                value={config.name}
                onChange={(e) => onUpdateForm({ name: e.target.value })}
                placeholder="My Intake Form"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5">
                Description
              </label>
              <textarea
                value={config.description ?? ''}
                onChange={(e) =>
                  onUpdateForm({ description: e.target.value || undefined })
                }
                placeholder="Brief description of this form"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5">
                Treatment Type
              </label>
              <input
                type="text"
                value={config.treatmentType ?? ''}
                onChange={(e) =>
                  onUpdateForm({ treatmentType: e.target.value || undefined })
                }
                placeholder="e.g. GLP-1, TRT"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5">
                Version
              </label>
              <input
                type="text"
                value={config.version}
                onChange={(e) => onUpdateForm({ version: e.target.value })}
                placeholder="1"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
            </div>
          </>
        )}

        {isDesign && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5">
                Primary Color
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={branding.primaryColor ?? '#6366f1'}
                  onChange={(e) =>
                    onUpdateBranding({ primaryColor: e.target.value })
                  }
                  className="h-9 w-14 cursor-pointer rounded border border-gray-200"
                />
                <input
                  type="text"
                  value={branding.primaryColor ?? ''}
                  onChange={(e) =>
                    onUpdateBranding({ primaryColor: e.target.value || undefined })
                  }
                  placeholder="#6366f1"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5">
                Accent Color
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={branding.accentColor ?? '#8b5cf6'}
                  onChange={(e) =>
                    onUpdateBranding({ accentColor: e.target.value })
                  }
                  className="h-9 w-14 cursor-pointer rounded border border-gray-200"
                />
                <input
                  type="text"
                  value={branding.accentColor ?? ''}
                  onChange={(e) =>
                    onUpdateBranding({ accentColor: e.target.value || undefined })
                  }
                  placeholder="#8b5cf6"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5">
                Border Radius
              </label>
              <input
                type="text"
                value={branding.borderRadius ?? ''}
                onChange={(e) =>
                  onUpdateBranding({ borderRadius: e.target.value || undefined })
                }
                placeholder="e.g. 0.5rem"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5">
                Font Family
              </label>
              <input
                type="text"
                value={branding.fontFamily ?? ''}
                onChange={(e) =>
                  onUpdateBranding({ fontFamily: e.target.value || undefined })
                }
                placeholder="e.g. Inter, sans-serif"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5">
                Logo URL
              </label>
              <input
                type="url"
                value={branding.logo ?? ''}
                onChange={(e) =>
                  onUpdateBranding({ logo: e.target.value || undefined })
                }
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
