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
  setCustomApiBaseUrl,
} from '../../src/services/api-client';

export default function SettingsScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState<string>(getApiBaseUrl());
  const [cachedAvatarName, setCachedAvatarName] = useState<string | null>(null);

  useEffect(() => {
    getAccessToken().then((t) => setToken(t));
    const cached = getCachedAvatar();
    if (cached) {
      setCachedAvatarName(cached.name);
    }
  }, []);

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

  const handleApplyApiUrl = () => {
    setCustomApiBaseUrl(apiUrl.trim());
    Alert.alert('API Updated', `Backend API URL set to: ${apiUrl.trim()}`);
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
          <Text style={styles.cardHeader}>Backend Connection</Text>
          <Text style={styles.subtext}>
            FastAPI endpoint used for avatar synchronization and voice chat:
          </Text>
          <TextInput
            style={styles.input}
            value={apiUrl}
            onChangeText={setApiUrl}
            placeholder="http://10.0.2.2:8000"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.applyButton} onPress={handleApplyApiUrl}>
            <Text style={styles.applyButtonText}>Save Endpoint</Text>
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
            <Text style={styles.value}>Aria AI Companion</Text>
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
});