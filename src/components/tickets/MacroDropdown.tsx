'use client';

import { useState, useEffect, useRef } from 'react';
import { Zap, ChevronDown, Loader2, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface Macro {
  id: number;
  name: string;
  description?: string | null;
  responseContent: string;
  setStatus?: string | null;
  setPriority?: string | null;
  setCategory?: string | null;
  addTags: string[];
  removeTags: string[];
}

interface MacroDropdownProps {
  ticketId: string | number;
  onApplied: () => void;
}

export default function MacroDropdown({ ticketId, onApplied }: MacroDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<number | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && macros.length === 0) {
      setLoading(true);
      apiFetch('/api/tickets/macros')
        .then((r) => r.ok ? r.json() : { macros: [] })
        .then((d) => setMacros(d.macros || []))
        .catch(() => setMacros([]))
        .finally(() => setLoading(false));
    }
  }, [isOpen, macros.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleApply = async (macroId: number) => {
    setApplying(macroId);
    try {
      const res = await apiFetch(`/api/tickets/macros/${macroId}/apply`, {
        method: 'POST',
        body: JSON.stringify({ ticketId }),
      });
      if (res.ok) {
        setApplied(macroId);
        setTimeout(() => {
          setIsOpen(false);
          setApplied(null);
          onApplied();
        }, 600);
      }
    } catch {
      // Silently handle
    } finally {
      setApplying(null);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Zap className="h-4 w-4" />
        Macros
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="text-xs font-medium text-gray-500">Apply a macro to this ticket</p>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : macros.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                No macros available.
                <a href="/tickets/macros" className="ml-1 text-blue-600 hover:underline">Create one</a>
              </div>
            ) : (
              macros.map((macro) => (
                <button
                  key={macro.id}
                  onClick={() => handleApply(macro.id)}
                  disabled={applying !== null}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900">{macro.name}</div>
                    {macro.description && (
                      <div className="truncate text-xs text-gray-500">{macro.description}</div>
                    )}
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {macro.setStatus && (
                        <span className="rounded bg-purple-50 px-1 py-0.5 text-[10px] text-purple-600">
                          {macro.setStatus.replace(/_/g, ' ')}
                        </span>
                      )}
                      {macro.setPriority && (
                        <span className="rounded bg-orange-50 px-1 py-0.5 text-[10px] text-orange-600">
                          {macro.setPriority.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                  {applying === macro.id ? (
                    <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-gray-400" />
                  ) : applied === macro.id ? (
                    <Check className="h-4 w-4 flex-shrink-0 text-green-500" />
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
