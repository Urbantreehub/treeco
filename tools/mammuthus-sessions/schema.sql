-- Mammuthus Sessions — Supabase schema
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to re-run.

-- One table of JSON documents, mirroring the app's path-based data model
-- (songs/<id>, songs/<id>/notes/<id>, songs/<id>/versions/<id>, events/<id>,
--  chat/<channel>/messages/<id>, band/members, band/profile).
create table if not exists public.docs (
  path        text primary key,
  collection  text not null,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create index if not exists docs_collection_idx on public.docs (collection);

alter table public.docs enable row level security;

-- Every signed-in band member can read and write everything.
drop policy if exists "band read"   on public.docs;
drop policy if exists "band insert" on public.docs;
drop policy if exists "band update" on public.docs;
drop policy if exists "band delete" on public.docs;
create policy "band read"   on public.docs for select to authenticated using (true);
create policy "band insert" on public.docs for insert to authenticated with check (true);
create policy "band update" on public.docs for update to authenticated using (true) with check (true);
create policy "band delete" on public.docs for delete to authenticated using (true);

-- Recursive merge: objects merge key by key, everything else (arrays, scalars, null) replaces.
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb)
returns jsonb language plpgsql immutable as $$
declare k text; out jsonb;
begin
  if jsonb_typeof(a) <> 'object' or jsonb_typeof(b) <> 'object' then
    return coalesce(b, a);
  end if;
  out := a;
  for k in select jsonb_object_keys(b) loop
    if jsonb_typeof(a -> k) = 'object' and jsonb_typeof(b -> k) = 'object' then
      out := jsonb_set(out, array[k], public.jsonb_deep_merge(a -> k, b -> k));
    else
      out := jsonb_set(out, array[k], b -> k);
    end if;
  end loop;
  return out;
end $$;

-- Partial update used by the app; fails if the document is gone.
create or replace function public.update_doc(p_path text, p_patch jsonb)
returns jsonb language plpgsql security invoker as $$
declare r jsonb;
begin
  update public.docs
     set data = public.jsonb_deep_merge(data, p_patch), updated_at = now()
   where path = p_path
   returning data into r;
  if not found then
    raise exception 'That item no longer exists' using errcode = 'P0002';
  end if;
  return r;
end $$;
grant execute on function public.update_doc(text, jsonb) to authenticated;

-- Live updates for everyone with the app open.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs'
  ) then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- File storage: audio versions, photos, PDFs, chat attachments.
-- Public bucket = anyone with a file's link can play/download it; only signed-in members can add or remove files.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 104857600)
on conflict (id) do update set public = true, file_size_limit = 104857600;

drop policy if exists "media public read"  on storage.objects;
drop policy if exists "media band insert"  on storage.objects;
drop policy if exists "media band update"  on storage.objects;
drop policy if exists "media band delete"  on storage.objects;
create policy "media public read"  on storage.objects for select using (bucket_id = 'media');
create policy "media band insert"  on storage.objects for insert to authenticated with check (bucket_id = 'media');
create policy "media band update"  on storage.objects for update to authenticated using (bucket_id = 'media');
create policy "media band delete"  on storage.objects for delete to authenticated using (bucket_id = 'media');
