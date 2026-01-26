'use client';

/**
 * Affiliate Portal Demo Page
 * 
 * Shows the affiliate dashboard UI with mock data for demonstration.
 * No authentication required.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Mock data
const mockData = {
  affiliate: {
    displayName: 'Sarah Johnson',
    tier: 'Gold Partner',
    tierProgress: 75,
    email: 'sarah@example.com',
    phone: '+1 (555) 123-4567',
    referralCode: 'SARAH2024',
    joinedDate: 'January 2024',
  },
  earnings: {
    availableBalance: 125000,
    pendingBalance: 45000,
    lifetimeEarnings: 850000,
    thisMonth: 85000,
    lastMonth: 72000,
    monthOverMonthChange: 18.1,
  },
  performance: {
    clicks: 1247,
    conversions: 89,
    conversionRate: 7.1,
    avgOrderValue: 12500,
  },
  recentActivity: [
    { id: '1', type: 'conversion' as const, amount: 2500, createdAt: new Date().toISOString(), description: 'New conversion' },
    { id: '2', type: 'conversion' as const, amount: 1800, createdAt: new Date(Date.now() - 3600000).toISOString(), description: 'New conversion' },
    { id: '3', type: 'payout' as const, amount: 50000, createdAt: new Date(Date.now() - 86400000).toISOString(), description: 'Payout completed' },
  ],
  earningsHistory: [
    { id: '1', date: 'Jan 20, 2026', type: 'Commission', amount: 2500, status: 'Paid' },
    { id: '2', date: 'Jan 18, 2026', type: 'Commission', amount: 1800, status: 'Paid' },
    { id: '3', date: 'Jan 15, 2026', type: 'Bonus', amount: 5000, status: 'Paid' },
    { id: '4', date: 'Jan 12, 2026', type: 'Commission', amount: 3200, status: 'Paid' },
    { id: '5', date: 'Jan 10, 2026', type: 'Commission', amount: 1500, status: 'Pending' },
  ],
  links: [
    { id: '1', name: 'Main Link', url: 'https://eonpro.com/r/SARAH2024', clicks: 892, conversions: 67 },
    { id: '2', name: 'Instagram Bio', url: 'https://eonpro.com/r/SARAH2024-ig', clicks: 234, conversions: 15 },
    { id: '3', name: 'Email Campaign', url: 'https://eonpro.com/r/SARAH2024-email', clicks: 121, conversions: 7 },
  ],
};

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

const formatPercent = (value: number) => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

// Static time labels to avoid hydration mismatch
const activityTimes = ['Just now', '1h ago', '1d ago'];

// Tab Icons
const HomeIcon = ({ active }: { active: boolean }) => (
  <svg className={`w-6 h-6 ${active ? 'text-gray-900' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const EarningsIcon = ({ active }: { active: boolean }) => (
  <svg className={`w-6 h-6 ${active ? 'text-gray-900' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const LinksIcon = ({ active }: { active: boolean }) => (
  <svg className={`w-6 h-6 ${active ? 'text-gray-900' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

const AccountIcon = ({ active }: { active: boolean }) => (
  <svg className={`w-6 h-6 ${active ? 'text-gray-900' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

type TabType = 'home' | 'earnings' | 'links' | 'account';

export default function AffiliateDemo() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  // Static greeting to avoid hydration mismatch
  const greeting = 'Good morning';

  const tabs = [
    { id: 'home' as const, label: 'Home', icon: HomeIcon },
    { id: 'earnings' as const, label: 'Earnings', icon: EarningsIcon },
    { id: 'links' as const, label: 'Links', icon: LinksIcon },
    { id: 'account' as const, label: 'Account', icon: AccountIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-2 z-50">
        <div className="flex items-center justify-around h-16">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex flex-col items-center justify-center flex-1 py-2 relative"
            >
              <tab.icon active={activeTab === tab.id} />
              <span className={`text-xs mt-1 ${activeTab === tab.id ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                {tab.label}
              </span>
              {activeTab === tab.id && (
                <div className="absolute top-0 w-8 h-0.5 bg-gray-900 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </nav>

      <AnimatePresence mode="wait">
        {activeTab === 'home' && <HomeTab key="home" greeting={greeting} />}
        {activeTab === 'earnings' && <EarningsTab key="earnings" />}
        {activeTab === 'links' && <LinksTab key="links" />}
        {activeTab === 'account' && <AccountTab key="account" />}
      </AnimatePresence>
    </div>
  );
}

// ============ HOME TAB ============
function HomeTab({ greeting }: { greeting: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
    >
      {/* Header */}
      <header className="bg-white px-6 py-6 border-b border-gray-100">
        <div className="max-w-3xl mx-auto">
          <p className="text-gray-500 text-sm mb-1">{greeting}</p>
          <h1 className="text-2xl font-semibold text-gray-900">
            {mockData.affiliate.displayName}
          </h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {/* Balance Card */}
        <div className="bg-gray-900 text-white rounded-2xl p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-gray-400 text-sm mb-1">Available Balance</p>
              <p className="text-4xl font-semibold tracking-tight">
                {formatCurrency(mockData.earnings.availableBalance)}
              </p>
            </div>
            <span className="px-3 py-1 bg-white/10 rounded-full text-sm font-medium">
              {mockData.affiliate.tier}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="flex-1 py-3 bg-white text-gray-900 font-medium rounded-xl text-center hover:bg-gray-100 transition-colors">
              Withdraw
            </button>
            <button className="flex-1 py-3 bg-white/10 font-medium rounded-xl text-center hover:bg-white/20 transition-colors">
              View Details
            </button>
          </div>

          <p className="mt-4 text-gray-400 text-sm text-center">
            {formatCurrency(mockData.earnings.pendingBalance)} pending
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-5">
            <p className="text-gray-500 text-sm mb-1">This Month</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatCurrency(mockData.earnings.thisMonth)}
            </p>
            <p className="text-sm mt-1 text-green-600">
              {formatPercent(mockData.earnings.monthOverMonthChange)} vs last month
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5">
            <p className="text-gray-500 text-sm mb-1">Lifetime</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatCurrency(mockData.earnings.lifetimeEarnings)}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              Total earned
            </p>
          </div>
        </div>

        {/* Performance Overview */}
        <div className="bg-white rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold text-gray-900">This Month</h2>
            <span className="text-sm text-gray-500">View all</span>
          </div>
          
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-2xl font-semibold text-gray-900">
                {mockData.performance.clicks.toLocaleString()}
              </p>
              <p className="text-gray-500 text-sm mt-1">Clicks</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-gray-900">
                {mockData.performance.conversions}
              </p>
              <p className="text-gray-500 text-sm mt-1">Conversions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-gray-900">
                {mockData.performance.conversionRate}%
              </p>
              <p className="text-gray-500 text-sm mt-1">Conv. Rate</p>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Activity</h2>
            <span className="text-sm text-gray-500">View all</span>
          </div>
          
          <div className="space-y-4">
            {mockData.recentActivity.map((activity, index) => (
              <div key={activity.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center
                    ${activity.type === 'conversion' ? 'bg-green-50' : 'bg-[#fdf6e3]'}`}>
                    {activity.type === 'conversion' ? (
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-[#cab172]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{activity.description}</p>
                    <p className="text-xs text-gray-500">{activityTimes[index]}</p>
                  </div>
                </div>
                <span className={`font-medium ${activity.type === 'payout' ? 'text-gray-900' : 'text-green-600'}`}>
                  {activity.type === 'payout' ? '-' : '+'}
                  {formatCurrency(activity.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Demo Label */}
        <div className="text-center py-4">
          <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
            Demo Mode - Mock Data
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ============ EARNINGS TAB ============
function EarningsTab() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <header className="bg-white px-6 py-6 border-b border-gray-100">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Earnings</h1>
          <p className="text-gray-500 text-sm mt-1">Track your commissions and payouts</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-5">
            <p className="text-gray-500 text-sm mb-1">Available</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatCurrency(mockData.earnings.availableBalance)}
            </p>
            <button className="mt-3 w-full py-2 bg-gray-900 text-white text-sm font-medium rounded-lg">
              Withdraw
            </button>
          </div>
          <div className="bg-white rounded-2xl p-5">
            <p className="text-gray-500 text-sm mb-1">Pending</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatCurrency(mockData.earnings.pendingBalance)}
            </p>
            <p className="mt-3 text-xs text-gray-400">Clears in 7-14 days</p>
          </div>
        </div>

        {/* Earnings History */}
        <div className="bg-white rounded-2xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">History</h2>
          <div className="space-y-4">
            {mockData.earningsHistory.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-medium text-gray-900">{item.type}</p>
                  <p className="text-sm text-gray-500">{item.date}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-green-600">+{formatCurrency(item.amount)}</p>
                  <p className={`text-xs ${item.status === 'Paid' ? 'text-gray-400' : 'text-amber-500'}`}>
                    {item.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payout Settings */}
        <div className="bg-white rounded-2xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Payout Method</h2>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#fdf6e3] rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-[#cab172]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Bank Account</p>
                <p className="text-sm text-gray-500">****4567</p>
              </div>
            </div>
            <button className="text-sm text-[#b5a05a] font-medium">Change</button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============ LINKS TAB ============
function LinksTab() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyLink = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <header className="bg-white px-6 py-6 border-b border-gray-100">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Your Links</h1>
          <p className="text-gray-500 text-sm mt-1">Manage and track your referral links</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {/* Main Referral Code */}
        <div className="bg-gray-900 text-white rounded-2xl p-6">
          <p className="text-gray-400 text-sm mb-2">Your Referral Code</p>
          <div className="flex items-center justify-between">
            <p className="text-3xl font-bold tracking-wider">{mockData.affiliate.referralCode}</p>
            <button 
              onClick={() => copyLink('code', mockData.affiliate.referralCode || '')}
              className="px-4 py-2 bg-white/10 rounded-lg text-sm font-medium hover:bg-white/20 transition-colors"
            >
              {copied === 'code' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Links List */}
        <div className="space-y-4">
          {mockData.links.map((link) => (
            <div key={link.id} className="bg-white rounded-2xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-900">{link.name}</p>
                  <p className="text-sm text-gray-400 truncate max-w-[200px]">{link.url}</p>
                </div>
                <button 
                  onClick={() => copyLink(link.id, link.url)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                    ${copied === link.id 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {copied === link.id ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="flex gap-6 pt-3 border-t border-gray-100">
                <div>
                  <p className="text-lg font-semibold text-gray-900">{link.clicks}</p>
                  <p className="text-xs text-gray-500">Clicks</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">{link.conversions}</p>
                  <p className="text-xs text-gray-500">Conversions</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">
                    {((link.conversions / link.clicks) * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-500">Rate</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Create New Link */}
        <button className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-500 font-medium hover:border-gray-300 hover:text-gray-600 transition-colors">
          + Create New Link
        </button>
      </div>
    </motion.div>
  );
}

// ============ ACCOUNT TAB ============
function AccountTab() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <header className="bg-white px-6 py-6 border-b border-gray-100">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Account</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your profile and settings</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {/* Profile Card */}
        <div className="bg-white rounded-2xl p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-[#cab172] to-[#a89048] rounded-full flex items-center justify-center text-white text-2xl font-bold">
              {mockData.affiliate.displayName.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{mockData.affiliate.displayName}</h2>
              <p className="text-gray-500">{mockData.affiliate.tier}</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="text-gray-500">Email</span>
              <span className="text-gray-900">{mockData.affiliate.email}</span>
            </div>
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="text-gray-500">Phone</span>
              <span className="text-gray-900">{mockData.affiliate.phone}</span>
            </div>
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="text-gray-500">Referral Code</span>
              <span className="text-gray-900 font-mono">{mockData.affiliate.referralCode}</span>
            </div>
            <div className="flex justify-between py-3">
              <span className="text-gray-500">Member Since</span>
              <span className="text-gray-900">{mockData.affiliate.joinedDate}</span>
            </div>
          </div>
        </div>

        {/* Settings Menu */}
        <div className="bg-white rounded-2xl divide-y divide-gray-100">
          <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              <span className="font-medium text-gray-900">Edit Profile</span>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="font-medium text-gray-900">Notification Settings</span>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <span className="font-medium text-gray-900">Payout Settings</span>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium text-gray-900">Help & Support</span>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-medium text-gray-900">Terms of Service</span>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Sign Out */}
        <button className="w-full py-4 text-red-600 font-medium bg-red-50 rounded-2xl hover:bg-red-100 transition-colors">
          Sign Out
        </button>

        {/* Version */}
        <p className="text-center text-xs text-gray-400">Version 1.0.0 (Demo)</p>
      </div>
    </motion.div>
  );
}
