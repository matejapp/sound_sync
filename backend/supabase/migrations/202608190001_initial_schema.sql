create extension if not exists pgcrypto;

create type public.playlist_visibility as enum ('private', 'unlisted', 'public');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-zA-Z0-9_]{3,30}$'),
  display_name text check (char_length(display_name) <= 80),
  bio text check (char_length(bio) <= 300),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_avatar_owned check (
    avatar_path is null or split_part(avatar_path, '/', 1) = id::text
  )
);

create unique index profiles_username_lower_key on public.profiles (lower(username));

create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 1000),
  cover_path text,
  visibility public.playlist_visibility not null default 'private',
  share_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint playlist_cover_owned check (
    cover_path is null or split_part(cover_path, '/', 1) = owner_id::text
  )
);

create index playlists_owner_id_idx on public.playlists(owner_id);
create index playlists_visibility_created_at_idx on public.playlists(visibility, created_at desc);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  artist text check (char_length(artist) <= 200),
  album text check (char_length(album) <= 200),
  genre text check (char_length(genre) <= 80),
  file_path text not null unique,
  original_filename text not null check (char_length(original_filename) <= 255),
  mime_type text not null check (mime_type like 'audio/%'),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 52428800),
  duration_seconds numeric(10, 2) check (duration_seconds is null or duration_seconds > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint track_file_owned check (split_part(file_path, '/', 1) = uploader_id::text)
);

create index tracks_uploader_id_idx on public.tracks(uploader_id);
create index tracks_created_at_idx on public.tracks(created_at desc);

create table public.playlist_tracks (
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  added_by uuid not null references public.profiles(id) on delete cascade,
  position integer not null check (position >= 0),
  added_at timestamptz not null default now(),
  primary key (playlist_id, track_id)
);

create index playlist_tracks_order_idx on public.playlist_tracks(playlist_id, position, added_at);
create index playlist_tracks_track_id_idx on public.playlist_tracks(track_id);

create table public.playlist_likes (
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (playlist_id, user_id)
);

create index playlist_likes_user_id_idx on public.playlist_likes(user_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comments_playlist_created_at_idx on public.comments(playlist_id, created_at);
create index comments_author_id_idx on public.comments(author_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger playlists_set_updated_at
before update on public.playlists
for each row execute function public.set_updated_at();

create trigger tracks_set_updated_at
before update on public.tracks
for each row execute function public.set_updated_at();

create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
begin
  base_username := regexp_replace(
    lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'user')),
    '[^a-z0-9_]',
    '',
    'g'
  );

  if char_length(base_username) < 3 then
    base_username := 'user';
  end if;

  base_username := left(base_username, 23);

  if exists (select 1 from public.profiles where lower(username) = base_username) then
    base_username := base_username || '_' || left(new.id::text, 6);
  end if;

  begin
    insert into public.profiles (id, username, display_name)
    values (
      new.id,
      base_username,
      nullif(new.raw_user_meta_data ->> 'display_name', '')
    );
  exception when unique_violation then
    insert into public.profiles (id, username, display_name)
    values (
      new.id,
      left(base_username, 23) || '_' || left(new.id::text, 6),
      nullif(new.raw_user_meta_data ->> 'display_name', '')
    );
  end;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_playlist_owner(p_playlist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.playlists
    where id = p_playlist_id and owner_id = auth.uid()
  );
$$;

create or replace function public.can_read_playlist(p_playlist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.playlists
    where id = p_playlist_id
      and (owner_id = auth.uid() or visibility = 'public')
  );
$$;

create or replace function public.can_read_track(p_track_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tracks t
    where t.id = p_track_id
      and (
        t.uploader_id = auth.uid()
        or exists (
          select 1
          from public.playlist_tracks pt
          join public.playlists p on p.id = pt.playlist_id
          where pt.track_id = t.id
            and (p.owner_id = auth.uid() or p.visibility = 'public')
        )
      )
  );
$$;

alter table public.profiles enable row level security;
alter table public.playlists enable row level security;
alter table public.tracks enable row level security;
alter table public.playlist_tracks enable row level security;
alter table public.playlist_likes enable row level security;
alter table public.comments enable row level security;

create policy "Profiles are publicly readable"
on public.profiles for select
using (true);

create policy "Users can update their own profile"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "Owners and the public can read playlists"
on public.playlists for select
using (owner_id = auth.uid() or visibility = 'public');

create policy "Users can create their own playlists"
on public.playlists for insert
with check (owner_id = auth.uid());

create policy "Owners can update their playlists"
on public.playlists for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Owners can delete their playlists"
on public.playlists for delete
using (owner_id = auth.uid());

create policy "Uploaders and playlist listeners can read tracks"
on public.tracks for select
using (public.can_read_track(id));

create policy "Users can register their own uploads"
on public.tracks for insert
with check (uploader_id = auth.uid());

create policy "Uploaders can update their tracks"
on public.tracks for update
using (uploader_id = auth.uid())
with check (uploader_id = auth.uid());

create policy "Uploaders can delete their tracks"
on public.tracks for delete
using (uploader_id = auth.uid());

create policy "Listeners can read playlist tracks"
on public.playlist_tracks for select
using (public.can_read_playlist(playlist_id));

create policy "Playlist owners can add tracks"
on public.playlist_tracks for insert
with check (public.is_playlist_owner(playlist_id) and added_by = auth.uid());

create policy "Playlist owners can reorder tracks"
on public.playlist_tracks for update
using (public.is_playlist_owner(playlist_id))
with check (public.is_playlist_owner(playlist_id));

create policy "Playlist owners can remove tracks"
on public.playlist_tracks for delete
using (public.is_playlist_owner(playlist_id));

create policy "Likes are readable with their playlist"
on public.playlist_likes for select
using (public.can_read_playlist(playlist_id));

create policy "Signed-in users can like visible playlists"
on public.playlist_likes for insert
with check (user_id = auth.uid() and public.can_read_playlist(playlist_id));

create policy "Users can remove their own likes"
on public.playlist_likes for delete
using (user_id = auth.uid());

create policy "Comments are readable with their playlist"
on public.comments for select
using (public.can_read_playlist(playlist_id));

create policy "Signed-in users can comment on visible playlists"
on public.comments for insert
with check (author_id = auth.uid() and public.can_read_playlist(playlist_id));

create policy "Authors can update their comments"
on public.comments for update
using (author_id = auth.uid())
with check (author_id = auth.uid());

create policy "Authors and playlist owners can delete comments"
on public.comments for delete
using (author_id = auth.uid() or public.is_playlist_owner(playlist_id));

create or replace function public.toggle_playlist_like(p_playlist_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_read_playlist(p_playlist_id) then
    raise exception 'Playlist not found or not accessible';
  end if;

  delete from public.playlist_likes
  where playlist_id = p_playlist_id and user_id = current_user_id;

  if found then
    return false;
  end if;

  insert into public.playlist_likes (playlist_id, user_id)
  values (p_playlist_id, current_user_id);

  return true;
end;
$$;

create or replace function public.rotate_playlist_share_token(p_playlist_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_token uuid := gen_random_uuid();
begin
  update public.playlists
  set share_token = next_token
  where id = p_playlist_id and owner_id = auth.uid();

  if not found then
    raise exception 'Playlist not found or not owned by the current user';
  end if;

  return next_token;
end;
$$;

create or replace function public.reorder_playlist_tracks(
  p_playlist_id uuid,
  p_track_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  expected_count integer;
  supplied_count integer;
begin
  if not public.is_playlist_owner(p_playlist_id) then
    raise exception 'Playlist not found or not owned by the current user';
  end if;

  select count(*) into expected_count
  from public.playlist_tracks
  where playlist_id = p_playlist_id;

  select count(distinct item.track_id) into supplied_count
  from unnest(p_track_ids) as item(track_id);

  if expected_count <> supplied_count or cardinality(p_track_ids) <> supplied_count then
    raise exception 'Track order must contain each playlist track exactly once';
  end if;

  if exists (
    select 1
    from unnest(p_track_ids) as supplied(track_id)
    where not exists (
      select 1 from public.playlist_tracks pt
      where pt.playlist_id = p_playlist_id and pt.track_id = supplied.track_id
    )
  ) then
    raise exception 'Track order contains a track outside this playlist';
  end if;

  update public.playlist_tracks pt
  set position = ordered.position
  from (
    select track_id, ordinality::integer - 1 as position
    from unnest(p_track_ids) with ordinality as item(track_id, ordinality)
  ) ordered
  where pt.playlist_id = p_playlist_id and pt.track_id = ordered.track_id;
end;
$$;

create or replace function public.get_shared_playlist(p_share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'description', p.description,
    'cover_path', p.cover_path,
    'visibility', p.visibility,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'owner', jsonb_build_object(
      'id', owner.id,
      'username', owner.username,
      'display_name', owner.display_name,
      'avatar_path', owner.avatar_path
    ),
    'likes_count', (
      select count(*) from public.playlist_likes likes where likes.playlist_id = p.id
    ),
    'tracks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'artist', t.artist,
          'album', t.album,
          'genre', t.genre,
          'file_path', t.file_path,
          'mime_type', t.mime_type,
          'file_size_bytes', t.file_size_bytes,
          'duration_seconds', t.duration_seconds,
          'position', pt.position
        ) order by pt.position, pt.added_at
      )
      from public.playlist_tracks pt
      join public.tracks t on t.id = pt.track_id
      where pt.playlist_id = p.id
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'body', c.body,
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'author', jsonb_build_object(
            'id', author.id,
            'username', author.username,
            'display_name', author.display_name,
            'avatar_path', author.avatar_path
          )
        ) order by c.created_at
      )
      from public.comments c
      join public.profiles author on author.id = c.author_id
      where c.playlist_id = p.id
    ), '[]'::jsonb)
  )
  from public.playlists p
  join public.profiles owner on owner.id = p.owner_id
  where p.share_token = p_share_token
    and p.visibility in ('public', 'unlisted');
$$;

revoke all on function public.is_playlist_owner(uuid) from public;
revoke all on function public.can_read_playlist(uuid) from public;
revoke all on function public.can_read_track(uuid) from public;
grant execute on function public.is_playlist_owner(uuid) to anon, authenticated;
grant execute on function public.can_read_playlist(uuid) to anon, authenticated;
grant execute on function public.can_read_track(uuid) to anon, authenticated;
grant execute on function public.toggle_playlist_like(uuid) to authenticated;
grant execute on function public.rotate_playlist_share_token(uuid) to authenticated;
grant execute on function public.reorder_playlist_tracks(uuid, uuid[]) to authenticated;
grant execute on function public.get_shared_playlist(uuid) to anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.playlists, public.tracks, public.playlist_tracks,
  public.playlist_likes, public.comments to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant insert, update, delete on public.playlists, public.tracks, public.playlist_tracks,
  public.playlist_likes, public.comments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'audio-files',
    'audio-files',
    true,
    52428800,
    array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/flac']
  ),
  (
    'playlist-covers',
    'playlist-covers',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'avatars',
    'avatars',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public media is readable"
on storage.objects for select
using (bucket_id in ('audio-files', 'playlist-covers', 'avatars'));

create policy "Users can upload media to their folder"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('audio-files', 'playlist-covers', 'avatars')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can replace media in their folder"
on storage.objects for update to authenticated
using (
  bucket_id in ('audio-files', 'playlist-covers', 'avatars')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id in ('audio-files', 'playlist-covers', 'avatars')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete media from their folder"
on storage.objects for delete to authenticated
using (
  bucket_id in ('audio-files', 'playlist-covers', 'avatars')
  and (storage.foldername(name))[1] = auth.uid()::text
);
