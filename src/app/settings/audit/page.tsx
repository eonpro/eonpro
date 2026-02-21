'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, RefreshCw, User, Calendar, Filter } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

interface AuditLog {
  id: number;
  action: string;
  tableName: string;
  recordId: string;
  userId: number;
  diff: string;
  ipAddress: string;
  createdAt: string;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('all');

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);

      const response = await apiFetch('/api/admin/audit-logs?limit=100');

      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = logs.filter((log) => {
    if (filterAction !== 'all' && !normalizedIncludes(log.action || '', filterAction)) {
      return false;
    }
    if (searchTerm) {
      return (
        normalizedIncludes(log.action || '', searchTerm) ||
        normalizedIncludes(log.tableName || '', searchTerm) ||
        normalizedIncludes(log.recordId || '', searchTerm)
      );
    }
    return true;
  });

  const getActionColor = (action: string) => {
    if (action.includes('CREATE') || action.includes('RECEIVED'))
      return 'bg-green-100 text-green-800';
    if (action.includes('UPDATE') || action.includes('MODIFIED'))
      return 'bg-blue-100 text-blue-800';
    if (action.includes('DELETE') || action.includes('REMOVED')) return 'bg-red-100 text-red-800';
    if (action.includes('LOGIN') || action.includes('AUTH')) return 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="mt-1 text-gray-500">Track all system activities and changes</p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 transition-colors hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative min-w-[200px] flex-1">
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-4 pr-4 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Actions</option>
            <option value="create">Creates</option>
            <option value="update">Updates</option>
            <option value="delete">Deletes</option>
            <option value="login">Logins</option>
            <option value="intake">Intakes</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Table
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Record ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  IP Address
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                    <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin" />
                    Loading audit logs...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                    <FileText className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                    No audit logs found
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <div>
                          <div className="text-sm text-gray-900">
                            {new Date(log.createdAt).toLocaleDateString()}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(log.createdAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getActionColor(log.action)}`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="text-sm text-gray-700">{log.tableName}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="font-mono text-sm text-gray-500">{log.recordId}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="text-sm text-gray-500">{log.ipAddress}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
