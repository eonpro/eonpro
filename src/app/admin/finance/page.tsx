'use client';

import { DollarSign, TrendingUp, CreditCard, FileText, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function AdminFinancePage() {
  const stats = [
    { label: 'Total Revenue', value: '$127,450', change: '+12.5%', trend: 'up', icon: DollarSign },
    { label: 'Monthly Recurring', value: '$45,678', change: '+8.2%', trend: 'up', icon: TrendingUp },
    { label: 'Outstanding', value: '$12,340', change: '-3.1%', trend: 'down', icon: CreditCard },
    { label: 'Invoices Sent', value: '156', change: '+15%', trend: 'up', icon: FileText },
  ];

  const recentTransactions = [
    { id: 1, patient: 'John Smith', amount: 250, type: 'Payment', status: 'Completed', date: '2024-01-15' },
    { id: 2, patient: 'Sarah Johnson', amount: 175, type: 'Invoice', status: 'Pending', date: '2024-01-14' },
    { id: 3, patient: 'Mike Davis', amount: 500, type: 'Payment', status: 'Completed', date: '2024-01-14' },
    { id: 4, patient: 'Emily Brown', amount: 325, type: 'Refund', status: 'Processed', date: '2024-01-13' },
    { id: 5, patient: 'Chris Wilson', amount: 450, type: 'Payment', status: 'Completed', date: '2024-01-12' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
        <p className="text-gray-600 mt-1">Track revenue, payments, and financial metrics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <Icon className="h-6 w-6 text-emerald-600" />
                </div>
                <span className={`flex items-center text-sm font-medium ${
                  stat.trend === 'up' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {stat.change}
                  {stat.trend === 'up' ? (
                    <ArrowUpRight className="h-4 w-4 ml-1" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 ml-1" />
                  )}
                </span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900">{stat.value}</h3>
              <p className="text-sm text-gray-600 mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recentTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{tx.patient}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{tx.type}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${tx.amount}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      tx.status === 'Completed' ? 'bg-green-100 text-green-800' :
                      tx.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{tx.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

