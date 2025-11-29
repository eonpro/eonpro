"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Check, Building2, CreditCard, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { logger } from '@/lib/logger';

interface BankAccount {
  id: number;
  bankName: string;
  accountNumber: string;
  routingNumber: string;
  accountType: string;
  isDefault: boolean;
  createdAt: string;
}

export default function InfluencerBankAccountsPage() {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    bankName: "",
    accountNumber: "",
    routingNumber: "",
    accountType: "checking",
    isDefault: false,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const fetchBankAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/influencers/bank-accounts");
      if (res.status === 401) {
        router.push("/influencer/login");
        return;
      }
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to fetch bank accounts");
      }
      const data = await res.json();
      setBankAccounts(data);
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error("Error fetching bank accounts:", err);
      setError(errorMessage || "Failed to load bank accounts.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchBankAccounts();
  }, [fetchBankAccounts]);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formData.bankName) {
      errors.bankName = "Bank name is required";
    }
    
    if (!formData.accountNumber || formData.accountNumber.length < 5) {
      errors.accountNumber = "Valid account number is required";
    }
    
    if (!formData.routingNumber || formData.routingNumber.length !== 9 || !/^\d+$/.test(formData.routingNumber)) {
      errors.routingNumber = "Routing number must be exactly 9 digits";
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setSubmitting(true);
    try {
      const res = await fetch("/api/influencers/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      
      if (res.status === 401) {
        router.push("/influencer/login");
        return;
      }
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to add bank account");
      }
      
      await fetchBankAccounts();
      setShowAddForm(false);
      setFormData({
        bankName: "",
        accountNumber: "",
        routingNumber: "",
        accountType: "checking",
        isDefault: false,
      });
      setFormErrors({});
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBankAccount = async (id: number) => {
    if (!confirm("Are you sure you want to remove this bank account?")) return;
    
    try {
      const res = await fetch(`/api/influencers/bank-accounts/${id}`, {
        method: "DELETE",
      });
      
      if (res.status === 401) {
        router.push("/influencer/login");
        return;
      }
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to delete bank account");
      }
      
      await fetchBankAccounts();
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    setError(errorMessage);
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      const res = await fetch(`/api/influencers/bank-accounts/${id}/set-default`, {
        method: "PUT",
      });
      
      if (res.status === 401) {
        router.push("/influencer/login");
        return;
      }
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to set default bank account");
      }
      
      await fetchBankAccounts();
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    setError(errorMessage);
    }
  };

  const maskAccountNumber = (accountNumber: string) => {
    if (accountNumber.length <= 4) return accountNumber;
    return "*".repeat(accountNumber.length - 4) + accountNumber.slice(-4);
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-10 w-10 text-[#4fa77e] animate-spin" />
        <p className="ml-3 text-gray-600">Loading bank accounts...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back to Dashboard Link */}
      <Link
        href="/influencer/dashboard"
        className="inline-flex items-center text-[#4fa77e] hover:text-[#3a8a6b] transition"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Dashboard
      </Link>

      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Bank Accounts</h1>
          <p className="text-sm text-gray-600 mt-1">Manage your payout bank accounts</p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center px-4 py-2 bg-[#4fa77e] text-white rounded-md hover:bg-[#3a8a6b] transition"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Bank Account
          </button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Add Bank Account Form */}
      {showAddForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Add New Bank Account</h3>
          <form onSubmit={handleAddBankAccount} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Bank Name</label>
                <input
                  type="text"
                  value={formData.bankName}
                  onChange={(e: any) => setFormData({ ...formData, bankName: e.target.value })}
                  className={`mt-1 block w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-[#4fa77e] focus:border-[#4fa77e] ${
                    formErrors.bankName ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="e.g., Chase Bank"
                />
                {formErrors.bankName && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.bankName}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Account Type</label>
                <select
                  value={formData.accountType}
                  onChange={(e: any) => setFormData({ ...formData, accountType: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-[#4fa77e] focus:border-[#4fa77e]"
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Account Number</label>
                <input
                  type="text"
                  value={formData.accountNumber}
                  onChange={(e: any) => setFormData({ ...formData, accountNumber: e.target.value })}
                  className={`mt-1 block w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-[#4fa77e] focus:border-[#4fa77e] ${
                    formErrors.accountNumber ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="Enter account number"
                />
                {formErrors.accountNumber && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.accountNumber}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Routing Number</label>
                <input
                  type="text"
                  value={formData.routingNumber}
                  onChange={(e: any) => setFormData({ ...formData, routingNumber: e.target.value })}
                  maxLength={9}
                  className={`mt-1 block w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-[#4fa77e] focus:border-[#4fa77e] ${
                    formErrors.routingNumber ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="9-digit routing number"
                />
                {formErrors.routingNumber && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.routingNumber}</p>
                )}
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isDefault"
                checked={formData.isDefault}
                onChange={(e: any) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="h-4 w-4 text-[#4fa77e] focus:ring-[#4fa77e] border-gray-300 rounded"
              />
              <label htmlFor="isDefault" className="ml-2 block text-sm text-gray-700">
                Set as default payout account
              </label>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setFormErrors({});
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center px-4 py-2 bg-[#4fa77e] text-white rounded-md hover:bg-[#3a8a6b] transition disabled:opacity-50"
                disabled={submitting}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Account
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bank Accounts List */}
      <div className="space-y-4">
        {bankAccounts.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Bank Accounts</h3>
            <p className="text-gray-500 mb-6">Add a bank account to receive commission payouts</p>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center px-4 py-2 bg-[#4fa77e] text-white rounded-md hover:bg-[#3a8a6b] transition"
              >
                <Plus className="h-5 w-5 mr-2" />
                Add Your First Bank Account
              </button>
            )}
          </div>
        ) : (
          bankAccounts.map((account: any) => (
            <div
              key={account.id}
              className="bg-white rounded-lg shadow p-6 flex items-center justify-between"
            >
              <div className="flex items-start space-x-4">
                <Building2 className="h-8 w-8 text-[#4fa77e] mt-1" />
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-semibold text-gray-900">{account.bankName}</h3>
                    {account.isDefault && (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {account.accountType === "checking" ? "Checking" : "Savings"} Account ending in {maskAccountNumber(account.accountNumber)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Routing: ***{account.routingNumber.slice(-4)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Added {new Date(account.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex space-x-2">
                {!account.isDefault && (
                  <button
                    onClick={() => handleSetDefault(account.id)}
                    className="px-3 py-1 text-sm border border-[#4fa77e] text-[#4fa77e] rounded hover:bg-[#4fa77e] hover:text-white transition"
                  >
                    Set as Default
                  </button>
                )}
                <button
                  onClick={() => handleDeleteBankAccount(account.id)}
                  className="text-red-600 hover:text-red-800 transition"
                  title="Remove bank account"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
