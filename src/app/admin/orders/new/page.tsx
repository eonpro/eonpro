'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumb';
import { Package, User, Pill, Truck, AlertCircle, CheckCircle } from 'lucide-react';

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  dob: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
}

interface Provider {
  id: number;
  firstName: string;
  lastName: string;
  npi: string;
  titleLine: string;
}

export default function NewOrderPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    patientId: '',
    providerId: '',
    medications: [{ name: '', strength: '', quantity: '', sig: '', refills: '0' }],
    shippingMethod: 'standard',
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

      const [patientsRes, providersRes] = await Promise.all([
        fetch('/api/patients', { headers }),
        fetch('/api/providers', { headers }),
      ]);

      if (patientsRes.ok) {
        const data = await patientsRes.json();
        setPatients(data.patients || []);
      }

      if (providersRes.ok) {
        const data = await providersRes.json();
        setProviders(data.providers || []);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const addMedication = () => {
    setForm(prev => ({
      ...prev,
      medications: [...prev.medications, { name: '', strength: '', quantity: '', sig: '', refills: '0' }],
    }));
  };

  const removeMedication = (index: number) => {
    setForm(prev => ({
      ...prev,
      medications: prev.medications.filter((_, i) => i !== index),
    }));
  };

  const updateMedication = (index: number, field: string, value: string) => {
    setForm(prev => ({
      ...prev,
      medications: prev.medications.map((med, i) => 
        i === index ? { ...med, [field]: value } : med
      ),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // Validate form
      if (!form.patientId || !form.providerId) {
        throw new Error('Please select a patient and provider');
      }

      if (form.medications.some(med => !med.name || !med.quantity)) {
        throw new Error('Please fill in all medication details');
      }

      const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
      
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          patientId: parseInt(form.patientId),
          providerId: parseInt(form.providerId),
          rxs: form.medications.map(med => ({
            medName: med.name,
            strength: med.strength,
            quantity: parseInt(med.quantity) || 0,
            sig: med.sig,
            refills: parseInt(med.refills) || 0,
          })),
          shippingMethod: form.shippingMethod,
          notes: form.notes,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create order');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/admin/orders');
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-green-800 mb-2">Order Created Successfully!</h2>
          <p className="text-green-600">Redirecting to orders list...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Breadcrumb items={[
        { label: 'Orders', href: '/admin/orders' },
        { label: 'New Order' }
      ]} />

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Package className="h-8 w-8 text-emerald-600" />
          Create New Order
        </h1>
        <p className="text-gray-600 mt-2">Create a new prescription order for a patient</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Patient Selection */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <User className="h-5 w-5 text-emerald-600" />
            Patient Information
          </h2>
          <select
            value={form.patientId}
            onChange={(e) => setForm(prev => ({ ...prev, patientId: e.target.value }))}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            required
          >
            <option value="">Select a patient...</option>
            {patients.map(patient => (
              <option key={patient.id} value={patient.id}>
                {patient.firstName} {patient.lastName} - {patient.email}
              </option>
            ))}
          </select>
        </div>

        {/* Provider Selection */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <User className="h-5 w-5 text-blue-600" />
            Prescribing Provider
          </h2>
          <select
            value={form.providerId}
            onChange={(e) => setForm(prev => ({ ...prev, providerId: e.target.value }))}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            required
          >
            <option value="">Select a provider...</option>
            {providers.map(provider => (
              <option key={provider.id} value={provider.id}>
                {provider.firstName} {provider.lastName}, {provider.titleLine} - NPI: {provider.npi}
              </option>
            ))}
          </select>
        </div>

        {/* Medications */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Pill className="h-5 w-5 text-purple-600" />
              Medications
            </h2>
            <button
              type="button"
              onClick={addMedication}
              className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors text-sm font-medium"
            >
              + Add Medication
            </button>
          </div>

          <div className="space-y-4">
            {form.medications.map((med, index) => (
              <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">Medication #{index + 1}</span>
                  {form.medications.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMedication(index)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Medication Name *"
                    value={med.name}
                    onChange={(e) => updateMedication(index, 'name', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Strength (e.g., 10mg)"
                    value={med.strength}
                    onChange={(e) => updateMedication(index, 'strength', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="number"
                    placeholder="Quantity *"
                    value={med.quantity}
                    onChange={(e) => updateMedication(index, 'quantity', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                    min="1"
                  />
                  <input
                    type="number"
                    placeholder="Refills"
                    value={med.refills}
                    onChange={(e) => updateMedication(index, 'refills', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    min="0"
                    max="12"
                  />
                  <input
                    type="text"
                    placeholder="Sig / Directions (e.g., Take 1 tablet daily)"
                    value={med.sig}
                    onChange={(e) => updateMedication(index, 'sig', e.target.value)}
                    className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Shipping */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Truck className="h-5 w-5 text-orange-600" />
            Shipping Method
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { value: 'standard', label: 'Standard', desc: '5-7 business days' },
              { value: 'express', label: 'Express', desc: '2-3 business days' },
              { value: 'overnight', label: 'Overnight', desc: 'Next business day' },
            ].map(option => (
              <label
                key={option.value}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  form.shippingMethod === option.value
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="shippingMethod"
                  value={option.value}
                  checked={form.shippingMethod === option.value}
                  onChange={(e) => setForm(prev => ({ ...prev, shippingMethod: e.target.value }))}
                  className="sr-only"
                />
                <div className="font-medium text-gray-900">{option.label}</div>
                <div className="text-sm text-gray-500">{option.desc}</div>
              </label>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Additional Notes</h2>
          <textarea
            value={form.notes}
            onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Any special instructions or notes for this order..."
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.push('/admin/orders')}
            className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`flex-1 px-6 py-3 rounded-lg font-semibold text-white transition-all ${
              submitting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-lg hover:shadow-xl'
            }`}
          >
            {submitting ? 'Creating Order...' : 'Create Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
