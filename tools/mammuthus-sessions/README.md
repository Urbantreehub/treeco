# Mammuthus Sessions

Shared band workspace for writing and finishing the *Mammuthus* album. One
single-file web app (`index.html`) that runs in two modes:

- **Self-hosted (for the whole band)** – Supabase for sign-in, database, file
  storage and live updates; any static host (Vercel) for the page. Bandmates
  sign in with an email and password; nobody needs a Claude account.
- **Claude Artifact** – the same file published with the `db`, `assets`,
  `downloads` and `mcp` capabilities: https://claude.ai/code/artifact/4e7b2235-ddd1-488a-a97f-9ba6fe821814
  (only people in the owner's Claude workspace can open it).

The mode is chosen at load time: if `config.js` has a Supabase URL and anon key,
the app uses Supabase; otherwise it uses the artifact runtime.

## Setup on the existing TreeCo Vercel project

The band app deploys with TreeCo: `scripts/build-band.js` runs after the Vite
build and publishes this folder at **https://<treeco-domain>/band/**. It reads
two Vercel environment variables for its Supabase connection. Use a **separate,
free Supabase project** for the band: TreeCo's `handle_new_user` trigger turns
every auth user into a TreeCo user row, so band logins must not live in the
TreeCo project.

1. **Supabase → New project** (free tier). Name it e.g. `mammuthus`.
2. **SQL Editor → New query**: paste `band-setup.sql`, Run. (Table, security
   rules, storage bucket, and the current songs/notes/bio/EPK in one go.)
3. **Authentication → URL Configuration**: Site URL = `https://<treeco-domain>/band/`;
   add the same URL under Redirect URLs.
4. **Authentication → Users → Invite user**: enter each bandmate's email. They
   get an email, tap the link, choose a password, and land in the app. Invite
   yourself too, or add yourself with *Create new user* (Auto Confirm on).
5. **Project Settings → API**: copy *Project URL* and the *anon public* key.
6. **Vercel → TreeCo project → Settings → Environment Variables**: add
   `BAND_SUPABASE_URL` and `BAND_SUPABASE_ANON_KEY` (Production), then merge
   this branch (or *Redeploy*).
7. Open `/band/`, sign in, pick your name. Songs tab → **Bulk upload audio**
   to load the demos from the Drive folder.

Files are in a public bucket, so anyone with a file's link can play or download
it; only signed-in members can add or delete. 100 MB per file, 1 GB free storage.

### Push notifications (optional, ~10 minutes)

1. Generate keys once on your laptop: `npx web-push generate-vapid-keys`.
2. Supabase → Edge Functions → *Deploy a new function* → name `band-push` →
   paste `supabase/functions/band-push/index.ts` (or run
   `supabase functions deploy band-push --project-ref <ref> --workdir tools/mammuthus-sessions`).
3. Supabase → Edge Functions → Secrets: add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
   and `VAPID_SUBJECT` (`mailto:your@email`).
4. Vercel → Environment Variables: add `BAND_VAPID_PUBLIC_KEY` (the public key
   again) and redeploy.
5. Each member: Band tab → Notifications → *Enable on this device*. iPhones
   need the site added to the Home Screen first (Safari → Share → Add to Home
   Screen), then enable from there.

If you already ran `band-setup.sql` before the public EPK page existed, run it
again once: it only adds the anonymous read rule for `band/profile`.

Standalone alternative: any static host can serve this folder directly; fill in
`config.js` instead of the Vercel env vars.

## What it does

- **Songs** – list with writing/tracking progress bars; per song: stage
  (Idea → Writing → Arranged → Demoed → Tracking → Mixing → Done), tempo, key,
  time signature, length; writing checklist (bass, drums, guitar 1, guitar 2,
  vocal melody, lyrics); tracking checklist (drums, bass, guitar 1, guitar 2,
  vocals, scratch vs final take); session notes; shared lyrics with copy and
  `.txt` download.
- **Audio versions** – upload a bounce or phone demo per song. Every upload is a
  new version (v1, v2, …); older versions stay available. Waveform player with
  click-to-seek. Songs can be reordered from the song header. Every version
  can be downloaded by any member: MP4/WebM save as-is; other formats are
  packaged into a stored .zip in the browser (the sandbox's download allowlist
  has no mp3/wav). "Download all versions" zips a whole song's history.
- **Notes** – general comments or notes tagged to a timestamp in a specific
  version. Timestamps are drawn on the waveform and jump the player when tapped.
  Notes can be edited, marked resolved, and a time can be typed as m:ss.
- **Calendar** – practices, gigs, jams and recording sessions with a plan/gig
  info field. Each member RSVPs Going / Maybe / Can't. Each event has
  "Add to my phone" links for Google Calendar and Outlook (the artifact sandbox
  does not permit `.ics` downloads).
- **Media & EPK** – bio, one-line pitch, genre, hometown, contact, links, press
  quotes, logo, photo gallery with captions, files (PDF, video, audio). "Copy
  EPK as text" and "Download EPK (.html)" with logo and photos inlined.
- **Chat** – a band channel plus direct chats between any two members, with
  photo, video, audio and PDF attachments and unread indicators.
- **Setlists** – build sets from the song list, reorder, running time from song
  lengths, key/tempo/tuning per song, print view, attach to a gig.
- **Gig sheet** – load-in, soundcheck, set time and length, pay and paid flag,
  venue contact, backline, parking, stage plot (from Files) and setlist, shown
  on gig events.
- **Riff bank** – ideas that aren't songs yet, with optional audio, tags, a
  "steal me" flag and one-click promotion to a song (audio becomes v1).
- **Reference tracks** – "sounds like this" links per song.
- **Loop a region** – A/B loop on the waveform for learning a part.
- **Note voting** – thumbs up/down on notes.
- **Search** – press `/` or the Search button: songs, lyrics, notes, dates,
  setlists, riffs, chat and the EPK.
- **Mentions** – @Name in notes and chat is highlighted and logged.
- **Activity feed** – recent uploads, notes, new songs, events and mentions at
  the top of the Songs tab.
- **Money** – expenses, income and settle-up transfers split between members,
  per-member balances, a "who pays who" list, and merch stock with sizes,
  counts and a sale log that books the income automatically.
- **Contacts** (Band tab) – venues, promoters, engineers, photographers, bands,
  press, with click-to-call and searchable notes.
- **Availability** (Calendar tab) – six-week grid where each member marks nights
  they can't do; nights everyone is free are highlighted with a "book" button.
- **Metronome and tuner** – floating tools panel; the metronome takes the song's
  tempo and time signature and can save a tapped tempo back to the song; the
  tuner uses the microphone.
- **Practice mode** – full-screen phone layout for a setlist or all songs:
  latest audio, lyrics, big play/loop/prev/next, auto-advance.
- **Promo** – release checklists (a 14-step template per release, with owners
  and due dates), a content calendar (posts with platform, caption, media and
  an idea → drafted → scheduled → posted status; unposted ones show on the
  calendar), and a press/radio outreach log.
- **Public EPK page** (self-hosted) – `epk.html` renders the Media & EPK data
  read-only for promoters and press; anonymous read of `band/profile` only.
- **Push notifications** (self-hosted) – per-device web push for new versions,
  notes, dates, money entries and @mentions, via the `band-push` Edge Function.
- **Band** – member names, instruments and colours; album title, target and
  notes; storage meter.
- **Import from Google Drive** – on the Songs tab. Uses the viewer's own Google
  Drive connector (the `mcp` capability, tools `search_files` and
  `download_file_content`) to list audio in a named folder, match each file to
  a song by title/aliases, and upload it as a new version. Files already
  imported are flagged, and ones modified on Drive since are offered again.

## Notes on the implementation

- No user identity capability is available to the page, so each member picks
  themselves once ("Who's this?") and the choice is remembered per device.
- The asset store accepts mp4/m4a/webm directly. Other audio (mp3, wav, aiff,
  ogg, flac) is base64-wrapped into a `text/plain` asset on upload and unwrapped
  into a blob URL on playback, split into 14 MB chunks so full WAV bounces
  (up to ~120 MB) work.
- Touch targets follow the 44 pt / 48 dp guidance; on phones the tabs become a
  fixed bottom bar and form fields use 16 px text to avoid iOS zoom.
- Without the Claude runtime (opening the file directly) the app runs in a
  preview mode with in-memory example data.
