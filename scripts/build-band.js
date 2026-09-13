// Copies the Mammuthus Sessions band app into the Vercel output as /band/ and
// writes its config.js from environment variables set in the Vercel project:
//   BAND_SUPABASE_URL       e.g. https://xxxx.supabase.co
//   BAND_SUPABASE_ANON_KEY  the anon/public key of the band's Supabase project
// Runs after `vite build` (see vercel.json). Without the env vars the app still
// deploys but opens in preview mode.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'tools', 'mammuthus-sessions', 'index.html');
const outDir = path.join(__dirname, '..', 'frontend', 'dist', 'band');
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(src, path.join(outDir, 'index.html'));
const url = process.env.BAND_SUPABASE_URL || '';
const key = process.env.BAND_SUPABASE_ANON_KEY || '';
fs.writeFileSync(path.join(outDir, 'config.js'),
  `window.MAMMUTHUS_CONFIG = ${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key })};\n`);
console.log(`[band] wrote ${outDir} (${url ? 'Supabase configured' : 'no BAND_SUPABASE_* env vars, preview mode'})`);
