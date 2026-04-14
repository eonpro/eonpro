'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CanvasDropZoneProps {
  id: string;
  isOver?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CanvasDropZone({ id, isOver = false }: CanvasDropZoneProps) {
  const { setNodeRef, isOver: dndIsOver } = useDroppable({ id });
  const active = isOver || dndIsOver;

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[48px] flex-shrink-0 items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-all duration-150 ${
        active
          ? 'border-indigo-400 bg-indigo-50/80 dark:border-indigo-500 dark:bg-indigo-950/40'
          : 'border-gray-300 bg-gray-50/50 dark:border-gray-600 dark:bg-gray-800/30'
      } `}
    >
      <Plus
        className={`h-4 w-4 shrink-0 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}`}
      />
      <span
        className={`text-sm font-medium ${active ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}
      >
        {active ? 'Drop to add field' : 'Drag a field here or click + to add'}
      </span>
    </div>
  );
}
