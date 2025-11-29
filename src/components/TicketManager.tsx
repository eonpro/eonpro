"use client";

import { useState, useEffect } from 'react';
import { logger } from '../lib/logger';

import {
  Ticket,
  Plus,
  Search,
  Filter,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  User,
  Calendar,
  Tag,
  ChevronDown,
  ChevronRight,
  Paperclip,
  Send,
  ArrowUpCircle,
  ArrowDownCircle,
  MinusCircle,
  UserCheck,
  Activity,
  Timer,
  TrendingUp
} from 'lucide-react';
import TicketDetailView from './TicketDetailView';

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

interface TicketType {
  id: number;
  ticketNumber: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  disposition?: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  patient?: Patient;
  createdBy: User;
  assignedTo?: User;
  _count?: {
    comments: number;
  };
}

interface TicketComment {
  id: number;
  createdAt: string;
  comment: string;
  isInternal: boolean;
  author: User;
}

interface TicketManagerProps {
  currentUserId: number;
  currentUserRole: string;
}

export default function TicketManager({ currentUserId, currentUserRole }: TicketManagerProps) {
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(null);
  const [ticketComments, setTicketComments] = useState<TicketComment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    assignedTo: '',
    search: ''
  });
  
  // Form states
  const [newTicket, setNewTicket] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    category: 'GENERAL',
    patientId: '',
    assignedToId: '',
    isNonClientIssue: false
  });
  const [patients, setPatients] = useState<Patient[]>([]);
  
  const [newComment, setNewComment] = useState('');
  const [isInternalComment, setIsInternalComment] = useState(false);
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [loadingPatients, setLoadingPatients] = useState(false);

  useEffect(() => {
    fetchTickets();
    fetchUsers();
    fetchPatients(); // Always fetch patients on component mount
  }, [filters]);

  // Re-fetch patients when modal opens (in case new ones were added)
  useEffect(() => {
    if (showCreateModal) {
      fetchPatients();
    }
  }, [showCreateModal]);

  useEffect(() => {
    if (selectedTicket) {
      fetchTicketComments(selectedTicket.id);
    }
  }, [selectedTicket]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (filters.status) queryParams.append('status', filters.status);
      if (filters.priority) queryParams.append('priority', filters.priority);
      if (filters.assignedTo) queryParams.append('assignedToId', filters.assignedTo);
      
      const response = await fetch(`/api/internal/tickets?${queryParams}`);
      if (response.ok) {
        const data = await response.json();
        setTickets(data);
      }
    } catch (error) {
      logger.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      // Mock users - in production, fetch from API
      const mockUsers: User[] = [
        { id: 1, firstName: 'Admin', lastName: 'User', email: 'admin@example.com', role: 'admin' },
        { id: 2, firstName: 'Dr. John', lastName: 'Smith', email: 'doctor@example.com', role: 'provider' },
        { id: 3, firstName: 'Support', lastName: 'Team', email: 'support@example.com', role: 'admin' },
      ];
      setUsers(mockUsers);
    } catch (error) {
      logger.error('Error fetching users:', error);
    }
  };

  const fetchPatients = async () => {
    setLoadingPatients(true);
    try {
      // Use internal endpoint that doesn't require authentication
      const response = await fetch('/api/internal/patients');
      
      if (response.ok) {
        const data = await response.json();
        logger.info('Fetched patients:', data.length);
        setPatients(data);
      } else {
        logger.error('Failed to fetch patients:', response.status);
        throw new Error('Failed to fetch patients');
      }
    } catch (error) {
      logger.error('Error fetching patients:', error);
      // Will use mock data from the API if database fails
    } finally {
      setLoadingPatients(false);
    }
  };

  const fetchTicketComments = async (ticketId: number) => {
    try {
      const response = await fetch(`/api/internal/tickets/${ticketId}/comments`);
      if (response.ok) {
        const data = await response.json();
        setTicketComments(data);
      }
    } catch (error) {
      logger.error('Error fetching comments:', error);
    }
  };

  const createTicket = async () => {
    try {
      // Set the title based on patient selection or non-client issue
      let finalTitle = newTicket.title;
      if (!newTicket.isNonClientIssue && newTicket.patientId) {
        const patient = patients.find(p => p.id === parseInt(newTicket.patientId));
        if (patient) {
          finalTitle = `${patient.firstName} ${patient.lastName} - ${newTicket.category.replace('_', ' ')}`;
        }
      }

      const response = await fetch('/api/internal/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newTicket,
          title: finalTitle,
          patientId: newTicket.isNonClientIssue ? null : newTicket.patientId,
          createdById: currentUserId
        })
      });

      if (response.ok) {
        const ticket = await response.json();
        setTickets([ticket, ...tickets]);
        setShowCreateModal(false);
        setPatientSearchTerm('');
        setNewTicket({
          title: '',
          description: '',
          priority: 'MEDIUM',
          category: 'GENERAL',
          patientId: '',
          assignedToId: '',
          isNonClientIssue: false
        });
      }
    } catch (error) {
      logger.error('Error creating ticket:', error);
    }
  };

  const updateTicketStatus = async (ticketId: number, status: string, disposition?: string) => {
    try {
      const response = await fetch(`/api/internal/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          disposition,
          updatedById: currentUserId,
          statusChangeReason: `Status changed to ${status}`
        })
      });

      if (response.ok) {
        const updatedTicket = await response.json();
        setTickets(tickets.map(t => t.id === ticketId ? updatedTicket : t));
        if (selectedTicket?.id === ticketId) {
          setSelectedTicket(updatedTicket);
        }
      }
    } catch (error) {
      logger.error('Error updating ticket:', error);
    }
  };

  const assignTicket = async (ticketId: number, assignedToId: number) => {
    try {
      const response = await fetch(`/api/internal/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignedToId,
          updatedById: currentUserId,
          assignmentNotes: 'Ticket reassigned'
        })
      });

      if (response.ok) {
        const updatedTicket = await response.json();
        setTickets(tickets.map(t => t.id === ticketId ? updatedTicket : t));
        if (selectedTicket?.id === ticketId) {
          setSelectedTicket(updatedTicket);
        }
      }
    } catch (error) {
      logger.error('Error assigning ticket:', error);
    }
  };

  const addComment = async () => {
    if (!selectedTicket || !newComment.trim()) return;

    try {
      const response = await fetch(`/api/internal/tickets/${selectedTicket.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorId: currentUserId,
          comment: newComment,
          isInternal: isInternalComment
        })
      });

      if (response.ok) {
        const comment = await response.json();
        setTicketComments([...ticketComments, comment]);
        setNewComment('');
        setIsInternalComment(false);
      }
    } catch (error) {
      logger.error('Error adding comment:', error);
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return <ArrowUpCircle className="h-4 w-4 text-red-600" />;
      case 'HIGH':
        return <ArrowUpCircle className="h-4 w-4 text-orange-600" />;
      case 'MEDIUM':
        return <MinusCircle className="h-4 w-4 text-yellow-600" />;
      case 'LOW':
        return <ArrowDownCircle className="h-4 w-4 text-green-600" />;
      default:
        return null;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <AlertCircle className="h-4 w-4 text-blue-600" />;
      case 'IN_PROGRESS':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'RESOLVED':
      case 'CLOSED':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'CANCELLED':
        return <XCircle className="h-4 w-4 text-gray-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-blue-100 text-blue-800';
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800';
      case 'PENDING':
        return 'bg-orange-100 text-orange-800';
      case 'ON_HOLD':
        return 'bg-gray-100 text-gray-800';
      case 'ESCALATED':
        return 'bg-red-100 text-red-800';
      case 'RESOLVED':
        return 'bg-green-100 text-green-800';
      case 'CLOSED':
        return 'bg-gray-100 text-gray-800';
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      if (
        !ticket.title.toLowerCase().includes(searchTerm) &&
        !ticket.description.toLowerCase().includes(searchTerm) &&
        !ticket.ticketNumber.toLowerCase().includes(searchTerm)
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ticket Management</h1>
            <p className="text-sm text-gray-600 mt-1">Manage patient issues and support requests</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Create Ticket</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b px-6 py-3">
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Status</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="PENDING">Pending</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
          
          <select
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Priority</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          
          <select
            value={filters.assignedTo}
            onChange={(e) => setFilters({ ...filters, assignedTo: e.target.value })}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Assignees</option>
            <option value={currentUserId}>Assigned to me</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.firstName} {user.lastName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Tickets List */}
        <div className="w-1/3 border-r bg-white overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-sm text-gray-600 mt-2">Loading tickets...</p>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-6 text-center">
              <Ticket className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-600">No tickets found</p>
              <p className="text-sm text-gray-500 mt-1">Create a new ticket to get started</p>
            </div>
          ) : (
            filteredTickets.map(ticket => (
              <button
                key={ticket.id}
                onClick={() => setSelectedTicket(ticket)}
                className={`w-full p-4 text-left border-b hover:bg-gray-50 transition-colors ${
                  selectedTicket?.id === ticket.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    {getPriorityIcon(ticket.priority)}
                    <span className="text-xs text-gray-500">#{ticket.ticketNumber}</span>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(ticket.status)}`}>
                    {ticket.status.replace('_', ' ')}
                  </span>
                </div>
                
                <h3 className="font-medium text-gray-900 mb-1 line-clamp-1">
                  {ticket.patient ? (
                    <span>
                      <span className="font-semibold">{ticket.patient.firstName} {ticket.patient.lastName}</span>
                      <span className="text-gray-600 ml-1">- {ticket.category.replace('_', ' ')}</span>
                    </span>
                  ) : (
                    <span>
                      {ticket.title}
                      <span className="text-xs ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Non-Client</span>
                    </span>
                  )}
                </h3>
                <p className="text-sm text-gray-600 line-clamp-2 mb-2">{ticket.description}</p>
                
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center space-x-3">
                    {ticket.assignedTo && (
                      <div className="flex items-center space-x-1">
                        <User className="h-3 w-3" />
                        <span>{ticket.assignedTo.firstName}</span>
                      </div>
                    )}
                    {ticket._count && ticket._count.comments > 0 && (
                      <div className="flex items-center space-x-1">
                        <MessageSquare className="h-3 w-3" />
                        <span>{ticket._count.comments}</span>
                      </div>
                    )}
                  </div>
                  <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Ticket Detail */}
        {selectedTicket ? (
          <div className="flex-1 overflow-y-auto bg-white">
            <TicketDetailView 
              ticketId={selectedTicket.id} 
              currentUserId={currentUserId} 
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <Ticket className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">Select a ticket</h3>
              <p className="text-sm text-gray-600">Choose a ticket from the list to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Create New Ticket</h2>
            
            <div className="space-y-4">
              {/* Non-Client Issue Toggle */}
              <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
                <input
                  type="checkbox"
                  id="nonClientIssue"
                  checked={newTicket.isNonClientIssue}
                  onChange={(e) => setNewTicket({ 
                    ...newTicket, 
                    isNonClientIssue: e.target.checked,
                    patientId: e.target.checked ? '' : newTicket.patientId,
                    title: ''
                  })}
                  className="rounded text-blue-600"
                />
                <label htmlFor="nonClientIssue" className="text-sm font-medium text-gray-700">
                  Non-Client Issue (Internal, System, or General Issue)
                </label>
              </div>

              {/* Client Selection or Title Input */}
              {!newTicket.isNonClientIssue ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Client *</label>
                  
                  {/* Client Search */}
                  <div className="mb-2">
                    <input
                      type="text"
                      placeholder="Search clients by name or email..."
                      value={patientSearchTerm}
                      onChange={(e) => setPatientSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                    {patientSearchTerm && (
                      <p className="text-xs text-gray-500 mt-1">
                        {loadingPatients ? 'Loading...' : 
                         `Found ${patients.filter(p => {
                           const s = patientSearchTerm.toLowerCase();
                           return p.firstName.toLowerCase().includes(s) ||
                                  p.lastName.toLowerCase().includes(s) ||
                                  p.email.toLowerCase().includes(s);
                         }).length} client(s)`}
                      </p>
                    )}
                  </div>
                  
                  <div className="relative">
                    <select
                      value={newTicket.patientId}
                      onChange={(e) => {
                        setNewTicket({ ...newTicket, patientId: e.target.value });
                        // Clear search after selection
                        if (e.target.value) {
                          setPatientSearchTerm('');
                        }
                      }}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                      size={Math.min(10, patients.filter(patient => {
                        if (!patientSearchTerm) return true;
                        const search = patientSearchTerm.toLowerCase();
                        return (
                          patient.firstName.toLowerCase().includes(search) ||
                          patient.lastName.toLowerCase().includes(search) ||
                          patient.email.toLowerCase().includes(search) ||
                          patient.id.toString().includes(search)
                        );
                      }).length + 1)}
                    >
                      <option value="">-- Select a client --</option>
                      {patients.length === 0 ? (
                        <option disabled>Loading clients...</option>
                      ) : (
                        patients
                          .filter(patient => {
                            if (!patientSearchTerm) return true;
                            const search = patientSearchTerm.toLowerCase();
                            return (
                              patient.firstName.toLowerCase().includes(search) ||
                              patient.lastName.toLowerCase().includes(search) ||
                              patient.email.toLowerCase().includes(search) ||
                              patient.id.toString().includes(search)
                            );
                          })
                          .sort((a, b) => {
                            // If searching, sort by relevance (exact match first)
                            if (patientSearchTerm) {
                              const search = patientSearchTerm.toLowerCase();
                              const aName = `${a.firstName} ${a.lastName}`.toLowerCase();
                              const bName = `${b.firstName} ${b.lastName}`.toLowerCase();
                              
                              // Exact match first
                              if (aName.startsWith(search) && !bName.startsWith(search)) return -1;
                              if (!aName.startsWith(search) && bName.startsWith(search)) return 1;
                            }
                            // Then sort by ID descending (most recent first)
                            return b.id - a.id;
                          })
                          .slice(0, 100) // Limit to 100 most recent for performance
                          .map(patient => (
                            <option key={patient.id} value={patient.id}>
                              {patient.firstName} {patient.lastName} - {patient.email} (ID: #{String(patient.id).padStart(6, '0')})
                            </option>
                          ))
                      )}
                    </select>
                    
                    {/* Selected Client Display */}
                    {newTicket.patientId && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm text-green-800">
                          Selected: <span className="font-semibold">
                            {patients.find(p => p.id === parseInt(newTicket.patientId))?.firstName}{' '}
                            {patients.find(p => p.id === parseInt(newTicket.patientId))?.lastName}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      Title format: <span className="font-semibold">[Client Name] - [Category]</span>
                    </p>
                    <a href="/patients" target="_blank" className="text-xs text-blue-600 hover:text-blue-800">
                      Add New Client →
                    </a>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issue Title *</label>
                  <input
                    type="text"
                    value={newTicket.title}
                    onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., System Maintenance, Internal Process Issue"
                    required
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={4}
                  placeholder="Detailed description of the issue"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={newTicket.priority}
                    onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={newTicket.category}
                    onChange={(e) => {
                      const newCategory = e.target.value;
                      setNewTicket({ ...newTicket, category: newCategory });
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="GENERAL">General</option>
                    <option value="BILLING">Billing</option>
                    <option value="PRESCRIPTION">Prescription</option>
                    <option value="APPOINTMENT">Appointment</option>
                    <option value="TECHNICAL_ISSUE">Technical Issue</option>
                    <option value="MEDICATION_QUESTION">Medication Question</option>
                    <option value="INSURANCE">Insurance</option>
                    <option value="DELIVERY">Delivery</option>
                    <option value="SIDE_EFFECTS">Side Effects</option>
                    <option value="DOSAGE">Dosage</option>
                    <option value="REFILL">Refill</option>
                    <option value="PORTAL_ACCESS">Portal Access</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign to</label>
                <select
                  value={newTicket.assignedToId}
                  onChange={(e) => setNewTicket({ ...newTicket, assignedToId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Unassigned</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.firstName} {user.lastName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setPatientSearchTerm('');
                  setNewTicket({
                    title: '',
                    description: '',
                    priority: 'MEDIUM',
                    category: 'GENERAL',
                    patientId: '',
                    assignedToId: '',
                    isNonClientIssue: false
                  });
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createTicket}
                disabled={
                  !newTicket.description || 
                  (!newTicket.isNonClientIssue && !newTicket.patientId) ||
                  (newTicket.isNonClientIssue && !newTicket.title)
                }
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Create Ticket
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
