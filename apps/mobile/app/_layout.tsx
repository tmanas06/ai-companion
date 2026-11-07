import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';
import { bootstrapApiBaseUrl } from '../src/services/api-client';
import { useAutoDownload } from '../src/services/model-auto-downloader';
import { ModelDownloadBanner } from '../src/components/ModelDownloadBanner';

function AppShell() {
  const autoDownload = useAutoDownload();
  return (
    <View style={{ flex: 1, backgroundColor: '#090d16' }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#090d16' }}>
        <ModelDownloadBanner
          status={autoDownload}
          onCancel={autoDownload.cancel}
          onRetry={autoDownload.retry}
        />
      </SafeAreaView>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ headerShown: false }} />
        </Stack>
      </View>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
    'JetBrainsMono-Regular': JetBrainsMono_400Regular,
    'JetBrainsMono-Medium': JetBrainsMono_500Medium,
  });
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    bootstrapApiBaseUrl().finally(() => setConfigReady(true));
  }, []);

  if (!fontsLoaded || !configReady) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}
