import { StyleSheet, Text, View, SafeAreaView } from 'react-native';

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.description}>
          Account and app settings coming soon...
        </Text>
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
    fontSize: 28,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
    fontFamily: 'Inter-Bold',
  },
  description: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
  },
});