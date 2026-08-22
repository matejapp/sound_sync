export type PlaylistVisibility = "private" | "unlisted" | "public";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface Playlist {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  cover_path: string | null;
  visibility: PlaylistVisibility;
  share_token: string;
  created_at: string;
  updated_at: string;
}

export interface Track {
  id: string;
  uploader_id: string;
  title: string;
  artist: string | null;
  album: string | null;
  genre: string | null;
  file_path: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface PlaylistTrack extends Track {
  position: number;
  added_at: string;
}

export interface Comment {
  id: string;
  playlist_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author?: Pick<Profile, "id" | "username" | "display_name" | "avatar_path">;
}

export interface SharedPlaylist {
  id: string;
  title: string;
  description: string | null;
  cover_path: string | null;
  visibility: Exclude<PlaylistVisibility, "private">;
  created_at: string;
  updated_at: string;
  owner: Pick<Profile, "id" | "username" | "display_name" | "avatar_path">;
  likes_count: number;
  tracks: Array<
    Pick<
      Track,
      | "id"
      | "title"
      | "artist"
      | "album"
      | "genre"
      | "file_path"
      | "mime_type"
      | "file_size_bytes"
      | "duration_seconds"
    > & { position: number }
  >;
  comments: Array<
    Pick<Comment, "id" | "body" | "created_at" | "updated_at"> & {
      author: Pick<Profile, "id" | "username" | "display_name" | "avatar_path">;
    }
  >;
}

export interface CreatePlaylistInput {
  title: string;
  description?: string | null;
  visibility?: PlaylistVisibility;
}

export interface UpdatePlaylistInput {
  title?: string;
  description?: string | null;
  visibility?: PlaylistVisibility;
  cover_path?: string | null;
}

export interface UploadTrackInput {
  title: string;
  artist?: string | null;
  album?: string | null;
  genre?: string | null;
  durationSeconds?: number | null;
}
