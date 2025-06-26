import React, { useEffect } from 'react';
import { StyleSheet, View, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import { ChatList } from '@/components/chat/ChatList';
import { ChatInput } from '@/components/chat/ChatInput';
import { useChatStore } from '@/store/chatStore';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function ChatScreen() {
  const router = useRouter();
  const { user, isGuest } = useAuthStore();
  const { messages, isLoading, sendMessage } = useChatStore();
  
  // Check if authenticated or in guest mode
  useEffect(() => {
    if (!user && !isGuest) {
      router.replace('/');
    }
  }, [user, isGuest, router]);
  
  const handleSendMessage = async (content: string) => {
    await sendMessage(content);
  };
  
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <View style={styles.content}>
          <ChatList
            messages={messages}
            isLoading={isLoading}
          />
          <ChatInput
            onSend={handleSendMessage}
            isLoading={isLoading}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  keyboardAvoid: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});