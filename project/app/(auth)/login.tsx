import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { Mail, Lock, X } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading, error, setError } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    
    await login(email, password);
  };
  
  const handleGoBack = () => {
    router.back();
  };
  
  const handleRegister = () => {
    router.replace('/(auth)/register');
  };
  
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <StatusBar style="dark" />
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleGoBack}
            >
              <X size={24} color="#0f172a" />
            </TouchableOpacity>
            
            <Animated.View 
              entering={FadeInDown.duration(600).delay(100)}
              style={styles.headerContainer}
            >
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>
                Sign in to continue to BingeHouse
              </Text>
            </Animated.View>
            
            <Animated.View 
              entering={FadeInDown.duration(600).delay(200)}
              style={styles.formContainer}
            >
              <Input
                label="Email"
                placeholder="Enter your email"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                leftIcon={<Mail size={20} color="#64748b" />}
              />
              
              <Input
                label="Password"
                placeholder="Enter your password"
                isPassword
                value={password}
                onChangeText={setPassword}
                leftIcon={<Lock size={20} color="#64748b" />}
              />
              
              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : null}
              
              <Button
                title="Sign In"
                size="lg"
                style={styles.button}
                onPress={handleLogin}
                isLoading={isLoading}
              />
            </Animated.View>
            
            <Animated.View 
              entering={FadeInDown.duration(600).delay(300)}
              style={styles.footerContainer}
            >
              <Text style={styles.footerText}>
                Don't have an account?{' '}
                <Text
                  style={styles.footerLink}
                  onPress={handleRegister}
                >
                  Sign Up
                </Text>
              </Text>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: '100%',
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 24,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContainer: {
    marginTop: 20,
    marginBottom: 24,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: '#0f172a',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: '#64748b',
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    marginBottom: 24,
  },
  button: {
    marginTop: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  footerContainer: {
    alignItems: 'center',
    paddingBottom: 154,
  },
  footerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#64748b',
  },
  footerLink: {
    fontFamily: 'Inter_600SemiBold',
    color: '#3b82f6',
  },
});
