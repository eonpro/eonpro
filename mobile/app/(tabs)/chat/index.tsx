import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { apiFetch } from '@/lib/api-client';

interface ChatMessage {
  id: number;
  message: string;
  direction: 'INBOUND' | 'OUTBOUND';
  senderName?: string;
  createdAt: string;
}

export default function ChatScreen() {
  const colors = useBrandColors();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const messages = usePortalQuery<{ messages: ChatMessage[] }>(
    ['chat-messages'],
    '/api/patient-chat?limit=50',
    { refetchInterval: 10_000 }
  );

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await apiFetch('/api/patient-chat', {
        method: 'POST',
        body: JSON.stringify({ message: input.trim(), channel: 'WEB' }),
      });
      setInput('');
      await messages.refetch();
    } catch {
      // Error handled by API client
    } finally {
      setSending(false);
    }
  }, [input, sending, messages]);

  const sortedMessages = [...(messages.data?.messages ?? [])].reverse();

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <View className="px-5 pt-4 pb-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Messages</Text>
        <Text className="text-sm text-gray-500">Chat with your care team</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={90}
      >
        <FlatList
          data={sortedMessages}
          keyExtractor={(item) => String(item.id)}
          inverted
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <Text className="text-4xl mb-3">💬</Text>
              <Text className="text-base text-gray-500">No messages yet</Text>
              <Text className="text-sm text-gray-400 mt-1">Send a message to your care team</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isOutbound = item.direction === 'OUTBOUND';
            return (
              <View
                className={`mb-2 max-w-[80%] ${isOutbound ? 'self-end' : 'self-start'}`}
              >
                {!isOutbound && item.senderName && (
                  <Text className="text-xs text-gray-400 mb-1">{item.senderName}</Text>
                )}
                <View
                  className="rounded-2xl px-4 py-2.5"
                  style={{
                    backgroundColor: isOutbound ? colors.primary : '#F3F4F6',
                  }}
                >
                  <Text
                    className="text-sm"
                    style={{ color: isOutbound ? colors.primaryText : '#1F2937' }}
                  >
                    {item.message}
                  </Text>
                </View>
                <Text className="text-xs text-gray-400 mt-0.5 px-1">
                  {formatTime(item.createdAt)}
                </Text>
              </View>
            );
          }}
        />

        {/* Input Bar */}
        <View className="flex-row items-center px-4 py-3 border-t border-gray-100 bg-white">
          <TextInput
            className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm text-gray-900 mr-3"
            placeholder="Type a message..."
            placeholderTextColor="#9CA3AF"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            editable={!sending}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim() || sending}
            className="rounded-full w-10 h-10 items-center justify-center"
            style={{
              backgroundColor: input.trim() ? colors.primary : '#E5E7EB',
            }}
          >
            <Text style={{ color: input.trim() ? colors.primaryText : '#9CA3AF', fontSize: 16 }}>
              ↑
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}
