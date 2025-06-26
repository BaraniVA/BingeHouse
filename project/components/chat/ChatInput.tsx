import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { Send } from 'lucide-react-native';
import Animated, { 
  useAnimatedStyle, 
  withTiming,
  useSharedValue 
} from 'react-native-reanimated';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const scale = useSharedValue(1);
  
  const handleSend = () => {
    if (message.trim() && !isLoading) {
      onSend(message.trim());
      setMessage('');
      Keyboard.dismiss();
    }
  };
  
  const pressIn = () => {
    scale.value = withTiming(0.95, { duration: 100 });
  };
  
  const pressOut = () => {
    scale.value = withTiming(1, { duration: 100 });
  };
  
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Ask about a movie..."
        placeholderTextColor="#64748b"
        value={message}
        onChangeText={setMessage}
        onSubmitEditing={handleSend}
        editable={!isLoading}
        multiline
      />
      
      <Animated.View style={animatedStyle}>
        <Pressable
          style={[
            styles.sendButton,
            message.trim() === '' || isLoading ? styles.disabledButton : {},
          ]}
          onPress={handleSend}
          disabled={message.trim() === '' || isLoading}
          onPressIn={pressIn}
          onPressOut={pressOut}
        >
          <Send size={20} color="#ffffff" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingRight: 48,
    marginRight: 8,
    fontSize: 16,
    maxHeight: 100,
    color: '#0f172a',
  },
  sendButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    backgroundColor: '#94a3b8',
  },
});