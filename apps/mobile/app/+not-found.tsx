import { StyleSheet, Text, View, SafeAreaView } from 'react-native';
import { Link } from 'expo-router';

export default function NotFoundScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>404</Text>
        <Text style={styles.description}>Screen not found</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go Home</Text>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 48,
    fontWeight: '700',
    color: '#0ea5e9',
    marginBottom: 12,
    fontFamily: 'Inter-Bold',
  },
  description: {
    fontSize: 18,
    color: '#64748b',
    marginBottom: 24,
    fontFamily: 'Inter-Regular',
  },
  link: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
  },
  linkText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    fontFamily: 'Inter-SemiBold',
  },
});