'use client';

import { useState } from 'react';
import {
  FlaskConical,
  Download,
  Eye,
  AlertCircle,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Construction,
} from 'lucide-react';

interface LabResult {
  id: string;
  patientName: string;
  testName: string;
  orderDate: string;
  resultDate?: string;
  status: 'pending' | 'completed' | 'abnormal' | 'critical';
  provider: string;
  values?: {
    name: string;
    value: string;
    unit: string;
    reference: string;
    flag?: 'high' | 'low' | 'critical';
  }[];
}

export default function ProviderLabsPage() {
  const [selectedLab, setSelectedLab] = useState<LabResult | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // No lab results - feature coming soon
  const labResults: LabResult[] = [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'abnormal':
        return 'bg-yellow-100 text-yellow-800';
      case 'critical':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'abnormal':
        return <AlertCircle className="h-4 w-4" />;
      case 'critical':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getFlagIcon = (flag?: string) => {
    if (flag === 'high') return <TrendingUp className="h-4 w-4 text-red-500" />;
    if (flag === 'low') return <TrendingDown className="h-4 w-4 text-blue-500" />;
    if (flag === 'critical') return <AlertCircle className="h-4 w-4 text-red-600" />;
    return null;
  };

  const filteredResults = labResults.filter(
    (lab) => filterStatus === 'all' || lab.status === filterStatus
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FlaskConical className="h-6 w-6" />
            Lab Results
          </h1>
          <button
            className="cursor-not-allowed rounded-lg bg-gray-300 px-4 py-2 text-gray-500"
            disabled
          >
            Order New Lab
          </button>
        </div>

        {/* Filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border px-4 py-2 focus:ring-2 focus:ring-[var(--brand-primary)]"
        >
          <option value="all">All Results</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="abnormal">Abnormal</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-[var(--brand-primary)]">{labResults.length}</div>
          <div className="text-sm text-gray-600">Total Orders</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-gray-600">
            {labResults.filter((l) => l.status === 'pending').length}
          </div>
          <div className="text-sm text-gray-600">Pending</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-yellow-600">
            {labResults.filter((l) => l.status === 'abnormal').length}
          </div>
          <div className="text-sm text-gray-600">Abnormal</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-red-600">
            {labResults.filter((l) => l.status === 'critical').length}
          </div>
          <div className="text-sm text-gray-600">Critical</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Lab Results List */}
        <div className="col-span-2 rounded-lg bg-white shadow">
          <div className="p-6">
            {filteredResults.length === 0 ? (
              <div className="py-16 text-center">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
                  <Construction className="h-8 w-8 text-amber-600" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">
                  Lab Integration Coming Soon
                </h3>
                <p className="mx-auto max-w-md text-gray-500">
                  Lab ordering and results management is currently in development. This feature will
                  integrate with major lab providers like Quest Diagnostics and LabCorp.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredResults.map((lab) => (
                  <div
                    key={lab.id}
                    onClick={() => setSelectedLab(lab)}
                    className={`cursor-pointer rounded-lg border p-4 transition-shadow hover:shadow-md ${
                      selectedLab?.id === lab.id ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-light)]' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-medium">{lab.patientName}</span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${getStatusColor(lab.status)}`}
                          >
                            {getStatusIcon(lab.status)}
                            {lab.status}
                          </span>
                        </div>
                        <div className="text-lg font-medium text-gray-900">{lab.testName}</div>
                        <div className="mt-1 text-sm text-gray-500">
                          Ordered: {new Date(lab.orderDate).toLocaleDateString()}
                          {lab.resultDate && (
                            <span> • Result: {new Date(lab.resultDate).toLocaleDateString()}</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">Provider: {lab.provider}</div>
                      </div>
                      <div className="flex gap-2">
                        <button className="rounded p-2 text-gray-600 hover:bg-gray-100">
                          <Eye className="h-4 w-4" />
                        </button>
                        {lab.resultDate && (
                          <button className="rounded p-2 text-gray-600 hover:bg-gray-100">
                            <Download className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Selected Lab Details */}
        <div className="rounded-lg bg-white shadow">
          <div className="p-6">
            {selectedLab ? (
              <>
                <h3 className="mb-4 font-semibold">Lab Result Details</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-500">Test</label>
                    <p className="font-medium">{selectedLab.testName}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Patient</label>
                    <p className="font-medium">{selectedLab.patientName}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Status</label>
                    <p
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${getStatusColor(selectedLab.status)}`}
                    >
                      {getStatusIcon(selectedLab.status)}
                      {selectedLab.status}
                    </p>
                  </div>
                  {selectedLab.values && (
                    <div>
                      <label className="mb-2 block text-sm text-gray-500">Results</label>
                      <div className="space-y-2">
                        {selectedLab.values.map((value, idx) => (
                          <div
                            key={idx}
                            className={`rounded p-2 ${value.flag ? 'bg-yellow-50' : 'bg-gray-50'}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{value.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-bold">
                                  {value.value} {value.unit}
                                </span>
                                {getFlagIcon(value.flag)}
                              </div>
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              Reference: {value.reference}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2 pt-3">
                    <button className="w-full rounded bg-[var(--brand-primary-light)] px-3 py-2 text-[var(--brand-primary)] hover:bg-[var(--brand-primary-light)]">
                      Send to Patient
                    </button>
                    <button className="w-full rounded bg-green-100 px-3 py-2 text-green-700 hover:bg-green-200">
                      Add Note
                    </button>
                    <button className="w-full rounded bg-gray-100 px-3 py-2 text-gray-700 hover:bg-gray-200">
                      Download PDF
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-gray-500">
                <FlaskConical className="mx-auto mb-2 h-12 w-12 text-gray-300" />
                <p>Select a lab result to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
