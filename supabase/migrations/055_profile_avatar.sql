-- Persist account avatars in Supabase Storage + profiles.avatar_url.
-- Public read so roster/avatars work across devices and teammates.

alter table public.profiles
  add column if not exists avatar_url text;

-- 023 locked column grants; re-grant avatar_url for authenticated owners.
grant update (avatar_url) on table public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path layout: {user_id}/avatar.{ext}
drop policy if exists "profile_avatars_public_select" on storage.objects;
create policy "profile_avatars_public_select"
  on storage.objects for select
  using (bucket_id = 'profile-avatars');

drop policy if exists "profile_avatars_owner_insert" on storage.objects;
create policy "profile_avatars_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_avatars_owner_update" on storage.objects;
create policy "profile_avatars_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_avatars_owner_delete" on storage.objects;
create policy "profile_avatars_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
