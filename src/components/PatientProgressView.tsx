'use client';

import { useState, useEffect } from 'react';
import { logger } from '../lib/logger';

import { format } from 'date-fns';
import { TrendingUp, TrendingDown, Activity, Calendar, FileText, Play } from 'lucide-react';

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

  // Check if patient has active treatment (has tracking number on any order)
  useEffect(() => {
    const hasTracking = patient.orders?.some((order: any) =>
      order.events?.some((event: any) => event.type === 'TRACKING_UPDATED' || event.tracking)
    );
    setHasActiveTreatment(hasTracking || false);
  }, [patient.orders]);

  // Fetch weight data from API - always fetch if patient has ID
  useEffect(() => {
    const fetchWeightData = async () => {
      if (patient.id) {
        try {
          const response = await fetch(
            `/api/patient-progress/weight?patientId=${patient.id}&limit=20`
          );
          if (response.ok) {
            const result = await response.json();
            // API returns { data: [...], meta: {...} }
            const logs = result.data || result || [];
            const formattedData = (Array.isArray(logs) ? logs : []).map((log: any) => ({
              date: new Date(log.recordedAt),
              weight: log.weight,
              id: log.id,
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

    fetchWeightData();
  }, [patient.id]);

  // Fetch medication reminders from API
  useEffect(() => {
    const fetchReminders = async () => {
      if (patient.id) {
        try {
          const response = await fetch(
            `/api/patient-progress/medication-reminders?patientId=${patient.id}`
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

      {/* Weight Tracker Widget */}
      <div className="rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-green-100 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Weight Tracker</h2>
            <p className="mt-1 text-sm text-gray-600">Track your weight loss journey</p>
          </div>
          <span className="rounded-full bg-white/80 px-3 py-1 text-xs text-green-700">
            {weightData.length} entries
          </span>
        </div>

        {/* Chart Container */}
        <div className="relative h-64 overflow-hidden rounded-lg bg-black/90 p-4">
          <iframe
            srcDoc={`<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { margin: 0; background: transparent; font-family: system-ui; }
    canvas { display: block; width: 100% !important; height: 100% !important; }
  </style>
</head>
<body>
  <canvas id="weightChart"></canvas>
  <script>
    const weights = ${JSON.stringify(weightData.map((d) => d.weight))};
    const labels = ${JSON.stringify(weightData.map((d) => format(d.date, 'M/d')))};
    const ctx = document.getElementById('weightChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: weights,
          borderColor: '#d3f931',
          pointBackgroundColor: '#d3f931',
          pointRadius: 6,
          fill: true,
          tension: 0.4,
          backgroundColor: 'rgba(211, 249, 49, 0.2)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            title: { display: true, text: 'Date', color: '#fff' },
            ticks: { color: '#fff' },
            grid: { color: 'rgba(255,255,255,0.1)' }
          },
          y: {
            title: { display: true, text: 'Weight (lbs)', color: '#fff' },
            ticks: { color: '#fff' },
            grid: { color: 'rgba(255,255,255,0.1)' }
          }
        }
      }
    });
  </script>
</body>
</html>`}
            className="h-full w-full border-0"
            title="Weight Chart"
          />
        </div>

        {/* Recent Entries */}
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-gray-700">Recent Weight Logs</h3>
          <div className="space-y-2">
            {weightData.length > 0 ? (
              weightData.slice(0, 5).map((entry, idx) => (
                <div
                  key={entry.id || idx}
                  className="flex items-center justify-between rounded-lg bg-white px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-2 w-2 rounded-full ${idx === 0 ? 'bg-green-500' : 'bg-gray-300'}`}
                    />
                    <span className="text-sm font-medium">{format(entry.date, 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{entry.weight} lbs</span>
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
              <div className="rounded-lg bg-gray-50 py-4 text-center">
                <p className="text-sm text-gray-500">No weight data logged yet</p>
                <p className="mt-1 text-xs text-gray-400">
                  Patient can log weight from their dashboard
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
