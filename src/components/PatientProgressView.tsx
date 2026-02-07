'use client';

import { useState, useEffect } from 'react';
import { logger } from '../lib/logger';
import { getAuthHeaders } from '@/lib/utils/auth-token';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
} from 'chart.js';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, Activity, Calendar, FileText, Play, Plus, Scale, Check, X } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface PatientProgressViewProps {
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    orders?: any[];
  };
}

export default function PatientProgressView({ patient }: PatientProgressViewProps) {
  const [weightData, setWeightData] = useState<any[]>([]);
  const [medicationReminders, setMedicationReminders] = useState<any[]>([]);
  const [hasActiveTreatment, setHasActiveTreatment] = useState(false);

  // Weight entry form state
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [weightDate, setWeightDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [weightNotes, setWeightNotes] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Check if patient has active treatment (has tracking number on any order)
  useEffect(() => {
    const hasTracking = patient.orders?.some((order: any) =>
      order.events?.some((event: any) => event.type === 'TRACKING_UPDATED' || event.tracking)
    );
    setHasActiveTreatment(hasTracking || false);
  }, [patient.orders]);

  // Fetch weight data from API (same source as patient portal)
  const fetchWeightData = async () => {
    if (patient.id) {
      try {
        const response = await fetch(
          `/api/patient-progress/weight?patientId=${patient.id}&limit=100`,
          { headers: getAuthHeaders(), credentials: 'include' }
        );
        if (response.ok) {
          const result = await response.json();
          // API returns { data: [...], meta: {...} }
          const logs = result.data || result || [];
          const formattedData = (Array.isArray(logs) ? logs : []).map((log: any) => ({
            date: new Date(log.recordedAt),
            weight: log.weight,
            id: log.id,
            notes: log.notes,
            source: log.source,
          }));
          setWeightData(formattedData);
          // If patient has weight data, consider them having active treatment
          if (formattedData.length > 0) {
            setHasActiveTreatment(true);
          }
        }
      } catch (error) {
        logger.error('Failed to fetch weight data:', error);
      }
    }
  };

  // Fetch weight data on mount
  useEffect(() => {
    fetchWeightData();
  }, [patient.id]);

  // Handle adding new weight entry
  const handleAddWeight = async () => {
    if (!newWeight || isNaN(parseFloat(newWeight))) return;

    setSavingWeight(true);
    try {
      const response = await fetch('/api/patient-progress/weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          patientId: patient.id,
          weight: parseFloat(newWeight),
          unit: 'lbs',
          notes: weightNotes || `Entered by provider`,
          recordedAt: new Date(weightDate).toISOString(),
        }),
      });

      if (response.ok) {
        // Refresh weight data
        await fetchWeightData();
        // Reset form
        setNewWeight('');
        setWeightNotes('');
        setWeightDate(format(new Date(), 'yyyy-MM-dd'));
        setShowWeightForm(false);
        // Show success briefly
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const error = await response.json();
        logger.error('Failed to save weight:', error);
        alert('Failed to save weight. Please try again.');
      }
    } catch (error) {
      logger.error('Failed to save weight:', error);
      alert('Failed to save weight. Please try again.');
    } finally {
      setSavingWeight(false);
    }
  };

  // Fetch medication reminders from API
  useEffect(() => {
    const fetchReminders = async () => {
      if (patient.id) {
        try {
          const response = await fetch(
            `/api/patient-progress/medication-reminders?patientId=${patient.id}`,
            { headers: getAuthHeaders(), credentials: 'include' }
          );
          if (response.ok) {
            const result = await response.json();
            // API returns { data: [...], meta: {...} }
            setMedicationReminders(result.data || result || []);
          }
        } catch (error) {
          logger.error('Failed to fetch medication reminders:', error);
        }
      }
    };

    fetchReminders();
  }, [patient.id]);

  const calculateProgress = () => {
    if (weightData.length < 2) return null;
    const initial = weightData[0].weight;
    const current = weightData[weightData.length - 1].weight;
    const change = current - initial;
    const percentage = ((Math.abs(change) / initial) * 100).toFixed(1);
    return { change, percentage, trend: change < 0 ? 'down' : 'up' };
  };

  const progress = calculateProgress();

  if (!hasActiveTreatment) {
    return (
      <div className="py-12 text-center">
        <Activity className="mx-auto mb-4 h-16 w-16 text-gray-400" />
        <h3 className="mb-2 text-lg font-semibold text-gray-700">No Active Treatment</h3>
        <p className="mx-auto max-w-md text-gray-500">
          Progress tracking will be available once the patient starts their treatment and receives
          their medication.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Overview Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-600">Current Weight</h3>
            {progress?.trend === 'down' ? (
              <TrendingDown className="h-5 w-5 text-green-500" />
            ) : (
              <TrendingUp className="h-5 w-5 text-yellow-500" />
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {weightData[weightData.length - 1]?.weight || '--'} lbs
          </p>
          {progress && (
            <p
              className={`mt-1 text-sm ${progress.change < 0 ? 'text-green-600' : 'text-yellow-600'}`}
            >
              {progress.change > 0 ? '+' : ''}
              {progress.change} lbs ({progress.percentage}%)
            </p>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-600">Treatment Start</h3>
            <Calendar className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {format(new Date(2024, 5, 18), 'MMM d, yyyy')}
          </p>
          <p className="mt-1 text-sm text-gray-500">Week 12 of treatment</p>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-600">Activity Tracking</h3>
            <Activity className="h-5 w-5 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {weightData.length + medicationReminders.length}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {weightData.length} weight logs, {medicationReminders.length} reminders
          </p>
        </div>
      </div>

      {/* Weight Tracker Widget - entire container #faffac */}
      <div
        className="rounded-xl border border-green-200 p-6"
        style={{ backgroundColor: '#faffac' }}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Weight Tracker</h2>
            <p className="mt-1 text-sm text-gray-600">Track patient's weight loss journey</p>
          </div>
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="flex items-center gap-1 rounded-full bg-green-500 px-3 py-1 text-xs text-white">
                <Check className="h-3 w-3" /> Saved!
              </span>
            )}
            <span className="rounded-full px-3 py-1 text-xs text-green-800" style={{ backgroundColor: 'rgba(255,255,255,0.6)' }}>
              {weightData.length} entries
            </span>
            <button
              onClick={() => setShowWeightForm(!showWeightForm)}
              className="flex items-center gap-1 rounded-full bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
            >
              <Plus className="h-3 w-3" />
              Add Weight
            </button>
          </div>
        </div>

        {/* Add Weight Form */}
        {showWeightForm && (
          <div className="mb-6 rounded-lg border border-green-300 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-medium text-gray-900">
                <Scale className="h-4 w-4" />
                Add Weight Entry
              </h3>
              <button
                onClick={() => setShowWeightForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Weight (lbs)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={newWeight}
                  onChange={(e) => setNewWeight(e.target.value)}
                  placeholder="e.g., 185.5"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Date
                </label>
                <input
                  type="date"
                  value={weightDate}
                  onChange={(e) => setWeightDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={weightNotes}
                  onChange={(e) => setWeightNotes(e.target.value)}
                  placeholder="e.g., Weekly check-in"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setShowWeightForm(false)}
                className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAddWeight}
                disabled={!newWeight || savingWeight}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingWeight ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Save Weight
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              This weight entry will appear in the patient's portal dashboard.
            </p>
          </div>
        )}

        {/* Chart Container - transparent chart on #faffac background */}
        <div
          className="relative h-64 overflow-hidden rounded-lg border border-gray-100 p-4 shadow-sm"
          style={{ backgroundColor: '#faffac' }}
        >
          {weightData.length > 0 ? (
            <div className="h-full w-full [&_canvas]:!bg-transparent">
              <Line
                data={{
                  labels: weightData.map((d) => format(d.date, 'M/d')),
                  datasets: [
                    {
                      data: weightData.map((d) => d.weight),
                      borderColor: '#16a34a',
                      pointBackgroundColor: '#16a34a',
                      pointBorderColor: '#fff',
                      pointBorderWidth: 2,
                      pointRadius: 6,
                      fill: true,
                      tension: 0.4,
                      backgroundColor: 'rgba(22, 163, 74, 0.15)',
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  layout: { padding: 0 },
                  plugins: {
                    legend: { display: false },
                    tooltip: { backgroundColor: 'rgba(255,255,255,0.95)' },
                  },
                  scales: {
                    x: {
                      title: { display: true, text: 'Date', color: '#374151' },
                      ticks: { color: '#374151' },
                      grid: { color: 'rgba(0,0,0,0.06)' },
                    },
                    y: {
                      title: { display: true, text: 'Weight (lbs)', color: '#374151' },
                      ticks: { color: '#374151' },
                      grid: { color: 'rgba(0,0,0,0.06)' },
                    },
                  },
                } as ChartOptions<'line'>}
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-gray-600">
              <Scale className="mb-2 h-10 w-10 text-gray-500" />
              <p className="text-sm font-medium">No weight data yet</p>
              <p className="mt-1 text-xs">Add weight above or patient can log from their portal</p>
            </div>
          )}
        </div>

        {/* Recent Entries */}
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-gray-700">Recent Weight Logs</h3>
          <div className="space-y-2">
            {weightData.length > 0 ? (
              weightData.slice(0, 5).map((entry, idx) => (
                <div
                  key={entry.id || idx}
                  className="flex items-center justify-between rounded-lg px-4 py-3"
                  style={{ backgroundColor: '#faffac' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-2 w-2 rounded-full ${idx === 0 ? 'bg-green-500' : 'bg-gray-300'}`}
                    />
                    <div>
                      <span className="text-sm font-medium">{format(entry.date, 'MMM d, yyyy')}</span>
                      {entry.notes && (
                        <p className="text-xs text-gray-500">{entry.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{entry.weight} lbs</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        entry.source === 'intake'
                          ? 'bg-purple-100 text-purple-700'
                          : entry.source === 'provider'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {entry.source === 'intake' ? 'Intake' : entry.source === 'provider' ? 'Provider' : 'Patient'}
                    </span>
                    {idx === 0 && progress && (
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          progress.change < 0
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {progress.change > 0 ? '+' : ''}
                        {progress.change}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg py-4 text-center" style={{ backgroundColor: '#faffac' }}>
                <p className="text-sm text-gray-600">No weight data logged yet</p>
                <p className="mt-1 text-xs text-gray-500">
                  Click "Add Weight" above or patient can log from their dashboard
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Medication Reminders */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Medication Reminders</h2>
          <span className="text-sm text-gray-500">Patient-Configured</span>
        </div>

        {medicationReminders.length > 0 ? (
          <div className="space-y-2">
            <p className="mb-2 text-sm text-gray-600">Active reminders from patient dashboard:</p>
            {medicationReminders.map((reminder: any) => {
              const dayNames = [
                'Sunday',
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday',
              ];
              return (
                <div
                  key={reminder.id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                >
                  <div>
                    <span className="text-sm font-medium">{reminder.medicationName}</span>
                    <span className="ml-2 text-sm text-gray-500">
                      - Every {dayNames[reminder.dayOfWeek]} at {reminder.timeOfDay}
                    </span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      reminder.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {reminder.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg bg-gray-50 py-8 text-center">
            <Calendar className="mx-auto mb-3 h-12 w-12 text-gray-400" />
            <p className="text-sm text-gray-500">No medication reminders set</p>
            <p className="mt-1 text-xs text-gray-400">
              Patient can configure reminders from their dashboard
            </p>
          </div>
        )}
      </div>

      {/* Educational Resources */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Dietary Plans */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Dietary Plans</h2>
          <div className="space-y-3">
            <a
              href="#"
              className="block rounded-lg bg-gray-50 p-3 transition-colors hover:bg-gray-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Week 1-4: Getting Started</p>
                  <p className="text-xs text-gray-500">1200-1500 calories/day</p>
                </div>
                <FileText className="h-4 w-4 text-gray-400" />
              </div>
            </a>
            <a
              href="#"
              className="block rounded-lg bg-gray-50 p-3 transition-colors hover:bg-gray-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Week 5-8: Building Habits</p>
                  <p className="text-xs text-gray-500">1400-1700 calories/day</p>
                </div>
                <FileText className="h-4 w-4 text-gray-400" />
              </div>
            </a>
          </div>
        </div>

        {/* Tutorial Videos */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Tutorial Videos</h2>
          <div className="space-y-3">
            <button className="w-full rounded-lg bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">How to Inject Semaglutide</p>
                  <p className="text-xs text-gray-500">5 min video</p>
                </div>
                <Play className="h-4 w-4 text-gray-400" />
              </div>
            </button>
            <button className="w-full rounded-lg bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Exercise Routines for Beginners</p>
                  <p className="text-xs text-gray-500">15 min video</p>
                </div>
                <Play className="h-4 w-4 text-gray-400" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
