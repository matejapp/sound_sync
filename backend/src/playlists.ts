import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "./internal.js";
import type {
  CreatePlaylistInput,
  Playlist,
  PlaylistTrack,
  UpdatePlaylistInput,
} from "./types.js";

export async function createPlaylist(
  client: SupabaseClient,
  input: CreatePlaylistInput,
): Promise<Playlist> {
  const user = await requireUser(client);
  const { data, error } = await client
    .from("playlists")
    .insert({
      owner_id: user.id,
      title: input.title,
      description: input.description ?? null,
      visibility: input.visibility ?? "private",
    })
    .select()
    .single();
  if (error) throw error;
  return data as Playlist;
}

export async function updatePlaylist(
  client: SupabaseClient,
  playlistId: string,
  patch: UpdatePlaylistInput,
): Promise<Playlist> {
  const { data, error } = await client
    .from("playlists")
    .update(patch)
    .eq("id", playlistId)
    .select()
    .single();
  if (error) throw error;
  return data as Playlist;
}

export async function deletePlaylist(
  client: SupabaseClient,
  playlistId: string,
): Promise<void> {
  const { error } = await client.from("playlists").delete().eq("id", playlistId);
  if (error) throw error;
}

export async function listMyPlaylists(client: SupabaseClient): Promise<Playlist[]> {
  const user = await requireUser(client);
  const { data, error } = await client
    .from("playlists")
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as Playlist[];
}

export async function listPublicPlaylists(
  client: SupabaseClient,
  limit = 30,
): Promise<Playlist[]> {
  const { data, error } = await client
    .from("playlists")
    .select("*")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as Playlist[];
}

export async function getPlaylistTracks(
  client: SupabaseClient,
  playlistId: string,
): Promise<PlaylistTrack[]> {
  const { data, error } = await client
    .from("playlist_tracks")
    .select("position, added_at, tracks(*)")
    .eq("playlist_id", playlistId)
    .order("position");
  if (error) throw error;

  return (data ?? []).map((item) => ({
    ...(item.tracks as unknown as Omit<PlaylistTrack, "position" | "added_at">),
    position: item.position as number,
    added_at: item.added_at as string,
  }));
}

export async function addTrackToPlaylist(
  client: SupabaseClient,
  playlistId: string,
  trackId: string,
): Promise<void> {
  const user = await requireUser(client);
  const { data: lastItem, error: positionError } = await client
    .from("playlist_tracks")
    .select("position")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (positionError) throw positionError;

  const { error } = await client.from("playlist_tracks").insert({
    playlist_id: playlistId,
    track_id: trackId,
    added_by: user.id,
    position: (lastItem?.position ?? -1) + 1,
  });
  if (error) throw error;
}

export async function removeTrackFromPlaylist(
  client: SupabaseClient,
  playlistId: string,
  trackId: string,
): Promise<void> {
  const { error } = await client
    .from("playlist_tracks")
    .delete()
    .eq("playlist_id", playlistId)
    .eq("track_id", trackId);
  if (error) throw error;
}

export async function reorderPlaylistTracks(
  client: SupabaseClient,
  playlistId: string,
  orderedTrackIds: string[],
): Promise<void> {
  const { error } = await client.rpc("reorder_playlist_tracks", {
    p_playlist_id: playlistId,
    p_track_ids: orderedTrackIds,
  });
  if (error) throw error;
}
