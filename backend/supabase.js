import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    })
  : null;

if (isSupabaseConfigured) {
  console.log('[SUPABASE] Connected to Supabase at:', supabaseUrl);
} else {
  console.log('[SUPABASE] Running in local JSON mode (SUPABASE_URL not configured).');
}

/**
 * App Configuration in Supabase
 */
export async function getSupabaseConfig(key) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error) throw error;
    return data ? data.value : null;
  } catch (err) {
    console.warn(`[Supabase] getConfig(${key}) failed:`, err.message);
    return null;
  }
}

export async function setSupabaseConfig(key, value) {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('app_config')
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn(`[Supabase] setConfig(${key}) failed:`, err.message);
    return false;
  }
}

/**
 * Addons Table in Supabase
 */
export async function getSupabaseAddons() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('addons')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase] getAddons failed:', err.message);
    return null;
  }
}

export async function saveSupabaseAddon(addon) {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('addons')
      .upsert({
        id: addon.id,
        name: addon.name,
        url: addon.url,
        enabled: addon.enabled ?? true,
        builtin: addon.builtin ?? false
      });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[Supabase] saveAddon failed:', err.message);
    return false;
  }
}

export async function removeSupabaseAddon(id) {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('addons')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[Supabase] removeAddon failed:', err.message);
    return false;
  }
}

/**
 * IPTV Playlists in Supabase
 */
export async function getSupabaseIptvPlaylists() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('iptv_playlists')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase] getIptvPlaylists failed:', err.message);
    return null;
  }
}

export async function saveSupabaseIptvPlaylist(playlist) {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('iptv_playlists')
      .upsert({
        id: playlist.id,
        name: playlist.name,
        url: playlist.url,
        enabled: playlist.enabled ?? true
      });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[Supabase] saveIptvPlaylist failed:', err.message);
    return false;
  }
}

export async function removeSupabaseIptvPlaylist(id) {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('iptv_playlists')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[Supabase] removeIptvPlaylist failed:', err.message);
    return false;
  }
}
