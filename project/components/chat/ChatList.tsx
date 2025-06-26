import React, { useRef, useEffect } from 'react';
import {
  FlatList,
  StyleSheet,
  ActivityIndicator,
  View,
  Text,
} from 'react-native';
import { Message } from '@/lib/types';
import { ChatBubble } from './ChatBubble';
import Animated, { 
  FadeIn,
  Layout 
} from 'react-native-reanimated';

interface ChatListProps {
  messages: Message[];
  isLoading: boolean;
}

export function ChatList({ messages, isLoading }: ChatListProps) {
  const flatListRef = useRef<FlatList>(null);
  
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);
  
  return (
    <View style={styles.container}>
      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            Ask me if a movie is worth watching!
          </Text>
          <Text style={styles.emptySubtext}>
            For example: "Is Inception worth watching?"
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatBubble message={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => 
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          itemLayoutAnimation={Layout.springify()}
        />
      )}
      
      {isLoading && (
        <Animated.View 
          style={styles.loadingContainer}
          entering={FadeIn}
        >
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text style={styles.loadingText}>Thinking...</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#64748b',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#334155',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
});