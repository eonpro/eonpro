import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

const MUTATION_QUEUE_KEY = 'offline-mutation-queue';

export interface QueuedMutation {
  id: string;
  path: string;
  method: string;
  body: string;
  createdAt: string;
}

export async function getMutationQueue(): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(MUTATION_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addToMutationQueue(mutation: Omit<QueuedMutation, 'id' | 'createdAt'>): Promise<void> {
  const queue = await getMutationQueue();
  queue.push({
    ...mutation,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
  });
  await AsyncStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(queue));
}

export async function removeMutationFromQueue(id: string): Promise<void> {
  const queue = await getMutationQueue();
  const updated = queue.filter((m) => m.id !== id);
  await AsyncStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(updated));
}

export async function clearMutationQueue(): Promise<void> {
  await AsyncStorage.removeItem(MUTATION_QUEUE_KEY);
}

export async function replayMutationQueue(
  apiFetch: (path: string, init?: RequestInit) => Promise<unknown>
): Promise<{ succeeded: number; failed: number }> {
  const queue = await getMutationQueue();
  if (queue.length === 0) return { succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;

  for (const mutation of queue) {
    try {
      await apiFetch(mutation.path, {
        method: mutation.method,
        body: mutation.body,
      });
      await removeMutationFromQueue(mutation.id);
      succeeded++;
    } catch {
      failed++;
    }
  }

  return { succeeded, failed };
}

export function subscribeToNetworkChanges(
  callback: (isConnected: boolean) => void
): () => void {
  const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    callback(state.isConnected ?? false);
  });
  return unsubscribe;
}

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected ?? false;
}
