-- ==============================================================
-- My-Movie-House Supabase Database Schema
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- ==============================================================

-- 1. App Configuration Table (TMDB Key, UI Preferences, etc.)
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Installed Addons Table (Stremio & Community Addons)
CREATE TABLE IF NOT EXISTS addons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  builtin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. IPTV Playlists Table
CREATE TABLE IF NOT EXISTS iptv_playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. User Watchlist / Favorites Table (Optional sync)
CREATE TABLE IF NOT EXISTS user_favorites (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  poster TEXT,
  banner TEXT,
  genres JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. User Watch Progress / History Table (Optional sync)
CREATE TABLE IF NOT EXISTS watch_progress (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  poster TEXT,
  progress_seconds FLOAT DEFAULT 0,
  duration_seconds FLOAT DEFAULT 0,
  percentage FLOAT DEFAULT 0,
  season INT,
  episode INT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) but allow anonymous access for read/write if using anon key
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE iptv_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_progress ENABLE ROW LEVEL SECURITY;

-- Allow public access (can be locked down with Supabase Auth later)
CREATE POLICY "Allow public read/write app_config" ON app_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write addons" ON addons FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write iptv_playlists" ON iptv_playlists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write user_favorites" ON user_favorites FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write watch_progress" ON watch_progress FOR ALL USING (true) WITH CHECK (true);
