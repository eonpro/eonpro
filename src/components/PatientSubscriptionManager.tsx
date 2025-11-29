'use client';

import { useState, useEffect } from 'react';
import { formatPlanPrice } from '@/config/billingPlans';
import { Patient, Provider, Order } from '@/types/models';

interface Subscription {
  id: number;
  planName: string;
  planDescription: string;
  status: string;
  amount: number;
  interval: string;
  intervalCount: number;
  startDate: string;
  currentPeriodEnd: string;
  nextBillingDate: string | null;
  canceledAt: string | null;
  pausedAt: string | null;
  resumeAt: string | null;
}

interface PatientSubscriptionManagerProps {
  patientId: number;
  patientName: string;
}

export function PatientSubscriptionManager({ patientId, patientName }: PatientSubscriptionManagerProps) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const fetchSubscriptions = async () => {
    try {
      const res = await fetch(`/api/patients/${patientId}/subscriptions`);
      if (!res.ok) throw new Error('Failed to fetch subscriptions');
      const data = await res.json();
      setSubscriptions(data);
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [patientId]);

  const handlePause = async (subscriptionId: number) => {
    setProcessingId(subscriptionId);
    try {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!res.ok) throw new Error('Failed to pause subscription');
      
      await fetchSubscriptions();
      alert('Subscription paused successfully');
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    alert(`Error: ${errorMessage}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleResume = async (subscriptionId: number) => {
    setProcessingId(subscriptionId);
    try {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!res.ok) throw new Error('Failed to resume subscription');
      
      await fetchSubscriptions();
      alert('Subscription resumed successfully');
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    alert(`Error: ${errorMessage}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (subscriptionId: number) => {
    if (!confirm('Are you sure you want to cancel this subscription? This action cannot be undone.')) {
      return;
    }
    
    setProcessingId(subscriptionId);
    try {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!res.ok) throw new Error('Failed to cancel subscription');
      
      await fetchSubscriptions();
      alert('Subscription canceled successfully');
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    alert(`Error: ${errorMessage}`);
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (subscription: Subscription) => {
    const status = subscription.status.toUpperCase();
    let className = 'px-2 py-1 text-xs font-medium rounded-full ';
    
    switch (status) {
      case 'ACTIVE':
        className += 'bg-green-100 text-green-800';
        break;
      case 'PAUSED':
        className += 'bg-yellow-100 text-yellow-800';
        break;
      case 'CANCELED':
        className += 'bg-red-100 text-red-800';
        break;
      case 'PAST_DUE':
        className += 'bg-orange-100 text-orange-800';
        break;
      default:
        className += 'bg-gray-100 text-gray-800';
    }
    
    return <span className={className}>{status}</span>;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-600">Error loading subscriptions: {error}</p>
      </div>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Recurring Subscriptions</h3>
        <p className="text-gray-500">No active subscriptions</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-4">Recurring Subscriptions</h3>
        
        <div className="space-y-4">
          {subscriptions.map((subscription: any) => (
            <div key={subscription.id} className="border rounded-lg p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{subscription.planName}</h4>
                  <p className="text-sm text-gray-600">{subscription.planDescription}</p>
                </div>
                <div className="ml-4">
                  {getStatusBadge(subscription)}
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                <div>
                  <span className="text-gray-600">Amount:</span>
                  <p className="font-medium text-[#4fa77e]">
                    {formatPlanPrice(subscription.amount)}/{subscription.interval}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Started:</span>
                  <p className="font-medium">
                    {new Date(subscription.startDate).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Current Period:</span>
                  <p className="font-medium">
                    Until {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                </div>
                {subscription.nextBillingDate && (
                  <div>
                    <span className="text-gray-600">Next Billing:</span>
                    <p className="font-medium">
                      {new Date(subscription.nextBillingDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
              
              {subscription.pausedAt && (
                <div className="mb-3 p-2 bg-yellow-50 rounded text-sm">
                  <span className="text-yellow-800">
                    Paused since {new Date(subscription.pausedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
              
              {subscription.canceledAt && (
                <div className="mb-3 p-2 bg-red-50 rounded text-sm">
                  <span className="text-red-800">
                    Canceled on {new Date(subscription.canceledAt).toLocaleDateString()}
                  </span>
                </div>
              )}
              
              <div className="flex gap-2">
                {subscription.status === 'ACTIVE' && (
                  <>
                    <button
                      onClick={() => handlePause(subscription.id)}
                      disabled={processingId === subscription.id}
                      className="px-3 py-1.5 text-sm bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 disabled:opacity-50"
                    >
                      {processingId === subscription.id ? 'Processing...' : 'Pause'}
                    </button>
                    <button
                      onClick={() => handleCancel(subscription.id)}
                      disabled={processingId === subscription.id}
                      className="px-3 py-1.5 text-sm bg-red-100 text-red-800 rounded-lg hover:bg-red-200 disabled:opacity-50"
                    >
                      {processingId === subscription.id ? 'Processing...' : 'Cancel'}
                    </button>
                  </>
                )}
                
                {subscription.status === 'PAUSED' && (
                  <>
                    <button
                      onClick={() => handleResume(subscription.id)}
                      disabled={processingId === subscription.id}
                      className="px-3 py-1.5 text-sm bg-green-100 text-green-800 rounded-lg hover:bg-green-200 disabled:opacity-50"
                    >
                      {processingId === subscription.id ? 'Processing...' : 'Resume'}
                    </button>
                    <button
                      onClick={() => handleCancel(subscription.id)}
                      disabled={processingId === subscription.id}
                      className="px-3 py-1.5 text-sm bg-red-100 text-red-800 rounded-lg hover:bg-red-200 disabled:opacity-50"
                    >
                      {processingId === subscription.id ? 'Processing...' : 'Cancel'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
