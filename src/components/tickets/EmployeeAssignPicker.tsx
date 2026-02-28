'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronDown, X, User as UserIcon, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface WorkloadUser {
  userId: number;
  firstName: string;
  lastName: string;
  role: string;
  openTicketCount: number;
}

interface EmployeeAssignPickerProps {
  currentAssigneeId: number | null;
  currentAssigneeName?: string;
  onAssign: (userId: number | null) => Promise<void>;
  disabled?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  STAFF: 'Staff',
  PROVIDER: 'Provider',
  SUPPORT: 'Support',
  SUPER_ADMIN: 'Super Admin',
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-purple-100 text-purple-700',
  STAFF: 'bg-blue-100 text-blue-700',
  PROVIDER: 'bg-green-100 text-green-700',
  SUPPORT: 'bg-orange-100 text-orange-700',
  SUPER_ADMIN: 'bg-red-100 text-red-700',
};

function getWorkloadColor(count: number): string {
  if (count === 0) return 'bg-green-100 text-green-700';
  if (count <= 3) return 'bg-blue-100 text-blue-700';
  if (count <= 7) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
}

export default function EmployeeAssignPicker({
  currentAssigneeId,
  currentAssigneeName,
  onAssign,
  disabled = false,
}: EmployeeAssignPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<WorkloadUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchWorkload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/users/workload');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.workload || []);
      }
    } catch {
      // Silently handle - users will see empty list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && users.length === 0) {
      fetchWorkload();
    }
  }, [isOpen, users.length, fetchWorkload]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      u.firstName.toLowerCase().includes(term) ||
      u.lastName.toLowerCase().includes(term) ||
      (ROLE_LABELS[u.role] || u.role).toLowerCase().includes(term)
    );
  });

  const handleSelect = async (userId: number | null) => {
    if (userId === currentAssigneeId) {
      setIsOpen(false);
      setSearch('');
      return;
    }
    setAssigning(true);
    try {
      await onAssign(userId);
    } finally {
      setAssigning(false);
      setIsOpen(false);
      setSearch('');
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || assigning}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 px-3 py-2 text-left text-sm transition-colors hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {assigning ? (
          <span className="flex items-center gap-2 text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Assigning...
          </span>
        ) : currentAssigneeId && currentAssigneeName ? (
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
              {currentAssigneeName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </span>
            <span className="text-gray-900">{currentAssigneeName}</span>
          </span>
        ) : (
          <span className="text-gray-400">Unassigned</span>
        )}
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employees..."
                className="w-full rounded-md border border-gray-200 py-2 pl-8 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {/* Unassign option */}
            {currentAssigneeId && (
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
                <span>Unassign</span>
              </button>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                {search ? 'No employees match your search' : 'No employees available'}
              </div>
            ) : (
              filteredUsers.map((u) => (
                <button
                  key={u.userId}
                  type="button"
                  onClick={() => handleSelect(u.userId)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    u.userId === currentAssigneeId ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                      {u.firstName[0]}{u.lastName[0]}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-900">
                        {u.firstName} {u.lastName}
                      </div>
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${getWorkloadColor(u.openTicketCount)}`}
                    title={`${u.openTicketCount} open tickets`}
                  >
                    {u.openTicketCount}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
