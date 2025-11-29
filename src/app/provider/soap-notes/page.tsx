"use client";

import { useState } from "react";
import { FileText, Search, Plus, Download, Edit, Calendar, User, CheckCircle, Clock } from "lucide-react";

interface SOAPNote {
  id: string;
  patientName: string;
  visitDate: string;
  chiefComplaint: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  status: "draft" | "completed" | "signed";
  provider: string;
  followUpDate?: string;
}

export default function ProviderSOAPNotesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNote, setSelectedNote] = useState<SOAPNote | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Mock SOAP notes
  const soapNotes: SOAPNote[] = [
    {
      id: "SOAP001",
      patientName: "Sarah Johnson",
      visitDate: "2024-01-29",
      chiefComplaint: "Follow-up for hypertension",
      subjective: "Patient reports good medication compliance. No side effects. Occasional headaches in the morning.",
      objective: "BP: 128/82, HR: 72, Weight: 165 lbs. Heart: RRR, no murmurs. Lungs: Clear bilaterally.",
      assessment: "Hypertension, improved control on current regimen",
      plan: "Continue Lisinopril 10mg daily. Lifestyle modifications. Follow-up in 3 months.",
      status: "completed",
      provider: "Dr. Smith",
      followUpDate: "2024-04-29"
    },
    {
      id: "SOAP002",
      patientName: "Michael Chen",
      visitDate: "2024-01-28",
      chiefComplaint: "Chest pain evaluation",
      subjective: "Patient reports intermittent chest pain for 2 weeks. Pain is sharp, worse with deep breathing.",
      objective: "BP: 140/90, HR: 88, O2: 98%. EKG: Normal sinus rhythm. Chest X-ray: Clear.",
      assessment: "Costochondritis, rule out cardiac etiology",
      plan: "NSAIDs for pain. Cardiac stress test scheduled. Follow-up in 1 week.",
      status: "signed",
      provider: "Dr. Smith",
      followUpDate: "2024-02-04"
    },
    {
      id: "SOAP003",
      patientName: "Emily Davis",
      visitDate: "2024-01-29",
      chiefComplaint: "Anxiety management",
      subjective: "Patient reports increased anxiety over past month. Sleep disturbance. Work-related stress.",
      objective: "Appears anxious but cooperative. GAD-7 score: 12 (moderate).",
      assessment: "Generalized anxiety disorder, moderate",
      plan: "Continue Sertraline 50mg. Refer to therapist. Sleep hygiene education.",
      status: "draft",
      provider: "Dr. Smith"
    },
    {
      id: "SOAP004",
      patientName: "James Wilson",
      visitDate: "2024-01-27",
      chiefComplaint: "Diabetes follow-up",
      subjective: "Reports dietary non-compliance during holidays. Fatigue and increased thirst.",
      objective: "BP: 135/85, Weight: 210 lbs. HbA1c: 9.8% (critical). Foot exam: No ulcers.",
      assessment: "Type 2 diabetes, poorly controlled",
      plan: "Increase Metformin to 1000mg BID. Start insulin glargine. Diabetes education referral.",
      status: "completed",
      provider: "Dr. Smith",
      followUpDate: "2024-02-10"
    },
    {
      id: "SOAP005",
      patientName: "Lisa Anderson",
      visitDate: "2024-01-29",
      chiefComplaint: "Thyroid check-up",
      subjective: "Feeling more energetic on current dose. No palpitations or tremors.",
      objective: "BP: 118/76, HR: 68. Thyroid: No enlargement or nodules. TSH pending.",
      assessment: "Hypothyroidism, stable on replacement therapy",
      plan: "Continue Levothyroxine 75mcg. Recheck TSH in 6 weeks.",
      status: "completed",
      provider: "Dr. Smith",
      followUpDate: "2024-03-12"
    }
  ];

  const getStatusColor = (status: string) => {
    switch(status) {
      case "completed": return "bg-green-100 text-green-800";
      case "signed": return "bg-blue-100 text-blue-800";
      default: return "bg-yellow-100 text-yellow-800";
    }
  };

  const filteredNotes = soapNotes.filter(note => {
    const matchesSearch = note.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          note.chiefComplaint.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || note.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            SOAP Notes
          </h1>
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New SOAP Note
          </button>
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
          <div className="text-2xl font-bold text-yellow-600">
            {soapNotes.filter(n => n.status === "draft").length}
          </div>
          <div className="text-sm text-gray-600">Drafts</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">
            {soapNotes.filter(n => n.status === "completed").length}
          </div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-blue-600">
            {soapNotes.filter(n => n.status === "signed").length}
          </div>
          <div className="text-sm text-gray-600">Signed</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Notes List */}
        <div className="col-span-2 bg-white rounded-lg shadow">
          <div className="p-6">
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
                          {note.status}
                        </span>
                      </div>
                      <div className="text-lg font-medium text-gray-900 mb-2">{note.chiefComplaint}</div>
                      <div className="text-sm text-gray-600 mb-2 line-clamp-2">
                        <strong>S:</strong> {note.subjective}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {new Date(note.visitDate).toLocaleDateString()}
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
                    <p className="text-sm mt-1">{selectedNote.chiefComplaint}</p>
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
                    {selectedNote.status === "draft" && (
                      <button className="w-full px-3 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200">
                        Complete & Sign
                      </button>
                    )}
                    {selectedNote.status === "completed" && (
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
