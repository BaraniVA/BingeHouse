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

export default function RegisterScreen() {
  const router = useRouter();
  const { register, isLoading, error, setError } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    await register(email, password);
  };
  
  const handleGoBack = () => {
    router.back('/index');
  };
  
  const handleLogin = () => {
    router.replace('/(auth)/login');
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
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>
                Sign up to get started with BingeHouse
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
                placeholder="Create a password"
                isPassword
                value={password}
                onChangeText={setPassword}
                leftIcon={<Lock size={20} color="#64748b" />}
              />
              
              <Input
                label="Confirm Password"
                placeholder="Confirm your password"
                isPassword
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                leftIcon={<Lock size={20} color="#64748b" />}
              />
              
              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : null}
              
              <Button
                title="Create Account"
                size="lg"
                style={styles.button}
                onPress={handleRegister}
                isLoading={isLoading}
              />
            </Animated.View>
            
            <Animated.View 
              entering={FadeInDown.duration(600).delay(300)}
              style={styles.footerContainer}
            >
              <Text style={styles.footerText}>
                Already have an account?{' '}
                <Text
                  style={styles.footerLink}
                  onPress={handleLogin}
                >
                  Sign In
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
    paddingBottom: 94,
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