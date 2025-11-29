"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Activity, CheckCircle, AlertCircle, Clock, TrendingUp, ExternalLink } from "lucide-react";
import { logger } from '@/lib/logger';

interface WebhookStatsData {
  total: number;
  successful: number;
  failed: number;
  invalidAuth: number;
  invalidPayload: number;
  successRate: number;
  avgProcessingTimeMs: number;
  recentLogs: Array<{
    id: number;
    endpoint: string;
    status: string;
    statusCode: number;
    errorMessage?: string;
    createdAt: string;
    processingTimeMs?: number;
  }>;
}

export default function WebhookStats() {
  const [stats, setStats] = useState<WebhookStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/webhooks/heyflow-intake-v2");
        if (!res.ok) {
          throw new Error("Failed to fetch webhook stats");
        }
        const data = await res.json();
        setStats(data.stats);
      } catch (err: any) {
    // @ts-ignore
   
        logger.error("Failed to fetch webhook stats:", err);
        setError("Failed to load webhook statistics");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i: any) => (
              <div key={i} className="h-20 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Webhook Activity</h3>
          <Link 
            href="/webhooks/monitor" 
            className="text-sm text-[#4fa77e] hover:underline flex items-center gap-1"
          >
            View Monitor
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <div className="text-center text-gray-500 py-8">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
          <p>{error || "No webhook data available"}</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return "text-green-600 bg-green-100";
      case "INVALID_AUTH":
        return "text-yellow-600 bg-yellow-100";
      case "INVALID_PAYLOAD":
        return "text-orange-600 bg-orange-100";
      case "ERROR":
      case "PROCESSING_ERROR":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-[#4fa77e]" />
          <h3 className="text-lg font-semibold">Webhook Activity</h3>
          <span className="text-xs text-gray-500">(Last 7 days)</span>
        </div>
        <Link 
          href="/webhooks/monitor" 
          className="text-sm text-[#4fa77e] hover:underline flex items-center gap-1"
        >
          Open Monitor
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <Activity className="h-8 w-8 text-gray-400" />
          </div>
        </div>

        <div className="bg-green-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600">Success</p>
              <p className="text-2xl font-bold text-green-600">{stats.successful}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-400" />
          </div>
        </div>

        <div className="bg-red-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600">Failed</p>
              <p className="text-2xl font-bold text-red-600">
                {stats.failed + stats.invalidAuth + stats.invalidPayload}
              </p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-400" />
          </div>
        </div>

        <div className="bg-blue-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600">Success Rate</p>
              <p className="text-2xl font-bold text-blue-600">{stats.successRate.toFixed(0)}%</p>
            </div>
            <TrendingUp className="h-8 w-8 text-blue-400" />
          </div>
        </div>

        <div className="bg-purple-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600">Avg Time</p>
              <p className="text-2xl font-bold text-purple-600">
                {formatTime(stats.avgProcessingTimeMs)}
              </p>
            </div>
            <Clock className="h-8 w-8 text-purple-400" />
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      {stats.recentLogs && stats.recentLogs.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Recent Webhooks</h4>
          <div className="space-y-2">
            {stats.recentLogs.slice(0, 5).map((log: any) => (
              <div key={log.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(log.status)}`}>
                    {log.status}
                  </span>
                  <span className="text-sm text-gray-600">
                    {log.endpoint.replace("/api/webhooks/", "")}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  {log.processingTimeMs && (
                    <span>{formatTime(log.processingTimeMs)}</span>
                  )}
                  <span>{formatDate(log.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
          
          {stats.total > 5 && (
            <Link 
              href="/webhooks/monitor" 
              className="block text-center text-sm text-[#4fa77e] hover:underline mt-3"
            >
              View all {stats.total} webhooks →
            </Link>
          )}
        </div>
      )}

      {/* Alert for failures */}
      {stats.total > 0 && stats.successRate < 80 && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-yellow-800">
            <AlertCircle className="h-4 w-4" />
            <span>
              Success rate is below 80%. Check the{" "}
              <Link href="/webhooks/monitor" className="underline font-medium">
                webhook monitor
              </Link>{" "}
              for details.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
