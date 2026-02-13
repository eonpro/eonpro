'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
    setForm((prev) => ({
      ...prev,
      medications: [
        ...prev.medications,
        { name: '', strength: '', quantity: '', sig: '', refills: '0' },
      ],
    }));
  };

  const removeMedication = (index: number) => {
    setForm((prev) => ({
      ...prev,
      medications: prev.medications.filter((_, i) => i !== index),
    }));
  };

  const updateMedication = (index: number, field: string, value: string) => {
    setForm((prev) => ({
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

      if (form.medications.some((med) => !med.name || !med.quantity)) {
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
          rxs: form.medications.map((med) => ({
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
      <div className="flex items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
          <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
          <h2 className="mb-2 text-2xl font-bold text-green-800">Order Created Successfully!</h2>
          <p className="text-green-600">Redirecting to orders list...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900">
          <Package className="h-8 w-8 text-emerald-600" />
          Create New Order
        </h1>
        <p className="mt-2 text-gray-600">Create a new prescription order for a patient</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Patient Selection */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <User className="h-5 w-5 text-emerald-600" />
            Patient Information
          </h2>
          <select
            value={form.patientId}
            onChange={(e) => setForm((prev) => ({ ...prev, patientId: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            required
          >
            <option value="">Select a patient...</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.firstName} {patient.lastName} - {patient.email}
              </option>
            ))}
          </select>
        </div>

        {/* Provider Selection */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <User className="h-5 w-5 text-blue-600" />
            Prescribing Provider
          </h2>
          <select
            value={form.providerId}
            onChange={(e) => setForm((prev) => ({ ...prev, providerId: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            required
          >
            <option value="">Select a provider...</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.firstName} {provider.lastName}, {provider.titleLine} - NPI: {provider.npi}
              </option>
            ))}
          </select>
        </div>

        {/* Medications */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Pill className="h-5 w-5 text-purple-600" />
              Medications
            </h2>
            <button
              type="button"
              onClick={addMedication}
              className="rounded-lg bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-200"
            >
              + Add Medication
            </button>
          </div>

          <div className="space-y-4">
            {form.medications.map((med, index) => (
              <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Medication #{index + 1}</span>
                  {form.medications.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMedication(index)}
                      className="text-sm text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input
                    type="text"
                    placeholder="Medication Name *"
                    value={med.name}
                    onChange={(e) => updateMedication(index, 'name', e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Strength (e.g., 10mg)"
                    value={med.strength}
                    onChange={(e) => updateMedication(index, 'strength', e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="number"
                    placeholder="Quantity *"
                    value={med.quantity}
                    onChange={(e) => updateMedication(index, 'quantity', e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                    min="1"
                  />
                  <input
                    type="number"
                    placeholder="Refills"
                    value={med.refills}
                    onChange={(e) => updateMedication(index, 'refills', e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    min="0"
                    max="12"
                  />
                  <input
                    type="text"
                    placeholder="Sig / Directions (e.g., Take 1 tablet daily)"
                    value={med.sig}
                    onChange={(e) => updateMedication(index, 'sig', e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 md:col-span-2"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Shipping */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Truck className="h-5 w-5 text-orange-600" />
            Shipping Method
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { value: 'standard', label: 'Standard', desc: '5-7 business days' },
              { value: 'express', label: 'Express', desc: '2-3 business days' },
              { value: 'overnight', label: 'Overnight', desc: 'Next business day' },
            ].map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-lg border p-4 transition-all ${
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
                  onChange={(e) => setForm((prev) => ({ ...prev, shippingMethod: e.target.value }))}
                  className="sr-only"
                />
                <div className="font-medium text-gray-900">{option.label}</div>
                <div className="text-sm text-gray-500">{option.desc}</div>
              </label>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Additional Notes</h2>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Any special instructions or notes for this order..."
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.push('/admin/orders')}
            className="rounded-lg border border-gray-300 px-6 py-3 text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`flex-1 rounded-lg px-6 py-3 font-semibold text-white transition-all ${
              submitting
                ? 'cursor-not-allowed bg-gray-400'
                : 'bg-gradient-to-r from-emerald-500 to-teal-600 shadow-lg hover:from-emerald-600 hover:to-teal-700 hover:shadow-xl'
            }`}
          >
            {submitting ? 'Creating Order...' : 'Create Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
