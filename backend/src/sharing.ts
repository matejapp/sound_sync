import type { SupabaseClient } from "@supabase/supabase-js";
import type { SharedPlaylist } from "./types.js";

export async function getSharedPlaylist(
  client: SupabaseClient,
  shareToken: string,
): Promise<SharedPlaylist | null> {
  const { data, error } = await client.rpc("get_shared_playlist", {
    p_share_token: shareToken,
  });
  if (error) throw error;
  return data as SharedPlaylist | null;
}

export async function rotateShareToken(
  client: SupabaseClient,
  playlistId: string,
): Promise<string> {
  const { data, error } = await client.rpc("rotate_playlist_share_token", {
    p_playlist_id: playlistId,
  });
  if (error) throw error;
  return data as string;
}

export function sharePath(token: string): string {
  return `/shared/${encodeURIComponent(token)}`;
}
