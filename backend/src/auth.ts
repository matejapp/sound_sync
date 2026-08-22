import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "./types.js";

export async function signUp(
  client: SupabaseClient,
  input: { email: string; password: string; username: string; displayName?: string },
) {
  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        username: input.username,
        display_name: input.displayName ?? input.username,
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn(
  client: SupabaseClient,
  email: string,
  password: string,
) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function getMyProfile(client: SupabaseClient): Promise<Profile> {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Authentication required.");

  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function updateMyProfile(
  client: SupabaseClient,
  patch: Pick<Partial<Profile>, "username" | "display_name" | "bio" | "avatar_path">,
): Promise<Profile> {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Authentication required.");

  const { data, error } = await client
    .from("profiles")
    .update(patch)
    .eq("id", userData.user.id)
    .select()
    .single();
  if (error) throw error;
  return data as Profile;
}
