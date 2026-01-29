'use client';

import { useState, useEffect, useMemo } from 'react';
import { logger } from '../lib/logger';
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
import { TrendingDown, TrendingUp, Scale, Target, Sparkles, Check } from 'lucide-react';

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
  variant?: 'default' | 'hims';
  accentColor?: string;
  showBMI?: boolean;
  heightInches?: number;
  onWeightSaved?: () => void;
}

const calculateBMI = (weightLbs: number, heightInches: number): number => {
  return (weightLbs / (heightInches * heightInches)) * 703;
};

const getBMICategory = (bmi: number): { label: string; color: string; bgColor: string } => {
  if (bmi < 18.5) return { label: 'Underweight', color: '#3B82F6', bgColor: '#EFF6FF' };
  if (bmi < 25) return { label: 'Healthy', color: '#10B981', bgColor: '#ECFDF5' };
  if (bmi < 30) return { label: 'Overweight', color: '#F59E0B', bgColor: '#FFFBEB' };
  return { label: 'Obese', color: '#EF4444', bgColor: '#FEF2F2' };
};

export default function WeightTracker({
  patientId,
  embedded = false,
  variant = 'hims',
  accentColor = '#d3f931',
  showBMI = true,
  heightInches = 70,
  onWeightSaved,
}: WeightTrackerProps) {
  const [currentWeight, setCurrentWeight] = useState('');
  const [weightData, setWeightData] = useState<WeightEntry[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const loadWeightData = async () => {
      if (patientId) {
        try {
          const response = await fetch(`/api/patient-progress/weight?patientId=${patientId}`);
          if (response.ok) {
            const result = await response.json();
            // Handle both array format and { data: [...] } format
            const logs = Array.isArray(result) ? result : (result.data || []);
            const formattedData = logs.map((log: any) => ({
              dateInput: log.recordedAt,
              currentWeightInput: log.weight,
              id: log.id.toString(),
            }));
            setWeightData(formattedData);
            // Cache to localStorage as backup
            localStorage.setItem(`weightData_${patientId}`, JSON.stringify(formattedData));
          } else if (response.status === 401 || response.status === 403) {
            // Auth issue - try loading from localStorage cache
            logger.warn('Auth issue loading weight data, using cache');
            const stored = localStorage.getItem(`weightData_${patientId}`);
            if (stored) {
              setWeightData(JSON.parse(stored));
            }
          }
        } catch (error) {
          logger.error('Failed to fetch weight data:', error);
          // Fallback to localStorage cache on network error
          const stored = localStorage.getItem(`weightData_${patientId}`);
          if (stored) {
            try {
              setWeightData(JSON.parse(stored));
            } catch (e) {
              logger.error('Error parsing weight data:', e);
            }
          }
        }
      } else {
        const stored = localStorage.getItem(`weightData_default`);
        if (stored) {
          try {
            setWeightData(JSON.parse(stored));
          } catch (e) {
            logger.error('Error parsing weight data:', e);
          }
        }
      }
    };
    loadWeightData();
  }, [patientId]);

  const handleWeightSubmit = async () => {
    if (!currentWeight || isNaN(Number(currentWeight))) return;

    setIsLoading(true);
    const newEntry: WeightEntry = {
      dateInput: new Date().toISOString(),
      currentWeightInput: parseFloat(currentWeight),
      id: Date.now().toString(),
    };

    try {
      if (patientId) {
        const response = await fetch('/api/patient-progress/weight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId,
            weight: parseFloat(currentWeight),
            unit: 'lbs',
            recordedAt: new Date().toISOString(),
          }),
        });

        if (response.ok) {
          const savedLog = await response.json();
          newEntry.id = savedLog.id.toString();
          setWeightData((prev) => [...prev, newEntry]);
        } else {
          throw new Error('Failed to save weight');
        }
      } else {
        const updatedData = [...weightData, newEntry];
        setWeightData(updatedData);
        localStorage.setItem(`weightData_default`, JSON.stringify(updatedData));
      }

      setCurrentWeight('');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2500);
      if (onWeightSaved) onWeightSaved();
    } catch (error) {
      logger.error('Failed to save weight:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const sortedData = useMemo(
    () =>
      [...weightData].sort(
        (a, b) => new Date(a.dateInput).getTime() - new Date(b.dateInput).getTime()
      ),
    [weightData]
  );

  const chartData = sortedData.slice(-7);
  const chartLabels = chartData.map((w) =>
    new Date(w.dateInput).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );
  const chartWeights = chartData.map((w) => w.currentWeightInput);

  const latestWeight = sortedData[sortedData.length - 1]?.currentWeightInput;
  const startingWeight = sortedData[0]?.currentWeightInput;
  const weightChange = latestWeight && startingWeight ? latestWeight - startingWeight : 0;
  const percentChange = startingWeight ? Math.abs((weightChange / startingWeight) * 100) : 0;

  const currentBMI = latestWeight ? calculateBMI(latestWeight, heightInches) : null;
  const bmiCategory = currentBMI ? getBMICategory(currentBMI) : null;

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1a1a',
        titleColor: '#fff',
        bodyColor: '#fff',
        titleFont: { family: 'system-ui', weight: 'bold', size: 13 },
        bodyFont: { family: 'system-ui', size: 14 },
        padding: 14,
        cornerRadius: 12,
        displayColors: false,
        callbacks: {
          title: (items) => items[0]?.label || '',
          label: (context) => `${context.raw} lbs`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          font: { family: 'system-ui', size: 11, weight: 500 },
          color: '#9CA3AF',
        },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        ticks: {
          font: { family: 'system-ui', size: 11, weight: 500 },
          color: '#9CA3AF',
          padding: 12,
        },
        grid: {
          color: '#F3F4F6',
          drawTicks: false,
        },
        border: { display: false },
        beginAtZero: false,
      },
    },
  };

  const data = {
    labels: chartLabels,
    datasets: [
      {
        data: chartWeights,
        borderColor: accentColor,
        pointBackgroundColor: accentColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 3,
        pointRadius: 6,
        pointHoverRadius: 10,
        fill: true,
        tension: 0.4,
        borderWidth: 3,
        backgroundColor: (context: any) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 250);
          gradient.addColorStop(0, `${accentColor}50`);
          gradient.addColorStop(0.5, `${accentColor}20`);
          gradient.addColorStop(1, `${accentColor}00`);
          return gradient;
        },
      },
    ],
  };

  if (embedded) {
    return (
      <div className="h-32 w-full">
        {chartData.length > 0 ? (
          <Line
            data={data}
            options={{
              ...chartOptions,
              scales: { x: { display: false }, y: { display: false } },
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">
            No data yet
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
      {/* Hero Header */}
      <div
        className="relative overflow-hidden px-8 pb-8 pt-10"
        style={{ background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}cc 100%)` }}
      >
        {/* Decorative elements */}
        <div
          className="absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-20"
          style={{ backgroundColor: '#000' }}
        />
        <div
          className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full opacity-10"
          style={{ backgroundColor: '#fff' }}
        />

        <div className="relative">
          <div className="mb-1 flex items-center gap-2">
            <Scale className="h-4 w-4 text-gray-700/60" />
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-700/60">
              Current Weight
            </span>
          </div>

          <div className="flex items-end justify-between">
            <div className="flex items-baseline gap-3">
              <span className="text-7xl font-semibold tracking-tight text-gray-900">
                {latestWeight || '---'}
              </span>
              <span className="mb-2 text-2xl font-medium text-gray-700/70">lbs</span>
            </div>

            {weightChange !== 0 && (
              <div
                className={`flex items-center gap-2 rounded-2xl px-5 py-3 backdrop-blur-sm ${
                  weightChange < 0 ? 'bg-emerald-500/20' : 'bg-rose-500/20'
                }`}
              >
                {weightChange < 0 ? (
                  <TrendingDown className="h-5 w-5 text-emerald-700" />
                ) : (
                  <TrendingUp className="h-5 w-5 text-rose-700" />
                )}
                <span
                  className={`text-lg font-semibold ${weightChange < 0 ? 'text-emerald-700' : 'text-rose-700'}`}
                >
                  {Math.abs(weightChange).toFixed(1)} lbs
                </span>
              </div>
            )}
          </div>

          {/* BMI Badge */}
          {showBMI && currentBMI && bmiCategory && (
            <div className="mt-6 flex items-center gap-3">
              <div className="rounded-xl bg-black/10 px-4 py-2 backdrop-blur-sm">
                <span className="text-sm font-semibold text-gray-800">BMI {currentBMI.toFixed(1)}</span>
              </div>
              <div
                className="flex items-center gap-2 rounded-xl px-4 py-2"
                style={{ backgroundColor: bmiCategory.bgColor }}
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: bmiCategory.color }}
                />
                <span className="text-sm font-semibold" style={{ color: bmiCategory.color }}>
                  {bmiCategory.label}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Weight Input Section - Mobile optimized */}
      <div className="border-b border-gray-100 p-5 sm:p-8">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-500">Log Today's Weight</span>
        </div>

        {/* Stack vertically on mobile, horizontal on larger screens */}
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <div
            className={`relative flex-1 transition-all duration-300 ${isFocused ? 'scale-[1.01]' : ''}`}
          >
            <input
              type="number"
              inputMode="decimal"
              pattern="[0-9]*"
              value={currentWeight}
              onChange={(e) => setCurrentWeight(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={(e) => e.key === 'Enter' && handleWeightSubmit()}
              placeholder="Enter weight"
              className={`w-full rounded-2xl border-2 bg-gray-50 px-5 py-4 text-xl font-semibold text-gray-900 outline-none transition-all duration-300 placeholder:font-normal placeholder:text-gray-400 sm:px-6 sm:py-5 ${
                isFocused ? 'border-gray-900 bg-white shadow-lg' : 'border-transparent'
              }`}
              style={{ fontSize: '18px' }} // Prevent iOS zoom
            />
            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-400 sm:right-6 sm:text-lg">
              lbs
            </span>
          </div>

          <button
            onClick={handleWeightSubmit}
            disabled={isLoading || !currentWeight}
            className="group relative min-h-[52px] overflow-hidden rounded-2xl px-8 py-4 font-semibold text-gray-900 transition-all duration-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:px-10 sm:py-5 sm:hover:scale-105 sm:hover:shadow-xl"
            style={{ backgroundColor: accentColor }}
          >
            <span className="absolute inset-0 translate-y-full bg-black/10 transition-transform duration-300 group-hover:translate-y-0" />
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />
                <span className="relative">Saving...</span>
              </div>
            ) : showSuccess ? (
              <div className="flex items-center justify-center gap-2">
                <Check className="h-5 w-5" />
                <span className="relative">Saved!</span>
              </div>
            ) : (
              <span className="relative">Log Weight</span>
            )}
          </button>
        </div>
      </div>

      {/* Chart Section */}
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Your Progress</h3>
            <p className="mt-1 text-sm text-gray-500">Last 7 check-ins</p>
          </div>
          {percentChange > 0 && weightChange !== 0 && (
            <div className="text-right">
              <span
                className={`text-2xl font-semibold ${weightChange < 0 ? 'text-emerald-500' : 'text-rose-500'}`}
              >
                {weightChange < 0 ? '-' : '+'}
                {percentChange.toFixed(1)}%
              </span>
              <p className="text-xs text-gray-500">since start</p>
            </div>
          )}
        </div>

        <div className="h-72">
          {chartData.length > 0 ? (
            <Line data={data} options={chartOptions} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50">
              <Scale className="mb-3 h-12 w-12 text-gray-300" />
              <p className="font-semibold text-gray-400">No data yet</p>
              <p className="mt-1 text-sm text-gray-400">Log your first weight to see progress</p>
            </div>
          )}
        </div>
      </div>

      {/* Stats Footer */}
      {sortedData.length > 1 && (
        <div className="grid grid-cols-4 divide-x divide-gray-100 border-t border-gray-100 bg-gray-50/50">
          {[
            { label: 'Starting', value: `${startingWeight}`, unit: 'lbs', color: 'text-gray-600' },
            { label: 'Current', value: `${latestWeight}`, unit: 'lbs', color: 'text-gray-900' },
            {
              label: 'Change',
              value: `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)}`,
              unit: 'lbs',
              color: weightChange < 0 ? 'text-emerald-600' : 'text-rose-600',
            },
            {
              label: 'Check-ins',
              value: `${weightData.length}`,
              unit: 'total',
              color: 'text-gray-900',
            },
          ].map((stat, i) => (
            <div key={i} className="px-6 py-5 text-center">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {stat.label}
              </p>
              <p className={`text-2xl font-semibold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-gray-400">{stat.unit}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
