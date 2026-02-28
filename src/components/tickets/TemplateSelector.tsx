'use client';

import { useState, useEffect } from 'react';
import { FileText, ChevronRight, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface Template {
  id: number;
  name: string;
  description?: string | null;
  category: string;
  titleTemplate: string;
  descriptionTemplate: string;
  priority: string;
  tags: string[];
  defaultAssigneeId?: number | null;
}

interface TemplateSelectorProps {
  onSelect: (template: {
    title: string;
    description: string;
    category: string;
    priority: string;
    tags: string[];
    assignedToId?: number;
  }) => void;
}

export default function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    apiFetch('/api/tickets/templates')
      .then((r) => r.ok ? r.json() : { templates: [] })
      .then((d) => setTemplates(d.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading templates...
      </div>
    );
  }

  if (templates.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-sm font-medium text-gray-700"
      >
        <span className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-400" />
          Start from a template ({templates.length} available)
        </span>
        <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onSelect({
                  title: t.titleTemplate,
                  description: t.descriptionTemplate,
                  category: t.category,
                  priority: t.priority,
                  tags: t.tags,
                  assignedToId: t.defaultAssigneeId || undefined,
                });
                setExpanded(false);
              }}
              className="rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
            >
              <div className="text-sm font-medium text-gray-900">{t.name}</div>
              {t.description && (
                <div className="mt-0.5 text-xs text-gray-500">{t.description}</div>
              )}
              <div className="mt-1.5 flex gap-1">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                  {t.category.replace(/_/g, ' ')}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
