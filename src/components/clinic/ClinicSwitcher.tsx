'use client';

import { useState, useEffect, useRef } from 'react';
import { Building2, ChevronDown, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { isBrowser, getLocalStorageItem, setLocalStorageItem } from '@/lib/utils/ssr-safe';

interface ClinicOption {
  id: number;
  name: string;
  subdomain: string;
  customDomain?: string;
  logoUrl?: string | null;
  iconUrl?: string | null;
  faviconUrl?: string | null;
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
    if (!isBrowser) return null;
    return (
      getLocalStorageItem('auth-token') ||
      getLocalStorageItem('admin-token') ||
      getLocalStorageItem('provider-token') ||
      getLocalStorageItem('super_admin-token') ||
      getLocalStorageItem('SUPER_ADMIN-token')
    );
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
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setClinics(data.clinics || []);
        setActiveClinicId(data.activeClinicId);
        setError(null);

        // Store active clinic in localStorage for other components
        if (data.activeClinicId) {
          setLocalStorageItem('activeClinicId', data.activeClinicId.toString());
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
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ clinicId }),
      });

      if (response.ok) {
        const data = await response.json();
        setActiveClinicId(clinicId);
        setLocalStorageItem('activeClinicId', clinicId.toString());
        setIsOpen(false);

        // Refresh the page to load new clinic data (with SSR guard)
        if (isBrowser) {
          window.location.reload();
        }
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
        {showLabel && <span className="hidden text-sm sm:inline">Loading...</span>}
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
        {/* Use iconUrl or faviconUrl for smaller icon display, fallback to logoUrl */}
        {clinic.iconUrl || clinic.faviconUrl || clinic.logoUrl ? (
          <img
            src={clinic.iconUrl || clinic.faviconUrl || clinic.logoUrl || ''}
            alt=""
            className="h-6 w-6 rounded object-contain"
          />
        ) : (
          <div
            className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-white"
            style={{ backgroundColor: clinic.primaryColor || '#3B82F6' }}
          >
            {clinic.name.charAt(0).toUpperCase()}
          </div>
        )}
        {showLabel && (
          <span className="hidden max-w-[120px] truncate text-sm font-medium text-gray-700 sm:inline">
            {clinic.name}
          </span>
        )}
      </div>
    );
  }

  const activeClinic = clinics.find((c) => c.id === activeClinicId) || clinics[0];

  // Multiple clinics - show dropdown
  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors hover:bg-gray-100"
        disabled={switching}
      >
        {switching ? (
          <RefreshCw className="h-5 w-5 animate-spin text-teal-600" />
        ) : activeClinic?.iconUrl || activeClinic?.faviconUrl || activeClinic?.logoUrl ? (
          <img
            src={activeClinic.iconUrl || activeClinic.faviconUrl || activeClinic.logoUrl || ''}
            alt=""
            className="h-6 w-6 rounded object-contain"
          />
        ) : (
          <div
            className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-white"
            style={{ backgroundColor: activeClinic?.primaryColor || '#3B82F6' }}
          >
            {activeClinic?.name.charAt(0).toUpperCase()}
          </div>
        )}
        {showLabel && (
          <span className="hidden max-w-[120px] truncate text-sm font-medium text-gray-700 sm:inline">
            {activeClinic?.name || 'Select Clinic'}
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg sm:left-0">
          <div className="border-b border-gray-100 bg-gray-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Switch Clinic
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {clinics.map((clinic) => (
              <button
                key={clinic.id}
                onClick={() => switchClinic(clinic.id)}
                disabled={switching || clinic.status !== 'ACTIVE'}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                  clinic.id === activeClinicId ? 'bg-teal-50' : ''
                } ${clinic.status !== 'ACTIVE' ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                {/* Use iconUrl or faviconUrl for smaller icon display, fallback to logoUrl */}
                {clinic.iconUrl || clinic.faviconUrl || clinic.logoUrl ? (
                  <img
                    src={clinic.iconUrl || clinic.faviconUrl || clinic.logoUrl || ''}
                    alt=""
                    className="h-10 w-10 flex-shrink-0 rounded-lg object-contain"
                  />
                ) : (
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg font-bold text-white"
                    style={{ backgroundColor: clinic.primaryColor || '#3B82F6' }}
                  >
                    {clinic.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{clinic.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {clinic.subdomain}.eonpro.io
                    {clinic.isPrimary && (
                      <span className="ml-2 font-medium text-teal-600">(Primary)</span>
                    )}
                  </p>
                  {clinic.role && (
                    <p className="text-xs capitalize text-gray-400">
                      {clinic.role.toLowerCase().replace('_', ' ')}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {clinic.status !== 'ACTIVE' && (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {clinic.status}
                    </span>
                  )}
                  {clinic.id === activeClinicId && <Check className="h-5 w-5 text-teal-600" />}
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-gray-100 bg-gray-50 p-3">
            <p className="text-center text-xs text-gray-500">
              {clinics.length} clinic{clinics.length !== 1 ? 's' : ''} available
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClinicSwitcher;
