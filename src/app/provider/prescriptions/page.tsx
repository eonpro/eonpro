"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Pill, Search, Plus, AlertCircle, CheckCircle, Clock, RefreshCw, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, ChevronUp, User } from "lucide-react";
import Link from "next/link";

interface Order {
  id: number;
  referenceId: string;
  status: string;
  primaryMedName: string;
  primaryMedStrength: string;
  primaryMedForm: string;
  shippingMethod: string;
  createdAt: string;
  updatedAt: string;
  patient?: {
    id: number;
    firstName: string;
    lastName: string;
  };
  rxs?: Array<{
    id: number;
    medName: string;
    strength: string;
    form: string;
    quantity: number;
    refills: number;
    sig: string;
  }>;
}

interface Prescription {
  id: string;
  rxId: number;
  orderId: number;
  patientId: number;
  patientName: string;
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  prescribedDate: string;
  status: "active" | "refill-requested" | "expired" | "discontinued";
  refillsRemaining: number;
  lastFilled?: string;
}

interface PatientGroup {
  patientId: number;
  patientName: string;
  prescriptions: Prescription[];
  totalActive: number;
  totalExpired: number;
  latestDate: string;
}

const PAGE_SIZE = 50;

export default function ProviderPrescriptionsPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [expandedPatients, setExpandedPatients] = useState<Set<number>>(new Set());

  const fetchPrescriptions = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const token = localStorage.getItem("auth-token") || localStorage.getItem("provider-token");
      const offset = (page - 1) * PAGE_SIZE;
      const response = await fetch(`/api/orders?limit=${PAGE_SIZE}&offset=${offset}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTotalOrders(data.total || data.count || 0);
        setHasMore(data.hasMore || false);

        // Transform orders into prescription format
        const rxList: Prescription[] = (data.orders || []).flatMap((order: Order) => {
          // If order has rxs, create a prescription entry for each
          if (order.rxs && order.rxs.length > 0) {
            return order.rxs.map((rx) => ({
              id: `RX${String(rx.id).padStart(5, "0")}`,
              rxId: rx.id,
              orderId: order.id,
              patientId: order.patient?.id || 0,
              patientName: order.patient
                ? `${order.patient.firstName} ${order.patient.lastName}`
                : "Unknown Patient",
              medication: rx.medName,
              dosage: rx.strength,
              frequency: rx.sig,
              duration: "30 days",
              prescribedDate: order.createdAt,
              status: mapOrderStatus(order.status),
              refillsRemaining: rx.refills,
              lastFilled: order.updatedAt,
            }));
          }
          // Fallback to primary medication if no rxs
          return [{
            id: `RX${String(order.id).padStart(5, "0")}`,
            rxId: order.id,
            orderId: order.id,
            patientId: order.patient?.id || 0,
            patientName: order.patient
              ? `${order.patient.firstName} ${order.patient.lastName}`
              : "Unknown Patient",
            medication: order.primaryMedName,
            dosage: order.primaryMedStrength,
            frequency: "-",
            duration: "30 days",
            prescribedDate: order.createdAt,
            status: mapOrderStatus(order.status),
            refillsRemaining: 0,
            lastFilled: order.updatedAt,
          }];
        });
        setPrescriptions(rxList);
      }
    } catch (err) {
      console.error("Error fetching prescriptions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrescriptions(currentPage);
  }, [currentPage, fetchPrescriptions]);

  const mapOrderStatus = (status: string): "active" | "refill-requested" | "expired" | "discontinued" => {
    const s = status?.toLowerCase();
    if (s === "completed" || s === "sent" || s === "pending" || s === "processing") return "active";
    if (s === "refill_requested" || s === "refill-requested") return "refill-requested";
    if (s === "expired" || s === "cancelled" || s === "error") return "expired";
    if (s === "discontinued") return "discontinued";
    return "active";
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case "active": return "bg-green-100 text-green-800";
      case "refill-requested": return "bg-yellow-100 text-yellow-800";
      case "expired": return "bg-red-100 text-red-800";
      case "discontinued": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case "active": return <CheckCircle className="h-3.5 w-3.5" />;
      case "refill-requested": return <RefreshCw className="h-3.5 w-3.5" />;
      case "expired": return <AlertCircle className="h-3.5 w-3.5" />;
      default: return <Clock className="h-3.5 w-3.5" />;
    }
  };

  // Filter prescriptions
  const filteredPrescriptions = useMemo(() => {
    return prescriptions.filter(rx => {
      const matchesSearch =
        rx.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rx.medication.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterStatus === "all" || rx.status === filterStatus;
      return matchesSearch && matchesFilter;
    });
  }, [prescriptions, searchTerm, filterStatus]);

  // Group prescriptions by patient
  const patientGroups = useMemo(() => {
    const groups = new Map<number, PatientGroup>();

    filteredPrescriptions.forEach(rx => {
      if (!groups.has(rx.patientId)) {
        groups.set(rx.patientId, {
          patientId: rx.patientId,
          patientName: rx.patientName,
          prescriptions: [],
          totalActive: 0,
          totalExpired: 0,
          latestDate: rx.prescribedDate,
        });
      }

      const group = groups.get(rx.patientId)!;
      group.prescriptions.push(rx);

      if (rx.status === "active") {
        group.totalActive++;
      } else if (rx.status === "expired") {
        group.totalExpired++;
      }

      // Track latest date
      if (new Date(rx.prescribedDate) > new Date(group.latestDate)) {
        group.latestDate = rx.prescribedDate;
      }
    });

    // Sort groups by latest prescription date (most recent first)
    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()
    );
  }, [filteredPrescriptions]);

  const togglePatient = (patientId: number) => {
    setExpandedPatients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(patientId)) {
        newSet.delete(patientId);
      } else {
        newSet.add(patientId);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    setExpandedPatients(new Set(patientGroups.map(g => g.patientId)));
  };

  const collapseAll = () => {
    setExpandedPatients(new Set());
  };

  if (loading && prescriptions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto">
      <div className="space-y-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Pill className="h-5 w-5" />
              Prescriptions
            </h1>
            <button
              onClick={() => router.push('/provider/patients?action=new-prescription')}
              className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              New Prescription
            </button>
          </div>

          {/* Search and Filter */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by patient or medication..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Prescriptions</option>
              <option value="active">Active</option>
              <option value="refill-requested">Refill Requested</option>
              <option value="expired">Expired</option>
              <option value="discontinued">Discontinued</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-indigo-500">
            <div className="text-xl font-bold text-indigo-600">{patientGroups.length}</div>
            <div className="text-xs text-gray-500">Patients (this page)</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-green-500">
            <div className="text-xl font-bold text-green-600">
              {filteredPrescriptions.filter(p => p.status === "active").length}
            </div>
            <div className="text-xs text-gray-500">Active Rx</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-yellow-500">
            <div className="text-xl font-bold text-yellow-600">
              {filteredPrescriptions.filter(p => p.status === "refill-requested").length}
            </div>
            <div className="text-xs text-gray-500">Refill Requests</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-red-500">
            <div className="text-xl font-bold text-red-600">
              {filteredPrescriptions.filter(p => p.status === "expired").length}
            </div>
            <div className="text-xs text-gray-500">Expired</div>
          </div>
        </div>

        {/* Patients List */}
        <div className="bg-white rounded-lg shadow-sm">
          {patientGroups.length === 0 ? (
            <div className="text-center py-10 px-4">
              <Pill className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                {searchTerm ? "No prescriptions match your search" : "No prescriptions yet"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Prescriptions will appear here when you create orders for patients.
              </p>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-600">
                    {patientGroups.length} patients on this page
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={expandAll}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Expand All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={collapseAll}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Collapse All
                  </button>
                </div>
              </div>

              {/* Patient Rows */}
              <div className="divide-y divide-gray-100">
                {patientGroups.map((group) => (
                  <PatientRow
                    key={group.patientId}
                    group={group}
                    isExpanded={expandedPatients.has(group.patientId)}
                    onToggle={() => togglePatient(group.patientId)}
                    getStatusColor={getStatusColor}
                    getStatusIcon={getStatusIcon}
                  />
                ))}
              </div>
            </>
          )}

          {/* Pagination Controls */}
          {totalOrders > 0 && (
            <PaginationControls
              currentPage={currentPage}
              totalItems={totalOrders}
              pageSize={PAGE_SIZE}
              hasMore={hasMore}
              onPageChange={setCurrentPage}
              loading={loading}
            />
          )}
        </div>

        {/* Pending Actions */}
        {filteredPrescriptions.filter(p => p.status === "refill-requested").length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-800">
                {filteredPrescriptions.filter(p => p.status === "refill-requested").length} refill requests pending approval
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Patient Row Component with expandable prescriptions
interface PatientRowProps {
  group: PatientGroup;
  isExpanded: boolean;
  onToggle: () => void;
  getStatusColor: (status: string) => string;
  getStatusIcon: (status: string) => React.ReactNode;
}

function PatientRow({ group, isExpanded, onToggle, getStatusColor, getStatusIcon }: PatientRowProps) {
  return (
    <div>
      {/* Patient Summary Row */}
      <div
        onClick={onToggle}
        className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        {/* Expand/Collapse Icon */}
        <div className="flex-shrink-0 text-gray-400">
          {isExpanded ? (
            <ChevronUp className="h-5 w-5" />
          ) : (
            <ChevronDown className="h-5 w-5" />
          )}
        </div>

        {/* Patient Icon */}
        <div className="flex-shrink-0 w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center">
          <User className="h-5 w-5 text-indigo-600" />
        </div>

        {/* Patient Name */}
        <div className="flex-1 min-w-0">
          <Link
            href={`/patients/${group.patientId}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-gray-900 hover:text-indigo-600 hover:underline"
          >
            {group.patientName}
          </Link>
          <div className="text-xs text-gray-500">
            {group.prescriptions.length} prescription{group.prescriptions.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Status Summary */}
        <div className="flex items-center gap-2">
          {group.totalActive > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <CheckCircle className="h-3 w-3" />
              {group.totalActive} active
            </span>
          )}
          {group.totalExpired > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
              <AlertCircle className="h-3 w-3" />
              {group.totalExpired} expired
            </span>
          )}
        </div>

        {/* Latest Date */}
        <div className="text-sm text-gray-500 w-24 text-right">
          {new Date(group.latestDate).toLocaleDateString()}
        </div>

        {/* View Patient Button */}
        <Link
          href={`/patients/${group.patientId}?tab=prescriptions`}
          onClick={(e) => e.stopPropagation()}
          className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 font-medium"
        >
          View Patient
        </Link>
      </div>

      {/* Expanded Prescriptions */}
      {isExpanded && (
        <div className="bg-gray-50 border-t border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-100/50">
              <tr>
                <th className="text-left py-2 px-4 pl-16 font-medium text-gray-500 text-xs">Rx #</th>
                <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs">Medication</th>
                <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs">Dosage</th>
                <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs">Instructions</th>
                <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs">Status</th>
                <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs">Refills</th>
                <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {group.prescriptions.map((rx) => (
                <tr key={rx.id} className="hover:bg-gray-100/50">
                  <td className="py-2.5 px-4 pl-16 font-medium text-gray-700">{rx.id}</td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-gray-900 max-w-[200px] truncate" title={rx.medication}>
                      {rx.medication}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-gray-700">{rx.dosage}</td>
                  <td className="py-2.5 px-4">
                    <div className="text-gray-600 max-w-[200px] truncate" title={rx.frequency}>
                      {rx.frequency}
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(rx.status)}`}>
                      {getStatusIcon(rx.status)}
                      {rx.status.replace("-", " ")}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-gray-700">
                    {rx.refillsRemaining} remaining
                  </td>
                  <td className="py-2.5 px-4 text-gray-500">
                    {new Date(rx.prescribedDate).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Pagination Controls Component
interface PaginationControlsProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
  loading: boolean;
}

function PaginationControls({
  currentPage,
  totalItems,
  pageSize,
  hasMore,
  onPageChange,
  loading,
}: PaginationControlsProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPage > 3) {
        pages.push("...");
      }

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) {
          pages.push(i);
        }
      }

      if (currentPage < totalPages - 2) {
        pages.push("...");
      }

      if (!pages.includes(totalPages)) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-gray-50">
      {/* Results info */}
      <div className="text-sm text-gray-600">
        Showing orders <span className="font-medium">{startItem}</span> to{" "}
        <span className="font-medium">{endItem}</span> of{" "}
        <span className="font-medium">{totalItems}</span>
      </div>

      {/* Page controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1 || loading}
          className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          title="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>

        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || loading}
          className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1 mx-1">
          {getPageNumbers().map((page, index) =>
            typeof page === "number" ? (
              <button
                key={index}
                onClick={() => onPageChange(page)}
                disabled={loading}
                className={`min-w-[32px] h-8 px-2 text-sm rounded font-medium transition-colors ${
                  page === currentPage
                    ? "bg-indigo-600 text-white"
                    : "hover:bg-gray-200 text-gray-700"
                } disabled:cursor-not-allowed`}
              >
                {page}
              </button>
            ) : (
              <span key={index} className="px-1 text-gray-400">
                {page}
              </span>
            )
          )}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasMore || loading}
          className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages || loading}
          className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>

      {/* Page jump */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-600">Go to:</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={currentPage}
          onChange={(e) => {
            const page = parseInt(e.target.value, 10);
            if (page >= 1 && page <= totalPages) {
              onPageChange(page);
            }
          }}
          className="w-16 px-2 py-1 border rounded text-center text-sm focus:ring-2 focus:ring-indigo-500"
          disabled={loading}
        />
        <span className="text-gray-500">of {totalPages}</span>
      </div>
    </div>
  );
}
