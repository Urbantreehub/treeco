// Mammuthus Sessions — deployment config.
// Fill these in from Supabase → Project Settings → API. The anon key is safe to publish;
// all access is still gated by sign-in and the row-level security rules in schema.sql.
window.MAMMUTHUS_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  vapidPublicKey: ""   // optional, for push notifications
};
