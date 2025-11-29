'use client';

import { useState, useEffect, useRef } from 'react';
import { logger } from '../../lib/logger';

import { useClinic } from '@/lib/clinic/context';
import { Building2, ChevronDown, Plus, Check, AlertCircle } from 'lucide-react';

interface ClinicOption {
  id: number;
  name: string;
  subdomain: string;
  logoUrl?: string | null;
  patientCount?: number;
  providerCount?: number;
  status: string;
}

export function ClinicSwitcher() {
  const { clinic, isLoading, switchClinic } = useClinic();
  const [isOpen, setIsOpen] = useState(false);
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
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
  
  const loadClinics = async () => {
    setLoadingClinics(true);
    try {
      const response = await fetch('/api/clinic/list');
      if (response.ok) {
        const data = await response.json();
        setClinics(data);
      }
    } catch (error) {
      logger.error('Error loading clinics:', error);
    } finally {
      setLoadingClinics(false);
    }
  };
  
  const handleSwitchClinic = async (clinicId: number) => {
    await switchClinic(clinicId);
    setIsOpen(false);
  };
  
  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen && clinics.length === 0) {
      loadClinics();
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg animate-pulse">
        <div className="w-8 h-8 bg-gray-200 rounded"></div>
        <div className="h-4 w-24 bg-gray-200 rounded"></div>
      </div>
    );
  }
  
  if (!clinic) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
        <AlertCircle className="w-5 h-5 text-yellow-600" />
        <span className="text-sm text-yellow-800">No clinic selected</span>
      </div>
    );
  }
  
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="flex items-center gap-3 px-4 py-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
      >
        {clinic.logoUrl ? (
          <img 
            src={clinic.logoUrl} 
            alt={clinic.name}
            className="w-8 h-8 rounded object-cover"
          />
        ) : (
          <div 
            className="w-8 h-8 rounded flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: clinic.primaryColor || '#3B82F6' }}
          >
            {clinic.name.charAt(0).toUpperCase()}
          </div>
        )}
        
        <div className="text-left">
          <p className="text-sm font-semibold text-gray-900">{clinic.name}</p>
          <p className="text-xs text-gray-500">{clinic.subdomain}.{process.env.NEXT_PUBLIC_BASE_DOMAIN || 'localhost:3001'}</p>
        </div>
        
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">
              Available Clinics
            </p>
            
            {loadingClinics ? (
              <div className="px-3 py-4 text-sm text-gray-500 text-center">
                Loading clinics...
              </div>
            ) : clinics.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 text-center">
                No clinics available
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {clinics.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleSwitchClinic(c.id)}
                    disabled={c.status !== 'ACTIVE'}
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors ${
                      c.status !== 'ACTIVE' 
                        ? 'opacity-50 cursor-not-allowed' 
                        : 'hover:bg-gray-50 cursor-pointer'
                    } ${c.id === clinic.id ? 'bg-blue-50' : ''}`}
                  >
                    {c.logoUrl ? (
                      <img 
                        src={c.logoUrl} 
                        alt={c.name}
                        className="w-10 h-10 rounded object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{c.name}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{c.patientCount || 0} patients</span>
                        <span>•</span>
                        <span>{c.providerCount || 0} providers</span>
                      </div>
                    </div>
                    
                    {c.id === clinic.id && (
                      <Check className="w-4 h-4 text-green-500" />
                    )}
                    
                    {c.status !== 'ACTIVE' && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {c.status}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="border-t p-2">
            <button
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-blue-600 flex items-center gap-2 text-sm font-medium"
              onClick={() => {
                window.location.href = '/admin/clinics/new';
                setIsOpen(false);
              }}
            >
              <Plus className="w-4 h-4" />
              Add New Clinic
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
