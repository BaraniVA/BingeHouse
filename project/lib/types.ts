export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Movie {
  id: string;
  title: string;
  year: string;
  imdbID: string;
  poster: string;
  imdbRating: string;
  imdbVotes: string;
  plot: string;
  director: string;
  actors: string;
  genre: string;
  created_at: string;
}

export interface Recommendation {
  id: string;
  movie_id: string;
  recommendation: string;
  worth_watching: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  user_id: string | null;
  content: string;
  is_user: boolean;
  movie?: Movie;
  recommendation?: Recommendation;
  created_at: string;
}

export type MovieSearchResult = {
  Title: string;
  Year: string;
  imdbID: string;
  Poster: string;
};

export type MovieDetails = {
  Title: string;
  Year: string;
  imdbID: string;
  Poster: string;
  imdbRating: string;
  imdbVotes: string;
  Plot: string;
  Director: string;
  Actors: string;
  Genre: string;
};

export type ChatState = {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  conversationId: string;
  
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  setError: (error: string | null) => void;
};

export type AuthState = {
  user: User | null;
  isLoading: boolean;
  isGuest: boolean;
  error: string | null;
  
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  continueAsGuest: () => void;
  setError: (error: string | null) => void;
};