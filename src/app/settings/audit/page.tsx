'use client';

import { useState, useEffect } from 'react';
import { FileText, Search, Filter, Download, RefreshCw, User, Calendar } from 'lucide-react';

interface AuditLog {
  id: number;
  action: string;
  tableName: string;
  recordId: number;
  userId: number;
  diff: string;
  ipAddress: string;
  createdAt: string;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth-token') || 
                    localStorage.getItem('admin-token') ||
                    localStorage.getItem('token');
      const response = await fetch('/api/audit-logs?limit=100', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes('CREATE') || action.includes('RECEIVED')) return 'bg-green-100 text-green-800';
    if (action.includes('UPDATE')) return 'bg-blue-100 text-blue-800';
    if (action.includes('DELETE')) return 'bg-red-100 text-red-800';
    if (action.includes('LOGIN')) return 'bg-purple-100 text-purple-800';
    if (action.includes('ERROR') || action.includes('FAILED')) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  const filteredLogs = logs.filter(log => {
    if (searchTerm && !log.action.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !log.tableName.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (actionFilter !== 'all' && !log.action.toLowerCase().includes(actionFilter)) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-500 mt-1">Track all system activity for compliance</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg"
        >
          <option value="all">All Actions</option>
          <option value="login">Login Events</option>
          <option value="create">Create Events</option>
          <option value="update">Update Events</option>
          <option value="delete">Delete Events</option>
          <option value="intake">Intake Events</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Timestamp</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Action</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Table</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">User</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading audit logs...
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  No audit logs found
                </td>
              </tr>
            ) : (
              filteredLogs.slice(0, 50).map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{log.tableName}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {log.userId === 0 ? 'System' : `User #${log.userId}`}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 font-mono">{log.ipAddress}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
