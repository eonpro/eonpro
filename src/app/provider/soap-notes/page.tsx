"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Search, Plus, Download, Edit, Calendar, User, RefreshCw, AlertCircle } from "lucide-react";

interface SOAPNote {
  id: number;
  patientId: number;
  patientName: string;
  visitDate: string;
  chiefComplaint?: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  status: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "LOCKED" | "ARCHIVED";
  provider?: string;
  followUpDate?: string;
  createdAt: string;
  updatedAt: string;
  approvedBy?: number;
  approvedAt?: string;
}

export default function ProviderSOAPNotesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNote, setSelectedNote] = useState<SOAPNote | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [soapNotes, setSoapNotes] = useState<SOAPNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSOAPNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch all SOAP notes for the clinic
      const response = await fetch('/api/soap-notes/list');
      
      if (!response.ok) {
        if (response.status === 404) {
          // Endpoint might not exist yet - show empty state
          setSoapNotes([]);
          return;
        }
        throw new Error('Failed to fetch SOAP notes');
      }
      
      const data = await response.json();
      setSoapNotes(data.data || []);
    } catch (err) {
      console.error('Error fetching SOAP notes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load SOAP notes');
      setSoapNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSOAPNotes();
  }, [fetchSOAPNotes]);

  const getStatusColor = (status: string) => {
    switch(status) {
      case "APPROVED": 
      case "LOCKED":
        return "bg-green-100 text-green-800";
      case "PENDING_REVIEW": 
        return "bg-blue-100 text-blue-800";
      case "ARCHIVED":
        return "bg-gray-100 text-gray-800";
      default: 
        return "bg-yellow-100 text-yellow-800";
    }
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case "APPROVED": return "completed";
      case "LOCKED": return "signed";
      case "PENDING_REVIEW": return "pending";
      case "ARCHIVED": return "archived";
      default: return "draft";
    }
  };

  const filteredNotes = soapNotes.filter(note => {
    const matchesSearch = 
      note.patientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.subjective?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.assessment?.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesFilter = filterStatus === "all";
    if (filterStatus === "draft") matchesFilter = note.status === "DRAFT";
    if (filterStatus === "completed") matchesFilter = note.status === "APPROVED";
    if (filterStatus === "signed") matchesFilter = note.status === "LOCKED";
    if (filterStatus === "pending") matchesFilter = note.status === "PENDING_REVIEW";
    
    return matchesSearch && (filterStatus === "all" || matchesFilter);
  });

  const draftCount = soapNotes.filter(n => n.status === "DRAFT").length;
  const completedCount = soapNotes.filter(n => n.status === "APPROVED").length;
  const signedCount = soapNotes.filter(n => n.status === "LOCKED").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            SOAP Notes
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchSOAPNotes}
              disabled={loading}
              className="px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New SOAP Note
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by patient or complaint..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Notes</option>
            <option value="draft">Drafts</option>
            <option value="completed">Completed</option>
            <option value="signed">Signed</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-indigo-600">{soapNotes.length}</div>
          <div className="text-sm text-gray-600">Total Notes</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-yellow-600">{draftCount}</div>
          <div className="text-sm text-gray-600">Drafts</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">{completedCount}</div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-blue-600">{signedCount}</div>
          <div className="text-sm text-gray-600">Signed</div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Notes List */}
        <div className="col-span-2 bg-white rounded-lg shadow">
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No SOAP Notes</h3>
                <p className="text-gray-500 mb-4">
                  {searchTerm || filterStatus !== "all" 
                    ? "No notes match your search criteria."
                    : "SOAP notes will appear here when created for patients."}
                </p>
                <p className="text-sm text-gray-400">
                  Create SOAP notes from patient records or during consultations.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredNotes.map((note) => (
                  <div
                    key={note.id}
                    onClick={() => setSelectedNote(note)}
                    className={`p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer ${
                      selectedNote?.id === note.id ? "border-indigo-500 bg-indigo-50" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{note.patientName}</span>
                          <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(note.status)}`}>
                            {getStatusLabel(note.status)}
                          </span>
                        </div>
                        <div className="text-lg font-medium text-gray-900 mb-2">
                          {note.chiefComplaint || note.assessment?.substring(0, 50) || "Clinical Note"}
                        </div>
                        <div className="text-sm text-gray-600 mb-2 line-clamp-2">
                          <strong>S:</strong> {note.subjective}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(note.createdAt).toLocaleDateString()}
                          </span>
                          {note.followUpDate && (
                            <span>Follow-up: {new Date(note.followUpDate).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="p-2 text-gray-600 hover:bg-gray-100 rounded">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button className="p-2 text-gray-600 hover:bg-gray-100 rounded">
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Selected Note Details */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            {selectedNote ? (
              <>
                <h3 className="font-semibold mb-4">SOAP Note Details</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Chief Complaint</label>
                    <p className="text-sm mt-1">{selectedNote.chiefComplaint || selectedNote.assessment?.substring(0, 100) || "—"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Subjective</label>
                    <p className="text-sm mt-1">{selectedNote.subjective}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Objective</label>
                    <p className="text-sm mt-1">{selectedNote.objective}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Assessment</label>
                    <p className="text-sm mt-1">{selectedNote.assessment}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Plan</label>
                    <p className="text-sm mt-1">{selectedNote.plan}</p>
                  </div>
                  {selectedNote.followUpDate && (
                    <div>
                      <label className="text-sm font-semibold text-gray-700">Follow-up</label>
                      <p className="text-sm mt-1">{new Date(selectedNote.followUpDate).toLocaleDateString()}</p>
                    </div>
                  )}
                  <div className="pt-3 space-y-2">
                    {selectedNote.status === "DRAFT" && (
                      <button className="w-full px-3 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200">
                        Complete & Sign
                      </button>
                    )}
                    {selectedNote.status === "APPROVED" && (
                      <button className="w-full px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                        Add Signature
                      </button>
                    )}
                    <button className="w-full px-3 py-2 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">
                      Edit Note
                    </button>
                    <button className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                      Export PDF
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>Select a SOAP note to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
