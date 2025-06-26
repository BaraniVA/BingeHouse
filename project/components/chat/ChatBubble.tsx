import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Message } from '@/lib/types';
import Animated, { 
  FadeInRight, 
  FadeInLeft,
  Layout 
} from 'react-native-reanimated';

interface ChatBubbleProps {
  message: Message;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.is_user;
  
  console.log('ChatBubble rendering message:', {
    id: message.id,
    content: message.content,
    is_user: message.is_user,
    hasMovie: !!message.movie,
    hasRecommendation: !!message.recommendation
  });
  
  return (
    <Animated.View 
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.botContainer,
      ]}
      entering={isUser ? FadeInRight : FadeInLeft}
      layout={Layout.springify()}
    >
      <Text style={[styles.text, isUser ? styles.userText : styles.botText]}>
        {message.content}
      </Text>
      
      {message.movie && message.recommendation && (
        <View style={styles.movieInfoContainer}>
          <View style={styles.movieHeader}>
            <Text style={styles.movieTitle}>
              {message.movie.title} ({message.movie.year})
            </Text>
            <View style={styles.ratingContainer}>
              <Text style={styles.ratingText}>
                ⭐ {message.movie.imdbRating}/10
              </Text>
              <Text style={styles.votesText}>
                ({(() => {
                  const votes = message.movie.imdbVotes;
                  console.log('Raw votes value:', votes, 'Type:', typeof votes);
                  
                  if (!votes || votes === 'N/A' || votes === '' || votes === null || votes === undefined) {
                    return '0';
                  }
                  
                  // Convert to string and remove all non-digit characters
                  const cleanVotes = String(votes).replace(/[^\d]/g, '');
                  console.log('Clean votes:', cleanVotes);
                  
                  if (cleanVotes === '' || cleanVotes.length === 0) {
                    return '0';
                  }
                  
                  const votesNumber = parseInt(cleanVotes, 10);
                  console.log('Parsed number:', votesNumber);
                  
                  return isNaN(votesNumber) || votesNumber <= 0 ? '0' : votesNumber.toLocaleString();
                })()} votes)
              </Text>
            </View>
          </View>
          
          
          {message.movie.poster && message.movie.poster !== 'N/A' && (
            <Image
              source={{ uri: message.movie.poster }}
              style={styles.poster}
              resizeMode="cover"
            />
          )}
          
          <View style={styles.recommendationContainer}>
            <Text style={styles.recommendationText}>
              {message.recommendation.recommendation}
            </Text>
            <View 
              style={[
                styles.worthWatchingIndicator,
                message.recommendation.worth_watching 
                  ? styles.worthWatching 
                  : styles.notWorthWatching
              ]}
            >
              <Text style={styles.worthWatchingText}>
                {message.recommendation.worth_watching 
                  ? 'BingeHouse Recommended ✓' 
                  : 'Your call ○'}
              </Text>
            </View>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 12,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  userContainer: {
    alignSelf: 'flex-end',
    backgroundColor: '#3b82f6',
    borderTopRightRadius: 4,
  },
  botContainer: {
    alignSelf: 'flex-start',
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 4,
  },
  text: {
    fontSize: 16,
  },
  userText: {
    color: '#ffffff',
  },
  botText: {
    color: '#ffffff',
  },
  movieInfoContainer: {
    marginTop: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  movieHeader: {
    padding: 12,
  },
  movieTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  votesText: {
    fontSize: 12,
    color: '#cbd5e1',
    marginLeft: 4,
  },
  poster: {
    width: '100%',
    height: 200,
  },
  recommendationContainer: {
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  recommendationText: {
    fontSize: 14,
    color: '#ffffff',
    marginBottom: 8,
  },
  worthWatchingIndicator: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  worthWatching: {
    backgroundColor: '#10b981',
  },
  notWorthWatching: {
    backgroundColor: '#6b7280',
  },
  worthWatchingText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
  },
});