import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0ea5e9',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e2e8f0',
          height: 64,
          paddingBottom: 8,
        },
        headerShown: false,
      }}>
    <Tabs.Screen
      name="index"
      options={{
        title: 'Home',
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
        ),
      }}
    />
    <Tabs.Screen
      name="chat"
      options={{
        title: 'Chat',
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={size} color={color} />
        ),
      }}
    />
    <Tabs.Screen
      name="companion"
      options={{
        title: 'Companion',
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
        ),
      }}
    />
    <Tabs.Screen
      name="settings"
      options={{
        title: 'Settings',
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={color} />
        ),
      }}
    />
    </Tabs>
  );
}