import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Define custom storage for persisting auth state
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    SecureStore.deleteItemAsync(key);
  },
};

// For web, use localStorage; for native, use SecureStore
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Create the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' 
      ? localStorage 
      : ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Helper to handle API requests to Supabase Edge Functions
export const callEdgeFunction = async (
  functionName: string, 
  payload?: any
) => {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: payload,
    });
    
    if (error) {
      throw new Error(error.message);
    }
    
    return { data, error: null };
  } catch (error) {
    console.error(`Error calling ${functionName}:`, error);
    return { data: null, error };
  }
};