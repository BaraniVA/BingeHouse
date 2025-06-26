import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Movie, Recommendation } from '@/lib/types';
import { Search } from 'lucide-react-native';
import { Input } from '@/components/ui/Input';
import Animated, { FadeIn } from 'react-native-reanimated';

type MovieWithRecommendation = Movie & {
  recommendation: Recommendation;
};

export default function MoviesScreen() {
  const router = useRouter();
  const { user, isGuest } = useAuthStore();
  
  const [movies, setMovies] = useState<MovieWithRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Check if authenticated or in guest mode
  useEffect(() => {
    if (!user && !isGuest) {
      router.replace('/');
    } else {
      fetchMovies();
    }
  }, [user, isGuest, router]);
  
  const fetchMovies = async () => {
    try {
      setIsLoading(true);
      
      // For guests, we can only show movies from the current session
      // For logged in users, we fetch from Supabase
      if (user) {
        const { data, error } = await supabase
          .from('movies')
          .select(`
            *,
            recommendations (*)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (data) {
          const formattedMovies = data.map((item: any) => ({
            ...item,
            recommendation: item.recommendations[0] || null,
          }));
          
          setMovies(formattedMovies);
        }
      } else {
        // For guest mode, we'll use local state from the chat
        // This would come from the messages in chatStore that have movie data
        // But since we're not implementing full persistence for guests,
        // we're showing a placeholder message instead
      }
    } catch (error) {
      console.error('Error fetching movies:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const filteredMovies = searchQuery
    ? movies.filter(movie => 
        movie.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : movies;
  
  const renderMovieItem = ({ item }: { item: MovieWithRecommendation }) => (
    <TouchableOpacity style={styles.movieCard}>
      <View style={styles.movieContent}>
        {item.poster && item.poster !== 'N/A' ? (
          <Image
            source={{ uri: item.poster }}
            style={styles.poster}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.noPoster}>
            <Text style={styles.noPosterText}>No Poster</Text>
          </View>
        )}
        
        <View style={styles.movieInfo}>
          <Text style={styles.movieTitle} numberOfLines={2}>
            {item.title} ({item.year})
          </Text>
          
          <View style={styles.ratingContainer}>
            <Text style={styles.rating}>⭐ {item.imdbrating}/10</Text>
            <Text style={styles.votes}>
              ({(() => {
                const votes = item.imdbvotes;
                if (!votes || votes === 'N/A' || votes === '' || votes === null || votes === undefined) {
                  return '0 votes';
                }
                
                // Convert to string and remove all non-digit characters
                const cleanVotes = String(votes).replace(/[^\d]/g, '');
                
                if (cleanVotes === '' || cleanVotes.length === 0) {
                  return '0 votes';
                }
                
                const votesNumber = parseInt(cleanVotes, 10);
                const formattedVotes = isNaN(votesNumber) || votesNumber <= 0 ? '0' : votesNumber.toLocaleString();
                return `${formattedVotes} votes`;
              })()})
            </Text>
          </View>

          
          <View style={styles.genreContainer}>
            <Text style={styles.genreText} numberOfLines={1}>
              {item.genre}
            </Text>
          </View>
          
          {item.recommendation && (
            <View style={[
              styles.recommendationBadge,
              item.recommendation.worth_watching 
                ? styles.recommendedBadge 
                : styles.notRecommendedBadge
            ]}>
              <Text style={styles.recommendationText}>
                {item.recommendation.worth_watching 
                  ? 'BingeHouse Recommended' 
                  : 'Your Call'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
  
  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Input
          placeholder="Search movies..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon={<Search size={20} color="#64748b" />}
          containerStyle={styles.searchInput}
        />
      </View>
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : isGuest ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Guest Mode</Text>
          <Text style={styles.emptyText}>
            Sign in to save your movie recommendations and access them anytime.
          </Text>
        </View>
      ) : movies.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No Movies Yet</Text>
          <Text style={styles.emptyText}>
            Start chatting and asking about movies to build your collection.
          </Text>
        </View>
      ) : (
        <Animated.View 
          style={styles.listContainer}
          entering={FadeIn}
        >
          <FlatList
            data={filteredMovies}
            keyExtractor={(item) => item.id}
            renderItem={renderMovieItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
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
  searchContainer: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  searchInput: {
    marginBottom: 0,
  },
  listContainer: {
    flex: 1,
  },
  list: {
    padding: 16,
  },
  movieCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  movieContent: {
    flexDirection: 'row',
  },
  poster: {
    width: 100,
    height: 150,
  },
  noPoster: {
    width: 100,
    height: 150,
    backgroundColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPosterText: {
    color: '#475569',
    fontFamily: 'Inter_500Medium',
  },
  movieInfo: {
    flex: 1,
    padding: 12,
  },
  movieTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#0f172a',
    marginBottom: 8,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  rating: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#0f172a',
  },
  votes: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#64748b',
    marginLeft: 4,
  },
  genreContainer: {
    marginBottom: 12,
  },
  genreText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#64748b',
  },
  recommendationBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  recommendedBadge: {
    backgroundColor: '#10b981',
  },
  notRecommendedBadge: {
    backgroundColor: '#6b7280',
  },
  recommendationText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
    color: '#0f172a',
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
  },
});