"use client";

import { useState } from "react";
import { format } from "date-fns";

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

export default function PatientTimeline({ events, patientCreatedAt, patientSource }: PatientTimelineProps) {
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
      description: getSourceLabel(patientSource)
    } as TimelineEvent,
    ...events
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
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <h3 className="font-semibold text-gray-900 mb-4">Timeline</h3>
      
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {allEvents.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No events yet</p>
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
                <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-gray-200" />
              )}
              
              {/* Event icon */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 ${getEventColor(event.type)} z-10`}>
              </div>
              
              {/* Event content */}
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => event.description && toggleEvent(event.id)}
                  className="text-left w-full group"
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">
                      {format(event.date, 'MM/dd')}
                    </span>
                    <p className="text-sm font-medium text-gray-900 truncate group-hover:text-[#4fa77e] transition-colors">
                      {event.title}
                    </p>
                  </div>
                  {event.description && (
                    <p className={`text-xs text-gray-600 mt-1 ${
                      expandedEvents.has(event.id) ? '' : 'truncate'
                    }`}>
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
