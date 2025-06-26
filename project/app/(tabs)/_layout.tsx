import React from 'react';
import { Tabs } from 'expo-router';
import { MessageCircle, User, Film } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';

export default function TabLayout() {
  const { isGuest } = useAuthStore();
  
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e2e8f0',
          borderTopWidth: 1,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_500Medium',
          fontSize: 12,
        },
        headerStyle: {
          backgroundColor: '#ffffff',
          elevation: 0,
          shadowOpacity: 0,
          borderBottomColor: '#e2e8f0',
          borderBottomWidth: 1,
        },
        headerTitleStyle: {
          fontFamily: 'Inter_600SemiBold',
          fontSize: 18,
          color: '#0f172a',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <MessageCircle size={size} color={color} />
          ),
          headerTitle: 'BingeHouse',
        }}
      />
      <Tabs.Screen
        name="movies"
        options={{
          title: 'Movies',
          tabBarIcon: ({ color, size }) => (
            <Film size={size} color={color} />
          ),
          headerTitle: 'My Movies',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <User size={size} color={color} />
          ),
          headerTitle: isGuest ? 'Guest Profile' : 'My Profile',
        }}
      />
    </Tabs>
  );
}