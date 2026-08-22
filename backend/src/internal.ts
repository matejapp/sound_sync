import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function requireUser(client: SupabaseClient): Promise<User> {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Authentication required.");
  return data.user;
}

export function publicFileUrl(
  client: SupabaseClient,
  bucket: string,
  path: string | null,
): string | null {
  if (!path) return null;
  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export function fileExtension(filename: string, mimeType: string): string {
  const extension = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (extension) return extension;

  const subtype = mimeType.split("/")[1]?.split(";")[0]?.replace(/[^a-z0-9]/g, "");
  return subtype || "bin";
}
