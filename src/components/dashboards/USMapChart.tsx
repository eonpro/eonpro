'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from 'react-simple-maps';

// US Atlas TopoJSON - states
const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

// State code to name and centroid coordinates for labels
const STATE_META: Record<string, { name: string; coords: [number, number] }> = {
  AL: { name: 'Alabama', coords: [-86.9, 32.8] },
  AK: { name: 'Alaska', coords: [-153.5, 64.2] },
  AZ: { name: 'Arizona', coords: [-111.1, 34.0] },
  AR: { name: 'Arkansas', coords: [-91.8, 35.0] },
  CA: { name: 'California', coords: [-119.4, 36.8] },
  CO: { name: 'Colorado', coords: [-105.8, 39.1] },
  CT: { name: 'Connecticut', coords: [-72.8, 41.6] },
  DE: { name: 'Delaware', coords: [-75.5, 39.0] },
  FL: { name: 'Florida', coords: [-81.5, 27.7] },
  GA: { name: 'Georgia', coords: [-83.5, 32.7] },
  HI: { name: 'Hawaii', coords: [-155.5, 19.9] },
  ID: { name: 'Idaho', coords: [-114.7, 44.1] },
  IL: { name: 'Illinois', coords: [-89.4, 40.6] },
  IN: { name: 'Indiana', coords: [-86.1, 40.3] },
  IA: { name: 'Iowa', coords: [-93.1, 42.0] },
  KS: { name: 'Kansas', coords: [-98.5, 38.5] },
  KY: { name: 'Kentucky', coords: [-84.3, 37.8] },
  LA: { name: 'Louisiana', coords: [-91.2, 30.5] },
  ME: { name: 'Maine', coords: [-69.4, 45.3] },
  MD: { name: 'Maryland', coords: [-76.6, 39.0] },
  MA: { name: 'Massachusetts', coords: [-71.5, 42.4] },
  MI: { name: 'Michigan', coords: [-84.5, 44.3] },
  MN: { name: 'Minnesota', coords: [-94.6, 46.4] },
  MS: { name: 'Mississippi', coords: [-89.7, 32.7] },
  MO: { name: 'Missouri', coords: [-91.8, 38.5] },
  MT: { name: 'Montana', coords: [-110.4, 46.9] },
  NE: { name: 'Nebraska', coords: [-99.9, 41.5] },
  NV: { name: 'Nevada', coords: [-116.4, 38.8] },
  NH: { name: 'New Hampshire', coords: [-71.6, 43.2] },
  NJ: { name: 'New Jersey', coords: [-74.4, 40.1] },
  NM: { name: 'New Mexico', coords: [-105.9, 34.5] },
  NY: { name: 'New York', coords: [-74.2, 43.0] },
  NC: { name: 'North Carolina', coords: [-79.0, 35.5] },
  ND: { name: 'North Dakota', coords: [-101.0, 47.5] },
  OH: { name: 'Ohio', coords: [-82.9, 40.4] },
  OK: { name: 'Oklahoma', coords: [-97.1, 35.0] },
  OR: { name: 'Oregon', coords: [-120.6, 43.8] },
  PA: { name: 'Pennsylvania', coords: [-77.2, 41.2] },
  RI: { name: 'Rhode Island', coords: [-71.5, 41.7] },
  SC: { name: 'South Carolina', coords: [-81.2, 33.8] },
  SD: { name: 'South Dakota', coords: [-100.0, 44.3] },
  TN: { name: 'Tennessee', coords: [-86.6, 35.5] },
  TX: { name: 'Texas', coords: [-99.9, 31.2] },
  UT: { name: 'Utah', coords: [-111.1, 39.3] },
  VT: { name: 'Vermont', coords: [-72.6, 44.6] },
  VA: { name: 'Virginia', coords: [-79.4, 37.8] },
  WA: { name: 'Washington', coords: [-120.7, 47.7] },
  WV: { name: 'West Virginia', coords: [-80.5, 38.9] },
  WI: { name: 'Wisconsin', coords: [-89.6, 43.8] },
  WY: { name: 'Wyoming', coords: [-107.3, 43.1] },
  DC: { name: 'District of Columbia', coords: [-77.0, 38.9] },
};

// FIPS code to state abbreviation mapping
const FIPS_TO_STATE: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY',
};

interface ClinicBreakdown {
  clinicId: number;
  clinicName: string;
  color: string;
  count: number;
}

interface StateDataEntry {
  total: number;
  clinics: ClinicBreakdown[];
}

interface ClinicSummary {
  id: number;
  name: string;
  color: string;
  totalPatients: number;
}

interface USMapChartProps {
  stateData: Record<string, StateDataEntry>;
  clinics: ClinicSummary[];
  isLoading?: boolean;
}

export function USMapChart({ stateData, clinics, isLoading }: USMapChartProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const maxCount = useMemo(() => {
    return Math.max(1, ...Object.values(stateData).map((s) => s.total));
  }, [stateData]);

  const totalPatients = useMemo(() => {
    return Object.values(stateData).reduce((sum, s) => sum + s.total, 0);
  }, [stateData]);

  const statesWithData = useMemo(() => Object.keys(stateData).length, [stateData]);

  const getDominantColor = useCallback(
    (stateCode: string): string => {
      const data = stateData[stateCode];
      if (!data || data.clinics.length === 0) return '#E8E2DB';
      return data.clinics[0].color;
    },
    [stateData]
  );

  const getOpacity = useCallback(
    (stateCode: string): number => {
      const data = stateData[stateCode];
      if (!data) return 0.15;
      const ratio = data.total / maxCount;
      return 0.25 + ratio * 0.75;
    },
    [stateData, maxCount]
  );

  const handleMouseEnter = useCallback(
    (stateCode: string, event: React.MouseEvent) => {
      setHoveredState(stateCode);
      setTooltipPos({ x: event.clientX, y: event.clientY });
    },
    []
  );

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    setTooltipPos({ x: event.clientX, y: event.clientY });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredState(null);
  }, []);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="mb-4 h-6 w-64 animate-pulse rounded bg-gray-200" />
        <div className="flex h-[420px] items-center justify-center">
          <div className="h-full w-full animate-pulse rounded-xl bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Client Distribution by State
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {totalPatients.toLocaleString()} clients across {statesWithData} states
          </p>
        </div>
      </div>

      {/* Map */}
      <div className="relative px-4 pb-2">
        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{ scale: 1000 }}
          width={800}
          height={500}
          style={{ width: '100%', height: 'auto' }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const fips = geo.id;
                const stateCode = FIPS_TO_STATE[fips] ?? '';
                const data = stateData[stateCode];
                const color = getDominantColor(stateCode);
                const opacity = getOpacity(stateCode);
                const isHovered = hoveredState === stateCode;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={(e) => handleMouseEnter(stateCode, e as unknown as React.MouseEvent)}
                    onMouseMove={handleMouseMove as unknown as (event: React.MouseEvent<SVGPathElement, MouseEvent>) => void}
                    onMouseLeave={handleMouseLeave}
                    style={{
                      default: {
                        fill: data ? color : '#F0EBE3',
                        fillOpacity: data ? opacity : 0.5,
                        stroke: '#D4CEC6',
                        strokeWidth: 0.5,
                        outline: 'none',
                        transition: 'all 0.2s ease',
                      },
                      hover: {
                        fill: data ? color : '#E8E2DB',
                        fillOpacity: data ? Math.min(opacity + 0.15, 1) : 0.7,
                        stroke: '#1A1A1A',
                        strokeWidth: 1.2,
                        outline: 'none',
                        cursor: 'pointer',
                      },
                      pressed: {
                        fill: data ? color : '#E8E2DB',
                        fillOpacity: data ? opacity : 0.5,
                        stroke: '#1A1A1A',
                        strokeWidth: 1.2,
                        outline: 'none',
                      },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {/* Count markers for states with high counts */}
          {Object.entries(stateData)
            .filter(([, data]) => data.total > 0)
            .sort(([, a], [, b]) => b.total - a.total)
            .slice(0, 15)
            .map(([stateCode, data]) => {
              const meta = STATE_META[stateCode];
              if (!meta) return null;
              const size = Math.max(12, Math.min(28, 12 + (data.total / maxCount) * 16));
              return (
                <Marker key={stateCode} coordinates={meta.coords}>
                  <circle
                    r={size / 2}
                    fill="#1A1A1A"
                    fillOpacity={0.85}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                  <text
                    textAnchor="middle"
                    y={1}
                    dominantBaseline="central"
                    style={{
                      fontSize: size > 20 ? '8px' : '7px',
                      fontFamily: 'system-ui, sans-serif',
                      fontWeight: 600,
                      fill: '#fff',
                    }}
                  >
                    {data.total > 999 ? `${Math.round(data.total / 1000)}k` : data.total}
                  </text>
                </Marker>
              );
            })}
        </ComposableMap>

        {/* Tooltip */}
        {hoveredState && stateData[hoveredState] && (
          <div
            className="pointer-events-none fixed z-50 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg"
            style={{
              left: tooltipPos.x + 12,
              top: tooltipPos.y - 10,
              transform: 'translateY(-100%)',
            }}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                {STATE_META[hoveredState]?.name ?? hoveredState}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {hoveredState}
              </span>
            </div>
            <p className="mb-2 text-xs text-gray-500">
              {stateData[hoveredState].total.toLocaleString()} total clients
            </p>
            <div className="space-y-1">
              {stateData[hoveredState].clinics.map((clinic) => (
                <div key={clinic.clinicId} className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: clinic.color }}
                  />
                  <span className="text-xs text-gray-700">{clinic.clinicName}</span>
                  <span className="ml-auto text-xs font-semibold text-gray-900">
                    {clinic.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="border-t border-gray-100 px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          {clinics.map((clinic) => (
            <div key={clinic.id} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: clinic.color }}
              />
              <span className="text-xs font-medium text-gray-700">
                {clinic.name}
              </span>
              <span className="text-xs text-gray-400">
                ({clinic.totalPatients.toLocaleString()})
              </span>
            </div>
          ))}
          {clinics.length === 0 && (
            <span className="text-xs text-gray-400">No clinic data available</span>
          )}
        </div>
      </div>
    </div>
  );
}
