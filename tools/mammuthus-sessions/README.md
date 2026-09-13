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
