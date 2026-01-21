"use client";

import { useState, useEffect } from 'react';
import { logger } from '../lib/logger';

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
  Zap
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
  const [activeTab, setActiveTab] = useState<'timeline' | 'worklog' | 'escalation' | 'sla'>('timeline');
  const [showWorkLogModal, setShowWorkLogModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totalWorkTime, setTotalWorkTime] = useState(0);

  // Form states
  const [workLogForm, setWorkLogForm] = useState({
    action: 'RESEARCHED',
    duration: '',
    description: ''
  });

  const [escalateForm, setEscalateForm] = useState({
    escalatedToId: '',
    reason: '',
    level: 1
  });

  useEffect(() => {
    fetchTicketDetails();
    fetchWorkLogs();
    fetchSLA();
  }, [ticketId]);

  const fetchTicketDetails = async () => {
    try {
      const response = await fetch(`/api/internal/tickets/${ticketId}`);
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
      const response = await fetch(`/api/internal/tickets/${ticketId}/worklog`);
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
      const response = await fetch(`/api/internal/tickets/${ticketId}/sla`);
      if (response.ok) {
        const data = await response.json();
        setSLA(data);
      } else {
        // Create SLA if it doesn't exist
        const createResponse = await fetch(`/api/internal/tickets/${ticketId}/sla`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
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
      const response = await fetch(`/api/internal/tickets/${ticketId}/worklog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          action: workLogForm.action,
          duration: workLogForm.duration ? parseInt(workLogForm.duration) : null,
          description: workLogForm.description,
          isInternal: true
        })
      });

      if (response.ok) {
        await fetchWorkLogs();
        await fetchTicketDetails();
        setShowWorkLogModal(false);
        setWorkLogForm({
          action: 'RESEARCHED',
          duration: '',
          description: ''
        });
      }
    } catch (error) {
      logger.error('Error adding work log:', error);
    }
  };

  const escalateTicket = async () => {
    try {
      const response = await fetch(`/api/internal/tickets/${ticketId}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escalatedById: currentUserId,
          escalatedToId: parseInt(escalateForm.escalatedToId),
          reason: escalateForm.reason,
          level: escalateForm.level
        })
      });

      if (response.ok) {
        await fetchTicketDetails();
        setShowEscalateModal(false);
        setEscalateForm({
          escalatedToId: '',
          reason: '',
          level: 1
        });
      }
    } catch (error) {
      logger.error('Error escalating ticket:', error);
    }
  };

  const takeOwnership = async () => {
    try {
      await fetch(`/api/internal/tickets/${ticketId}/worklog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          action: 'STARTED_WORK',
          description: 'Taking ownership of ticket',
          isInternal: true
        })
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
        return <MessageSquare className="h-4 w-4 text-purple-600" />;
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const activeEscalation = escalations.find(e => e.isActive);

  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Header with Key Metrics */}
      <div className="p-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {ticket.title}
            </h2>
            <p className="text-sm text-gray-600 mt-1">#{ticket.ticketNumber}</p>
          </div>
          
          <div className="flex items-center space-x-3">
            {activeEscalation && (
              <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium flex items-center">
                <Zap className="h-4 w-4 mr-1" />
                Escalated (L{activeEscalation.level})
              </span>
            )}
            
            {ticket.currentOwner ? (
              <div className="flex items-center space-x-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                <UserCheck className="h-4 w-4" />
                <span>Owner: {ticket.currentOwner.firstName} {ticket.currentOwner.lastName}</span>
              </div>
            ) : (
              <button
                onClick={takeOwnership}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <UserCheck className="h-4 w-4" />
                <span>Take Ownership</span>
              </button>
            )}
          </div>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-5 gap-4 mt-4">
          <div className="bg-white rounded-lg p-3">
            <div className="text-xs text-gray-600">Status</div>
            <div className="text-sm font-semibold mt-1">{ticket.status}</div>
          </div>
          <div className="bg-white rounded-lg p-3">
            <div className="text-xs text-gray-600">Priority</div>
            <div className="text-sm font-semibold mt-1">{ticket.priority}</div>
          </div>
          <div className="bg-white rounded-lg p-3">
            <div className="text-xs text-gray-600">Time Worked</div>
            <div className="text-sm font-semibold mt-1">{formatDuration(totalWorkTime)}</div>
          </div>
          <div className="bg-white rounded-lg p-3">
            <div className="text-xs text-gray-600">Resolution Time</div>
            <div className={`text-sm font-semibold mt-1 ${getSLAStatusColor(sla?.status)}`}>
              {ticket.resolutionTime ? formatDuration(ticket.resolutionTime) : 'In Progress'}
            </div>
          </div>
          <div className="bg-white rounded-lg p-3">
            <div className="text-xs text-gray-600">Last Activity</div>
            <div className="text-sm font-semibold mt-1">
              {ticket.lastWorkedAt ? formatTimeAgo(ticket.lastWorkedAt) : 'No activity'}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="p-4 border-b bg-gray-50 flex items-center space-x-3">
        <button
          onClick={() => setShowWorkLogModal(true)}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
        >
          <Clock className="h-4 w-4" />
          <span>Log Work</span>
        </button>
        
        <button
          onClick={() => setShowEscalateModal(true)}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
        >
          <TrendingUp className="h-4 w-4" />
          <span>Escalate</span>
        </button>
        
        {activeEscalation && (
          <button
            onClick={async () => {
              await fetch(`/api/internal/tickets/${ticketId}/escalate?userId=${currentUserId}`, {
                method: 'DELETE'
              });
              fetchTicketDetails();
            }}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
          >
            <ArrowDown className="h-4 w-4" />
            <span>De-escalate</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex space-x-6 px-6">
          {['timeline', 'worklog', 'escalation', 'sla'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`py-3 px-1 border-b-2 transition-colors capitalize ${
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
            <h3 className="font-semibold text-gray-900 mb-3">Activity Timeline</h3>
            <div className="space-y-3">
              {[...workLogs, ...ticket.statusHistory || []].sort((a, b) => 
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              ).map((item, index) => (
                <div key={`${item.id}-${index}`} className="flex space-x-3">
                  <div className="flex-shrink-0">
                    {getActionIcon('action' in item ? item.action : 'UPDATED_STATUS')}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-sm">
                        {'user' in item ? `${item.user.firstName} ${item.user.lastName}` : 'System'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTimeAgo(item.createdAt)}
                      </span>
                      {'duration' in item && item.duration && (
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {formatDuration(item.duration)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 mt-1">
                      {'description' in item ? item.description : `Status changed: ${'fromStatus' in item ? item.fromStatus : ''} → ${'toStatus' in item ? item.toStatus : ''}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'worklog' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Work Log</h3>
              <div className="text-sm text-gray-600">
                Total time: <span className="font-semibold">{formatDuration(totalWorkTime)}</span>
              </div>
            </div>
            <div className="space-y-3">
              {workLogs.map(log => (
                <div key={log.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        {getActionIcon(log.action)}
                        <span className="font-medium text-sm">
                          {log.user.firstName} {log.user.lastName}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTimeAgo(log.createdAt)}
                        </span>
                        {log.duration && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {formatDuration(log.duration)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700">{log.description}</p>
                      <div className="mt-2">
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">
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
            <h3 className="font-semibold text-gray-900 mb-3">Escalation History</h3>
            {escalations.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No escalations recorded</p>
            ) : (
              <div className="space-y-3">
                {escalations.map(esc => (
                  <div key={esc.id} className={`border rounded-lg p-4 ${esc.isActive ? 'bg-red-50 border-red-300' : 'bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className={`h-4 w-4 ${esc.isActive ? 'text-red-600' : 'text-gray-600'}`} />
                        <span className="font-medium">Level {esc.level} Escalation</span>
                        {esc.isActive && (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Active</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">{formatTimeAgo(esc.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{esc.reason}</p>
                    <div className="flex items-center space-x-4 text-xs text-gray-600">
                      <span>From: {esc.escalatedBy.firstName} {esc.escalatedBy.lastName}</span>
                      <span>To: {esc.escalatedTo.firstName} {esc.escalatedTo.lastName}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'sla' && sla && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 mb-3">SLA Tracking</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className={`border rounded-lg p-4 ${sla.status?.firstResponseBreached ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">First Response</h4>
                  {sla.status?.firstResponseBreached ? (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                </div>
                <div className="space-y-1 text-sm">
                  <p>Due: {sla.firstResponseDue ? new Date(sla.firstResponseDue).toLocaleString() : 'N/A'}</p>
                  <p>Responded: {sla.firstResponseAt ? new Date(sla.firstResponseAt).toLocaleString() : 'Pending'}</p>
                  {sla.status?.timeToFirstResponse !== undefined && (
                    <p className="font-medium">
                      {sla.status.timeToFirstResponse > 0 
                        ? `${formatDuration(Math.abs(sla.status.timeToFirstResponse))} remaining`
                        : `${formatDuration(Math.abs(sla.status.timeToFirstResponse))} overdue`}
                    </p>
                  )}
                </div>
              </div>

              <div className={`border rounded-lg p-4 ${sla.status?.resolutionBreached ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Resolution</h4>
                  {sla.status?.resolutionBreached ? (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  ) : (
                    <Target className="h-4 w-4 text-green-600" />
                  )}
                </div>
                <div className="space-y-1 text-sm">
                  <p>Due: {new Date(sla.resolutionDue).toLocaleString()}</p>
                  <p>Resolved: {sla.resolvedAt ? new Date(sla.resolvedAt).toLocaleString() : 'Pending'}</p>
                  <p className="font-medium">
                    {(sla.status?.timeToResolution ?? 0) > 0 
                      ? `${formatDuration(sla.status?.timeToResolution ?? 0)} remaining`
                      : `${formatDuration(Math.abs(sla.status?.timeToResolution ?? 0))} overdue`}
                  </p>
                </div>
              </div>
            </div>
            
            {sla.breached && (
              <div className="bg-red-100 border border-red-300 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="font-medium text-red-900">SLA Breached</span>
                </div>
                {sla.breachReason && (
                  <p className="text-sm text-red-800">{sla.breachReason}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Work Log Modal */}
      {showWorkLogModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Log Work</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                <select
                  value={workLogForm.action}
                  onChange={(e) => setWorkLogForm({ ...workLogForm, action: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  value={workLogForm.duration}
                  onChange={(e) => setWorkLogForm({ ...workLogForm, duration: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 30"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={workLogForm.description}
                  onChange={(e) => setWorkLogForm({ ...workLogForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Describe what you did..."
                />
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowWorkLogModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addWorkLog}
                disabled={!workLogForm.description}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
              >
                Log Work
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escalate Modal */}
      {showEscalateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Escalate Ticket</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Escalation Level</label>
                <select
                  value={escalateForm.level}
                  onChange={(e) => setEscalateForm({ ...escalateForm, level: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value={1}>Level 1 - Team Lead</option>
                  <option value={2}>Level 2 - Manager</option>
                  <option value={3}>Level 3 - Director</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Escalate To</label>
                <select
                  value={escalateForm.escalatedToId}
                  onChange={(e) => setEscalateForm({ ...escalateForm, escalatedToId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select person...</option>
                  <option value="2">Dr. John Smith</option>
                  <option value="3">Support Manager</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Escalation</label>
                <textarea
                  value={escalateForm.reason}
                  onChange={(e) => setEscalateForm({ ...escalateForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Explain why this needs escalation..."
                />
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowEscalateModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={escalateTicket}
                disabled={!escalateForm.escalatedToId || !escalateForm.reason}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300"
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
