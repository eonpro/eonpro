"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Edit2, Trash2, UserPlus, DollarSign, Eye, EyeOff, KeyRound } from "lucide-react";

interface Influencer {
  id: number;
  name: string;
  email: string;
  promoCode: string;
  commissionRate: number;
  status: string;
  totalReferrals: number;
  convertedReferrals: number;
  pendingEarnings: number;
  totalEarnings: number;
  lastLogin: string | null;
  phone?: string | null;
  paypalEmail?: string | null;
  preferredPaymentMethod?: string | null;
  notes?: string | null;
}

export default function AdminInfluencersPage() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingInfluencer, setEditingInfluencer] = useState<Influencer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInfluencers();
  }, []);

  const fetchInfluencers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/influencers");
      if (!res.ok) throw new Error("Failed to fetch influencers");
      const data = await res.json();
      setInfluencers(data);
    } catch (err: any) {
    // @ts-ignore
   
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInfluencer = async (formData: any) => {
    try {
      const res = await fetch("/api/admin/influencers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create influencer");
      }
      await fetchInfluencers();
      setShowCreateForm(false);
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(errorMessage);
    }
  };

  const handleUpdateInfluencer = async (id: number, updates: any) => {
    try {
      const res = await fetch(`/api/admin/influencers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update influencer");
      }
      await fetchInfluencers();
      setEditingInfluencer(null);
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(errorMessage);
    }
  };

  const handleResetPassword = async (id: number, email: string) => {
    const newPassword = prompt(`Enter new password for ${email}:`);
    if (!newPassword) return;
    
    if (newPassword.length < 12) {
      alert("Password must be at least 6 characters long");
      return;
    }
    
    try {
      const res = await fetch(`/api/admin/influencers/${id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to reset password");
      }
      
      alert(`Password reset successfully for ${email}`);
    } catch (err: any) {
    // @ts-ignore
   
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(errorMessage);
    }
  };

  const handleDeleteInfluencer = async (id: number) => {
    if (!confirm("Are you sure you want to delete this influencer?")) return;
    
    try {
      const res = await fetch(`/api/admin/influencers/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete influencer");
      await fetchInfluencers();
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    alert(errorMessage);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#4fa77e]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Error: {error}</p>
        <button onClick={fetchInfluencers} className="mt-4 text-[#4fa77e] hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Influencer Management</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage influencers, promo codes, and commission structures
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center px-4 py-2 bg-[#4fa77e] text-white rounded-md hover:bg-[#3a8a6b] transition"
        >
          <UserPlus className="h-5 w-5 mr-2" />
          Add Influencer
        </button>
      </div>

      {/* Create/Edit Form */}
      {(showCreateForm || editingInfluencer) && (
        <InfluencerForm
          influencer={editingInfluencer}
          onSubmit={(data: any) => {
            if (editingInfluencer) {
              handleUpdateInfluencer(editingInfluencer.id, data);
            } else {
              handleCreateInfluencer(data);
            }
          }}
          onCancel={() => {
            setShowCreateForm(false);
            setEditingInfluencer(null);
          }}
        />
      )}

      {/* Influencers Table */}
      <div className="bg-white shadow-lg rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Influencer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Promo Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Commission Rate
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Performance
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Earnings
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {influencers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No influencers found. Click "Add Influencer" to create one.
                </td>
              </tr>
            ) : (
              influencers.map((influencer: any) => (
                <tr key={influencer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{influencer.name}</div>
                      <div className="text-sm text-gray-500">{influencer.email}</div>
                      {influencer.lastLogin && (
                        <div className="text-xs text-gray-400">
                          Last login: {new Date(influencer.lastLogin).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                      {influencer.promoCode}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <DollarSign className="h-4 w-4 text-green-600 mr-1" />
                      <span className="text-sm font-semibold text-gray-900">
                        {(influencer.commissionRate * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {influencer.convertedReferrals} / {influencer.totalReferrals} converted
                    </div>
                    <div className="text-xs text-gray-500">
                      {influencer.totalReferrals > 0
                        ? `${((influencer.convertedReferrals / influencer.totalReferrals) * 100).toFixed(0)}% rate`
                        : "No referrals yet"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      ${(influencer.pendingEarnings || 0).toFixed(2)} pending
                    </div>
                    <div className="text-xs text-gray-500">
                      ${(influencer.totalEarnings || 0).toFixed(2)} paid
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        influencer.status === "ACTIVE"
                          ? "bg-green-100 text-green-800"
                          : influencer.status === "INACTIVE"
                          ? "bg-gray-100 text-gray-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {influencer.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setEditingInfluencer(influencer)}
                        className="text-[#4fa77e] hover:text-[#3a8a6b]"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleResetPassword(influencer.id, influencer.email)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Reset Password"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteInfluencer(influencer.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface InfluencerFormProps {
  influencer?: Influencer | null;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

const InfluencerForm: React.FC<InfluencerFormProps> = ({ influencer, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    name: influencer?.name || "",
    email: influencer?.email || "",
    promoCode: influencer?.promoCode || "",
    password: "",
    commissionRate: influencer?.commissionRate || 0.10,
    status: influencer?.status || "ACTIVE",
    phone: influencer?.phone || "",
    paypalEmail: influencer?.paypalEmail || "",
    preferredPaymentMethod: influencer?.preferredPaymentMethod || "paypal",
    notes: influencer?.notes || "",
  });
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4">
        {influencer ? "Edit Influencer" : "Create New Influencer"}
      </h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e: any) => setFormData({ ...formData, name: e.target.value })}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-[#4fa77e] focus:border-[#4fa77e]"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e: any) => setFormData({ ...formData, email: e.target.value })}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-[#4fa77e] focus:border-[#4fa77e]"
            required
            disabled={!!influencer}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Promo Code</label>
          <input
            type="text"
            value={formData.promoCode}
            onChange={(e: any) => setFormData({ ...formData, promoCode: e.target.value.toUpperCase() })}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-[#4fa77e] focus:border-[#4fa77e]"
            placeholder="e.g., INFLUENCER20"
            required
            disabled={!!influencer}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            {influencer ? "New Password (leave blank to keep current)" : "Password"}
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={(e: any) => setFormData({ ...formData, password: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-[#4fa77e] focus:border-[#4fa77e]"
              required={!influencer}
              minLength={6}
              placeholder={influencer ? "Enter new password to reset" : "Minimum 6 characters"}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 text-gray-400" />
              ) : (
                <Eye className="h-4 w-4 text-gray-400" />
              )}
            </button>
          </div>
          {influencer && formData.password && (
            <p className="mt-1 text-sm text-yellow-600">
              Warning: This will reset the influencer's password
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Commission Rate (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={formData.commissionRate * 100}
            onChange={(e: any) => setFormData({ ...formData, commissionRate: parseFloat(e.target.value) / 100 })}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-[#4fa77e] focus:border-[#4fa77e]"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Status</label>
          <select
            value={formData.status}
            onChange={(e: any) => setFormData({ ...formData, status: e.target.value })}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-[#4fa77e] focus:border-[#4fa77e]"
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Phone Number</label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e: any) => setFormData({ ...formData, phone: e.target.value })}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-[#4fa77e] focus:border-[#4fa77e]"
            placeholder="(555) 123-4567"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">PayPal Email</label>
          <input
            type="email"
            value={formData.paypalEmail}
            onChange={(e: any) => setFormData({ ...formData, paypalEmail: e.target.value })}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-[#4fa77e] focus:border-[#4fa77e]"
            placeholder="paypal@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Preferred Payment Method</label>
          <select
            value={formData.preferredPaymentMethod}
            onChange={(e: any) => setFormData({ ...formData, preferredPaymentMethod: e.target.value })}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-[#4fa77e] focus:border-[#4fa77e]"
          >
            <option value="paypal">PayPal</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="check">Check</option>
          </select>
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Notes</label>
          <textarea
            value={formData.notes}
            onChange={(e: any) => setFormData({ ...formData, notes: e.target.value })}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-[#4fa77e] focus:border-[#4fa77e]"
            rows={3}
            placeholder="Additional notes about commission structure, payment preferences, etc."
          />
        </div>

        <div className="col-span-2 flex justify-end space-x-3 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-[#4fa77e] text-white rounded-md hover:bg-[#3a8a6b] transition"
          >
            {influencer ? "Update" : "Create"} Influencer
          </button>
        </div>
      </form>
    </div>
  );
};