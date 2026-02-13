'use client';

import { useState } from 'react';
import { format } from 'date-fns';

export interface TimelineEvent {
  id: string;
  date: Date;
  type: 'creation' | 'intake' | 'prescription' | 'billing' | 'document' | 'chat' | 'appointment';
  title: string;
  description?: string;
  metadata?: any;
}

interface PatientTimelineProps {
  events: TimelineEvent[];
  patientCreatedAt: Date;
  patientSource?: string; // "webhook", "api", "manual", "referral", "import"
}

// Map source to friendly display text
const getSourceLabel = (source?: string): string => {
  switch (source?.toLowerCase()) {
    case 'webhook':
    case 'heyflow':
      return 'via Heyflow';
    case 'api':
      return 'via API';
    case 'referral':
      return 'via Referral';
    case 'import':
      return 'via Data Import';
    case 'manual':
    default:
      return 'Created manually';
  }
};

export default function PatientTimeline({
  events,
  patientCreatedAt,
  patientSource,
}: PatientTimelineProps) {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const toggleEvent = (eventId: string) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId);
    } else {
      newExpanded.add(eventId);
    }
    setExpandedEvents(newExpanded);
  };

  // Add patient creation as first event
  const allEvents: TimelineEvent[] = [
    {
      id: 'patient-created',
      date: patientCreatedAt,
      type: 'creation' as const,
      title: 'Patient created',
      description: getSourceLabel(patientSource),
    } as TimelineEvent,
    ...events,
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const getEventColor = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'creation':
        return 'border-purple-400 bg-purple-50';
      case 'intake':
        return 'border-blue-400 bg-blue-50';
      case 'prescription':
        return 'border-orange-400 bg-orange-50';
      case 'billing':
        return 'border-green-400 bg-green-50';
      case 'document':
        return 'border-yellow-400 bg-yellow-50';
      case 'chat':
        return 'border-indigo-400 bg-indigo-50';
      case 'appointment':
        return 'border-pink-400 bg-pink-50';
      default:
        return 'border-gray-400 bg-gray-50';
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-4 font-semibold text-gray-900">Timeline</h3>

      <div className="max-h-96 space-y-3 overflow-y-auto">
        {allEvents.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">No events yet</p>
        ) : (
          allEvents.map((event, index) => (
            <div
              key={event.id}
              className={`relative flex items-start space-x-3 ${
                index !== allEvents.length - 1 ? 'pb-3' : ''
              }`}
            >
              {/* Timeline line */}
              {index !== allEvents.length - 1 && (
                <div className="absolute bottom-0 left-4 top-8 w-0.5 bg-gray-200" />
              )}

              {/* Event icon */}
              <div
                className={`h-8 w-8 flex-shrink-0 rounded-full border-2 ${getEventColor(event.type)} z-10`}
              ></div>

              {/* Event content */}
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => event.description && toggleEvent(event.id)}
                  className="group w-full text-left"
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">{format(event.date, 'MM/dd')}</span>
                    <p className="truncate text-sm font-medium text-gray-900 transition-colors group-hover:text-[#4fa77e]">
                      {event.title}
                    </p>
                  </div>
                  {event.description && (
                    <p
                      className={`mt-1 text-xs text-gray-600 ${
                        expandedEvents.has(event.id) ? '' : 'truncate'
                      }`}
                    >
                      {event.description}
                    </p>
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
