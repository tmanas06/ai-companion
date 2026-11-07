/**
 * Mobile Settings & Account Screen.
 * Provides authentication controls, account switching, cache clearing,
 * and rendering preferences.
 * Ensures that logout clears stored tokens and cached avatar configurations.
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import {
  getAccessToken,
  clearTokens,
} from '../../src/services/auth-storage';
import {
  clearAvatarCache,
  getCachedAvatar,
} from '../../src/services/avatar-service';
import {
  getApiBaseUrl,
  persistApiBaseUrl,
} from '../../src/services/api-client';
import { pingAiBackend, AiStatus } from '../../src/services/ai-status';
import { normalizeServerUrl } from '../../src/services/server-config';
import {
  AiSource,
  getAiSource,
  setAiSource,
  getSelectedModelId,
  setSelectedModelId,
  getEmbeddingModelId,
  setEmbeddingModelId,
  getSttModelId,
  setSttModelId,
} from '../../src/services/preferences';
import {
  MODEL_CATALOG,
  DEFAULT_MODEL_ID,
  DEFAULT_EMBEDDING_MODEL_ID,
  DEFAULT_STT_MODEL_ID,
  ModelCatalogEntry,
  listModels,
} from '../../src/engine/model-catalog';
import {
  deleteModel,
  downloadModel,
  isModelDownloaded,
  DownloadHandle,
} from '../../src/engine/model-manager';
import { isLocalLlmAvailable } from '../../src/engine/local-llm';
import { countMemories, clearAllMemories } from '../../src/engine/memory-store';
import {
  benchmarkChat,
  benchmarkEmbedding,
  snapshotSystem,
  BenchmarkResult,
} from '../../src/engine/diagnostics';
import { checkModelFit, getDeviceRamMb } from '../../src/engine/device-caps';

export default function SettingsScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState<string>(getApiBaseUrl());
  const [cachedAvatarName, setCachedAvatarName] = useState<string | null>(null);
  const [probing, setProbing] = useState<boolean>(false);
  const [probeResult, setProbeResult] = useState<AiStatus | null>(null);
  const [aiSource, setAiSourceState] = useState<AiSource>('auto');
  const [selectedModelId, setSelectedModelIdState] = useState<string>(DEFAULT_MODEL_ID);
  const [downloadedMap, setDownloadedMap] = useState<Record<string, boolean>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadFraction, setDownloadFraction] = useState<number>(0);
  const [embeddingModelId, setEmbeddingModelIdState] = useState<string>(DEFAULT_EMBEDDING_MODEL_ID);
  const [sttModelId, setSttModelIdState] = useState<string>(DEFAULT_STT_MODEL_ID);
  const [memoryCount, setMemoryCount] = useState<number>(0);
  const [benchChat, setBenchChat] = useState<BenchmarkResult | null>(null);
  const [benchEmbed, setBenchEmbed] = useState<BenchmarkResult | null>(null);
  const [benchRunning, setBenchRunning] = useState<boolean>(false);
  const ramMb = getDeviceRamMb();
  const downloadRef = React.useRef<DownloadHandle | null>(null);
  const llmInstalled = isLocalLlmAvailable();

  useEffect(() => {
    getAccessToken().then((t) => setToken(t));
    const cached = getCachedAvatar();
    if (cached) {
      setCachedAvatarName(cached.name);
    }
    (async () => {
      setAiSourceState(await getAiSource());
      setSelectedModelIdState((await getSelectedModelId()) || DEFAULT_MODEL_ID);
      setEmbeddingModelIdState((await getEmbeddingModelId()) || DEFAULT_EMBEDDING_MODEL_ID);
      setSttModelIdState((await getSttModelId()) || DEFAULT_STT_MODEL_ID);
      const map: Record<string, boolean> = {};
      for (const m of MODEL_CATALOG) {
        map[m.id] = await isModelDownloaded(m.id);
      }
      setDownloadedMap(map);
      setMemoryCount(await countMemories().catch(() => 0));
    })();
  }, []);

  const handleSetAiSource = async (next: AiSource) => {
    setAiSourceState(next);
    await setAiSource(next);
  };

  const handleSelectModel = async (id: string) => {
    const entry = MODEL_CATALOG.find((m) => m.id === id);
    if (entry?.kind === 'embedding') {
      setEmbeddingModelIdState(id);
      await setEmbeddingModelId(id);
    } else if (entry?.kind === 'stt') {
      setSttModelIdState(id);
      await setSttModelId(id);
    } else {
      setSelectedModelIdState(id);
      await setSelectedModelId(id);
    }
  };

  const handleRunDiagnostics = async () => {
    setBenchRunning(true);
    setBenchChat(null);
    setBenchEmbed(null);
    try {
      const snap = await snapshotSystem();
      setMemoryCount(snap.memories);
      const e = await benchmarkEmbedding();
      setBenchEmbed(e);
      const c = await benchmarkChat();
      setBenchChat(c);
    } finally {
      setBenchRunning(false);
    }
  };

  const handleClearMemories = () => {
    Alert.alert(
      'Clear all memories?',
      'This deletes everything AETHRA has remembered on this device. Cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearAllMemories();
            setMemoryCount(0);
          },
        },
      ],
    );
  };

  const handleDownload = async (entry: ModelCatalogEntry) => {
    if (downloading) return;
    setDownloading(entry.id);
    setDownloadFraction(0);
    const handle = downloadModel(entry, (p) => setDownloadFraction(p.fraction));
    downloadRef.current = handle;
    try {
      await handle.promise;
      setDownloadedMap((prev) => ({ ...prev, [entry.id]: true }));
      Alert.alert('Model ready', `${entry.label} is downloaded on this device.`);
    } catch (err) {
      Alert.alert('Download failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDownloading(null);
      setDownloadFraction(0);
      downloadRef.current = null;
    }
  };

  const handleCancelDownload = async () => {
    if (downloadRef.current) {
      await downloadRef.current.cancel();
      downloadRef.current = null;
    }
  };

  const handleDelete = async (entry: ModelCatalogEntry) => {
    Alert.alert(
      'Delete model',
      `Remove ${entry.label} from this device? You can re-download it any time.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteModel(entry.id);
            setDownloadedMap((prev) => ({ ...prev, [entry.id]: false }));
          },
        },
      ],
    );
  };

  const handleLogout = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? Your cached avatar configuration will be cleared from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await clearTokens();
            clearAvatarCache();
            setToken(null);
            setCachedAvatarName(null);
            Alert.alert('Signed Out', 'Account session and avatar cache cleared.');
          },
        },
      ]
    );
  };

  const handleApplyApiUrl = async () => {
    const saved = await persistApiBaseUrl(apiUrl);
    setApiUrl(saved);
    Alert.alert('AETHRA server saved', `Backend URL set to:\n${saved}`);
  };

  const handleTestConnection = async () => {
    setProbing(true);
    setProbeResult(null);
    const target = normalizeServerUrl(apiUrl);
    const result = await pingAiBackend(target);
    setProbeResult(result);
    setProbing(false);
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.screenTitle}>Settings & Account</Text>

        {/* Account Section */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Account Status</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Authentication</Text>
            <Text style={[styles.value, { color: token ? '#10b981' : '#f59e0b' }]}>
              {token ? 'Authenticated' : 'Guest / Local Session'}
            </Text>
          </View>

          {cachedAvatarName && (
            <View style={styles.row}>
              <Text style={styles.label}>Active Companion</Text>
              <Text style={styles.value}>{cachedAvatarName}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Sign Out & Clear Session</Text>
          </TouchableOpacity>
        </View>

        {/* Backend Configuration */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>AETHRA Server (your local AI)</Text>
          <Text style={styles.subtext}>
            AETHRA keeps your AI on your own machine. Set the LAN URL of the laptop running the
            AETHRA backend (e.g. http://192.168.1.42:8000). Your phone must be on the same Wi-Fi.
          </Text>
          <TextInput
            style={styles.input}
            value={apiUrl}
            onChangeText={setApiUrl}
            placeholder="http://192.168.1.42:8000"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.applyButton, styles.flex1]} onPress={handleApplyApiUrl}>
              <Text style={styles.applyButtonText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.testButton, styles.flex1]}
              onPress={handleTestConnection}
              disabled={probing}
            >
              <Text style={styles.testButtonText}>
                {probing ? 'Testing…' : 'Test Connection'}
              </Text>
            </TouchableOpacity>
          </View>
          {probeResult && (
            <View
              style={[
                styles.probeResult,
                probeResult.state === 'online' ? styles.probeOk : styles.probeFail,
              ]}
            >
              <Text style={styles.probeTitle}>
                {probeResult.state === 'online'
                  ? `Online · ${probeResult.latencyMs} ms`
                  : 'Unreachable'}
              </Text>
              {probeResult.error && (
                <Text style={styles.probeDetail}>{probeResult.error}</Text>
              )}
            </View>
          )}
        </View>

        {/* On-device AI */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>On-device AI</Text>
          <Text style={styles.subtext}>
            Run a small LLM directly on this phone so chat works without any server.
            Replies are shorter and slower than your laptop, but fully offline.
          </Text>

          {!llmInstalled && (
            <View style={[styles.probeResult, styles.probeFail]}>
              <Text style={styles.probeTitle}>Native runtime not installed</Text>
              <Text style={styles.probeDetail}>
                This build of the app was compiled without the llama.rn native module.
                Rebuild the APK with `pnpm build:apk` after `pnpm install` picks it up.
              </Text>
            </View>
          )}

          <Text style={[styles.label, { marginTop: 4 }]}>AI source</Text>
          <View style={styles.sourceRow}>
            {(['auto', 'on-device', 'lan'] as AiSource[]).map((s) => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.sourceChip,
                  aiSource === s && styles.sourceChipActive,
                ]}
                onPress={() => handleSetAiSource(s)}
              >
                <Text
                  style={[
                    styles.sourceChipText,
                    aiSource === s && styles.sourceChipTextActive,
                  ]}
                >
                  {s === 'on-device' ? 'On-device' : s === 'lan' ? 'Laptop (LAN)' : 'Auto'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 10, fontWeight: '700' }]}>Chat models</Text>
          {listModels('chat').map((entry) => {
            const isDownloaded = !!downloadedMap[entry.id];
            const isSelected = selectedModelId === entry.id;
            const isBusy = downloading === entry.id;
            const sizeGb = (entry.sizeBytes / 1_073_741_824).toFixed(2);
            const fit = checkModelFit(entry);
            const fitLabel =
              fit === 'too-big' ? ' · ⚠ may not fit on this device'
              : fit === 'tight' ? ' · ⚠ tight fit — may be slow'
              : '';
            return (
              <View key={entry.id} style={styles.modelRow}>
                <TouchableOpacity
                  style={styles.modelMeta}
                  onPress={() => handleSelectModel(entry.id)}
                >
                  <Text style={styles.modelLabel}>
                    {isSelected ? '● ' : '○ '}{entry.label}
                  </Text>
                  <Text style={styles.modelDesc}>
                    {sizeGb} GB · {entry.ctxTokens} ctx · ~{entry.approxRamMb} MB RAM{fitLabel}
                  </Text>
                  <Text style={styles.modelDesc}>{entry.description}</Text>
                  {isBusy && (
                    <Text style={styles.modelProgress}>
                      Downloading… {(downloadFraction * 100).toFixed(1)}%
                    </Text>
                  )}
                </TouchableOpacity>
                <View style={styles.modelActions}>
                  {isBusy ? (
                    <TouchableOpacity
                      style={styles.modelBtnDanger}
                      onPress={handleCancelDownload}
                    >
                      <Text style={styles.modelBtnDangerText}>Cancel</Text>
                    </TouchableOpacity>
                  ) : isDownloaded ? (
                    <TouchableOpacity
                      style={styles.modelBtnDanger}
                      onPress={() => handleDelete(entry)}
                    >
                      <Text style={styles.modelBtnDangerText}>Delete</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.modelBtn}
                      onPress={() => handleDownload(entry)}
                      disabled={!!downloading}
                    >
                      <Text style={styles.modelBtnText}>Download</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}

          <Text style={[styles.label, { marginTop: 14, fontWeight: '700' }]}>Memory (embedding) model</Text>
          {listModels('embedding').map((entry) => {
            const isDownloaded = !!downloadedMap[entry.id];
            const isSelected = embeddingModelId === entry.id;
            const isBusy = downloading === entry.id;
            const sizeMb = (entry.sizeBytes / 1_048_576).toFixed(0);
            const subtitle = `${sizeMb} MB · ${entry.embeddingDim}-dim · ${entry.description}`;
            return (
              <ModelRow
                key={entry.id}
                entry={entry}
                subtitle={subtitle}
                isSelected={isSelected}
                isDownloaded={isDownloaded}
                isBusy={isBusy}
                fraction={downloadFraction}
                disableDownload={!!downloading}
                onSelect={handleSelectModel}
                onDownload={handleDownload}
                onCancel={handleCancelDownload}
                onDelete={handleDelete}
              />
            );
          })}

          <Text style={[styles.label, { marginTop: 14, fontWeight: '700' }]}>Voice input (whisper) model</Text>
          {listModels('stt').map((entry) => {
            const isDownloaded = !!downloadedMap[entry.id];
            const isSelected = sttModelId === entry.id;
            const isBusy = downloading === entry.id;
            const sizeMb = (entry.sizeBytes / 1_048_576).toFixed(0);
            const subtitle = `${sizeMb} MB · ${entry.sttLanguage ?? 'en'} · ${entry.description}`;
            return (
              <ModelRow
                key={entry.id}
                entry={entry}
                subtitle={subtitle}
                isSelected={isSelected}
                isDownloaded={isDownloaded}
                isBusy={isBusy}
                fraction={downloadFraction}
                disableDownload={!!downloading}
                onSelect={handleSelectModel}
                onDownload={handleDownload}
                onCancel={handleCancelDownload}
                onDelete={handleDelete}
              />
            );
          })}
        </View>

        {/* Diagnostics */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Diagnostics</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Device RAM</Text>
            <Text style={styles.value}>{ramMb ? `${(ramMb / 1024).toFixed(1)} GB` : 'unknown'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>llama.rn</Text>
            <Text style={[styles.value, { color: llmInstalled ? '#10b981' : '#f59e0b' }]}>
              {llmInstalled ? 'installed' : 'missing'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.applyButton, benchRunning && { opacity: 0.6 }]}
            onPress={handleRunDiagnostics}
            disabled={benchRunning}
          >
            <Text style={styles.applyButtonText}>
              {benchRunning ? 'Running…' : 'Run on-device benchmark'}
            </Text>
          </TouchableOpacity>
          {benchEmbed && (
            <View
              style={[
                styles.probeResult,
                benchEmbed.ok ? styles.probeOk : styles.probeFail,
              ]}
            >
              <Text style={styles.probeTitle}>
                {benchEmbed.label}: {benchEmbed.ok ? 'OK' : 'failed'}
                {benchEmbed.latencyMs ? ` · ${benchEmbed.latencyMs} ms` : ''}
              </Text>
              <Text style={styles.probeDetail}>{benchEmbed.detail}</Text>
            </View>
          )}
          {benchChat && (
            <View
              style={[
                styles.probeResult,
                benchChat.ok ? styles.probeOk : styles.probeFail,
              ]}
            >
              <Text style={styles.probeTitle}>
                {benchChat.label}: {benchChat.ok ? 'OK' : 'failed'}
                {benchChat.throughput ? ` · ${benchChat.throughput}` : ''}
              </Text>
              <Text style={styles.probeDetail}>{benchChat.detail}</Text>
            </View>
          )}
        </View>

        {/* On-device Memory */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Memory</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Stored memories</Text>
            <Text style={styles.value}>{memoryCount}</Text>
          </View>
          <Text style={styles.subtext}>
            AETHRA remembers things you say on this device only — nothing leaves the phone. Needs
            the embedding model downloaded above.
          </Text>
          <TouchableOpacity style={styles.logoutButton} onPress={handleClearMemories}>
            <Text style={styles.logoutButtonText}>Clear all memories</Text>
          </TouchableOpacity>
        </View>

        {/* 3D Engine & Asset Information */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Avatar Rendering Engine</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Renderer</Text>
            <Text style={styles.value}>Three.js (WebGL via Expo GL)</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Supported Models</Text>
            <Text style={styles.value}>Aria & Marcus (GLTF/GLB)</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Fallback</Text>
            <Text style={styles.value}>Adaptive 2D Presentation Stage</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Morph Targets</Text>
            <Text style={styles.value}>102 blendshapes (MakeHuman / CC)</Text>
          </View>
        </View>

        {/* About & Legal Attribution */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>About & Legal Notices</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Application</Text>
            <Text style={styles.value}>AETHRA</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Version</Text>
            <Text style={styles.value}>1.0.0 (RC1, Build 1)</Text>
          </View>
          <View style={styles.attributionBlock}>
            <Text style={styles.attributionTitle}>3D Asset & Mesh Attribution</Text>
            <Text style={styles.attributionText}>
              Base 3D human character meshes derived from MakeHuman Community assets licensed under CC-BY 4.0.
            </Text>
            <Text style={styles.attributionSubtext}>
              https://creativecommons.org/licenses/by/4.0/
            </Text>
          </View>
          <View style={styles.attributionBlock}>
            <Text style={styles.attributionTitle}>Skeletal Animations</Text>
            <Text style={styles.attributionText}>
              Procedural and skeletal animations derived from Mixamo (Adobe Systems Inc.). Permitted for embedded interactive software applications.
            </Text>
          </View>
          <View style={styles.attributionBlock}>
            <Text style={styles.attributionTitle}>Open Source Licenses</Text>
            <Text style={styles.attributionText}>
              • Three.js (MIT License) - mrdoob{'\n'}
              • React Native & Expo SDK (MIT License) - Meta & Expo{'\n'}
              • Fonts: Inter & JetBrains Mono (SIL Open Font License 1.1)
            </Text>
          </View>
          <View style={styles.attributionBlock}>
            <Text style={styles.attributionTitle}>Commercial Model Isolation Notice</Text>
            <Text style={styles.attributionText}>
              SadTalker research checkpoints and non-commercial model weights are strictly excluded from this mobile distribution.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface ModelRowProps {
  entry: ModelCatalogEntry;
  subtitle: string;
  isSelected: boolean;
  isDownloaded: boolean;
  isBusy: boolean;
  fraction: number;
  disableDownload: boolean;
  onSelect: (id: string) => void;
  onDownload: (entry: ModelCatalogEntry) => void;
  onCancel: () => void;
  onDelete: (entry: ModelCatalogEntry) => void;
}

function ModelRow({
  entry,
  subtitle,
  isSelected,
  isDownloaded,
  isBusy,
  fraction,
  disableDownload,
  onSelect,
  onDownload,
  onCancel,
  onDelete,
}: ModelRowProps) {
  return (
    <View style={styles.modelRow}>
      <TouchableOpacity style={styles.modelMeta} onPress={() => onSelect(entry.id)}>
        <Text style={styles.modelLabel}>
          {isSelected ? '● ' : '○ '}{entry.label}
        </Text>
        <Text style={styles.modelDesc}>{subtitle}</Text>
        {isBusy && (
          <Text style={styles.modelProgress}>
            Downloading… {(fraction * 100).toFixed(1)}%
          </Text>
        )}
      </TouchableOpacity>
      <View style={styles.modelActions}>
        {isBusy ? (
          <TouchableOpacity style={styles.modelBtnDanger} onPress={onCancel}>
            <Text style={styles.modelBtnDangerText}>Cancel</Text>
          </TouchableOpacity>
        ) : isDownloaded ? (
          <TouchableOpacity style={styles.modelBtnDanger} onPress={() => onDelete(entry)}>
            <Text style={styles.modelBtnDangerText}>Delete</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.modelBtn}
            onPress={() => onDownload(entry)}
            disabled={disableDownload}
          >
            <Text style={styles.modelBtnText}>Download</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  container: {
    padding: 16,
    gap: 16,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 12,
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#38bdf8',
    marginBottom: 4,
  },
  subtext: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  label: {
    color: '#94a3b8',
    fontSize: 14,
  },
  value: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#090d16',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#f8fafc',
    fontSize: 14,
  },
  applyButton: {
    backgroundColor: '#0284c7',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  flex1: {
    flex: 1,
  },
  testButton: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  testButtonText: {
    color: '#cbd5e1',
    fontWeight: '600',
    fontSize: 14,
  },
  probeResult: {
    marginTop: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  probeOk: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: '#10b981',
  },
  probeFail: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: '#ef4444',
  },
  probeTitle: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '700',
  },
  probeDetail: {
    color: '#cbd5e1',
    fontSize: 11,
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  logoutButtonText: {
    color: '#f87171',
    fontWeight: '600',
    fontSize: 14,
  },
  attributionBlock: {
    backgroundColor: '#090d16',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  attributionTitle: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
  attributionText: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18,
  },
  attributionSubtext: {
    color: '#64748b',
    fontSize: 11,
  },
  sourceRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  sourceChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  sourceChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  sourceChipText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  sourceChipTextActive: {
    color: '#ffffff',
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  modelMeta: {
    flex: 1,
  },
  modelLabel: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '700',
  },
  modelDesc: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  modelProgress: {
    color: '#38bdf8',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  modelActions: {
    minWidth: 92,
    alignItems: 'flex-end',
  },
  modelBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  modelBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  modelBtnDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  modelBtnDangerText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
  },
});