'use client';

/**
 * Patient Insights Component
 * Displays personalized AI-generated health insights
 */

import { useEffect, useState } from 'react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import {
  Trophy,
  Flame,
  Lightbulb,
  Bell,
  Heart,
  Droplet,
  Activity,
  Scale,
  Info,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

interface Insight {
  id: string;
  type: 'tip' | 'reminder' | 'achievement' | 'alert' | 'encouragement';
  title: string;
  message: string;
  icon?: string;
  priority: 'low' | 'medium' | 'high';
  actionUrl?: string;
  actionLabel?: string;
}

const ICON_MAP: Record<string, typeof Trophy> = {
  trophy: Trophy,
  flame: Flame,
  lightbulb: Lightbulb,
  bell: Bell,
  heart: Heart,
  droplet: Droplet,
  activity: Activity,
  scale: Scale,
  info: Info,
  sparkles: Sparkles,
};

const TYPE_STYLES: Record<
  Insight['type'],
  { bg: string; border: string; iconBg: string; iconColor: string }
> = {
  achievement: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
  },
  tip: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  reminder: {
    bg: 'bg-[var(--brand-primary-light)]',
    border: 'border-[var(--brand-primary-medium)]',
    iconBg: 'bg-[var(--brand-primary-light)]',
    iconColor: 'text-[var(--brand-primary)]',
  },
  alert: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
  },
  encouragement: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
  },
};

export function PatientInsights() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      setError(null);
      const res = await fetch('/api/patient-portal/ai/insights');
      if (res.ok) {
        const data = await res.json();
        setInsights(data.insights || []);
      } else {
        setError('Unable to load insights');
      }
    } catch (error) {
      console.error('Failed to fetch insights:', error);
      setError('Failed to load insights. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const dismissInsight = (id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
  };

  const visibleInsights = insights.filter((i) => !dismissed.has(i.id));

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (visibleInsights.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-5 w-5" style={{ color: primaryColor }} />
        <h3 className="font-semibold text-gray-900">Personalized Insights</h3>
      </div>

      {visibleInsights.map((insight) => {
        const style = TYPE_STYLES[insight.type];
        const IconComponent = ICON_MAP[insight.icon || 'lightbulb'] || Lightbulb;

        return (
          <div
            key={insight.id}
            className={`${style.bg} ${style.border} rounded-xl border p-4 transition-all`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`h-10 w-10 rounded-full ${style.iconBg} flex flex-shrink-0 items-center justify-center`}
              >
                <IconComponent className={`h-5 w-5 ${style.iconColor}`} />
              </div>

              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-gray-900">{insight.title}</h4>
                <p className="mt-0.5 text-sm text-gray-600">{insight.message}</p>

                {insight.actionUrl && (
                  <Link
                    href={insight.actionUrl}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium hover:underline"
                    style={{ color: primaryColor }}
                  >
                    {insight.actionLabel || 'Learn More'}
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </div>

              <button
                onClick={() => dismissInsight(insight.id)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Mini Becca Chat Widget
 * A floating AI assistant for quick questions
 */
interface BeccaChatWidgetProps {
  onExpand?: () => void;
}

export function BeccaChatWidget({ onExpand }: BeccaChatWidgetProps) {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestions] = useState([
    'How is my progress?',
    'When is my next shipment?',
    'Tips for managing nausea',
  ]);

  const sendMessage = async (text: string) => {
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/patient-portal/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: [] }),
      });

      if (res.ok) {
        const data = await res.json();
        setResponse(data.message);
      } else {
        setResponse("Sorry, I couldn't process that. Please try again.");
      }
    } catch (error) {
      setResponse('Sorry, something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 md:bottom-6 md:right-6"
        style={{ backgroundColor: primaryColor }}
      >
        <Sparkles className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-4 z-40 w-80 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl md:bottom-6 md:right-6">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 text-white"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          <span className="font-semibold">Ask Becca</span>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white">
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="max-h-64 overflow-y-auto p-4">
        {response ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-gray-100 p-3 text-sm text-gray-700">{response}</div>
            <button
              onClick={() => setResponse(null)}
              className="text-sm font-medium hover:underline"
              style={{ color: primaryColor }}
            >
              Ask another question
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Hi! I'm Becca, your health assistant. How can I help you today?
            </p>
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => sendMessage(suggestion)}
                  className="w-full rounded-lg bg-gray-50 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
                  disabled={loading}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      {!response && (
        <div className="border-t border-gray-100 p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && message && sendMessage(message)}
              placeholder="Type your question..."
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-opacity-50"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
              disabled={loading}
            />
            <button
              onClick={() => message && sendMessage(message)}
              disabled={!message || loading}
              className="rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: primaryColor }}
            >
              {loading ? '...' : 'Ask'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
