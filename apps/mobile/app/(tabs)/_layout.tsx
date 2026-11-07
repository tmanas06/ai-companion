import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#38bdf8',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: {
          backgroundColor: '#0f172a',
          borderTopWidth: 1,
          borderTopColor: '#1e293b',
          height: 64,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
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
      name="memories"
      options={{
        title: 'Memories',
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={focused ? 'bookmark' : 'bookmark-outline'} size={size} color={color} />
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