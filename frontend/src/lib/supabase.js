import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

const FALLBACK_ART = [
  "/art/reggae-pulse.png", "/art/slow-motion.png", "/art/night-shift.png",
  "/art/warm-current.png", "/art/analog-sun.png", "/art/gym-time.png",
];

function requireClient() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

async function requireUser() {
  const client = requireClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Sign in to continue.");
  return data.user;
}

function extensionFor(file) {
  return file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
}

export function publicUrl(bucket, path) {
  if (!path || !supabase) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export function coverUrl(path, index = 0) {
  return publicUrl("playlist-covers", path) || FALLBACK_ART[index % FALLBACK_ART.length];
}

export function avatarUrl(path) { return publicUrl("avatars", path); }
export function audioUrl(path) { return publicUrl("audio-files", path); }

export function formatDuration(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function normalizePlaylist(row, index = 0) {
  const countValue = Array.isArray(row.playlist_tracks)
    ? Number(row.playlist_tracks[0]?.count ?? row.playlist_tracks.length) : Number(row.track_count ?? 0);
  const likesValue = Array.isArray(row.playlist_likes)
    ? Number(row.playlist_likes[0]?.count ?? row.playlist_likes.length) : Number(row.likes_count ?? 0);
  return {
    ...row,
    curator: row.owner?.display_name || row.owner?.username || "SoundSync",
    count: countValue,
    likesCount: likesValue,
    image: coverUrl(row.cover_path, index),
  };
}

function normalizeTrack(row, index = 0) {
  return {
    ...row,
    artist: row.artist || "Unknown artist",
    duration: row.duration_seconds ? formatDuration(row.duration_seconds) : "—:—",
    image: FALLBACK_ART[index % FALLBACK_ART.length],
    audio_url: audioUrl(row.file_path),
  };
}

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(session, event));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email, password) {
  const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp({ email, password, username, displayName }) {
  const { data, error } = await requireClient().auth.signUp({
    email, password,
    options: { emailRedirectTo: window.location.origin, data: { username, display_name: displayName || username } },
  });
  if (error) throw error;
  return data;
}

export async function resetPassword(email) {
  const { error } = await requireClient().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) throw error;
}

export async function updatePassword(password) {
  const { data, error } = await requireClient().auth.updateUser({ password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await requireClient().auth.signOut();
  if (error) throw error;
}

export async function getMyProfile() {
  const client = requireClient();
  const user = await requireUser();
  const { data, error } = await client.from("profiles").select("*").eq("id", user.id).single();
  if (error) throw error;
  return { ...data, avatar_url: avatarUrl(data.avatar_path) };
}

export async function updateMyProfile(patch) {
  const client = requireClient();
  const user = await requireUser();
  const { data, error } = await client.from("profiles").update(patch).eq("id", user.id).select().single();
  if (error) throw error;
  return { ...data, avatar_url: avatarUrl(data.avatar_path) };
}

export async function uploadAvatar(file) {
  const client = requireClient();
  const user = await requireUser();
  if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
  const path = `${user.id}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await client.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function listPlaylists() {
  const client = requireClient();
  const user = await requireUser();
  const select = "*, owner:profiles!playlists_owner_id_fkey(id,username,display_name,avatar_path), playlist_tracks(count), playlist_likes(count)";
  const [publicResult, mineResult] = await Promise.all([
    client.from("playlists").select(select).eq("visibility", "public").order("created_at", { ascending: false }),
    client.from("playlists").select(select).eq("owner_id", user.id).order("updated_at", { ascending: false }),
  ]);
  if (publicResult.error) throw publicResult.error;
  if (mineResult.error) throw mineResult.error;
  const unique = new Map();
  [...(mineResult.data || []), ...(publicResult.data || [])].forEach((row) => unique.set(row.id, row));
  return [...unique.values()].map(normalizePlaylist);
}

export async function listLikedPlaylists() {
  const client = requireClient();
  const user = await requireUser();
  const { data, error } = await client
    .from("playlist_likes")
    .select("playlists(*, owner:profiles!playlists_owner_id_fkey(id,username,display_name,avatar_path), playlist_tracks(count), playlist_likes(count))")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row, index) => normalizePlaylist(row.playlists, index));
}

export async function createPlaylist(input) {
  const client = requireClient();
  const user = await requireUser();
  const { data, error } = await client.from("playlists").insert({
    owner_id: user.id, title: input.title, description: input.description || null, visibility: input.visibility || "private",
  }).select("*, owner:profiles!playlists_owner_id_fkey(id,username,display_name,avatar_path)").single();
  if (error) throw error;
  return normalizePlaylist(data);
}

export async function updatePlaylist(playlistId, patch) {
  const { data, error } = await requireClient().from("playlists").update(patch).eq("id", playlistId)
    .select("*, owner:profiles!playlists_owner_id_fkey(id,username,display_name,avatar_path), playlist_tracks(count), playlist_likes(count)").single();
  if (error) throw error;
  return normalizePlaylist(data);
}

export async function deletePlaylist(playlistId) {
  const { error } = await requireClient().from("playlists").delete().eq("id", playlistId);
  if (error) throw error;
}

export async function uploadPlaylistCover(playlistId, file) {
  const client = requireClient();
  const user = await requireUser();
  if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
  const path = `${user.id}/${playlistId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await client.storage.from("playlist-covers").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  await updatePlaylist(playlistId, { cover_path: path });
  return path;
}

export async function listMyTracks() {
  const client = requireClient();
  const user = await requireUser();
  const { data, error } = await client.from("tracks").select("*").eq("uploader_id", user.id).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeTrack);
}

export async function getPlaylistDetails(playlistId) {
  const client = requireClient();
  const user = await requireUser();
  const [playlistResult, tracksResult, commentsResult, likeResult] = await Promise.all([
    client.from("playlists").select("*, owner:profiles!playlists_owner_id_fkey(id,username,display_name,avatar_path), playlist_likes(count)").eq("id", playlistId).single(),
    client.from("playlist_tracks").select("position, added_at, tracks(*)").eq("playlist_id", playlistId).order("position"),
    client.from("comments").select("*, author:profiles!comments_author_id_fkey(id,username,display_name,avatar_path)").eq("playlist_id", playlistId).order("created_at"),
    client.from("playlist_likes").select("playlist_id").eq("playlist_id", playlistId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (playlistResult.error) throw playlistResult.error;
  if (tracksResult.error) throw tracksResult.error;
  if (commentsResult.error) throw commentsResult.error;
  if (likeResult.error) throw likeResult.error;
  return {
    playlist: normalizePlaylist(playlistResult.data),
    tracks: (tracksResult.data || []).map((item, index) => ({ ...normalizeTrack(item.tracks, index), position: item.position, added_at: item.added_at })),
    comments: (commentsResult.data || []).map((comment) => ({ ...comment, authorName: comment.author?.display_name || comment.author?.username || "Listener" })),
    liked: Boolean(likeResult.data),
  };
}

export async function uploadAudioFile(file, metadata) {
  const client = requireClient();
  const user = await requireUser();
  if (!file.type.startsWith("audio/")) throw new Error("Choose a supported audio file.");
  if (file.size <= 0 || file.size > 50 * 1024 * 1024) throw new Error("Audio files must be smaller than 50 MB.");
  const path = `${user.id}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error: storageError } = await client.storage.from("audio-files").upload(path, file, { contentType: file.type, upsert: false });
  if (storageError) throw storageError;
  const { data, error } = await client.from("tracks").insert({
    uploader_id: user.id, title: metadata.title, artist: metadata.artist || null, album: metadata.album || null,
    genre: metadata.genre || null, file_path: path, original_filename: file.name, mime_type: file.type,
    file_size_bytes: file.size, duration_seconds: metadata.durationSeconds || null,
  }).select().single();
  if (error) {
    await client.storage.from("audio-files").remove([path]);
    throw error;
  }
  return normalizeTrack(data);
}

export async function deleteTrack(track) {
  const client = requireClient();
  const { error } = await client.from("tracks").delete().eq("id", track.id);
  if (error) throw error;
  await client.storage.from("audio-files").remove([track.file_path]);
}

export async function addTrackToPlaylist(playlistId, trackId) {
  const client = requireClient();
  const user = await requireUser();
  const { data: last } = await client.from("playlist_tracks").select("position").eq("playlist_id", playlistId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await client.from("playlist_tracks").insert({
    playlist_id: playlistId, track_id: trackId, added_by: user.id, position: Number(last?.position ?? -1) + 1,
  });
  if (error) throw error;
}

export async function removeTrackFromPlaylist(playlistId, trackId) {
  const { error } = await requireClient().from("playlist_tracks").delete().eq("playlist_id", playlistId).eq("track_id", trackId);
  if (error) throw error;
}

export async function reorderPlaylistTracks(playlistId, trackIds) {
  const { error } = await requireClient().rpc("reorder_playlist_tracks", { p_playlist_id: playlistId, p_track_ids: trackIds });
  if (error) throw error;
}

export async function togglePlaylistLike(playlistId) {
  const { data, error } = await requireClient().rpc("toggle_playlist_like", { p_playlist_id: playlistId });
  if (error) throw error;
  return Boolean(data);
}

export async function addComment(playlistId, body) {
  const client = requireClient();
  const user = await requireUser();
  const { data, error } = await client.from("comments").insert({ playlist_id: playlistId, author_id: user.id, body: body.trim() })
    .select("*, author:profiles!comments_author_id_fkey(id,username,display_name,avatar_path)").single();
  if (error) throw error;
  return { ...data, authorName: data.author?.display_name || data.author?.username || "You" };
}

export async function deleteComment(commentId) {
  const { error } = await requireClient().from("comments").delete().eq("id", commentId);
  if (error) throw error;
}

export async function rotateShareToken(playlistId) {
  const { data, error } = await requireClient().rpc("rotate_playlist_share_token", { p_playlist_id: playlistId });
  if (error) throw error;
  return data;
}

export async function getSharedPlaylist(shareToken) {
  const { data, error } = await requireClient().rpc("get_shared_playlist", { p_share_token: shareToken });
  if (error) throw error;
  if (!data) return null;
  return {
    ...data, image: coverUrl(data.cover_path), curator: data.owner?.display_name || data.owner?.username || "SoundSync",
    tracks: (data.tracks || []).map(normalizeTrack),
  };
}
