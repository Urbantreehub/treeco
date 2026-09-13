// Mammuthus Sessions — web push fan-out.
// Deploy:  supabase functions deploy band-push --project-ref <band project ref> --workdir tools/mammuthus-sessions
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com --project-ref <ref>
// (or paste this file into Dashboard → Edge Functions → New function, and add the secrets under Settings → Edge Functions.)
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return new Response("VAPID keys not configured", { status: 500, headers: cors });

  // Only signed-in band members may trigger a send.
  const user = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: { user: u } } = await user.auth.getUser();
  if (!u) return new Response("unauthorized", { status: 401, headers: cors });

  const { title, body, url: link, exclude, only } = await req.json();
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:band@example.com", pub, priv);
  const admin = createClient(url, service);
  const { data: rows } = await admin.from("docs").select("path,data").eq("collection", "push");
  let sent = 0; const dead: [string, string][] = [];
  for (const r of rows || []) {
    const memberId = r.path.split("/")[1];
    if (exclude && memberId === exclude) continue;
    if (Array.isArray(only) && only.length && !only.includes(memberId)) continue;
    for (const [k, sub] of Object.entries((r.data as any).subs || {})) {
      if (!sub) continue;
      try { await webpush.sendNotification(sub as any, JSON.stringify({ title, body, url: link, tag: "mammuthus" }), { TTL: 3600 }); sent++; }
      catch (e) { const code = (e as any).statusCode; if (code === 404 || code === 410) dead.push([r.path, k]); }
    }
  }
  for (const [p, k] of dead) await admin.rpc("update_doc", { p_path: p, p_patch: { subs: { [k]: null } } });
  return new Response(JSON.stringify({ sent }), { headers: { ...cors, "Content-Type": "application/json" } });
});
