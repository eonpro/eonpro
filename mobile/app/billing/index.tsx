import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { apiFetch } from '@/lib/api-client';
import StatusBadge from '@/components/ui/StatusBadge';
import { SkeletonList } from '@/components/ui/Skeleton';

interface BillingData {
  subscription: { id: string; planName: string; amount: number; interval: string; status: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean } | null;
  paymentMethods: Array<{ id: string; brand: string; last4: string; expMonth: number; expYear: number; isDefault: boolean }>;
  invoices: Array<{ id: string; number: string; amount: number; status: string; date: string; description: string }>;
  upcomingInvoice: { amount: number; date: string } | null;
}

export default function BillingScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const billing = usePortalQuery<BillingData>(['billing'], '/api/patient-portal/billing');
  const onRefresh = useCallback(async () => { setRefreshing(true); await billing.refetch(); setRefreshing(false); }, [billing]);

  async function openStripePortal() {
    try {
      const data = await apiFetch<{ url: string }>('/api/patient-portal/billing/portal', { method: 'POST' });
      await WebBrowser.openBrowserAsync(data.url);
    } catch {
      // Fallback
    }
  }

  const sub = billing.data?.subscription;
  const methods = billing.data?.paymentMethods ?? [];
  const invoices = billing.data?.invoices ?? [];

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openStripePortal} className="rounded-lg px-3 py-1.5" style={{ backgroundColor: colors.primary }}>
            <Text className="text-xs font-semibold" style={{ color: colors.primaryText }}>Manage</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Billing</Text>

        {billing.isLoading ? <View className="px-5"><SkeletonList count={3} /></View> : (
          <>
            {/* Subscription */}
            {sub && (
              <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm mb-4">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-base font-semibold text-gray-900">{sub.planName}</Text>
                  <StatusBadge status={sub.status} />
                </View>
                <Text className="text-2xl font-bold" style={{ color: colors.primary }}>${(sub.amount / 100).toFixed(2)}<Text className="text-sm text-gray-400">/{sub.interval}</Text></Text>
                <Text className="text-xs text-gray-400 mt-2">Renews {formatDate(sub.currentPeriodEnd)}</Text>
                {sub.cancelAtPeriodEnd && <Text className="text-xs text-red-500 mt-1">Cancels at end of period</Text>}
              </View>
            )}

            {/* Payment Methods */}
            {methods.length > 0 && (
              <View className="mx-5 mb-4">
                <Text className="text-base font-semibold text-gray-900 mb-3">Payment Methods</Text>
                {methods.map((m) => (
                  <View key={m.id} className="bg-white rounded-xl p-4 shadow-sm mb-2 flex-row items-center">
                    <Text className="text-lg mr-3">💳</Text>
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-gray-900 capitalize">{m.brand} •••• {m.last4}</Text>
                      <Text className="text-xs text-gray-400">Exp {m.expMonth}/{m.expYear}</Text>
                    </View>
                    {m.isDefault && <Text className="text-xs text-green-600 font-medium">Default</Text>}
                  </View>
                ))}
              </View>
            )}

            {/* Invoices */}
            <View className="px-5">
              <Text className="text-base font-semibold text-gray-900 mb-3">Invoices</Text>
              {invoices.length > 0 ? invoices.slice(0, 10).map((inv) => (
                <View key={inv.id} className="bg-white rounded-xl p-4 shadow-sm mb-2 flex-row items-center justify-between">
                  <View>
                    <Text className="text-sm font-medium text-gray-900">{inv.number}</Text>
                    <Text className="text-xs text-gray-400">{inv.description}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-sm font-semibold text-gray-900">${(inv.amount / 100).toFixed(2)}</Text>
                    <StatusBadge status={inv.status} />
                  </View>
                </View>
              )) : <Text className="text-sm text-gray-400 text-center py-4">No invoices yet</Text>}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}
