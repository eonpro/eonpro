'use client';

/**
 * IntakeFormBuilder — Top-level orchestrator
 *
 * 3-panel layout: Left (steps/elements) | Center (canvas) | Right (properties)
 * Wraps everything in a shared DndContext for cross-panel drag and drop.
 */

import React, { useCallback, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';

import { useFormBuilder } from './state/useFormBuilder';
import type { FormConfig, FieldType } from './state/builderTypes';
import { getElementDefinition } from './state/elementDefinitions';

import BuilderToolbar from './BuilderToolbar';
import StepListPanel from './panels/StepListPanel';
import ElementPalette from './panels/ElementPalette';
import BuilderCanvas from './canvas/BuilderCanvas';
import PropertiesPanel from './properties/PropertiesPanel';
import FormPreviewPanel from './preview/FormPreviewPanel';
import JsonToggle from './shared/JsonToggle';
import StepFlowDiagram from './navigation/StepFlowDiagram';

interface IntakeFormBuilderProps {
  templateId: string;
  initialConfig: FormConfig;
  isActive: boolean;
  onSave: (config: FormConfig) => Promise<void>;
  onToggleActive: () => void;
  onBack: () => void;
  onSendToClient: () => void;
}

export default function IntakeFormBuilder({
  templateId,
  initialConfig,
  isActive,
  onSave,
  onToggleActive,
  onBack,
  onSendToClient,
}: IntakeFormBuilderProps) {
  const builder = useFormBuilder({
    templateId,
    initialConfig,
    onSave,
  });

  const {
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
    canUndo,
    canRedo,
    selectedStep,
    selectedField,
  } = builder;

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ---- DnD handlers ----

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current as Record<string, unknown> | undefined;
      const overData = over.data.current as Record<string, unknown> | undefined;

      // Palette element dropped onto canvas drop zone
      if (activeData?.type === 'palette-element' && String(over.id).startsWith('canvas-drop-')) {
        const fieldType = activeData.fieldType as FieldType;
        const stepId = ui.selection.stepId;
        if (stepId) {
          dispatch({ type: 'ADD_FIELD', stepId, fieldType });
        }
        return;
      }

      // Field reordering within a step
      if (activeData?.type === 'canvas-field' && overData?.type === 'canvas-field') {
        const stepId = ui.selection.stepId;
        if (stepId && active.id !== over.id) {
          dispatch({
            type: 'REORDER_FIELDS',
            stepId,
            activeId: String(active.id),
            overId: String(over.id),
          });
        }
        return;
      }
    },
    [dispatch, ui.selection.stepId]
  );

  // ---- Callbacks for child components ----

  const handleFormNameChange = useCallback(
    (name: string) => {
      dispatch({ type: 'UPDATE_FORM', updates: { name } });
    },
    [dispatch]
  );

  const handleAddStep = useCallback(
    (stepType: import('./state/builderTypes').StepType) => {
      dispatch({ type: 'ADD_STEP', stepType, afterStepId: ui.selection.stepId ?? undefined });
    },
    [dispatch, ui.selection.stepId]
  );

  const handleAddFieldFromPalette = useCallback(
    (stepId: string, fieldType: FieldType) => {
      dispatch({ type: 'ADD_FIELD', stepId, fieldType });
    },
    [dispatch]
  );

  const handleJsonApply = useCallback(
    (config: FormConfig) => {
      dispatch({ type: 'SET_CONFIG', config });
    },
    [dispatch]
  );

  // ---- Render ----

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-screen flex-col overflow-hidden bg-gray-100">
        {/* Toolbar */}
        <BuilderToolbar
          formName={state.config.name}
          onFormNameChange={handleFormNameChange}
          saveStatus={saveStatus}
          onSave={save}
          onUndo={() => dispatch({ type: 'UNDO' })}
          onRedo={() => dispatch({ type: 'REDO' })}
          canUndo={canUndo}
          canRedo={canRedo}
          builderView={ui.builderView}
          onViewChange={setBuilderView}
          devicePreview={ui.devicePreview}
          onDeviceChange={setDevicePreview}
          language={ui.language}
          onLanguageChange={setLanguage}
          onToggleFlow={toggleFlowDiagram}
          onBack={onBack}
          isActive={isActive}
          onToggleActive={onToggleActive}
          onSendToClient={onSendToClient}
        />

        {/* Main content area */}
        {ui.builderView === 'builder' && (
          <div className="flex flex-1 overflow-hidden">
            {/* Left panel */}
            <div className="flex w-[280px] shrink-0 flex-col border-r border-gray-200 bg-white">
              {/* Panel tabs */}
              <div className="flex border-b border-gray-200">
                <button
                  onClick={() => setLeftPanelTab('steps')}
                  className={`flex-1 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    ui.leftPanelTab === 'steps'
                      ? 'border-b-2 border-indigo-600 bg-indigo-50/50 text-indigo-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Steps
                </button>
                <button
                  onClick={() => setLeftPanelTab('elements')}
                  className={`flex-1 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    ui.leftPanelTab === 'elements'
                      ? 'border-b-2 border-indigo-600 bg-indigo-50/50 text-indigo-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Elements
                </button>
              </div>

              {/* Panel content */}
              <div className="flex-1 overflow-y-auto">
                {ui.leftPanelTab === 'steps' ? (
                  <StepListPanel
                    steps={state.config.steps}
                    startStepId={state.config.startStep}
                    selectedStepId={ui.selection.stepId}
                    onSelectStep={selectStep}
                    onAddStep={handleAddStep}
                    onDuplicateStep={(id) => dispatch({ type: 'DUPLICATE_STEP', stepId: id })}
                    onDeleteStep={(id) => dispatch({ type: 'DELETE_STEP', stepId: id })}
                    onReorderSteps={(a, o) =>
                      dispatch({ type: 'REORDER_STEPS', activeId: a, overId: o })
                    }
                    onSetStartStep={(id) => dispatch({ type: 'SET_START_STEP', stepId: id })}
                    language={ui.language}
                  />
                ) : (
                  <ElementPalette
                    onAddField={handleAddFieldFromPalette}
                    selectedStepId={ui.selection.stepId}
                  />
                )}
              </div>
            </div>

            {/* Center canvas */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-auto">
                <BuilderCanvas
                  step={selectedStep}
                  devicePreview={ui.devicePreview}
                  language={ui.language}
                  selectedFieldId={ui.selection.fieldId}
                  branding={state.config.branding}
                  onSelectField={(fieldId) => {
                    if (ui.selection.stepId) selectField(ui.selection.stepId, fieldId);
                  }}
                  onSelectStep={() => {
                    if (ui.selection.stepId) selectStep(ui.selection.stepId);
                  }}
                  onUpdateStep={(updates) => {
                    if (ui.selection.stepId)
                      dispatch({ type: 'UPDATE_STEP', stepId: ui.selection.stepId, updates });
                  }}
                  onReorderFields={(a, o) => {
                    if (ui.selection.stepId)
                      dispatch({
                        type: 'REORDER_FIELDS',
                        stepId: ui.selection.stepId,
                        activeId: a,
                        overId: o,
                      });
                  }}
                  onDeleteField={(fieldId) => {
                    if (ui.selection.stepId)
                      dispatch({ type: 'DELETE_FIELD', stepId: ui.selection.stepId, fieldId });
                  }}
                  onDuplicateField={(fieldId) => {
                    if (ui.selection.stepId)
                      dispatch({ type: 'DUPLICATE_FIELD', stepId: ui.selection.stepId, fieldId });
                  }}
                  onDropNewField={(fieldType, atIndex) => {
                    if (ui.selection.stepId)
                      dispatch({
                        type: 'ADD_FIELD',
                        stepId: ui.selection.stepId,
                        fieldType,
                        atIndex,
                      });
                  }}
                />
              </div>

              {/* Flow diagram (collapsible) */}
              {ui.showFlowDiagram && (
                <div className="shrink-0 border-t border-gray-200 bg-white p-3">
                  <StepFlowDiagram
                    steps={state.config.steps}
                    startStepId={state.config.startStep}
                    selectedStepId={ui.selection.stepId}
                    onSelectStep={selectStep}
                  />
                </div>
              )}
            </div>

            {/* Right panel */}
            <div className="w-[320px] shrink-0 overflow-y-auto border-l border-gray-200 bg-white">
              <PropertiesPanel
                selection={ui.selection}
                steps={state.config.steps}
                config={state.config}
                language={ui.language}
                rightPanelTab={ui.rightPanelTab}
                onTabChange={setRightPanelTab}
                onUpdateStep={(id, u) => dispatch({ type: 'UPDATE_STEP', stepId: id, updates: u })}
                onUpdateField={(sId, fId, u) =>
                  dispatch({ type: 'UPDATE_FIELD', stepId: sId, fieldId: fId, updates: u })
                }
                onUpdateForm={(u) => dispatch({ type: 'UPDATE_FORM', updates: u })}
                onUpdateBranding={(u) => dispatch({ type: 'UPDATE_BRANDING', updates: u })}
                onAddOption={(sId, fId) =>
                  dispatch({ type: 'ADD_OPTION', stepId: sId, fieldId: fId })
                }
                onDeleteOption={(sId, fId, oId) =>
                  dispatch({ type: 'DELETE_OPTION', stepId: sId, fieldId: fId, optionId: oId })
                }
                onUpdateOption={(sId, fId, oId, u) =>
                  dispatch({
                    type: 'UPDATE_OPTION',
                    stepId: sId,
                    fieldId: fId,
                    optionId: oId,
                    updates: u,
                  })
                }
                onReorderOptions={(sId, fId, a, o) =>
                  dispatch({
                    type: 'REORDER_OPTIONS',
                    stepId: sId,
                    fieldId: fId,
                    activeId: a,
                    overId: o,
                  })
                }
                onSetNextStep={(id, n) =>
                  dispatch({ type: 'SET_NEXT_STEP', stepId: id, nextStep: n })
                }
                onAddConditionalNav={(id, nav) =>
                  dispatch({ type: 'ADD_CONDITIONAL_NAV', stepId: id, nav })
                }
                onDeleteConditionalNav={(id, idx) =>
                  dispatch({ type: 'DELETE_CONDITIONAL_NAV', stepId: id, index: idx })
                }
                onUpdateConditionalNav={(id, idx, nav) =>
                  dispatch({ type: 'UPDATE_CONDITIONAL_NAV', stepId: id, index: idx, nav })
                }
                onClearSelection={clearSelection}
              />
            </div>
          </div>
        )}

        {/* Preview view */}
        {ui.builderView === 'preview' && (
          <div className="flex flex-1 items-start justify-center overflow-auto bg-gray-50 p-8">
            <FormPreviewPanel
              config={state.config}
              devicePreview={ui.devicePreview}
              language={ui.language}
              previewStepId={ui.previewStepId}
              onPreviewStepChange={setPreviewStepId}
            />
          </div>
        )}

        {/* JSON view */}
        {ui.builderView === 'json' && (
          <div className="flex-1 overflow-hidden p-4">
            <JsonToggle config={state.config} onApply={handleJsonApply} />
          </div>
        )}
      </div>

      {/* Drag overlay for palette elements */}
      <DragOverlay>
        {activeDragId && activeDragId.startsWith('el-') ? (
          <div className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 opacity-90 shadow-lg">
            {getElementDefinition(activeDragId)?.label ?? 'Element'}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
