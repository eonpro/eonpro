import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { apiFetch } from '@/lib/api-client';
import StatusBadge from '@/components/ui/StatusBadge';
import { SkeletonList } from '@/components/ui/Skeleton';

interface TicketDetail {
  id: number;
  ticketNumber: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  assignedTo: { firstName: string; lastName: string } | null;
}

interface Comment {
  id: number;
  createdAt: string;
  comment: string;
  author: {
    firstName: string;
    lastName: string;
    role: string;
  };
}

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useBrandColors();
  const router = useRouter();
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ticket = usePortalQuery<{ ticket: TicketDetail }>(
    ['ticket', id],
    `/api/patient-portal/tickets/${id}`
  );

  const comments = usePortalQuery<{ comments: Comment[] }>(
    ['ticket-comments', id],
    `/api/patient-portal/tickets/${id}/comments`
  );

  const handleAddComment = useCallback(async () => {
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/patient-portal/tickets/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: commentText.trim() }),
      });
      setCommentText('');
      await comments.refetch();
    } catch {
      // Error handled
    } finally {
      setSubmitting(false);
    }
  }, [commentText, submitting, id, comments]);

  const t = ticket.data?.ticket;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 16 }}>
          {/* Header */}
          <View className="px-5 pt-4 pb-2">
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
            </TouchableOpacity>
          </View>

          {ticket.isLoading ? (
            <View className="px-5"><SkeletonList count={2} /></View>
          ) : t ? (
            <>
              {/* Ticket Info */}
              <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm mb-4">
                <View className="flex-row items-start justify-between mb-2">
                  <Text className="text-xs text-gray-400">{t.ticketNumber}</Text>
                  <StatusBadge status={t.status} />
                </View>
                <Text className="text-lg font-bold text-gray-900 mb-2">{t.title}</Text>
                <Text className="text-sm text-gray-600 leading-5">{t.description}</Text>
                <View className="flex-row items-center gap-3 mt-3 pt-3 border-t border-gray-50">
                  <Text className="text-xs text-gray-400 capitalize">
                    {t.category.replace(/_/g, ' ').toLowerCase()}
                  </Text>
                  <Text className="text-xs text-gray-400">{formatDate(t.createdAt)}</Text>
                  {t.assignedTo && (
                    <Text className="text-xs text-gray-400">
                      Assigned to {t.assignedTo.firstName} {t.assignedTo.lastName}
                    </Text>
                  )}
                </View>

                {t.resolutionNotes && (
                  <View className="mt-3 pt-3 border-t border-gray-100">
                    <Text className="text-xs font-medium text-gray-500 mb-1">Resolution</Text>
                    <Text className="text-sm text-gray-700">{t.resolutionNotes}</Text>
                  </View>
                )}
              </View>

              {/* Comments */}
              <View className="mx-5">
                <Text className="text-base font-semibold text-gray-900 mb-3">
                  Conversation ({comments.data?.comments?.length ?? 0})
                </Text>
                {(comments.data?.comments?.length ?? 0) > 0 ? (
                  comments.data!.comments.map((c) => {
                    const isPatient = c.author.role === 'patient';
                    return (
                      <View
                        key={c.id}
                        className={`mb-3 max-w-[85%] ${isPatient ? 'self-end' : 'self-start'}`}
                      >
                        {!isPatient && (
                          <Text className="text-xs text-gray-400 mb-1 px-1">
                            {c.author.firstName} {c.author.lastName}
                          </Text>
                        )}
                        <View
                          className="rounded-2xl px-4 py-3"
                          style={{ backgroundColor: isPatient ? colors.primaryLight : '#ffffff', borderWidth: isPatient ? 0 : 1, borderColor: '#E5E7EB' }}
                        >
                          <Text className="text-sm text-gray-900 leading-5">{c.comment}</Text>
                        </View>
                        <Text className="text-[10px] text-gray-400 mt-0.5 px-1">
                          {formatDateTime(c.createdAt)}
                        </Text>
                      </View>
                    );
                  })
                ) : (
                  <Text className="text-sm text-gray-400 text-center py-4">No replies yet</Text>
                )}
              </View>
            </>
          ) : (
            <View className="items-center py-20">
              <Text className="text-gray-500">Ticket not found</Text>
            </View>
          )}
        </ScrollView>

        {/* Reply Input */}
        {t && !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status) && (
          <View className="flex-row items-end px-5 py-3 border-t border-gray-100 bg-white">
            <TextInput
              className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm text-gray-900 mr-3 max-h-24"
              placeholder="Add a reply..."
              placeholderTextColor="#9CA3AF"
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={2000}
              editable={!submitting}
            />
            <TouchableOpacity
              onPress={handleAddComment}
              disabled={!commentText.trim() || submitting}
              className="rounded-full w-10 h-10 items-center justify-center mb-0.5"
              style={{ backgroundColor: commentText.trim() ? colors.primary : '#E5E7EB' }}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryText} size="small" />
              ) : (
                <Text style={{ color: commentText.trim() ? colors.primaryText : '#9CA3AF', fontSize: 18, fontWeight: '700' }}>↑</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}
