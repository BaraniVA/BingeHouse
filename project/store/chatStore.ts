import { create } from 'zustand';
import { callEdgeFunction } from '@/lib/supabase';
import { ChatState, Message } from '@/lib/types';
import { useAuthStore } from './authStore';

// Generate unique conversation ID
const generateConversationId = () => `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  error: null,
  conversationId: generateConversationId(), // Add conversation tracking
  
  sendMessage: async (content: string) => {
    try {
      set({ isLoading: true, error: null });
      
      // Get current user or null if guest
      const user = useAuthStore.getState().user;
      const userId = user?.id || null;
      
      // Create user message
      const userMessage: Message = {
        id: Date.now().toString(),
        user_id: userId,
        content,
        is_user: true,
        created_at: new Date().toISOString(),
      };
      
      // Add user message to state
      set(state => ({
        messages: [...state.messages, userMessage],
      }));
      
      // Call edge function to process message
      const { data, error } = await callEdgeFunction('process-movie-query', {
        query: content,
        userId,
        conversationId: get().conversationId,
        sessionId: `session_${Date.now()}`,
      });
      
      if (error) throw error;
      
      console.log('Edge function response:', { data, error });
      
      // Add AI response to state
      if (data && data.data) {
        const responseData = data.data;
        console.log('Response data:', responseData);
        
        // Handle error responses from the edge function
        if (responseData.error) {
          const errorMessage: Message = {
            id: (Date.now() + 1).toString(),
            user_id: userId,
            content: responseData.error,
            is_user: false,
            created_at: new Date().toISOString(),
          };
          
          set((state: any) => ({
            messages: [...state.messages, errorMessage],
          }));
          return;
        }
        
        // Handle successful responses
        console.log('Creating bot message with:', {
          hasMessage: !!responseData.message,
          hasMovie: !!responseData.movie,
          hasRecommendation: !!responseData.recommendation,
          movieTitle: responseData.movie?.title,
          recommendationText: responseData.recommendation?.recommendation
        });
        
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          user_id: userId,
          content: responseData.message || "I received your message but couldn't generate a proper response.",
          is_user: false,
          movie: responseData.movie || undefined,
          recommendation: responseData.recommendation || undefined,
          created_at: new Date().toISOString(),
        };
        
        console.log('Bot message created:', botMessage);
        
        set((state: any) => ({
          messages: [...state.messages, botMessage],
        }));
      }
    } catch (error: any) {
      set({ error: error.message || 'Failed to send message' });
      
      // Add error message from bot
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        user_id: useAuthStore.getState().user?.id || null,
        content: "I'm sorry, I couldn't process your request. Please try again later.",
        is_user: false,
        created_at: new Date().toISOString(),
      };
      
      set((state: any) => ({
        messages: [...state.messages, errorMessage],
      }));
    } finally {
      set({ isLoading: false });
    }
  },
  
  clearMessages: () => {
    set({ 
      messages: [],
      conversationId: generateConversationId() // Start new conversation
    });
  },
  
  setError: (error: string | null) => {
    set({ error });
  },
}));