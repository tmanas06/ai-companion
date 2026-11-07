/**
 * Banner shown at the top of chat when the AETHRA backend is unreachable.
 * Dismisses itself when the backend comes back online.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AiStatus } from '../services/ai-status';

interface Props {
  status: AiStatus;
  onRetry: () => void;
}

export function AiStatusBanner({ status, onRetry }: Props) {
  if (status.state === 'online') return null;

  const isChecking = status.state === 'checking';
  return (
    <View style={[styles.banner, isChecking ? styles.bannerChecking : styles.bannerOffline]}>
      <View style={styles.textCol}>
        <Text style={styles.title}>
          {isChecking ? 'Connecting to AETHRA…' : 'AI server unreachable'}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {isChecking
            ? `Pinging ${status.baseUrl}`
            : status.error
              ? `${status.error} · ${status.baseUrl}`
              : `Can't reach ${status.baseUrl}`}
        </Text>
      </View>
      {isChecking ? (
        <ActivityIndicator size="small" color="#fde68a" />
      ) : (
        <TouchableOpacity style={styles.retry} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },
  bannerChecking: {
    backgroundColor: '#1e293b',
    borderBottomColor: '#334155',
  },
  bannerOffline: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderBottomColor: 'rgba(239, 68, 68, 0.4)',
  },
  textCol: {
    flex: 1,
  },
  title: {
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '700',
  },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 11,
    marginTop: 2,
  },
  retry: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#ef4444',
  },
  retryText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
