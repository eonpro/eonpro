'use client';

import { useState } from 'react';
import { Mic, X } from 'lucide-react';
import BeccaAIScribe from './BeccaAIScribe';

interface ScribeButtonProps {
  patientId: number;
  providerId: number;
  appointmentId?: number;
  patientName: string;
  className?: string;
}

export default function BeccaAIScribeButton({
  patientId,
  providerId,
  appointmentId,
  patientName,
  className = '',
}: ScribeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSOAPGenerated = (_soapNote: unknown) => {
    // Could navigate to SOAP note view or trigger a refresh
    // SOAP note generated - callback could be extended for navigation
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-white shadow-lg transition-all hover:from-emerald-600 hover:to-teal-600 hover:shadow-xl ${className}`}
        title="Start AI Scribe"
      >
        <Mic className="h-4 w-4" />
        <span>AI Scribe</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute -right-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-lg hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
            <BeccaAIScribe
              patientId={patientId}
              providerId={providerId}
              appointmentId={appointmentId}
              patientName={patientName}
              onSOAPGenerated={handleSOAPGenerated}
              onClose={() => setIsOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
