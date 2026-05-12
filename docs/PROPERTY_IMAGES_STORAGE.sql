-- AgentNote brochure/property image storage setup.
--
-- Run this in Supabase SQL editor if the `property-images` bucket does not exist.
-- The current frontend stores public URLs in `properties.main_image_url`,
-- `properties.extra_image_urls`, and the JSON `data.images` metadata.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-images',
  'property-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "property images are publicly readable" on storage.objects;
create policy "property images are publicly readable"
on storage.objects
for select
using (bucket_id = 'property-images');

drop policy if exists "users upload own property images" on storage.objects;
create policy "users upload own property images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'property-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "users update own property images" on storage.objects;
create policy "users update own property images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'property-images'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'property-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "users delete own property images" on storage.objects;
create policy "users delete own property images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'property-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);
