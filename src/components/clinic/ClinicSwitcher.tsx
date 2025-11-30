'use client';

import { useState, useEffect, useRef } from 'react';
import { Building2, ChevronDown, Check, RefreshCw, AlertCircle } from 'lucide-react';

interface ClinicOption {
  id: number;
  name: string;
  subdomain: string;
  customDomain?: string;
  logoUrl?: string | null;
  primaryColor?: string;
  status: string;
  role?: string;
  isPrimary?: boolean;
}

interface ClinicSwitcherProps {
  className?: string;
  showLabel?: boolean;
}

export function ClinicSwitcher({ className = '', showLabel = true }: ClinicSwitcherProps) {
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [activeClinicId, setActiveClinicId] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch user's clinics on mount
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

  const getAuthToken = () => {
    return localStorage.getItem('auth-token') || 
           localStorage.getItem('admin-token') || 
           localStorage.getItem('provider-token') ||
           localStorage.getItem('super_admin-token') ||
           localStorage.getItem('SUPER_ADMIN-token');
  };

  const fetchClinics = async () => {
    try {
      const token = getAuthToken();
      
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
        setError(null);
        
        // Store active clinic in localStorage for other components
        if (data.activeClinicId) {
          localStorage.setItem('activeClinicId', data.activeClinicId.toString());
        }
      } else if (response.status === 401) {
        // Not authenticated - that's okay, just don't show the switcher
        setError(null);
      } else {
        console.error('Error fetching clinics:', await response.text());
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
      const token = getAuthToken();

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
        const errorData = await response.json();
        alert(errorData.error || 'Failed to switch clinic');
      }
    } catch (error) {
      console.error('Error switching clinic:', error);
      alert('Failed to switch clinic');
    } finally {
      setSwitching(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 text-gray-400 ${className}`}>
        <RefreshCw className="h-4 w-4 animate-spin" />
        {showLabel && <span className="text-sm hidden sm:inline">Loading...</span>}
      </div>
    );
  }

  // No clinics - don't render anything
  if (clinics.length === 0) {
    return null;
  }

  // Single clinic - show name without dropdown
  if (clinics.length === 1) {
    const clinic = clinics[0];
    return (
      <div className={`flex items-center gap-2 px-3 py-2 ${className}`}>
        {clinic.logoUrl ? (
          <img src={clinic.logoUrl} alt="" className="h-6 w-6 rounded object-cover" />
        ) : (
          <div 
            className="h-6 w-6 rounded flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: clinic.primaryColor || '#3B82F6' }}
          >
            {clinic.name.charAt(0).toUpperCase()}
          </div>
        )}
        {showLabel && (
          <span className="text-sm font-medium text-gray-700 hidden sm:inline truncate max-w-[120px]">
            {clinic.name}
          </span>
        )}
      </div>
    );
  }

  const activeClinic = clinics.find(c => c.id === activeClinicId) || clinics[0];

  // Multiple clinics - show dropdown
  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 bg-white"
        disabled={switching}
      >
        {switching ? (
          <RefreshCw className="h-5 w-5 animate-spin text-teal-600" />
        ) : activeClinic?.logoUrl ? (
          <img src={activeClinic.logoUrl} alt="" className="h-6 w-6 rounded object-cover" />
        ) : (
          <div 
            className="h-6 w-6 rounded flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: activeClinic?.primaryColor || '#3B82F6' }}
          >
            {activeClinic?.name.charAt(0).toUpperCase()}
          </div>
        )}
        {showLabel && (
          <span className="text-sm font-medium text-gray-700 max-w-[120px] truncate hidden sm:inline">
            {activeClinic?.name || 'Select Clinic'}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 sm:left-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="p-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Switch Clinic
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {clinics.map((clinic) => (
              <button
                key={clinic.id}
                onClick={() => switchClinic(clinic.id)}
                disabled={switching || clinic.status !== 'ACTIVE'}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${
                  clinic.id === activeClinicId ? 'bg-teal-50' : ''
                } ${clinic.status !== 'ACTIVE' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {clinic.logoUrl ? (
                  <img src={clinic.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div 
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0"
                    style={{ backgroundColor: clinic.primaryColor || '#3B82F6' }}
                  >
                    {clinic.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{clinic.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {clinic.subdomain}.eonpro.app
                    {clinic.isPrimary && (
                      <span className="ml-2 text-teal-600 font-medium">(Primary)</span>
                    )}
                  </p>
                  {clinic.role && (
                    <p className="text-xs text-gray-400 capitalize">{clinic.role.toLowerCase().replace('_', ' ')}</p>
                  )}
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  {clinic.status !== 'ACTIVE' && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {clinic.status}
                    </span>
                  )}
                  {clinic.id === activeClinicId && (
                    <Check className="h-5 w-5 text-teal-600" />
                  )}
                </div>
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

export default ClinicSwitcher;
