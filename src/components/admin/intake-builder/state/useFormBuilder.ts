'use client';

/**
 * useFormBuilder — Custom hook wrapping the builder reducer.
 *
 * Provides dispatch, selection state, keyboard shortcuts (undo/redo),
 * auto-save with debounce, and dirty tracking.
 */

import { useReducer, useCallback, useRef, useEffect, useState } from 'react';
import { builderReducer, createInitialBuilderState } from './builderReducer';
import type {
  BuilderAction,
  BuilderState,
  BuilderUIState,
  BuilderSelection,
  FormConfig,
  SaveStatus,
  LeftPanelTab,
  RightPanelTab,
  DevicePreview,
  BuilderLanguage,
  BuilderView,
} from './builderTypes';

interface UseFormBuilderOptions {
  templateId: string;
  initialConfig?: FormConfig;
  onSave?: (config: FormConfig) => Promise<void>;
  autoSaveMs?: number;
}

interface UseFormBuilderReturn {
  // State
  state: BuilderState;
  ui: BuilderUIState;
  saveStatus: SaveStatus;

  // Dispatch
  dispatch: (action: BuilderAction) => void;

  // Selection
  selectStep: (stepId: string) => void;
  selectField: (stepId: string, fieldId: string) => void;
  selectForm: () => void;
  clearSelection: () => void;

  // UI
  setLeftPanelTab: (tab: LeftPanelTab) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  setBuilderView: (view: BuilderView) => void;
  setDevicePreview: (device: DevicePreview) => void;
  setLanguage: (lang: BuilderLanguage) => void;
  setPreviewStepId: (stepId: string | null) => void;
  toggleFlowDiagram: () => void;

  // Actions
  save: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;

  // Helpers
  selectedStep: import('./builderTypes').FormStep | undefined;
  selectedField: import('./builderTypes').FormField | undefined;
}

export function useFormBuilder({
  templateId,
  initialConfig,
  onSave,
  autoSaveMs = 3000,
}: UseFormBuilderOptions): UseFormBuilderReturn {
  const [state, dispatch] = useReducer(builderReducer, initialConfig, (cfg) =>
    createInitialBuilderState(cfg)
  );

  const [ui, setUI] = useState<BuilderUIState>({
    leftPanelTab: 'steps',
    rightPanelTab: 'content',
    builderView: 'builder',
    devicePreview: 'mobile',
    language: 'en',
    selection: { type: null, stepId: null, fieldId: null },
    previewStepId: null,
    showFlowDiagram: false,
  });

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>(JSON.stringify(initialConfig));

  // Track dirty state
  const isDirty = JSON.stringify(state.config) !== lastSavedRef.current;

  // ---- Selection ----

  const selectStep = useCallback((stepId: string) => {
    setUI((prev) => ({
      ...prev,
      selection: { type: 'step', stepId, fieldId: null },
      rightPanelTab: 'content',
    }));
  }, []);

  const selectField = useCallback((stepId: string, fieldId: string) => {
    setUI((prev) => ({
      ...prev,
      selection: { type: 'field', stepId, fieldId },
      rightPanelTab: 'content',
    }));
  }, []);

  const selectForm = useCallback(() => {
    setUI((prev) => ({
      ...prev,
      selection: { type: 'form', stepId: null, fieldId: null },
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setUI((prev) => ({
      ...prev,
      selection: { type: null, stepId: null, fieldId: null },
    }));
  }, []);

  // ---- UI setters ----

  const setLeftPanelTab = useCallback((tab: LeftPanelTab) => {
    setUI((prev) => ({ ...prev, leftPanelTab: tab }));
  }, []);

  const setRightPanelTab = useCallback((tab: RightPanelTab) => {
    setUI((prev) => ({ ...prev, rightPanelTab: tab }));
  }, []);

  const setBuilderView = useCallback((view: BuilderView) => {
    setUI((prev) => ({ ...prev, builderView: view }));
  }, []);

  const setDevicePreview = useCallback((device: DevicePreview) => {
    setUI((prev) => ({ ...prev, devicePreview: device }));
  }, []);

  const setLanguage = useCallback((lang: BuilderLanguage) => {
    setUI((prev) => ({ ...prev, language: lang }));
  }, []);

  const setPreviewStepId = useCallback((stepId: string | null) => {
    setUI((prev) => ({ ...prev, previewStepId: stepId }));
  }, []);

  const toggleFlowDiagram = useCallback(() => {
    setUI((prev) => ({ ...prev, showFlowDiagram: !prev.showFlowDiagram }));
  }, []);

  // ---- Save ----

  const save = useCallback(async () => {
    if (!onSave) return;
    setSaveStatus('saving');
    try {
      await onSave(state.config);
      lastSavedRef.current = JSON.stringify(state.config);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }, [onSave, state.config]);

  // Auto-save on changes
  useEffect(() => {
    if (!isDirty || !onSave) return;
    setSaveStatus('unsaved');

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      save();
    }, autoSaveMs);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state.config, isDirty, autoSaveMs, save, onSave]);

  // ---- Keyboard shortcuts ----

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      }
      if (isMod && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      }
      if (isMod && e.key === 's') {
        e.preventDefault();
        save();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement ||
          (e.target instanceof HTMLElement && e.target.isContentEditable)
        ) {
          return;
        }
        if (ui.selection.type === 'field' && ui.selection.stepId && ui.selection.fieldId) {
          e.preventDefault();
          dispatch({
            type: 'DELETE_FIELD',
            stepId: ui.selection.stepId,
            fieldId: ui.selection.fieldId,
          });
          selectStep(ui.selection.stepId);
        }
      }
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch, save, ui.selection, selectStep, clearSelection]);

  // ---- Derived data ----

  const selectedStep = ui.selection.stepId
    ? state.config.steps.find((s) => s.id === ui.selection.stepId)
    : undefined;

  const selectedField =
    selectedStep && ui.selection.fieldId
      ? selectedStep.fields.find((f) => f.id === ui.selection.fieldId)
      : undefined;

  return {
    state,
    ui,
    saveStatus,
    dispatch,
    selectStep,
    selectField,
    selectForm,
    clearSelection,
    setLeftPanelTab,
    setRightPanelTab,
    setBuilderView,
    setDevicePreview,
    setLanguage,
    setPreviewStepId,
    toggleFlowDiagram,
    save,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    selectedStep,
    selectedField,
  };
}
