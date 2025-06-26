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
        // Create profile entry
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            email: data.user.email || email,
          });
        
        if (profileError) {
          console.error('Profile creation error:', profileError);
          // Don't throw here - user is created, profile creation is secondary
        }
        
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