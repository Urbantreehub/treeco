# Marketing & Social Auto-Posting — Setup

This adds a **Marketing** section to TreeCo where the office can:

- Compose posts (caption + photos + a call-to-action link back to the site),
  **publish now** or **schedule** them.
- Auto-publish scheduled posts to **Facebook Page, Instagram, Google Business
  Profile and LinkedIn**.
- Write **blog articles** that get a public page at `/blog/:slug`; publishing an
  article auto-creates a draft social post that links back to it with the cover
  photo and a CTA.

Auto-posting ships **paused** (`app_settings.marketing_autopost_enabled = false`),
so nothing goes out until you connect channels and switch it on in
**Settings → Integrations**.

---

## 1. Database

Run migration `supabase/migrations/019_marketing.sql` (Supabase → SQL Editor, or
`supabase db push`). It creates:

- `social_connections`, `blog_posts`, `marketing_posts` tables (+ RLS)
- the public `marketing-media` storage bucket (photos must be public so the
  platforms can fetch them when publishing)
- the `marketing_autopost_enabled` feature flag (starts `false`)

## 2. Deploy the edge functions

```bash
supabase functions deploy social-auth
supabase functions deploy social-publish
supabase functions deploy social-scheduler
```

## 3. Create the platform apps & credentials

You need a developer app per platform. Register **the same redirect URI** with
each one:

```
https://<project-ref>.supabase.co/functions/v1/social-auth
```

| Platform | Where | Scopes / products needed |
|----------|-------|--------------------------|
| **Facebook + Instagram** | [developers.facebook.com](https://developers.facebook.com) → an app with *Facebook Login* + *Instagram Graph API*. IG must be a **Business** account linked to the Page. | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management` |
| **Google Business Profile** | [Google Cloud Console](https://console.cloud.google.com) → OAuth client (Web). Enable the *Business Profile* APIs and request quota. | `https://www.googleapis.com/auth/business.manage` |
| **LinkedIn** | [linkedin.com/developers](https://www.linkedin.com/developers) → app with *Sign In with OpenID Connect* + *Share on LinkedIn*. | `openid`, `profile`, `w_member_social` |

## 4. Set the secrets

**Supabase → Edge Functions → Secrets:**

```
META_APP_ID=...
META_APP_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
SOCIAL_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/social-auth
APP_URL=https://app.urbantreeservices.net
# optional: META_GRAPH_VERSION=v21.0
```

**Frontend build vars** (`.env` / hosting env) — the public client IDs so the
Connect buttons can start the OAuth flow:

```
VITE_META_APP_ID=...
VITE_GOOGLE_CLIENT_ID=...
VITE_LINKEDIN_CLIENT_ID=...
VITE_SOCIAL_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/social-auth
```

## 5. Connect the channels

In the app: **Settings → Integrations → Social channels**. Click **Connect** on
each channel and complete the provider login. Connecting Facebook also connects
the linked Instagram account automatically.

## 6. Schedule the auto-publisher

`social-scheduler` publishes any post whose scheduled time has passed. Run it on
a cron (Supabase → Database → Cron, or an external scheduler) roughly every 5
minutes:

```sql
select cron.schedule(
  'social-scheduler',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/social-scheduler',
       headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb
     ); $$
);
```

## 7. Turn auto-posting on

Flip the **Auto-post** switch on the Social channels card. Until then, scheduled
posts just wait in the queue (you can still **Publish now** manually any time).

---

### Notes & limits

- **Instagram** requires a photo on every post — text-only posts skip IG (the UI
  warns you and drops it automatically).
- **Google Business** maps the CTA button text to the closest Google action
  (`Book`, `Call`, `Order`, `Sign up`, else `Learn more`).
- **LinkedIn** posts as the member who connected. To post as a Company Page,
  set that channel's `account_id` to the org URN (`urn:li:organization:<id>`).
  Images ride along via the link preview rather than a native upload.
- **Tokens**: Google refreshes automatically. Meta/LinkedIn tokens are long-lived
  (~60 days) — the card shows *"Token expired — reconnect"* when it's time.
- Photos are stored in the public `marketing-media` bucket so the platforms can
  fetch them by URL when publishing.
