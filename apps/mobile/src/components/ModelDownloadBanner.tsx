/**
 * Persistent banner that reports first-run model downloads.
 * Rendered at the root layout so it's visible across all tabs.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AutoDownloadStatus } from '../services/model-auto-downloader';

interface Props {
  status: AutoDownloadStatus;
  onCancel: () => void;
  onRetry: () => void;
}

function formatMb(bytes?: number): string {
  if (!bytes) return '';
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  return `${Math.round(bytes / 1_048_576)} MB`;
}

export function ModelDownloadBanner({ status, onCancel, onRetry }: Props) {
  if (status.phase === 'idle' || status.phase === 'done') return null;

  const isError = status.phase === 'error';
  const isChecking = status.phase === 'checking';
  const entry = status.currentModel;
  const pct = Math.round(status.fraction * 100);
  const sizeHint = entry ? formatMb(entry.sizeBytes) : '';

  return (
    <View style={[styles.banner, isError ? styles.err : styles.info]}>
      <View style={styles.row}>
        <View style={styles.textCol}>
          {isError ? (
            <>
              <Text style={styles.title}>AI model download failed</Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                {status.error}
              </Text>
            </>
          ) : isChecking ? (
            <>
              <Text style={styles.title}>Preparing AI models…</Text>
              <Text style={styles.subtitle}>Checking what's already on this device.</Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>
                Downloading {entry?.label ?? 'AI model'}
                {status.totalModels > 1
                  ? `  ·  ${status.completedModels + 1}/${status.totalModels}`
                  : ''}
              </Text>
              <Text style={styles.subtitle}>
                {pct}% of {sizeHint}  ·  first-run setup, can continue in background
              </Text>
            </>
          )}
        </View>
        {isError ? (
          <TouchableOpacity style={styles.action} onPress={onRetry}>
            <Text style={styles.actionText}>Retry</Text>
          </TouchableOpacity>
        ) : status.phase === 'downloading' ? (
          <TouchableOpacity style={styles.actionGhost} onPress={onCancel}>
            <Text style={styles.actionGhostText}>Cancel</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {status.phase === 'downloading' && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  info: {
    backgroundColor: '#0c1f3a',
    borderBottomColor: '#1e40af',
  },
  err: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderBottomColor: 'rgba(239, 68, 68, 0.4)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textCol: { flex: 1 },
  title: {
    color: '#dbeafe',
    fontSize: 13,
    fontWeight: '700',
  },
  subtitle: {
    color: '#93c5fd',
    fontSize: 11,
    marginTop: 2,
  },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#ef4444',
  },
  actionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  actionGhost: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.5)',
  },
  actionGhostText: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(147, 197, 253, 0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: '#38bdf8',
  },
});
