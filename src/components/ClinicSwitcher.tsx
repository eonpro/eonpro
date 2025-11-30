'use client';

import { useState, useEffect, useRef } from 'react';
import { Building2, ChevronDown, Check, RefreshCw } from 'lucide-react';

interface Clinic {
  id: number;
  name: string;
  subdomain: string;
  customDomain?: string;
  logoUrl?: string;
  primaryColor?: string;
  status: string;
  role?: string;
  isPrimary?: boolean;
}

interface ClinicSwitcherProps {
  className?: string;
}

export default function ClinicSwitcher({ className = '' }: ClinicSwitcherProps) {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [activeClinicId, setActiveClinicId] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch user's clinics
  useEffect(() => {
    fetchClinics();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchClinics = async () => {
    try {
      const token = localStorage.getItem('auth-token') || 
                    localStorage.getItem('admin-token') || 
                    localStorage.getItem('provider-token');
      
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch('/api/user/clinics', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setClinics(data.clinics || []);
        setActiveClinicId(data.activeClinicId);
        
        // Store active clinic in localStorage for other components
        if (data.activeClinicId) {
          localStorage.setItem('activeClinicId', data.activeClinicId.toString());
        }
      }
    } catch (error) {
      console.error('Error fetching clinics:', error);
    } finally {
      setLoading(false);
    }
  };

  const switchClinic = async (clinicId: number) => {
    if (clinicId === activeClinicId || switching) return;

    setSwitching(true);
    try {
      const token = localStorage.getItem('auth-token') || 
                    localStorage.getItem('admin-token') || 
                    localStorage.getItem('provider-token');

      const response = await fetch('/api/user/clinics', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ clinicId }),
      });

      if (response.ok) {
        const data = await response.json();
        setActiveClinicId(clinicId);
        localStorage.setItem('activeClinicId', clinicId.toString());
        setIsOpen(false);
        
        // Refresh the page to load new clinic data
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to switch clinic');
      }
    } catch (error) {
      console.error('Error switching clinic:', error);
      alert('Failed to switch clinic');
    } finally {
      setSwitching(false);
    }
  };

  // Don't render if user only has one clinic or none
  if (loading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 text-gray-400 ${className}`}>
        <RefreshCw className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (clinics.length <= 1) {
    // Show current clinic name without dropdown
    const activeClinic = clinics[0];
    if (!activeClinic) return null;
    
    return (
      <div className={`flex items-center gap-2 px-3 py-2 ${className}`}>
        {activeClinic.logoUrl ? (
          <img src={activeClinic.logoUrl} alt="" className="h-5 w-5 rounded" />
        ) : (
          <Building2 className="h-4 w-4 text-gray-500" />
        )}
        <span className="text-sm font-medium text-gray-700 hidden sm:inline">
          {activeClinic.name}
        </span>
      </div>
    );
  }

  const activeClinic = clinics.find(c => c.id === activeClinicId);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
        disabled={switching}
      >
        {switching ? (
          <RefreshCw className="h-4 w-4 animate-spin text-teal-600" />
        ) : activeClinic?.logoUrl ? (
          <img src={activeClinic.logoUrl} alt="" className="h-5 w-5 rounded" />
        ) : (
          <Building2 className="h-4 w-4 text-gray-500" />
        )}
        <span className="text-sm font-medium text-gray-700 max-w-[120px] truncate hidden sm:inline">
          {activeClinic?.name || 'Select Clinic'}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="p-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Switch Clinic</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {clinics.map((clinic) => (
              <button
                key={clinic.id}
                onClick={() => switchClinic(clinic.id)}
                disabled={switching}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${
                  clinic.id === activeClinicId ? 'bg-teal-50' : ''
                }`}
              >
                {clinic.logoUrl ? (
                  <img src={clinic.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                ) : (
                  <div 
                    className="h-8 w-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: clinic.primaryColor || '#3B82F6' }}
                  >
                    <Building2 className="h-4 w-4 text-white" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{clinic.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {clinic.subdomain}.eonpro.app
                    {clinic.isPrimary && (
                      <span className="ml-2 text-teal-600">(Primary)</span>
                    )}
                  </p>
                </div>
                {clinic.id === activeClinicId && (
                  <Check className="h-5 w-5 text-teal-600 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
          <div className="p-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500 text-center">
              {clinics.length} clinic{clinics.length !== 1 ? 's' : ''} available
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

