'use client';

import { useEffect, useState } from 'react';
import { logger } from '../../lib/logger';

import { Building2, Check, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ClinicOption {
  id: number;
  name: string;
  subdomain: string;
  logoUrl?: string | null;
  status: string;
  billingPlan: string;
  patientCount: number;
  providerCount: number;
}

export default function ClinicSelectPage() {
  const router = useRouter();
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClinic, setSelectedClinic] = useState<number | null>(null);
  const [switching, setSwitching] = useState(false);
  
  useEffect(() => {
    loadClinics();
  }, []);
  
  const loadClinics = async () => {
    try {
      const response = await fetch('/api/clinic/list');
      if (response.ok) {
        const data = await response.json();
        setClinics(data);
        
        // If only one clinic is available, auto-select it
        if (data.length === 1 && data[0].status === 'ACTIVE') {
          handleSelectClinic(data[0].id);
        }
      }
    } catch (error) {
      logger.error('Error loading clinics:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSelectClinic = async (clinicId: number) => {
    setSelectedClinic(clinicId);
    setSwitching(true);
    
    try {
      const response = await fetch('/api/clinic/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId }),
      });
      
      if (response.ok) {
        // Redirect to dashboard after successful selection
        router.push('/admin');
      } else {
        setSwitching(false);
        setSelectedClinic(null);
      }
    } catch (error) {
      logger.error('Error selecting clinic:', error);
      setSwitching(false);
      setSelectedClinic(null);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <Building2 className="w-8 h-8 text-blue-600 animate-pulse" />
          </div>
          <p className="text-gray-600">Loading available clinics...</p>
        </div>
      </div>
    );
  }
  
  if (clinics.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-100 rounded-full mb-4">
            <AlertCircle className="w-8 h-8 text-yellow-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">No Clinics Available</h1>
          <p className="text-gray-600 mb-6">
            There are no active clinics available for you to access. Please contact your administrator.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <Building2 className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Select Your Clinic</h1>
          <p className="text-gray-600">Choose the clinic you want to access</p>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2">
          {clinics.map((clinic) => (
            <button
              key={clinic.id}
              onClick={() => handleSelectClinic(clinic.id)}
              disabled={clinic.status !== 'ACTIVE' || switching}
              className={`
                relative bg-white p-6 rounded-xl shadow-sm border-2 transition-all
                ${selectedClinic === clinic.id 
                  ? 'border-blue-500 shadow-lg' 
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                }
                ${clinic.status !== 'ACTIVE' 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'cursor-pointer'
                }
                ${switching && selectedClinic !== clinic.id 
                  ? 'opacity-50' 
                  : ''
                }
              `}
            >
              {selectedClinic === clinic.id && (
                <div className="absolute top-4 right-4">
                  <Check className="w-5 h-5 text-green-500" />
                </div>
              )}
              
              <div className="flex items-start gap-4">
                {clinic.logoUrl ? (
                  <img 
                    src={clinic.logoUrl} 
                    alt={clinic.name}
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
                    {clinic.name.charAt(0).toUpperCase()}
                  </div>
                )}
                
                <div className="flex-1 text-left">
                  <h3 className="font-semibold text-lg text-gray-900 mb-1">
                    {clinic.name}
                  </h3>
                  <p className="text-sm text-gray-500 mb-3">
                    {clinic.subdomain}.{process.env.NEXT_PUBLIC_BASE_DOMAIN || 'localhost:3001'}
                  </p>
                  
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1">
                      <span className="text-gray-400">Patients:</span>
                      <span className="font-medium text-gray-700">{clinic.patientCount}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-gray-400">Providers:</span>
                      <span className="font-medium text-gray-700">{clinic.providerCount}</span>
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-3">
                    <span className={`
                      px-2 py-1 text-xs rounded-full font-medium
                      ${clinic.status === 'ACTIVE' 
                        ? 'bg-green-100 text-green-800' 
                        : clinic.status === 'TRIAL'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                      }
                    `}>
                      {clinic.status}
                    </span>
                    <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 font-medium">
                      {clinic.billingPlan}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
        
        {switching && (
          <div className="mt-6 text-center text-gray-600">
            <div className="inline-flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
              Switching to clinic...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
