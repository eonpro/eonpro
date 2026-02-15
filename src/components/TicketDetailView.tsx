'use client';

import { useState, useEffect } from 'react';
import { logger } from '../lib/logger';
import { apiFetch } from '@/lib/api/fetch';

import {
  Clock,
  User,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowUp,
  ArrowDown,
  Activity,
  MessageSquare,
  Calendar,
  Timer,
  TrendingUp,
  Users,
  AlertCircle,
  BarChart3,
  History,
  Target,
  UserCheck,
  Zap,
} from 'lucide-react';

interface TicketDetailViewProps {
  ticketId: number;
  currentUserId: number;
}

interface WorkLog {
  id: number;
  createdAt: string;
  action: string;
  duration?: number;
  description: string;
  isInternal: boolean;
  user: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
}

interface Escalation {
  id: number;
  createdAt: string;
  level: number;
  reason: string;
  isActive: boolean;
  escalatedBy: {
    firstName: string;
    lastName: string;
  };
  escalatedTo: {
    firstName: string;
    lastName: string;
  };
}

interface SLA {
  firstResponseDue?: string;
  firstResponseAt?: string;
  resolutionDue: string;
  resolvedAt?: string;
  breached: boolean;
  breachReason?: string;
  status?: {
    firstResponseBreached: boolean;
    resolutionBreached: boolean;
    timeToFirstResponse?: number;
    timeToResolution: number;
    isBreached: boolean;
  };
}

export default function TicketDetailView({ ticketId, currentUserId }: TicketDetailViewProps) {
  const [ticket, setTicket] = useState<any>(null);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [sla, setSLA] = useState<SLA | null>(null);
  const [activeTab, setActiveTab] = useState<'timeline' | 'worklog' | 'escalation' | 'sla'>(
    'timeline'
  );
  const [showWorkLogModal, setShowWorkLogModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totalWorkTime, setTotalWorkTime] = useState(0);

  // Form states
  const [workLogForm, setWorkLogForm] = useState({
    action: 'RESEARCHED',
    duration: '',
    description: '',
  });

  const [escalateForm, setEscalateForm] = useState({
    escalatedToId: '',
    reason: '',
    level: 1,
  });

  useEffect(() => {
    fetchTicketDetails();
    fetchWorkLogs();
    fetchSLA();
  }, [ticketId]);

  const fetchTicketDetails = async () => {
    try {
      const response = await apiFetch(`/api/internal/tickets/${ticketId}`);
      if (response.ok) {
        const data = await response.json();
        setTicket(data);
        setEscalations(data.escalations || []);
      }
    } catch (error) {
      logger.error('Error fetching ticket:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkLogs = async () => {
    try {
      const response = await apiFetch(`/api/internal/tickets/${ticketId}/worklog`);
      if (response.ok) {
        const data = await response.json();
        setWorkLogs(data.workLogs);
        setTotalWorkTime(data.totalWorkTime);
      }
    } catch (error) {
      logger.error('Error fetching work logs:', error);
    }
  };

  const fetchSLA = async () => {
    try {
      const response = await apiFetch(`/api/internal/tickets/${ticketId}/sla`);
      if (response.ok) {
        const data = await response.json();
        setSLA(data);
      } else {
        // Create SLA if it doesn't exist
        const createResponse = await apiFetch(`/api/internal/tickets/${ticketId}/sla`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (createResponse.ok) {
          const data = await createResponse.json();
          setSLA(data);
        }
      }
    } catch (error) {
      logger.error('Error fetching SLA:', error);
    }
  };

  const addWorkLog = async () => {
    try {
      const response = await apiFetch(`/api/internal/tickets/${ticketId}/worklog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          action: workLogForm.action,
          duration: workLogForm.duration ? parseInt(workLogForm.duration) : null,
          description: workLogForm.description,
          isInternal: true,
        }),
      });

      if (response.ok) {
        await fetchWorkLogs();
        await fetchTicketDetails();
        setShowWorkLogModal(false);
        setWorkLogForm({
          action: 'RESEARCHED',
          duration: '',
          description: '',
        });
      }
    } catch (error) {
      logger.error('Error adding work log:', error);
    }
  };

  const escalateTicket = async () => {
    try {
      const response = await apiFetch(`/api/internal/tickets/${ticketId}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escalatedById: currentUserId,
          escalatedToId: parseInt(escalateForm.escalatedToId),
          reason: escalateForm.reason,
          level: escalateForm.level,
        }),
      });

      if (response.ok) {
        await fetchTicketDetails();
        setShowEscalateModal(false);
        setEscalateForm({
          escalatedToId: '',
          reason: '',
          level: 1,
        });
      }
    } catch (error) {
      logger.error('Error escalating ticket:', error);
    }
  };

  const takeOwnership = async () => {
    try {
      await apiFetch(`/api/internal/tickets/${ticketId}/worklog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          action: 'STARTED_WORK',
          description: 'Taking ownership of ticket',
          isInternal: true,
        }),
      });
      await fetchTicketDetails();
      await fetchWorkLogs();
    } catch (error) {
      logger.error('Error taking ownership:', error);
    }
  };

  const formatDuration = (minutes: number) => {
    if (!minutes) return '0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diff = now.getTime() - then.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return `${minutes}m ago`;
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'CREATED':
      case 'STARTED_WORK':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'ESCALATED':
        return <TrendingUp className="h-4 w-4 text-red-600" />;
      case 'RESOLVED':
        return <CheckCircle className="h-4 w-4 text-blue-600" />;
      case 'CLOSED':
        return <XCircle className="h-4 w-4 text-gray-600" />;
      case 'CONTACTED_PATIENT':
      case 'CONTACTED_PROVIDER':
        return <MessageSquare className="h-4 w-4 text-[var(--brand-primary)]" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getSLAStatusColor = (status?: SLA['status']) => {
    if (!status) return 'text-gray-500';
    if (status.isBreached) return 'text-red-600';
    if (status.timeToResolution < 60) return 'text-yellow-600';
    return 'text-green-600';
  };

  if (loading || !ticket) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const activeEscalation = escalations.find((e) => e.isActive);

  return (
    <div className="rounded-lg bg-white shadow-lg">
      {/* Header with Key Metrics */}
      <div className="border-b bg-gradient-to-r from-blue-50 to-[var(--brand-primary-light)] p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{ticket.title}</h2>
            <p className="mt-1 text-sm text-gray-600">#{ticket.ticketNumber}</p>
          </div>

          <div className="flex items-center space-x-3">
            {activeEscalation && (
              <span className="flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
                <Zap className="mr-1 h-4 w-4" />
                Escalated (L{activeEscalation.level})
              </span>
            )}

            {ticket.currentOwner ? (
              <div className="flex items-center space-x-2 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800">
                <UserCheck className="h-4 w-4" />
                <span>
                  Owner: {ticket.currentOwner.firstName} {ticket.currentOwner.lastName}
                </span>
              </div>
            ) : (
              <button
                onClick={takeOwnership}
                className="flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
              >
                <UserCheck className="h-4 w-4" />
                <span>Take Ownership</span>
              </button>
            )}
          </div>
        </div>

        {/* Key Metrics Row */}
        <div className="mt-4 grid grid-cols-5 gap-4">
          <div className="rounded-lg bg-white p-3">
            <div className="text-xs text-gray-600">Status</div>
            <div className="mt-1 text-sm font-semibold">{ticket.status}</div>
          </div>
          <div className="rounded-lg bg-white p-3">
            <div className="text-xs text-gray-600">Priority</div>
            <div className="mt-1 text-sm font-semibold">{ticket.priority}</div>
          </div>
          <div className="rounded-lg bg-white p-3">
            <div className="text-xs text-gray-600">Time Worked</div>
            <div className="mt-1 text-sm font-semibold">{formatDuration(totalWorkTime)}</div>
          </div>
          <div className="rounded-lg bg-white p-3">
            <div className="text-xs text-gray-600">Resolution Time</div>
            <div className={`mt-1 text-sm font-semibold ${getSLAStatusColor(sla?.status)}`}>
              {ticket.resolutionTime ? formatDuration(ticket.resolutionTime) : 'In Progress'}
            </div>
          </div>
          <div className="rounded-lg bg-white p-3">
            <div className="text-xs text-gray-600">Last Activity</div>
            <div className="mt-1 text-sm font-semibold">
              {ticket.lastWorkedAt ? formatTimeAgo(ticket.lastWorkedAt) : 'No activity'}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-3 border-b bg-gray-50 p-4">
        <button
          onClick={() => setShowWorkLogModal(true)}
          className="flex items-center space-x-2 rounded-lg border border-gray-300 bg-white px-4 py-2 transition-colors hover:bg-gray-50"
        >
          <Clock className="h-4 w-4" />
          <span>Log Work</span>
        </button>

        <button
          onClick={() => setShowEscalateModal(true)}
          className="flex items-center space-x-2 rounded-lg border border-gray-300 bg-white px-4 py-2 transition-colors hover:bg-gray-50"
        >
          <TrendingUp className="h-4 w-4" />
          <span>Escalate</span>
        </button>

        {activeEscalation && (
          <button
            onClick={async () => {
              await apiFetch(`/api/internal/tickets/${ticketId}/escalate?userId=${currentUserId}`, {
                method: 'DELETE',
              });
              fetchTicketDetails();
            }}
            className="flex items-center space-x-2 rounded-lg border border-gray-300 bg-white px-4 py-2 transition-colors hover:bg-gray-50"
          >
            <ArrowDown className="h-4 w-4" />
            <span>De-escalate</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex space-x-6 px-6">
          {['timeline', 'worklog', 'escalation', 'sla'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`border-b-2 px-1 py-3 capitalize transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab === 'sla' ? 'SLA' : tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'timeline' && (
          <div className="space-y-4">
            <h3 className="mb-3 font-semibold text-gray-900">Activity Timeline</h3>
            <div className="space-y-3">
              {[...workLogs, ...(ticket.statusHistory || [])]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((item, index) => (
                  <div key={`${item.id}-${index}`} className="flex space-x-3">
                    <div className="flex-shrink-0">
                      {getActionIcon('action' in item ? item.action : 'UPDATED_STATUS')}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium">
                          {'user' in item
                            ? `${item.user.firstName} ${item.user.lastName}`
                            : 'System'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTimeAgo(item.createdAt)}
                        </span>
                        {'duration' in item && item.duration && (
                          <span className="rounded bg-gray-100 px-2 py-1 text-xs">
                            {formatDuration(item.duration)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-700">
                        {'description' in item
                          ? item.description
                          : `Status changed: ${'fromStatus' in item ? item.fromStatus : ''} → ${'toStatus' in item ? item.toStatus : ''}`}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {activeTab === 'worklog' && (
          <div className="space-y-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Work Log</h3>
              <div className="text-sm text-gray-600">
                Total time: <span className="font-semibold">{formatDuration(totalWorkTime)}</span>
              </div>
            </div>
            <div className="space-y-3">
              {workLogs.map((log) => (
                <div key={log.id} className="rounded-lg border p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center space-x-2">
                        {getActionIcon(log.action)}
                        <span className="text-sm font-medium">
                          {log.user.firstName} {log.user.lastName}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTimeAgo(log.createdAt)}
                        </span>
                        {log.duration && (
                          <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">
                            {formatDuration(log.duration)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700">{log.description}</p>
                      <div className="mt-2">
                        <span className="rounded bg-gray-100 px-2 py-1 text-xs">
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'escalation' && (
          <div className="space-y-4">
            <h3 className="mb-3 font-semibold text-gray-900">Escalation History</h3>
            {escalations.length === 0 ? (
              <p className="py-8 text-center text-gray-500">No escalations recorded</p>
            ) : (
              <div className="space-y-3">
                {escalations.map((esc) => (
                  <div
                    key={esc.id}
                    className={`rounded-lg border p-4 ${esc.isActive ? 'border-red-300 bg-red-50' : 'bg-gray-50'}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <TrendingUp
                          className={`h-4 w-4 ${esc.isActive ? 'text-red-600' : 'text-gray-600'}`}
                        />
                        <span className="font-medium">Level {esc.level} Escalation</span>
                        {esc.isActive && (
                          <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-800">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">{formatTimeAgo(esc.createdAt)}</span>
                    </div>
                    <p className="mb-2 text-sm text-gray-700">{esc.reason}</p>
                    <div className="flex items-center space-x-4 text-xs text-gray-600">
                      <span>
                        From: {esc.escalatedBy.firstName} {esc.escalatedBy.lastName}
                      </span>
                      <span>
                        To: {esc.escalatedTo.firstName} {esc.escalatedTo.lastName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'sla' && sla && (
          <div className="space-y-4">
            <h3 className="mb-3 font-semibold text-gray-900">SLA Tracking</h3>
            <div className="grid grid-cols-2 gap-4">
              <div
                className={`rounded-lg border p-4 ${sla.status?.firstResponseBreached ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-medium">First Response</h4>
                  {sla.status?.firstResponseBreached ? (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                </div>
                <div className="space-y-1 text-sm">
                  <p>
                    Due:{' '}
                    {sla.firstResponseDue ? new Date(sla.firstResponseDue).toLocaleString() : 'N/A'}
                  </p>
                  <p>
                    Responded:{' '}
                    {sla.firstResponseAt
                      ? new Date(sla.firstResponseAt).toLocaleString()
                      : 'Pending'}
                  </p>
                  {sla.status?.timeToFirstResponse !== undefined && (
                    <p className="font-medium">
                      {sla.status.timeToFirstResponse > 0
                        ? `${formatDuration(Math.abs(sla.status.timeToFirstResponse))} remaining`
                        : `${formatDuration(Math.abs(sla.status.timeToFirstResponse))} overdue`}
                    </p>
                  )}
                </div>
              </div>

              <div
                className={`rounded-lg border p-4 ${sla.status?.resolutionBreached ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-medium">Resolution</h4>
                  {sla.status?.resolutionBreached ? (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  ) : (
                    <Target className="h-4 w-4 text-green-600" />
                  )}
                </div>
                <div className="space-y-1 text-sm">
                  <p>Due: {new Date(sla.resolutionDue).toLocaleString()}</p>
                  <p>
                    Resolved:{' '}
                    {sla.resolvedAt ? new Date(sla.resolvedAt).toLocaleString() : 'Pending'}
                  </p>
                  <p className="font-medium">
                    {(sla.status?.timeToResolution ?? 0) > 0
                      ? `${formatDuration(sla.status?.timeToResolution ?? 0)} remaining`
                      : `${formatDuration(Math.abs(sla.status?.timeToResolution ?? 0))} overdue`}
                  </p>
                </div>
              </div>
            </div>

            {sla.breached && (
              <div className="rounded-lg border border-red-300 bg-red-100 p-4">
                <div className="mb-2 flex items-center space-x-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="font-medium text-red-900">SLA Breached</span>
                </div>
                {sla.breachReason && <p className="text-sm text-red-800">{sla.breachReason}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Work Log Modal */}
      {showWorkLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-md rounded-lg bg-white p-6">
            <h3 className="mb-4 text-lg font-bold">Log Work</h3>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Action</label>
                <select
                  value={workLogForm.action}
                  onChange={(e) => setWorkLogForm({ ...workLogForm, action: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="STARTED_WORK">Started Work</option>
                  <option value="RESEARCHED">Researched</option>
                  <option value="CONTACTED_PATIENT">Contacted Patient</option>
                  <option value="CONTACTED_PROVIDER">Contacted Provider</option>
                  <option value="CONTACTED_PHARMACY">Contacted Pharmacy</option>
                  <option value="CONTACTED_INSURANCE">Contacted Insurance</option>
                  <option value="PROVIDED_INFO">Provided Information</option>
                  <option value="APPLIED_SOLUTION">Applied Solution</option>
                  <option value="TESTED_SOLUTION">Tested Solution</option>
                  <option value="RESOLVED">Resolved Issue</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  value={workLogForm.duration}
                  onChange={(e) => setWorkLogForm({ ...workLogForm, duration: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 30"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={workLogForm.description}
                  onChange={(e) => setWorkLogForm({ ...workLogForm, description: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Describe what you did..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowWorkLogModal(false)}
                className="rounded-lg border px-4 py-2 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addWorkLog}
                disabled={!workLogForm.description}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-300"
              >
                Log Work
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escalate Modal */}
      {showEscalateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-md rounded-lg bg-white p-6">
            <h3 className="mb-4 text-lg font-bold">Escalate Ticket</h3>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Escalation Level
                </label>
                <select
                  value={escalateForm.level}
                  onChange={(e) =>
                    setEscalateForm({ ...escalateForm, level: parseInt(e.target.value) })
                  }
                  className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-blue-500"
                >
                  <option value={1}>Level 1 - Team Lead</option>
                  <option value={2}>Level 2 - Manager</option>
                  <option value={3}>Level 3 - Director</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Escalate To</label>
                <select
                  value={escalateForm.escalatedToId}
                  onChange={(e) =>
                    setEscalateForm({ ...escalateForm, escalatedToId: e.target.value })
                  }
                  className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select person...</option>
                  <option value="2">Dr. John Smith</option>
                  <option value="3">Support Manager</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Reason for Escalation
                </label>
                <textarea
                  value={escalateForm.reason}
                  onChange={(e) => setEscalateForm({ ...escalateForm, reason: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Explain why this needs escalation..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowEscalateModal(false)}
                className="rounded-lg border px-4 py-2 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={escalateTicket}
                disabled={!escalateForm.escalatedToId || !escalateForm.reason}
                className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:bg-gray-300"
              >
                Escalate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
