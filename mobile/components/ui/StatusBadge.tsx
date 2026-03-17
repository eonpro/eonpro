import { View, Text } from 'react-native';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  SCHEDULED: { bg: '#DBEAFE', text: '#1D4ED8' },
  CONFIRMED: { bg: '#D1FAE5', text: '#047857' },
  COMPLETED: { bg: '#F3F4F6', text: '#6B7280' },
  CANCELLED: { bg: '#FEE2E2', text: '#DC2626' },
  RESCHEDULED: { bg: '#FEF3C7', text: '#D97706' },
  NO_SHOW: { bg: '#FEE2E2', text: '#DC2626' },
  processing: { bg: '#DBEAFE', text: '#1D4ED8' },
  shipped: { bg: '#D1FAE5', text: '#047857' },
  in_transit: { bg: '#FEF3C7', text: '#D97706' },
  out_for_delivery: { bg: '#FDE68A', text: '#92400E' },
  delivered: { bg: '#D1FAE5', text: '#047857' },
  exception: { bg: '#FEE2E2', text: '#DC2626' },
  active: { bg: '#D1FAE5', text: '#047857' },
  pending: { bg: '#FEF3C7', text: '#D97706' },
  approved: { bg: '#D1FAE5', text: '#047857' },
  rejected: { bg: '#FEE2E2', text: '#DC2626' },
};

const DEFAULT_COLORS = { bg: '#F3F4F6', text: '#6B7280' };

interface Props {
  status: string;
  label?: string;
}

export default function StatusBadge({ status, label }: Props) {
  const colors = STATUS_COLORS[status] ?? DEFAULT_COLORS;
  const displayLabel = label ?? status.replace(/_/g, ' ');

  return (
    <View className="rounded-full px-2.5 py-1 self-start" style={{ backgroundColor: colors.bg }}>
      <Text className="text-xs font-medium capitalize" style={{ color: colors.text }}>
        {displayLabel}
      </Text>
    </View>
  );
}
