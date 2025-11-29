"use client";

import { useState } from "react";

export default function TestPrescriptionPage() {
  const [showConfirmation, setShowConfirmation] = useState(false);
  
  // Mock prescription data for demonstration
  const mockPrescription = {
    patient: {
      firstName: "Rebecca",
      lastName: "Pignano",
      dob: "07/28/1997",
      gender: "Female",
      phone: "3857856102",
      email: "rebecca@eonmeds.com",
      address: "1801 North Morgan Street, 12, Tampa, FL 33602"
    },
    provider: {
      name: "Dr. John Smith",
      npi: "1234567890",
      signature: "✓ Captured"
    },
    medications: [
      {
        name: "Semaglutide",
        strength: "0.25mg/0.5mL",
        sig: "Inject 0.25mg subcutaneously once weekly",
        quantity: "1",
        refills: "3"
      },
      {
        name: "Metformin",
        strength: "500mg",
        sig: "Take 1 tablet by mouth twice daily with meals",
        quantity: "60",
        refills: "5"
      }
    ],
    shipping: {
      method: "UPS - OVERNIGHT",
      address: "1801 North Morgan Street, 12, Tampa, FL 33602"
    }
  };

  if (showConfirmation) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold">Prescription Confirmation</h1>
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full font-medium">
                Pending Review
              </span>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-600">
                Please review all prescription details carefully before sending to the pharmacy.
                Once submitted, this prescription will be processed and sent for fulfillment.
              </p>
            </div>

            {/* Patient Information */}
            <div className="border-b pb-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Patient Information</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Name:</span>{" "}
                  <span className="font-medium">{mockPrescription.patient.firstName} {mockPrescription.patient.lastName}</span>
                </div>
                <div>
                  <span className="text-gray-600">DOB:</span>{" "}
                  <span className="font-medium">{mockPrescription.patient.dob}</span>
                </div>
                <div>
                  <span className="text-gray-600">Gender:</span>{" "}
                  <span className="font-medium">{mockPrescription.patient.gender}</span>
                </div>
                <div>
                  <span className="text-gray-600">Phone:</span>{" "}
                  <span className="font-medium">{mockPrescription.patient.phone}</span>
                </div>
                <div>
                  <span className="text-gray-600">Email:</span>{" "}
                  <span className="font-medium">{mockPrescription.patient.email}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-600">Address:</span>{" "}
                  <span className="font-medium">{mockPrescription.patient.address}</span>
                </div>
              </div>
            </div>

            {/* Provider Information */}
            <div className="border-b pb-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Provider Information</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Provider:</span>{" "}
                  <span className="font-medium">{mockPrescription.provider.name}</span>
                </div>
                <div>
                  <span className="text-gray-600">NPI:</span>{" "}
                  <span className="font-medium">{mockPrescription.provider.npi}</span>
                </div>
                <div>
                  <span className="text-gray-600">Signature:</span>{" "}
                  <span className="font-medium text-green-600">{mockPrescription.provider.signature}</span>
                </div>
              </div>
            </div>

            {/* Medications */}
            <div className="border-b pb-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Medications</h2>
              {mockPrescription.medications.map((med, index) => (
                <div key={index} className="bg-blue-50 rounded-lg p-4 mb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm mb-2">
                        Medication #{index + 1}
                      </h3>
                      <p className="font-medium">
                        {med.name} - {med.strength}
                      </p>
                      <div className="mt-2 space-y-1 text-sm">
                        <p><span className="text-gray-600">SIG:</span> {med.sig}</p>
                        <p>
                          <span className="text-gray-600">Quantity:</span> {med.quantity} •{" "}
                          <span className="text-gray-600">Refills:</span> {med.refills}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Shipping Information */}
            <div className="border-b pb-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Shipping Information</h2>
              <div className="text-sm">
                <p>
                  <span className="text-gray-600">Method:</span>{" "}
                  <span className="font-medium">{mockPrescription.shipping.method}</span>
                </p>
                <p className="mt-2">
                  <span className="text-gray-600">Delivery Address:</span>{" "}
                  <span className="font-medium">{mockPrescription.shipping.address}</span>
                </p>
              </div>
            </div>

            {/* Important Notice */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Important Notice
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>
                      By clicking "Send to Pharmacy", you confirm that:
                    </p>
                    <ul className="list-disc list-inside mt-1">
                      <li>All patient information is accurate and up-to-date</li>
                      <li>The prescribed medications and dosages are correct</li>
                      <li>You have authority to prescribe these medications</li>
                      <li>The prescription complies with all applicable regulations</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => setShowConfirmation(false)}
                className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                ← Back to Edit
              </button>
              <button
                className="flex-1 px-6 py-3 bg-[#4fa77e] text-white rounded-lg font-medium hover:bg-[#3f8660] transition-colors"
              >
                Send to Pharmacy →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-2xl mx-auto text-center">
        <h1 className="text-3xl font-bold mb-6">Prescription Demo</h1>
        <p className="text-gray-600 mb-8">
          This demonstrates the new prescription confirmation page that appears before sending prescriptions to the pharmacy.
        </p>
        
        <button
          onClick={() => setShowConfirmation(true)}
          className="px-8 py-4 bg-[#4fa77e] text-white rounded-lg font-semibold text-lg hover:bg-[#3f8660] transition-colors"
        >
          Show Prescription Confirmation Page
        </button>
        
        <div className="mt-12 text-left bg-gray-50 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">How it works:</h2>
          <ol className="space-y-3 text-gray-700">
            <li className="flex">
              <span className="font-bold mr-3">1.</span>
              <span>Provider fills out the prescription form with patient information and medications</span>
            </li>
            <li className="flex">
              <span className="font-bold mr-3">2.</span>
              <span>Clicks "Review Prescription" instead of directly sending</span>
            </li>
            <li className="flex">
              <span className="font-bold mr-3">3.</span>
              <span>Confirmation page shows all details for final review</span>
            </li>
            <li className="flex">
              <span className="font-bold mr-3">4.</span>
              <span>Provider can go back to edit or confirm and send to pharmacy</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
