"use client";

import { useState, useEffect } from "react";
import { logger } from '../lib/logger';

import { format } from "date-fns";
import { TrendingUp, TrendingDown, Activity, Calendar, FileText, Play } from "lucide-react";

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
      order.events?.some((event: any) => 
        event.type === 'TRACKING_UPDATED' || event.tracking
      )
    );
    setHasActiveTreatment(hasTracking || false);
  }, [patient.orders]);

  // Fetch weight data from API
  useEffect(() => {
    const fetchWeightData = async () => {
      if (hasActiveTreatment && patient.id) {
        try {
          const response = await fetch(`/api/patient-progress/weight?patientId=${patient.id}&limit=20`);
          if (response.ok) {
            const logs = await response.json();
            const formattedData = logs.map((log: any) => ({
              date: new Date(log.recordedAt),
              weight: log.weight,
              id: log.id
            }));
            setWeightData(formattedData);
          }
        } catch (error) {
          logger.error('Failed to fetch weight data:', error);
        }
      }
    };

    fetchWeightData();
  }, [hasActiveTreatment, patient.id]);

  // Fetch medication reminders from API
  useEffect(() => {
    const fetchReminders = async () => {
      if (patient.id) {
        try {
          const response = await fetch(`/api/patient-progress/medication-reminders?patientId=${patient.id}`);
          if (response.ok) {
            const data = await response.json();
            setMedicationReminders(data);
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
    return { change, percentage, trend: change < 0 ? "down" : "up" };
  };

  const progress = calculateProgress();

  if (!hasActiveTreatment) {
    return (
      <div className="text-center py-12">
        <Activity className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">No Active Treatment</h3>
        <p className="text-gray-500 max-w-md mx-auto">
          Progress tracking will be available once the patient starts their treatment and receives their medication.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Current Weight</h3>
            {progress?.trend === "down" ? (
              <TrendingDown className="w-5 h-5 text-green-500" />
            ) : (
              <TrendingUp className="w-5 h-5 text-yellow-500" />
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {weightData[weightData.length - 1]?.weight || "--"} lbs
          </p>
          {progress && (
            <p className={`text-sm mt-1 ${progress.change < 0 ? "text-green-600" : "text-yellow-600"}`}>
              {progress.change > 0 ? "+" : ""}{progress.change} lbs ({progress.percentage}%)
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Treatment Start</h3>
            <Calendar className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {format(new Date(2024, 5, 18), "MMM d, yyyy")}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Week 12 of treatment
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Activity Tracking</h3>
            <Activity className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{weightData.length + medicationReminders.length}</p>
          <p className="text-sm text-gray-500 mt-1">
            {weightData.length} weight logs, {medicationReminders.length} reminders
          </p>
        </div>
      </div>

      {/* Weight Tracker Widget */}
      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Weight Tracker</h2>
            <p className="text-sm text-gray-600 mt-1">Track your weight loss journey</p>
          </div>
          <span className="text-xs text-green-700 bg-white/80 px-3 py-1 rounded-full">
            {weightData.length} entries
          </span>
        </div>

        {/* Chart Container */}
        <div className="bg-black/90 rounded-lg p-4 h-64 relative overflow-hidden">
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
    const weights = ${JSON.stringify(weightData.map(d => d.weight))};
    const labels = ${JSON.stringify(weightData.map(d => format(d.date, 'M/d')))};
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
            className="w-full h-full border-0"
            title="Weight Chart"
          />
        </div>

        {/* Recent Entries */}
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Weight Logs</h3>
          <div className="space-y-2">
            {weightData.length > 0 ? (
              weightData.slice(0, 5).map((entry, idx) => (
                <div key={entry.id || idx} className="flex items-center justify-between bg-white rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${idx === 0 ? "bg-green-500" : "bg-gray-300"}`} />
                    <span className="text-sm font-medium">{format(entry.date, "MMM d, yyyy")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{entry.weight} lbs</span>
                    {idx === 0 && progress && (
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        progress.change < 0 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {progress.change > 0 ? "+" : ""}{progress.change}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">No weight data logged yet</p>
                <p className="text-xs text-gray-400 mt-1">Patient can log weight from their dashboard</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Medication Reminders */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Medication Reminders</h2>
          <span className="text-sm text-gray-500">Patient-Configured</span>
        </div>
        
        {medicationReminders.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 mb-2">Active reminders from patient dashboard:</p>
            {medicationReminders.map((reminder: any) => {
              const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
              return (
                <div key={reminder.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium">{reminder.medicationName}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      - Every {dayNames[reminder.dayOfWeek]} at {reminder.timeOfDay}
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    reminder.isActive 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {reminder.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No medication reminders set</p>
            <p className="text-xs text-gray-400 mt-1">
              Patient can configure reminders from their dashboard
            </p>
          </div>
        )}
      </div>

      {/* Educational Resources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Dietary Plans */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Dietary Plans</h2>
          <div className="space-y-3">
            <a href="#" className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Week 1-4: Getting Started</p>
                  <p className="text-xs text-gray-500">1200-1500 calories/day</p>
                </div>
                <FileText className="w-4 h-4 text-gray-400" />
              </div>
            </a>
            <a href="#" className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Week 5-8: Building Habits</p>
                  <p className="text-xs text-gray-500">1400-1700 calories/day</p>
                </div>
                <FileText className="w-4 h-4 text-gray-400" />
              </div>
            </a>
          </div>
        </div>

        {/* Tutorial Videos */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Tutorial Videos</h2>
          <div className="space-y-3">
            <button className="w-full p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">How to Inject Semaglutide</p>
                  <p className="text-xs text-gray-500">5 min video</p>
                </div>
                <Play className="w-4 h-4 text-gray-400" />
              </div>
            </button>
            <button className="w-full p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Exercise Routines for Beginners</p>
                  <p className="text-xs text-gray-500">15 min video</p>
                </div>
                <Play className="w-4 h-4 text-gray-400" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
