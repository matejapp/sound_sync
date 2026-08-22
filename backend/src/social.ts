import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "./internal.js";
import type { Comment } from "./types.js";

export async function togglePlaylistLike(
  client: SupabaseClient,
  playlistId: string,
): Promise<boolean> {
  const { data, error } = await client.rpc("toggle_playlist_like", {
    p_playlist_id: playlistId,
  });
  if (error) throw error;
  return data as boolean;
}

export async function listComments(
  client: SupabaseClient,
  playlistId: string,
): Promise<Comment[]> {
  const { data, error } = await client
    .from("comments")
    .select("*, author:profiles(id, username, display_name, avatar_path)")
    .eq("playlist_id", playlistId)
    .order("created_at");
  if (error) throw error;
  return data as unknown as Comment[];
}

export async function addComment(
  client: SupabaseClient,
  playlistId: string,
  body: string,
): Promise<Comment> {
  const user = await requireUser(client);
  const { data, error } = await client
    .from("comments")
    .insert({ playlist_id: playlistId, author_id: user.id, body: body.trim() })
    .select()
    .single();
  if (error) throw error;
  return data as Comment;
}

export async function updateComment(
  client: SupabaseClient,
  commentId: string,
  body: string,
): Promise<Comment> {
  const { data, error } = await client
    .from("comments")
    .update({ body: body.trim() })
    .eq("id", commentId)
    .select()
    .single();
  if (error) throw error;
  return data as Comment;
}

export async function deleteComment(
  client: SupabaseClient,
  commentId: string,
): Promise<void> {
  const { error } = await client.from("comments").delete().eq("id", commentId);
  if (error) throw error;
}
