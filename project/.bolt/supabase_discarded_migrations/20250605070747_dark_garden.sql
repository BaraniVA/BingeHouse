/*
  # BingeHouse Database Schema

  1. New Tables
    - `profiles` - User profiles with additional information
    - `movies` - Movie information fetched from external APIs
    - `recommendations` - AI-generated recommendations for movies
    - `messages` - Chat messages between users and the AI

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to access their own data
    - Add policies for service role to access all data
*/

-- Create profiles table to store user information
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create movies table to store movie information
CREATE TABLE IF NOT EXISTS movies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  year TEXT,
  imdbID TEXT UNIQUE NOT NULL,
  poster TEXT,
  imdbRating TEXT,
  imdbVotes TEXT,
  plot TEXT,
  director TEXT,
  actors TEXT,
  genre TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create recommendations table to store AI-generated recommendations
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id UUID REFERENCES movies(id) ON DELETE CASCADE NOT NULL,
  recommendation TEXT NOT NULL,
  worth_watching BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create messages table to store chat history
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  is_user BOOLEAN DEFAULT true,
  movie_id UUID REFERENCES movies(id),
  recommendation_id UUID REFERENCES recommendations(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view their own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Create policies for movies
CREATE POLICY "Users can view their own movies"
  ON movies
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own movies"
  ON movies
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policies for recommendations
CREATE POLICY "Users can view recommendations for their movies"
  ON recommendations
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM movies
    WHERE movies.id = recommendations.movie_id
    AND movies.user_id = auth.uid()
  ));

-- Create policies for messages
CREATE POLICY "Users can view their own messages"
  ON messages
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own messages"
  ON messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create a trigger to create a profile when a user signs up
CREATE OR REPLACE FUNCTION create_profile_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_profile_for_user();