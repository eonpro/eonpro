"use client";

import { useState, useEffect, useRef } from "react";
import { logger } from '../lib/logger';

import { Line } from "react-chartjs-2";
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
} from "chart.js";

// Register Chart.js components
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

interface WeightEntry {
  dateInput: string;
  currentWeightInput: number;
  id?: string;
}

interface WeightTrackerProps {
  patientId?: number;
  embedded?: boolean;
}

export default function WeightTracker({ patientId, embedded = false }: WeightTrackerProps) {
  const [currentWeight, setCurrentWeight] = useState("");
  const [weightData, setWeightData] = useState<WeightEntry[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Load weight data from API or localStorage
    const loadWeightData = async () => {
      if (patientId) {
        // Fetch from API for logged-in patients
        try {
          const response = await fetch(`/api/patient-progress/weight?patientId=${patientId}`);
          if (response.ok) {
            const logs = await response.json();
            const formattedData = logs.map((log: any) => ({
              dateInput: log.recordedAt,
              currentWeightInput: log.weight,
              id: log.id.toString()
            }));
            setWeightData(formattedData);
          }
        } catch (error) {
          logger.error('Failed to fetch weight data:', error);
          // Fallback to localStorage
          const stored = localStorage.getItem(`weightData_${patientId}`);
          if (stored) {
            try {
              const data = JSON.parse(stored);
              setWeightData(data);
            } catch (e) {
              logger.error('Error parsing weight data:', e);
            }
          }
        }
      } else {
        // Guest users - use localStorage
        const stored = localStorage.getItem(`weightData_default`);
        if (stored) {
          try {
            const data = JSON.parse(stored);
            setWeightData(data);
          } catch (e) {
            logger.error('Error parsing weight data:', e);
          }
        }
      }
    };

    loadWeightData();
  }, [patientId]);

  const handleWeightSubmit = async () => {
    if (!currentWeight || isNaN(Number(currentWeight))) {
      alert('Please enter a valid weight');
      return;
    }

    setIsLoading(true);
    const newEntry: WeightEntry = {
      dateInput: new Date().toISOString(),
      currentWeightInput: parseFloat(currentWeight),
      id: Date.now().toString(),
    };

    try {
      if (patientId) {
        // Save to API for logged-in patients
        const response = await fetch('/api/patient-progress/weight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId,
            weight: parseFloat(currentWeight),
            unit: 'lbs',
            recordedAt: new Date().toISOString()
          })
        });

        if (response.ok) {
          const savedLog = await response.json();
          newEntry.id = savedLog.id.toString();
          const updatedData = [...weightData, newEntry];
          setWeightData(updatedData);
        } else {
          throw new Error('Failed to save weight');
        }
      } else {
        // Guest users - save to localStorage only
        const updatedData = [...weightData, newEntry];
        setWeightData(updatedData);
        localStorage.setItem(`weightData_default`, JSON.stringify(updatedData));
      }

      // Reset input and show success
      setCurrentWeight("");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (error) {
      logger.error('Failed to save weight:', error);
      alert('Failed to save weight. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Get last 4 weight entries for chart
  const chartData = weightData
    .sort((a, b) => new Date(a.dateInput).getTime() - new Date(b.dateInput).getTime())
    .slice(-4);

  const chartLabels = chartData.map(w => 
    new Date(w.dateInput).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );
  const chartWeights = chartData.map(w => w.currentWeightInput);

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#ffffff',
        titleColor: '#000',
        bodyColor: '#000',
        titleFont: { family: 'inherit', weight: 'bold' },
        bodyFont: { family: 'inherit' },
        callbacks: {
          label: (context) => `${context.raw} lbs`
        }
      }
    },
    scales: {
      x: {
        title: {
          display: !embedded,
          text: 'Date',
          font: { family: 'inherit', size: embedded ? 10 : 11 },
          color: 'rgba(255, 255, 255, 0.85)'
        },
        ticks: {
          font: { family: 'inherit', size: embedded ? 10 : 11 },
          color: 'rgba(255, 255, 255, 0.85)'
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      },
      y: {
        title: {
          display: !embedded,
          text: 'Weight (lbs)',
          font: { family: 'inherit', size: embedded ? 10 : 11 },
          color: 'rgba(255, 255, 255, 0.85)'
        },
        ticks: {
          font: { family: 'inherit', size: embedded ? 10 : 11 },
          color: 'rgba(255, 255, 255, 0.85)'
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        beginAtZero: false
      }
    }
  };

  const data = {
    labels: chartLabels,
    datasets: [{
      data: chartWeights,
      borderColor: '#fbbf24',
      pointBackgroundColor: '#fbbf24',
      pointBorderColor: '#fbbf24',
      pointRadius: 5,
      pointHoverRadius: 6,
      fill: true,
      tension: 0.4,
      backgroundColor: 'rgba(251, 191, 36, 0.2)',
    }]
  };

  if (embedded) {
    // Simple embedded chart view for the patient portal widget
    return (
      <div className="w-full h-32">
        {chartData.length > 0 ? (
          <Line data={data} options={chartOptions} />
        ) : (
          <div className="h-full flex items-center justify-center text-white/50 text-xs">
            No data yet - start tracking!
          </div>
        )}
      </div>
    );
  }

  // Full standalone component
  return (
    <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-6 text-white shadow-xl">
      <h2 className="text-xl font-bold mb-2">Track Your Progress</h2>
      <p className="text-purple-100 text-sm mb-4">
        {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
      
      <div className="flex items-center gap-3 mb-4">
        <input
          type="number"
          value={currentWeight}
          onChange={(e) => setCurrentWeight(e.target.value)}
          placeholder="0"
          className="flex-1 bg-white/20 border border-white/30 rounded-lg px-4 py-3 text-center text-2xl font-bold placeholder-white/50 text-white focus:outline-none focus:ring-2 focus:ring-white/50"
        />
        <span className="text-2xl font-bold">lbs</span>
      </div>

      <button
        onClick={handleWeightSubmit}
        disabled={isLoading}
        className="w-full py-3 bg-white text-purple-600 hover:bg-white/90 rounded-full font-semibold transition-all hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Saving...' : 'Save Progress'}
      </button>

      {/* Success Message */}
      {showSuccess && (
        <div className="mt-3 text-center text-yellow-200 text-sm font-medium animate-pulse">
          Weight saved successfully! ✓
        </div>
      )}

      {/* Mini Chart */}
      <div className="mt-6 h-32 bg-white/10 backdrop-blur rounded-xl p-3">
        <div className="text-xs text-white/90 mb-1 font-medium">Your Progress</div>
        {chartData.length > 0 ? (
          <div className="h-24">
            <Line data={data} options={chartOptions} />
          </div>
        ) : (
          <div className="h-24 flex items-center justify-center text-white/60 text-sm">
            Start tracking to see your progress
          </div>
        )}
      </div>

      {/* Stats Summary */}
      {chartData.length > 1 && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="bg-white/10 backdrop-blur rounded-lg p-3">
            <div className="text-xs text-white/70 font-medium">Starting</div>
            <div className="font-bold text-white">{chartData[0].currentWeightInput} lbs</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-lg p-3">
            <div className="text-xs text-white/70 font-medium">Current</div>
            <div className="font-bold text-yellow-300">{chartData[chartData.length - 1].currentWeightInput} lbs</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-lg p-3">
            <div className="text-xs text-white/70 font-medium">Progress</div>
            <div className="font-bold text-yellow-300">
              {(chartData[chartData.length - 1].currentWeightInput - chartData[0].currentWeightInput).toFixed(1)} lbs
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-lg p-3">
            <div className="text-xs text-white/70 font-medium">Check-ins</div>
            <div className="font-bold text-white">{weightData.length}</div>
          </div>
        </div>
      )}
    </div>
  );
}
