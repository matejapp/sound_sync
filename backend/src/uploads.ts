import type { SupabaseClient } from "@supabase/supabase-js";
import { fileExtension, publicFileUrl, requireUser } from "./internal.js";
import type { Track, UploadTrackInput } from "./types.js";

const AUDIO_BUCKET = "audio-files";
const COVER_BUCKET = "playlist-covers";
const AVATAR_BUCKET = "avatars";
const MAX_AUDIO_SIZE = 50 * 1024 * 1024;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export async function uploadTrack(
  client: SupabaseClient,
  file: File,
  input: UploadTrackInput,
): Promise<Track> {
  const user = await requireUser(client);
  if (!file.type.startsWith("audio/")) throw new Error("Only audio files are accepted.");
  if (file.size <= 0 || file.size > MAX_AUDIO_SIZE) {
    throw new Error("Audio files must be between 1 byte and 50 MB.");
  }

  const path = `${user.id}/${crypto.randomUUID()}.${fileExtension(file.name, file.type)}`;
  const { error: uploadError } = await client.storage
    .from(AUDIO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error: insertError } = await client
    .from("tracks")
    .insert({
      uploader_id: user.id,
      title: input.title,
      artist: input.artist ?? null,
      album: input.album ?? null,
      genre: input.genre ?? null,
      file_path: path,
      original_filename: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      duration_seconds: input.durationSeconds ?? null,
    })
    .select()
    .single();

  if (insertError) {
    await client.storage.from(AUDIO_BUCKET).remove([path]);
    throw insertError;
  }

  return data as Track;
}

export async function deleteTrack(
  client: SupabaseClient,
  trackId: string,
): Promise<{ storageCleanupFailed: boolean }> {
  const { data, error: selectError } = await client
    .from("tracks")
    .select("file_path")
    .eq("id", trackId)
    .single();
  if (selectError) throw selectError;

  const { error: deleteError } = await client.from("tracks").delete().eq("id", trackId);
  if (deleteError) throw deleteError;

  const { error: storageError } = await client.storage
    .from(AUDIO_BUCKET)
    .remove([data.file_path as string]);
  return { storageCleanupFailed: Boolean(storageError) };
}

async function uploadImage(
  client: SupabaseClient,
  bucket: string,
  file: File,
  childFolder?: string,
): Promise<{ path: string; publicUrl: string }> {
  const user = await requireUser(client);
  if (!file.type.startsWith("image/")) throw new Error("Only image files are accepted.");
  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
    throw new Error("Images must be between 1 byte and 5 MB.");
  }

  const suffix = `${crypto.randomUUID()}.${fileExtension(file.name, file.type)}`;
  const path = childFolder ? `${user.id}/${childFolder}/${suffix}` : `${user.id}/${suffix}`;
  const { error } = await client.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;

  return { path, publicUrl: publicFileUrl(client, bucket, path)! };
}

export function uploadPlaylistCover(
  client: SupabaseClient,
  playlistId: string,
  file: File,
) {
  return uploadImage(client, COVER_BUCKET, file, playlistId);
}

export function uploadAvatar(client: SupabaseClient, file: File) {
  return uploadImage(client, AVATAR_BUCKET, file);
}

export function audioUrl(client: SupabaseClient, path: string): string {
  return publicFileUrl(client, AUDIO_BUCKET, path)!;
}

export function playlistCoverUrl(client: SupabaseClient, path: string | null) {
  return publicFileUrl(client, COVER_BUCKET, path);
}

export function avatarUrl(client: SupabaseClient, path: string | null) {
  return publicFileUrl(client, AVATAR_BUCKET, path);
}
