import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'expo-router';
import Animated, { 
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';

export default function WelcomeScreen() {
  const router = useRouter();
  const { user, isGuest, continueAsGuest } = useAuthStore();
  
  // Check if already logged in or in guest mode
  useEffect(() => {
    if (user || isGuest) {
      router.replace('/(tabs)');
    }
  }, [user, isGuest, router]);
  
  const handleLogin = () => {
    router.push('/(auth)/login');
  };
  
  const handleRegister = () => {
    router.push('/(auth)/register');
  };
  
  const handleGuest = () => {
    continueAsGuest();
    router.replace('/(tabs)');
  };
  
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0f172a', '#1e293b', '#334155']}
        style={styles.background}
      />
      
      <Animated.View 
        style={styles.logoContainer}
        entering={FadeInDown.delay(300).duration(800)}
      >
        <Text style={styles.logoText}>BingeHouse</Text>
      </Animated.View>
      
      <Animated.View 
        style={styles.imageContainer}
        entering={FadeInUp.delay(600).duration(800)}
      >
        <Image
          source={{ uri: 'https://images.pexels.com/photos/7991579/pexels-photo-7991579.jpeg' }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.overlay} />
      </Animated.View>
      
      <Animated.View 
        style={styles.contentContainer}
        entering={FadeInUp.delay(900).duration(800)}
      >
        <Text style={styles.title}>Find Your Next Binge</Text>
        <Text style={styles.subtitle}>
          Get personalized movie recommendations powered by AI. Ask if a movie is worth watching and get honest answers.
        </Text>
        
        <View style={styles.buttonContainer}>
          <Button
            title="Sign In"
            variant="primary"
            size="lg"
            style={styles.button}
            onPress={handleLogin}
          />
          <Button
            title="Create Account"
            variant="outline"
            size="lg"
            style={styles.button}
            textStyle={styles.outlineButtonText}
            onPress={handleRegister}
          />
          <Button
            title="Continue as Guest"
            variant="ghost"
            size="md"
            style={styles.guestButton}
            textStyle={styles.guestButtonText}
            onPress={handleGuest}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  logoText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    color: '#ffffff',
    letterSpacing: 1,
  },
  imageContainer: {
    height: 300,
    marginHorizontal: 24,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 32,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 24,
  },
  contentContainer: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: '#cbd5e1',
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 24,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
  },
  button: {
    width: '100%',
    marginBottom: 16,
    borderColor: '#ffffff',
  },
  outlineButtonText: {
    color: '#ffffff',
  },
  guestButton: {
    marginTop: 8,
  },
  guestButtonText: {
    color: '#cbd5e1',
    fontFamily: 'Inter_400Regular',
  },
});