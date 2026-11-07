import { StyleSheet, Text, View, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>AETHRA</Text>
          <Text style={styles.subtitle}>
            Your personal AI companion with persistent memory
          </Text>
        </View>

        <View style={styles.features}>
          {FEATURES.map((feature, index) => (
            <View key={index} style={styles.featureCard}>
              <View style={styles.iconContainer}>
                <feature.icon style={styles.icon} />
              </View>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureDescription}>{feature.description}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Built with Expo, React Native, TypeScript, FastAPI, PostgreSQL & pgvector
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const FEATURES = [
  {
    title: 'Persistent Memory',
    description: 'Conversations remembered across sessions with explicit consent for sensitive info.',
    icon: MemoryIcon,
  },
  {
    title: 'Customizable Avatar',
    description: 'Create a unique 2D layered avatar that represents your companion.',
    icon: AvatarIcon,
  },
  {
    title: 'Privacy First',
    description: 'Your data is isolated, encrypted, and under your control. Export or delete anytime.',
    icon: PrivacyIcon,
  },
  {
    title: 'Cross-Platform',
    description: 'Seamless experience across web and mobile with shared account and companion.',
    icon: PlatformIcon,
  },
  {
    title: 'Provider Agnostic',
    description: 'Switch between AI providers (OpenAI, Anthropic, local) without changing code.',
    icon: ProviderIcon,
  },
  {
    title: 'Type-Safe API',
    description: 'End-to-end TypeScript with shared types between frontend and backend.',
    icon: TypeIcon,
  },
];

function MemoryIcon({ style }: { style?: any }) {
  return (
    <Image
      source={require('@expo/vector-icons/MaterialCommunityIcons')}
      style={[{ width: 24, height: 24, tintColor: '#0ea5e9' }, style]}
    />
  );
}

function AvatarIcon({ style }: { style?: any }) {
  return (
    <Image
      source={require('@expo/vector-icons/MaterialCommunityIcons')}
      style={[{ width: 24, height: 24, tintColor: '#0ea5e9' }, style]}
    />
  );
}

function PrivacyIcon({ style }: { style?: any }) {
  return (
    <Image
      source={require('@expo/vector-icons/MaterialCommunityIcons')}
      style={[{ width: 24, height: 24, tintColor: '#0ea5e9' }, style]}
    />
  );
}

function PlatformIcon({ style }: { style?: any }) {
  return (
    <Image
      source={require('@expo/vector-icons/MaterialCommunityIcons')}
      style={[{ width: 24, height: 24, tintColor: '#0ea5e9' }, style]}
    />
  );
}

function ProviderIcon({ style }: { style?: any }) {
  return (
    <Image
      source={require('@expo/vector-icons/MaterialCommunityIcons')}
      style={[{ width: 24, height: 24, tintColor: '#0ea5e9' }, style]}
    />
  );
}

function TypeIcon({ style }: { style?: any }) {
  return (
    <Image
      source={require('@expo/vector-icons/MaterialCommunityIcons')}
      style={[{ width: 24, height: 24, tintColor: '#0ea5e9' }, style]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
    fontFamily: 'Inter-Bold',
  },
  subtitle: {
    fontSize: 18,
    color: '#64748b',
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
  },
  features: {
    gap: 16,
  },
  featureCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  icon: {
    width: 24,
    height: 24,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
    fontFamily: 'Inter-SemiBold',
  },
  featureDescription: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    fontFamily: 'Inter-Regular',
  },
  footer: {
    marginTop: 32,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
  },
});