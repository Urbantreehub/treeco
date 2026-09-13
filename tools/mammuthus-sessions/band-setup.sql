-- Mammuthus Sessions: ONE-PASTE SETUP (schema + seed). Paste into Supabase SQL Editor and Run.

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


-- Mammuthus Sessions — seed data exported from the Claude artifact on 2026-09-13
-- Run AFTER schema.sql. Safe to re-run (existing rows are overwritten).
insert into public.docs (path, collection, data) values
('band/members', 'band', $j${"list": [{"color": "#6FD3C7", "id": "m1", "name": "Josh Micallef", "role": "Guitar / vocals"}, {"color": "#D9A05B", "id": "m2", "name": "Will", "role": "Guitar"}, {"color": "#8FBF7F", "id": "m3", "name": "Jed", "role": "Bass"}, {"color": "#B39DDB", "id": "m4", "name": "Jay", "role": "Drums"}]}$j$::jsonb),
('band/profile', 'band', $j${"album": {"notes": "Album #2. Working title Mammuthus. Song list imported from the 'Song notes' doc in the Nu mammuthus Drive folder (\"Mammuthus - Songs to Burn\").\n\nGeneral idea from the notes doc: telephone vocals.\n\nPrevious releases\n• Mammuthus EP (4 March 2020): Without You, Backdoor, Bloodworm, Something New. Original line-up with Rob Dring on drums.\n• Imperator LP (7 July 2023): Holy Goat, Long Drive, Backdoor, King of the Dead, Monolith, Bloodworm, Formless. Recorded and mixed 2022 by James Goldsmith, mastered by Will Borza. Self-released; limited gatefold CD of 100 (stocked by Centennial Conflict). Release show at Valhalla, Wellington.\n\nPeople we've worked with: James Goldsmith (recording/mix), Will Borza (mastering).", "target": "", "title": "Mammuthus"}, "bio": "Mammuthus are a heavy stoner doom band from Pōneke / Wellington, Aotearoa New Zealand. Formed in 2019 and first heard on the self-titled EP in March 2020, the band pairs ultra-heavy, low-end doom with the distorted fuzz of stoner rock, topped with melodic vocals. Influences run from Black Sabbath, Kyuss and Sleep through Red Fang, Corrosion of Conformity and fellow Wellingtonians Beastwars.\n\nThe debut album Imperator was recorded and mixed in 2022 by James Goldsmith, mastered by Will Borza, and released on 7 July 2023 with a launch show at Valhalla, Wellington. Its lead single Bloodworm premiered on The Obelisk, and the record was reviewed by Distorted Sound, The Sleeping Shaman, Outlaws of the Sun, Wonderbox Metal and RockmusicRaider. A limited gatefold CD (100 copies) was self-released.\n\nLive, Mammuthus are a fixture of the Wellington heavy scene: CubaDupa 2021, Fuzz Fest '25 at Valhalla alongside Pull Down the Sun, Sidewinder, Tusk, Caldera and Dead Queens, shows with Planet of the Dead, End Boss, Into Orbit, Drunk With Power, Wince and Sidewinder, and support slots for international and local acts including Sasquatch and Beastwars.\n\nNow a four-piece with a second guitar, the band is writing its second album.", "docs": [], "epk": {"contact": "", "genre": "Stoner doom / heavy fuzz rock", "hometown": "Pōneke / Wellington, Aotearoa New Zealand", "links": "https://mammuthusnz.bandcamp.com\nhttps://www.instagram.com/mammuthusnz/\nhttps://www.facebook.com/MammuthusNZ/\nhttps://open.spotify.com/album/3EmMMOaf1PvAb1BzmOSe7h\nhttps://music.apple.com/us/album/imperator/1697832059\nhttps://www.youtube.com/watch?v=VjSujiUcV6c\nhttps://mammuthusnz.myshopify.com\nhttps://elasticstage.com/mammuthusnz", "press": "\"An alluring psychedelic magic … fervent and potent in its reverence for a solid, well-constructed riff that shatters your skull with maximum impact. Each track on Imperator is an exemplar of raw honesty and authentic character.\" — Distorted Sound Magazine\n\n\"Full of world weary psychedelic grooves … a classic style of fuzzed-up stoner metal with a modern post-doom vibe.\" — Outlaws of the Sun\n\n\"Unpretentious, heavy, old-school stoner rock. The production is excellent, with plenty of fuzz on the guitar and the bass sitting prominently in the mix. Josh Micallef's voice fits the music perfectly.\" — The Sleeping Shaman\n\n\"Sick riffs and heavy fuzz.\" — UnderTheRadar\n\n\"You wouldn't believe this is their debut EP; this feels like a band who have been releasing killer records for years.\" — Outlaws of the Sun on the 2020 EP", "tagline": "Wellington's heaviest stoner doom: ultra-heavy low-end, distorted fuzz and melodic vocals."}, "logo": null, "photos": []}$j$::jsonb),
('chat/general/messages/welcome', 'chat/general/messages', $j${"at": 1757700000000, "by": "m1", "media": [], "text": "Welcome to the Mammuthus workspace. Everything here is shared between the four of us: songs, notes, audio versions, calendar and this chat."}$j$::jsonb),
('songs/18-goodshed-road', 'songs', $j${"aliases": ["goodshed", "18 goodshed rd"], "by": "m1", "createdAt": 1757800000017, "key": "", "length": "", "lyrics": "(instrumental)", "order": 9, "parts": {"gtr1": "wip", "lyrics": "done", "melody": "done"}, "sessionNotes": "", "stage": "Writing", "tempo": "", "timeSig": "4/4", "title": "18 Goodshed Road", "tracked": {}}$j$::jsonb),
('songs/18-goodshed-road/notes/drive1', 'songs/18-goodshed-road/notes', $j${"at": 1757800000018, "by": "m1", "done": false, "text": "Instrumental. Tease once, balls deep. Heavy once, shoegaze out... not messy.", "time": null, "versionId": null}$j$::jsonb),
('songs/90s-thing', 'songs', $j${"aliases": ["90sthing", "90s thing"], "by": "m1", "createdAt": 1757800000008, "key": "", "length": "", "lyrics": "", "order": 5, "parts": {"gtr1": "wip"}, "sessionNotes": "", "stage": "Idea", "tempo": "", "timeSig": "4/4", "title": "90's Thing", "tracked": {}}$j$::jsonb),
('songs/90s-thing/notes/drive1', 'songs/90s-thing/notes', $j${"at": 1757800000009, "by": "m1", "done": false, "text": "First riff.", "time": null, "versionId": null}$j$::jsonb),
('songs/ants-ants-ants', 'songs', $j${"aliases": ["antsantsants", "ants"], "by": "m1", "createdAt": 1757800000025, "key": "", "length": "", "lyrics": "", "order": 13, "parts": {"gtr1": "wip"}, "sessionNotes": "", "stage": "Writing", "tempo": "", "timeSig": "4/4", "title": "Ants Ants Ants", "tracked": {}}$j$::jsonb),
('songs/ants-ants-ants/notes/drive1', 'songs/ants-ants-ants/notes', $j${"at": 1757800000026, "by": "m1", "done": false, "text": "Turnaround in the 2nd riff simplified. Suno reference for the start.", "time": null, "versionId": null}$j$::jsonb),
('songs/chipmunks-playground', 'songs', $j${"aliases": ["chipmunks", "chipsquatch", "chip n squatch", "squatchy", "chipmunks playland"], "by": "m1", "createdAt": 1757800000014, "key": "", "length": "", "lyrics": "", "order": 8, "parts": {"drums": "wip", "gtr1": "wip", "melody": "wip"}, "sessionNotes": "", "stage": "Writing", "tempo": "", "timeSig": "4/4", "title": "Chipmunks Playground", "tracked": {}}$j$::jsonb),
('songs/chipmunks-playground/notes/drive1', 'songs/chipmunks-playground/notes', $j${"at": 1757800000015, "by": "m1", "done": false, "text": "First riff and vocal melody. Needs a chorus and pre-chorus. Half-time drums sound good.", "time": null, "versionId": null}$j$::jsonb),
('songs/chipmunks-playground/notes/drive2', 'songs/chipmunks-playground/notes', $j${"at": 1757800000016, "by": "m1", "done": false, "text": "Potentially mix Squatchy and Chipmunks. We're definitely... Jed wants the song called Chip n Squatch.", "time": null, "versionId": null}$j$::jsonb),
('songs/doom-2', 'songs', $j${"aliases": ["doom2"], "by": "m1", "createdAt": 1757800000000, "key": "", "length": "", "lyrics": "", "order": 1, "parts": {"gtr1": "wip"}, "sessionNotes": "", "stage": "Idea", "tempo": "", "timeSig": "4/4", "title": "Doom 2", "tracked": {}}$j$::jsonb),
('songs/doom-2/notes/drive1', 'songs/doom-2/notes', $j${"at": 1757800000001, "by": "m1", "done": false, "text": "First riff.", "time": null, "versionId": null}$j$::jsonb),
('songs/doom-4', 'songs', $j${"aliases": ["doom4"], "by": "m1", "createdAt": 1757800000004, "key": "", "length": "", "lyrics": "", "order": 3, "parts": {"gtr1": "wip"}, "sessionNotes": "", "stage": "Idea", "tempo": "", "timeSig": "4/4", "title": "Doom 4", "tracked": {}}$j$::jsonb),
('songs/doom-4/notes/drive1', 'songs/doom-4/notes', $j${"at": 1757800000005, "by": "m1", "done": false, "text": "First riff.", "time": null, "versionId": null}$j$::jsonb),
('songs/illusion', 'songs', $j${"aliases": ["illusion"], "by": "m1", "createdAt": 1757800000023, "key": "", "length": "", "lyrics": "", "order": 12, "parts": {"gtr1": "wip"}, "sessionNotes": "", "stage": "Writing", "tempo": "", "timeSig": "4/4", "title": "Illusion", "tracked": {}}$j$::jsonb),
('songs/illusion/notes/drive1', 'songs/illusion/notes', $j${"at": 1757800000024, "by": "m1", "done": false, "text": "Rework the main riff and structure. Last riff is cool.", "time": null, "versionId": null}$j$::jsonb),
('songs/in-the-sky', 'songs', $j${"aliases": ["inthesky", "in the sky guitars"], "by": "m1", "createdAt": 1757800000010, "key": "", "length": "", "lyrics": "", "order": 6, "parts": {"bass": "todo", "drums": "todo", "gtr1": "done", "melody": "wip"}, "sessionNotes": "", "stage": "Writing", "tempo": "", "timeSig": "4/4", "title": "In the Sky", "tracked": {}}$j$::jsonb),
('songs/in-the-sky/notes/drive1', 'songs/in-the-sky/notes', $j${"at": 1757800000011, "by": "m1", "done": false, "text": "OG version has the vocal. New version needs drums, bass etc.", "time": null, "versionId": null}$j$::jsonb),
('songs/song2-oct', 'songs', $j${"aliases": ["song2", "song2 22 oct"], "by": "m1", "createdAt": 1757800000027, "key": "", "length": "", "lyrics": "", "order": 14, "parts": {}, "sessionNotes": "", "stage": "Idea", "tempo": "", "timeSig": "4/4", "title": "Song 2 (22 Oct)", "tracked": {}}$j$::jsonb),
('songs/song2-oct/notes/drive1', 'songs/song2-oct/notes', $j${"at": 1757800000028, "by": "m1", "done": false, "text": "Audio in the Drive folder (Song2 22 oct 1.mp3) with no entry in the notes doc yet. Rename or merge as needed.", "time": null, "versionId": null}$j$::jsonb),
('songs/stump-grinder', 'songs', $j${"aliases": ["stumpgrinder"], "by": "m1", "createdAt": 1757800000002, "key": "", "length": "", "lyrics": "", "order": 2, "parts": {"gtr1": "wip"}, "sessionNotes": "", "stage": "Writing", "tempo": "", "timeSig": "4/4", "title": "Stump Grinder", "tracked": {}}$j$::jsonb),
('songs/stump-grinder/notes/drive1', 'songs/stump-grinder/notes', $j${"at": 1757800000003, "by": "m1", "done": false, "text": "Woodsy jam.", "time": null, "versionId": null}$j$::jsonb),
('songs/sunfall', 'songs', $j${"aliases": ["sun 4", "sun4", "sunfall"], "by": "m1", "createdAt": 1757800000019, "key": "", "length": "", "lyrics": "", "order": 10, "parts": {"bass": "wip", "drums": "wip", "gtr1": "done", "melody": "wip"}, "sessionNotes": "", "stage": "Arranged", "tempo": "", "timeSig": "4/4", "title": "Sunfall", "tracked": {}}$j$::jsonb),
('songs/sunfall/notes/drive1', 'songs/sunfall/notes', $j${"at": 1757800000020, "by": "m1", "done": false, "text": "Delete the spacey intro. Drums more elaborate when there are no vocals. Better end to the chorus needed. Verse palm mutes, various melodies complementing JM. Work on the pre-chorus build towards the chorus.", "time": null, "versionId": null}$j$::jsonb),
('songs/trooms', 'songs', $j${"aliases": ["trooms"], "by": "m1", "createdAt": 1757800000012, "key": "", "length": "", "lyrics": "", "order": 7, "parts": {"gtr1": "wip", "melody": "done"}, "sessionNotes": "", "stage": "Writing", "tempo": "", "timeSig": "4/4", "title": "Trooms", "tracked": {}}$j$::jsonb),
('songs/trooms/notes/drive1', 'songs/trooms/notes', $j${"at": 1757800000013, "by": "m1", "done": false, "text": "Josh has the melody for the whole song, it's on voice memos.", "time": null, "versionId": null}$j$::jsonb),
('songs/untitled', 'songs', $j${"aliases": ["untitled"], "by": "m1", "createdAt": 1757800000021, "key": "", "length": "", "lyrics": "", "order": 11, "parts": {"gtr1": "wip"}, "sessionNotes": "", "stage": "Idea", "tempo": "", "timeSig": "4/4", "title": "Untitled", "tracked": {}}$j$::jsonb),
('songs/untitled/notes/drive1', 'songs/untitled/notes', $j${"at": 1757800000022, "by": "m1", "done": false, "text": "First riff. JM wants the vocal to sound like Mars Red Sky... milk the riff.", "time": null, "versionId": null}$j$::jsonb),
('songs/wider', 'songs', $j${"aliases": ["wider"], "by": "m1", "createdAt": 1757800000006, "key": "", "length": "", "lyrics": "", "order": 4, "parts": {"gtr1": "wip", "melody": "wip"}, "sessionNotes": "", "stage": "Writing", "tempo": "", "timeSig": "4/4", "title": "Wider", "tracked": {}}$j$::jsonb),
('songs/wider/notes/drive1', 'songs/wider/notes', $j${"at": 1757800000007, "by": "m1", "done": false, "text": "Vocal line / pre-chorus.", "time": null, "versionId": null}$j$::jsonb)
on conflict (path) do update set data = excluded.data, updated_at = now();
