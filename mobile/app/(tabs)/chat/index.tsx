import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { apiFetch } from '@/lib/api-client';
import { connectSocket, EventType, onSocketEvent, disconnectSocket } from '@/lib/socket';
import * as Haptics from 'expo-haptics';

interface ChatMessage {
  id: number;
  message: string;
  direction: 'INBOUND' | 'OUTBOUND';
  senderType: string;
  senderName?: string;
  createdAt: string;
  status?: string;
}

export default function ChatScreen() {
  const colors = useBrandColors();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const messages = usePortalQuery<{ messages: ChatMessage[] }>(
    ['chat-messages'],
    '/api/patient-chat?limit=50',
    {
      refetchInterval: socketConnected ? false : 10_000,
    }
  );

  // Socket.IO for real-time updates
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    async function initSocket() {
      const socket = await connectSocket();
      if (!socket) return;

      setSocketConnected(socket.connected);

      socket.on('connect', () => setSocketConnected(true));
      socket.on('disconnect', () => setSocketConnected(false));

      cleanup = onSocketEvent(EventType.DATA_UPDATE, (data: unknown) => {
        const payload = data as { entity?: string };
        if (payload.entity === 'chat_message') {
          messages.refetch();
        }
      });
    }

    initSocket();

    return () => {
      cleanup?.();
    };
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await apiFetch('/api/patient-chat', {
        method: 'POST',
        body: JSON.stringify({ message: text, channel: 'WEB' }),
      });
      await messages.refetch();
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages]);

  const sortedMessages = [...(messages.data?.messages ?? [])].reverse();

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      {/* Header */}
      <View className="px-5 pt-4 pb-3 border-b border-gray-100">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xl font-bold text-gray-900">Messages</Text>
            <Text className="text-sm text-gray-500">Chat with your care team</Text>
          </View>
          <View className="flex-row items-center">
            <View
              className="w-2 h-2 rounded-full mr-1.5"
              style={{ backgroundColor: socketConnected ? '#10B981' : '#9CA3AF' }}
            />
            <Text className="text-xs text-gray-400">
              {socketConnected ? 'Live' : 'Polling'}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
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
          renderItem={({ item }) => <MessageBubble message={item} colors={colors} />}
        />

        {/* Input Bar */}
        <View className="flex-row items-end px-4 py-3 border-t border-gray-100 bg-white">
          <TextInput
            className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm text-gray-900 mr-3 max-h-24"
            placeholder="Type a message..."
            placeholderTextColor="#9CA3AF"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            editable={!sending}
            returnKeyType="default"
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim() || sending}
            className="rounded-full w-10 h-10 items-center justify-center mb-0.5"
            style={{
              backgroundColor: input.trim() ? colors.primary : '#E5E7EB',
            }}
          >
            <Text style={{ color: input.trim() ? colors.primaryText : '#9CA3AF', fontSize: 18, fontWeight: '700' }}>
              ↑
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({ message, colors }: { message: ChatMessage; colors: { primary: string; primaryText: string } }) {
  const isOutbound = message.direction === 'OUTBOUND';

  return (
    <View className={`mb-2.5 max-w-[80%] ${isOutbound ? 'self-end' : 'self-start'}`}>
      {!isOutbound && message.senderName && (
        <Text className="text-xs text-gray-400 mb-1 px-1">{message.senderName}</Text>
      )}
      <View
        className={`rounded-2xl px-4 py-2.5 ${isOutbound ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
        style={{
          backgroundColor: isOutbound ? colors.primary : '#F3F4F6',
        }}
      >
        <Text
          className="text-sm leading-5"
          style={{ color: isOutbound ? colors.primaryText : '#1F2937' }}
        >
          {message.message}
        </Text>
      </View>
      <View className={`flex-row items-center mt-0.5 px-1 ${isOutbound ? 'justify-end' : ''}`}>
        <Text className="text-[10px] text-gray-400">
          {formatTime(message.createdAt)}
        </Text>
        {isOutbound && message.status === 'READ' && (
          <Text className="text-[10px] text-blue-400 ml-1">✓✓</Text>
        )}
      </View>
    </View>
  );
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}
