drop policy if exists "Uploaders and playlist listeners can read tracks" on public.tracks;

create policy "Uploaders and playlist listeners can read tracks"
on public.tracks for select
using (
  uploader_id = auth.uid()
  or public.can_read_track(id)
);
