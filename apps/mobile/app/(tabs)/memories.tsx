/**
 * On-device memories editor. Lists the SQLite vector store, lets the user
 * read and delete individual memories. Nothing is sent off-device.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  deleteMemory,
  listMemories,
  MemoryRow,
} from '../../src/engine/memory-store';

function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function MemoriesScreen() {
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const load = useCallback(async () => {
    try {
      const data = await listMemories({ limit: 200 });
      setRows(data);
    } catch (err) {
      Alert.alert('Could not load memories', err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const confirmDelete = (row: MemoryRow) => {
    Alert.alert(
      'Delete memory',
      `Remove this memory? "${row.content.slice(0, 80)}${row.content.length > 80 ? '…' : ''}"`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteMemory(row.id);
            setRows((prev) => prev.filter((r) => r.id !== row.id));
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: MemoryRow }) => (
    <View style={styles.row}>
      <View style={styles.rowMeta}>
        <Text style={styles.rowType}>{item.memoryType}</Text>
        <Text style={styles.rowTime}>{timeAgo(item.createdAt)}</Text>
      </View>
      <Text style={styles.rowContent}>{item.content}</Text>
      <TouchableOpacity style={styles.deleteBtn} onPress={() => confirmDelete(item)}>
        <Text style={styles.deleteBtnText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Memories</Text>
        <Text style={styles.subtitle}>
          {rows.length} on this device · never leaves the phone
        </Text>
      </View>

      {loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Loading…</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No memories yet. Chat with on-device AI and this will fill up.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38bdf8" />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  list: {
    padding: 12,
    gap: 10,
  },
  row: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 6,
  },
  rowMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowType: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  rowTime: {
    color: '#64748b',
    fontSize: 11,
  },
  rowContent: {
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 20,
  },
  deleteBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#ef4444',
    marginTop: 4,
  },
  deleteBtnText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
});
