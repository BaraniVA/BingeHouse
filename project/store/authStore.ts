import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { AuthState, User } from '@/lib/types';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  isGuest: false,
  error: null,

  login: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) throw error;
      
      if (data.user) {
        const user: User = {
          id: data.user.id,
          email: data.user.email || '',
          created_at: data.user.created_at || new Date().toISOString(),
        };
        set({ user, isGuest: false });
      }
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      set({ isLoading: false });
    }
  },
  
  register: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      
      if (error) throw error;
      
      if (data.user) {
        // Only create profile if user signup was successful
        try {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              email: data.user.email || email,
            });
          
          if (profileError) {
            console.warn('Profile creation failed:', profileError.message);
            // Don't throw - user is created successfully
          }
        } catch (profileErr) {
          console.warn('Profile creation error:', profileErr);
          // Continue - user registration was successful
        }
        
        const user: User = {
          id: data.user.id,
          email: data.user.email || '',
          created_at: data.user.created_at || new Date().toISOString(),
        };
        set({ user, isGuest: false });
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      set({ error: error.message || 'Registration failed. Please try again.' });
    } finally {
      set({ isLoading: false });
    }
  },
  
  logout: async () => {
    try {
      set({ isLoading: true, error: null });
      
      const { error } = await supabase.auth.signOut();
      
      if (error) throw error;
      
      set({ user: null, isGuest: false });
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      set({ isLoading: false });
    }
  },
  
  continueAsGuest: () => {
    set({ isGuest: true });
  },
  
  setError: (error: string | null) => {
    set({ error });
  },
}));