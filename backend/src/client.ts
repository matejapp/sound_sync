import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SoundSyncClientOptions {
  persistSession?: boolean;
  autoRefreshToken?: boolean;
  detectSessionInUrl?: boolean;
}

export function createSoundSyncClient(
  supabaseUrl: string,
  supabaseAnonKey: string,
  options: SoundSyncClientOptions = {},
): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("A Supabase URL and anonymous key are required.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: options.persistSession ?? true,
      autoRefreshToken: options.autoRefreshToken ?? true,
      detectSessionInUrl: options.detectSessionInUrl ?? true,
    },
  });
}
