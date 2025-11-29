"use client";

import { useState } from "react";
import { X } from "lucide-react";
import PatientPrescriptionPanel from "./PatientPrescriptionPanel";

type PrescriptionModalProps = {
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    dob: string | null;
    gender: string | null;
    phone: string | null;
    email: string | null;
    address1: string | null;
    address2?: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function PrescriptionModal({ 
  patient, 
  isOpen, 
  onClose, 
  onSuccess 
}: PrescriptionModalProps) {
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSuccess = () => {
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      onSuccess();
      onClose();
    }, 2000); // Show success message for 2 seconds
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative w-full max-w-4xl bg-[#f9f8f6] rounded-lg shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-2xl font-semibold">
                New Prescription for {patient.firstName} {patient.lastName}
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Content */}
            <div className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
              {showSuccess ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="rounded-full bg-green-100 p-4 mb-4">
                    <svg
                      className="h-12 w-12 text-green-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Prescription Submitted Successfully!
                  </h3>
                  <p className="text-gray-600">
                    The prescription has been sent to the pharmacy.
                  </p>
                </div>
              ) : (
                <PatientPrescriptionPanel 
                  patient={patient} 
                  onSuccess={handleSuccess}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}