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
        className={`flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg shadow-lg hover:shadow-xl hover:from-emerald-600 hover:to-teal-600 transition-all ${className}`}
        title="Start AI Scribe"
      >
        <Mic className="w-4 h-4" />
        <span>AI Scribe</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="relative">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-100 z-10"
            >
              <X className="w-4 h-4" />
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
