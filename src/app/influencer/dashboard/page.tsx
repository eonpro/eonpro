"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Copy, Check, CreditCard, DollarSign, User, ChevronRight, Building2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { logger } from '@/lib/logger';

interface InfluencerStats {
  totalReferrals: number;
  convertedReferrals: number;
  conversionRate: number;
  pendingEarnings: number;
  totalEarnings: number;
  recentReferrals: {
    id: number;
    patient: { firstName: string; lastName: string };
    createdAt: string;
    isConverted: boolean;
    referralExpiresAt: string;
  }[];
  recentCommissions: {
    id: number;
    amount: number;
    createdAt: string;
    status: string;
    invoice: { stripeInvoiceNumber: string | null };
  }[];
}

export default function InfluencerDashboardPage() {
  const [stats, setStats] = useState<InfluencerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'payouts'>('overview');
  const router = useRouter();

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/influencers/stats");
      if (res.status === 401) {
        router.push("/influencer/login");
        return;
      }
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to fetch influencer stats");
      }
      const data = await res.json();
      setStats(data.stats);
      setPromoCode(data.promoCode);
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error("Error fetching influencer stats:", err);
      setError(errorMessage || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleCopyPromoCode = () => {
    if (promoCode) {
      navigator.clipboard.writeText(promoCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLogout = () => {
    document.cookie = "influencer-token=; Max-Age=0; path=/";
    router.push("/influencer/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 text-[#4fa77e] animate-spin" />
        <p className="ml-3 text-gray-600">Loading dashboard...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error || "Failed to load data"}</p>
          <button
            onClick={() => router.push("/influencer/login")}
            className="mt-4 text-[#4fa77e] hover:underline"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <header className="bg-transparent">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <Image
                src="https://static.wixstatic.com/media/c49a9b_3379db3991ba4ca48dcbb3a979570842~mv2.png"
                alt="EONPRO"
                width={120}
                height={30}
                priority
              />
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Influencer Dashboard</h1>
                <p className="text-sm text-gray-600">Welcome back!</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Promo Code Section */}
        <div className="bg-white rounded-lg shadow p-6 flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold text-gray-700">Your Promo Code:</p>
            <p className="text-3xl font-extrabold text-[#4fa77e] mt-1">{promoCode}</p>
          </div>
          <button
            onClick={handleCopyPromoCode}
            className="flex items-center px-4 py-2 bg-[#4fa77e] text-white rounded-md hover:bg-[#3a8a6b] transition"
          >
            {copied ? <Check className="h-5 w-5 mr-2" /> : <Copy className="h-5 w-5 mr-2" />}
            {copied ? "Copied!" : "Copy Code"}
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition ${
                activeTab === 'overview'
                  ? 'border-[#4fa77e] text-[#4fa77e]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <DollarSign className="inline-block w-5 h-5 mr-2" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('payouts')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition ${
                activeTab === 'payouts'
                  ? 'border-[#4fa77e] text-[#4fa77e]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <CreditCard className="inline-block w-5 h-5 mr-2" />
              Payout Settings
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' ? (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Total Referrals" value={stats.totalReferrals || 0} />
              <StatCard title="Converted Referrals" value={stats.convertedReferrals || 0} />
              <StatCard title="Conversion Rate" value={`${(stats.conversionRate || 0).toFixed(1)}%`} />
              <StatCard title="Pending Earnings" value={`$${(stats.pendingEarnings || 0).toFixed(2)}`} />
              <StatCard title="Total Paid" value={`$${(stats.totalEarnings || 0).toFixed(2)}`} />
            </div>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-xl font-semibold mb-4 text-gray-800">Recent Referrals</h3>
                {!stats.recentReferrals || stats.recentReferrals.length === 0 ? (
                  <p className="text-gray-500">No recent referrals yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {stats.recentReferrals.map((referral: any) => (
                      <li key={referral.id} className="py-3 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {referral.patient.firstName} {referral.patient.lastName}
                          </p>
                          <p className="text-xs text-gray-500">
                            Referred on {new Date(referral.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            referral.isConverted
                              ? "bg-green-100 text-green-800"
                              : new Date(referral.referralExpiresAt) < new Date()
                              ? "bg-gray-100 text-gray-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {referral.isConverted 
                            ? "CONVERTED" 
                            : new Date(referral.referralExpiresAt) < new Date() 
                            ? "EXPIRED" 
                            : "PENDING"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-xl font-semibold mb-4 text-gray-800">Recent Commissions</h3>
                {!stats.recentCommissions || stats.recentCommissions.length === 0 ? (
                  <p className="text-gray-500">No recent commissions yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {stats.recentCommissions.map((commission: any) => (
                      <li key={commission.id} className="py-3 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Commission for Invoice: {commission.invoice?.stripeInvoiceNumber || "N/A"}
                          </p>
                          <p className="text-xs text-gray-500">
                            Earned on {new Date(commission.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            commission.status === "PAID"
                              ? "bg-green-100 text-green-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          ${commission.amount.toFixed(2)} ({commission.status})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Payout Settings Tab */
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Building2 className="h-12 w-12 text-[#4fa77e]" />
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800">Bank Account Management</h3>
                    <p className="text-sm text-gray-600 mt-1">Add and manage your bank accounts for commission payouts</p>
                  </div>
                </div>
                <Link
                  href="/influencer/bank-accounts"
                  className="flex items-center px-4 py-2 bg-[#4fa77e] text-white rounded-md hover:bg-[#3a8a6b] transition"
                >
                  Manage Bank Accounts
                  <ChevronRight className="h-5 w-5 ml-2" />
                </Link>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-semibold mb-4 text-gray-800">Payment Preferences</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-700">Minimum Payout Threshold</span>
                  <span className="font-semibold">$100.00</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-700">Payout Frequency</span>
                  <span className="font-semibold">Monthly</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-700">Next Payout Date</span>
                  <span className="font-semibold">{new Date(new Date().setMonth(new Date().getMonth() + 1, 1)).toLocaleDateString()}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-4">
                Contact support to change your payment preferences
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
}

const StatCard: React.FC<StatCardProps> = ({ title, value }) => (
  <div className="bg-white rounded-lg shadow p-5">
    <p className="text-sm font-medium text-gray-500">{title}</p>
    <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
  </div>
);