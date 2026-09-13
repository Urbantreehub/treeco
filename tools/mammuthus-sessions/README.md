# Mammuthus Sessions

Shared band workspace for writing and finishing the *Mammuthus* album. A single-file
web app (`index.html`) published as a Claude Artifact with the `db`, `assets` and
`downloads` runtime capabilities.

Published at: https://claude.ai/code/artifact/4e7b2235-ddd1-488a-a97f-9ba6fe821814

## What it does

- **Songs** – list with writing/tracking progress bars; per song: stage
  (Idea → Writing → Arranged → Demoed → Tracking → Mixing → Done), tempo, key,
  time signature, length; writing checklist (bass, drums, guitar 1, guitar 2,
  vocal melody, lyrics); tracking checklist (drums, bass, guitar 1, guitar 2,
  vocals, scratch vs final take); session notes; shared lyrics with copy and
  `.txt` download.
- **Audio versions** – upload a bounce or phone demo per song. Every upload is a
  new version (v1, v2, …); older versions stay available. Waveform player with
  click-to-seek.
- **Notes** – general comments or notes tagged to a timestamp in a specific
  version. Timestamps are drawn on the waveform and jump the player when tapped.
  Notes can be marked resolved.
- **Calendar** – practices, gigs, jams and recording sessions with a plan/gig
  info field. Each member RSVPs Going / Maybe / Can't. Any event (or the whole
  calendar) exports as `.ics` for phone calendars, plus a Google Calendar link.
- **Media & EPK** – bio, one-line pitch, genre, hometown, contact, links, press
  quotes, logo, photo gallery with captions, PDF documents (press kit, stage
  plot, rider). "Copy EPK as text" button.
- **Chat** – a band channel plus direct chats between any two members, with
  photo, video, audio and PDF attachments.
- **Band** – member names, instruments and colours; album title, target and
  notes; storage meter.

## Notes on the implementation

- No user identity capability is available to the page, so each member picks
  themselves once ("Who's this?") and the choice is remembered per device.
- The asset store accepts mp4/m4a/webm directly. Other audio (mp3, wav, aiff,
  ogg, flac) is base64-wrapped into a `text/plain` asset on upload and unwrapped
  into a blob URL on playback. Wrapped files are limited to ~14 MB.
- Without the Claude runtime (opening the file directly) the app runs in a
  preview mode with in-memory example data.
