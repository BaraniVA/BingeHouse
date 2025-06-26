import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { Button } from '@/components/ui/Button';
import { LogOut, User, MessageCircle, Film } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isGuest, logout } = useAuthStore();
  const { clearMessages } = useChatStore();
  
  // Check if authenticated or in guest mode
  useEffect(() => {
    if (!user && !isGuest) {
      router.replace('/(auth)/register');
    }
  }, [user, isGuest, router]);
  
  const handleLogout = async () => {
    // Confirm logout
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            clearMessages();
            if (isGuest) {
              // For guest, just reset the auth state
              await logout();
            } else {
              // For logged in users, perform Supabase logout
              await logout();
            }
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };
  
  const handleClearChat = () => {
    Alert.alert(
      'Clear Chat History',
      'This will remove all your chat messages. Continue?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearMessages();
          },
        },
      ]
    );
  };
  
  const handleLogin = () => {
    router.replace('/(auth)/login');
  };
  
  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Animated.View 
          style={styles.profileHeader}
          entering={FadeInDown.delay(100).duration(600)}
        >
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <User size={40} color="#ffffff" />
            </View>
          </View>
          
          <Text style={styles.username}>
            {isGuest ? 'Guest User' : user?.email || 'User'}
          </Text>
          
          <Text style={styles.userStatus}>
            {isGuest 
              ? 'You are currently in guest mode' 
              : 'Logged in with email'}
          </Text>
        </Animated.View>
        
        <Animated.View 
          style={styles.sectionContainer}
          entering={FadeInDown.delay(200).duration(600)}
        >
          <Text style={styles.sectionTitle}>Chat</Text>
          
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleClearChat}
          >
            <View style={styles.menuItemIcon}>
              <MessageCircle size={20} color="#3b82f6" />
            </View>
            <Text style={styles.menuItemText}>Clear Chat History</Text>
          </TouchableOpacity>
        </Animated.View>
        
        {isGuest && (
          <Animated.View 
            style={styles.sectionContainer}
            entering={FadeInDown.delay(300).duration(600)}
          >
            <Text style={styles.sectionTitle}>Account</Text>
            
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={handleLogin}
            >
              <View style={styles.menuItemIcon}>
                <User size={20} color="#3b82f6" />
              </View>
              <Text style={styles.menuItemText}>Sign In to Save Movies</Text>
            </TouchableOpacity>
            
            <View style={styles.guestNoteContainer}>
              <Text style={styles.guestNoteText}>
                Create an account to save your movie recommendations and access them anytime.
              </Text>
            </View>
          </Animated.View>
        )}
        
        <Animated.View 
          style={styles.logoutContainer}
          entering={FadeInDown.delay(400).duration(600)}
        >
          <Button
            title={isGuest ? "Exit Guest Mode" : "Logout"}
            variant="outline"
            leftIcon={<LogOut size={20} color="#ef4444" />}
            style={styles.logoutButton}
            textStyle={styles.logoutButtonText}
            onPress={handleLogout}
          />
        </Animated.View>
        
        <View style={styles.footerContainer}>
          <Text style={styles.versionText}>
            BingeHouse v1.0.0
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 24,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
    color: '#0f172a',
    marginBottom: 4,
  },
  userStatus: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#64748b',
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#64748b',
    marginBottom: 16,
    paddingLeft: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 8,
  },
  menuItemIcon: {
    marginRight: 16,
  },
  menuItemText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: '#0f172a',
  },
  guestNoteContainer: {
    padding: 16,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    marginTop: 8,
  },
  guestNoteText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
  },
  logoutContainer: {
    marginTop: 8,
    marginBottom: 32,
  },
  logoutButton: {
    borderColor: '#fecaca',
  },
  logoutButtonText: {
    color: '#ef4444',
  },
  footerContainer: {
    alignItems: 'center',
  },
  versionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#94a3b8',
  },
});