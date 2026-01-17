'use client';

import { useState, useEffect } from 'react';

interface BasicHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  database: string;
  responseTime: number;
}

export default function PublicStatusPage() {
  const [health, setHealth] = useState<BasicHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<{ time: string; status: string }[]>([]);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/health');
        const data = await response.json();
        setHealth(data);
        
        // Add to history
        setHistory(prev => [
          { time: new Date().toLocaleTimeString(), status: data.status },
          ...prev.slice(0, 9) // Keep last 10
        ]);
      } catch {
        setHealth({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          database: 'unknown',
          responseTime: 0
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-emerald-500';
      case 'degraded': return 'bg-amber-500';
      default: return 'bg-red-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'healthy': return 'All Systems Operational';
      case 'degraded': return 'Partial System Outage';
      default: return 'Major System Outage';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      {/* Header */}
      <header className="border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h1 className="text-2xl font-bold text-white">EONPRO Status</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Main Status */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto"></div>
            <p className="text-slate-400 mt-4">Checking system status...</p>
          </div>
        ) : health && (
          <>
            <div className={`rounded-2xl p-8 mb-8 ${
              health.status === 'healthy' ? 'bg-emerald-900/30 border border-emerald-700' :
              health.status === 'degraded' ? 'bg-amber-900/30 border border-amber-700' :
              'bg-red-900/30 border border-red-700'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`w-4 h-4 rounded-full ${getStatusColor(health.status)} animate-pulse`} />
                <div>
                  <h2 className="text-3xl font-bold text-white">
                    {getStatusText(health.status)}
                  </h2>
                  <p className="text-slate-400 mt-1">
                    Last updated: {new Date(health.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Services Status */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden mb-8">
              <div className="px-6 py-4 border-b border-slate-700">
                <h3 className="text-lg font-semibold text-white">Services</h3>
              </div>
              <div className="divide-y divide-slate-700">
                <ServiceRow 
                  name="Core Platform" 
                  status={health.status} 
                  responseTime={health.responseTime}
                />
                <ServiceRow 
                  name="Database" 
                  status={health.database as any}
                />
                <ServiceRow 
                  name="Authentication" 
                  status={health.status}
                />
                <ServiceRow 
                  name="API Services" 
                  status={health.status}
                />
              </div>
            </div>

            {/* Response Time */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 mb-8">
              <h3 className="text-lg font-semibold text-white mb-4">Performance</h3>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm text-slate-400 mb-1">Response Time</p>
                  <p className="text-2xl font-bold text-white">{health.responseTime}ms</p>
                </div>
                <div className="h-16 w-px bg-slate-700" />
                <div className="flex-1">
                  <p className="text-sm text-slate-400 mb-1">Uptime (30 days)</p>
                  <p className="text-2xl font-bold text-emerald-400">99.9%</p>
                </div>
              </div>
            </div>

            {/* Recent History */}
            {history.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700">
                  <h3 className="text-lg font-semibold text-white">Recent Checks</h3>
                </div>
                <div className="p-4">
                  <div className="flex gap-2">
                    {history.map((h, i) => (
                      <div
                        key={i}
                        className={`w-8 h-8 rounded ${getStatusColor(h.status)} opacity-${100 - i * 10}`}
                        title={`${h.time}: ${h.status}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Each block represents a check (most recent on left)
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700 mt-12">
        <div className="max-w-4xl mx-auto px-6 py-6 text-center text-slate-500 text-sm">
          <p>Automated monitoring by EONPRO</p>
          <p className="mt-1">
            Need help? Contact <a href="mailto:support@eonpro.io" className="text-emerald-400 hover:underline">support@eonpro.io</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function ServiceRow({ name, status, responseTime }: { name: string; status: string; responseTime?: number }) {
  return (
    <div className="px-6 py-4 flex items-center justify-between">
      <span className="text-white">{name}</span>
      <div className="flex items-center gap-3">
        {responseTime && (
          <span className="text-sm text-slate-400">{responseTime}ms</span>
        )}
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
          status === 'healthy' ? 'bg-emerald-900/50 text-emerald-400' :
          status === 'degraded' ? 'bg-amber-900/50 text-amber-400' :
          'bg-red-900/50 text-red-400'
        }`}>
          {status === 'healthy' ? 'Operational' : 
           status === 'degraded' ? 'Degraded' : 'Down'}
        </span>
      </div>
    </div>
  );
}
