'use client';

import React, { useState } from 'react';
import {
  Undo2,
  Redo2,
  Save,
  Send,
  Eye,
  Code2,
  Smartphone,
  Tablet,
  Monitor,
  ArrowLeft,
  Globe,
  Workflow,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { SaveStatus, DevicePreview, BuilderLanguage, BuilderView } from './state/builderTypes';

interface BuilderToolbarProps {
  formName: string;
  onFormNameChange: (name: string) => void;
  saveStatus: SaveStatus;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  builderView: BuilderView;
  onViewChange: (view: BuilderView) => void;
  devicePreview: DevicePreview;
  onDeviceChange: (device: DevicePreview) => void;
  language: BuilderLanguage;
  onLanguageChange: (lang: BuilderLanguage) => void;
  onToggleFlow: () => void;
  onBack: () => void;
  isActive: boolean;
  onToggleActive: () => void;
  onSendToClient: () => void;
}

export default function BuilderToolbar({
  formName,
  onFormNameChange,
  saveStatus,
  onSave,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  builderView,
  onViewChange,
  devicePreview,
  onDeviceChange,
  language,
  onLanguageChange,
  onToggleFlow,
  onBack,
  isActive,
  onToggleActive,
  onSendToClient,
}: BuilderToolbarProps) {
  const [editingName, setEditingName] = useState(false);

  const SaveIcon = () => {
    switch (saveStatus) {
      case 'saving':
        return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
      case 'saved':
        return <CheckCircle2 className="h-3.5 w-3.5" />;
      case 'error':
        return <AlertCircle className="h-3.5 w-3.5" />;
      default:
        return <Save className="h-3.5 w-3.5" />;
    }
  };

  const saveLabel = () => {
    switch (saveStatus) {
      case 'saving':
        return 'Saving...';
      case 'saved':
        return 'Saved';
      case 'error':
        return 'Error';
      default:
        return 'Save';
    }
  };

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3">
      {/* Back */}
      <button
        onClick={onBack}
        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        title="Back to templates"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      {/* Separator */}
      <div className="h-6 w-px bg-gray-200" />

      {/* Form name */}
      {editingName ? (
        <input
          autoFocus
          value={formName}
          onChange={(e) => onFormNameChange(e.target.value)}
          onBlur={() => setEditingName(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setEditingName(false);
          }}
          className="w-64 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      ) : (
        <button
          onClick={() => setEditingName(true)}
          className="max-w-[240px] truncate rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50"
          title="Click to rename"
        >
          {formName || 'Untitled Form'}
        </button>
      )}

      {/* Save status */}
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
          saveStatus === 'saved'
            ? 'bg-green-50 text-green-600'
            : saveStatus === 'saving'
              ? 'bg-amber-50 text-amber-600'
              : saveStatus === 'error'
                ? 'bg-red-50 text-red-600'
                : 'bg-gray-100 text-gray-500'
        }`}
      >
        <SaveIcon />
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5 rounded-lg bg-gray-50 p-0.5">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (⌘Z)"
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (⌘⇧Z)"
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      {/* Separator */}
      <div className="h-6 w-px bg-gray-200" />

      {/* Language toggle */}
      <div className="flex items-center rounded-lg bg-gray-50 p-0.5">
        <button
          onClick={() => onLanguageChange('en')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            language === 'en'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          EN
        </button>
        <button
          onClick={() => onLanguageChange('es')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            language === 'es'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ES
        </button>
      </div>

      {/* Device preview */}
      <div className="flex items-center rounded-lg bg-gray-50 p-0.5">
        {[
          { id: 'mobile' as const, Icon: Smartphone },
          { id: 'tablet' as const, Icon: Tablet },
          { id: 'desktop' as const, Icon: Monitor },
        ].map(({ id, Icon }) => (
          <button
            key={id}
            onClick={() => onDeviceChange(id)}
            className={`rounded-md p-1.5 transition-colors ${
              devicePreview === id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-400 hover:text-gray-700'
            }`}
            title={id.charAt(0).toUpperCase() + id.slice(1)}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="h-6 w-px bg-gray-200" />

      {/* View toggles */}
      <div className="flex items-center rounded-lg bg-gray-50 p-0.5">
        {[
          { id: 'builder' as const, Icon: Workflow, label: 'Builder' },
          { id: 'preview' as const, Icon: Eye, label: 'Preview' },
          { id: 'json' as const, Icon: Code2, label: 'JSON' },
        ].map(({ id, Icon, label }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              builderView === id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="h-6 w-px bg-gray-200" />

      {/* Send to client */}
      <button
        onClick={onSendToClient}
        className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
      >
        <Send className="h-3.5 w-3.5" />
        Send to Client
      </button>

      {/* Separator */}
      <div className="h-6 w-px bg-gray-200" />

      {/* Save button */}
      <button
        onClick={onSave}
        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        disabled={saveStatus === 'saving'}
      >
        <SaveIcon />
        {saveLabel()}
      </button>

      {/* Publish toggle */}
      <button
        onClick={onToggleActive}
        className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-green-50 text-green-700 hover:bg-green-100'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        {isActive ? 'Published' : 'Draft'}
      </button>
    </div>
  );
}
