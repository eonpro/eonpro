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
      case 'saving': return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
      case 'saved': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'error': return <AlertCircle className="w-3.5 h-3.5" />;
      default: return <Save className="w-3.5 h-3.5" />;
    }
  };

  const saveLabel = () => {
    switch (saveStatus) {
      case 'saving': return 'Saving...';
      case 'saved': return 'Saved';
      case 'error': return 'Error';
      default: return 'Save';
    }
  };

  return (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center px-3 gap-2 shrink-0">
      {/* Back */}
      <button
        onClick={onBack}
        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        title="Back to templates"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      {/* Separator */}
      <div className="w-px h-6 bg-gray-200" />

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
          className="text-sm font-semibold text-gray-900 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-64"
        />
      ) : (
        <button
          onClick={() => setEditingName(true)}
          className="text-sm font-semibold text-gray-900 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors truncate max-w-[240px]"
          title="Click to rename"
        >
          {formName || 'Untitled Form'}
        </button>
      )}

      {/* Save status */}
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
        saveStatus === 'saved' ? 'text-green-600 bg-green-50'
          : saveStatus === 'saving' ? 'text-amber-600 bg-amber-50'
          : saveStatus === 'error' ? 'text-red-600 bg-red-50'
          : 'text-gray-500 bg-gray-100'
      }`}>
        <SaveIcon /> 
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5 bg-gray-50 rounded-lg p-0.5">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (⌘Z)"
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (⌘⇧Z)"
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-gray-200" />

      {/* Language toggle */}
      <div className="flex items-center bg-gray-50 rounded-lg p-0.5">
        <button
          onClick={() => onLanguageChange('en')}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            language === 'en' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          EN
        </button>
        <button
          onClick={() => onLanguageChange('es')}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            language === 'es' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ES
        </button>
      </div>

      {/* Device preview */}
      <div className="flex items-center bg-gray-50 rounded-lg p-0.5">
        {[
          { id: 'mobile' as const, Icon: Smartphone },
          { id: 'tablet' as const, Icon: Tablet },
          { id: 'desktop' as const, Icon: Monitor },
        ].map(({ id, Icon }) => (
          <button
            key={id}
            onClick={() => onDeviceChange(id)}
            className={`p-1.5 rounded-md transition-colors ${
              devicePreview === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-700'
            }`}
            title={id.charAt(0).toUpperCase() + id.slice(1)}
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-gray-200" />

      {/* View toggles */}
      <div className="flex items-center bg-gray-50 rounded-lg p-0.5">
        {[
          { id: 'builder' as const, Icon: Workflow, label: 'Builder' },
          { id: 'preview' as const, Icon: Eye, label: 'Preview' },
          { id: 'json' as const, Icon: Code2, label: 'JSON' },
        ].map(({ id, Icon, label }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              builderView === id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-gray-200" />

      {/* Send to client */}
      <button
        onClick={onSendToClient}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
      >
        <Send className="w-3.5 h-3.5" />
        Send to Client
      </button>

      {/* Separator */}
      <div className="w-px h-6 bg-gray-200" />

      {/* Save button */}
      <button
        onClick={onSave}
        className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
        disabled={saveStatus === 'saving'}
      >
        <SaveIcon />
        {saveLabel()}
      </button>

      {/* Publish toggle */}
      <button
        onClick={onToggleActive}
        className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${
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
