// The Quotient browser-extraction snippet, copied verbatim from
// supabase/functions/import-marketing-contacts/README.md.
//
// Quotient has no read API, so the mailing-list rows are pulled out of the
// logged-in browser session and pasted back into Campaigns → Import → Quotient.
// Keep this byte-identical to the README: it is the contract the 'quotient'
// source validates against, and a drifted copy produces rows the importer
// rejects one at a time with no obvious cause.
export const QUOTIENT_SNIPPET = `// Quotient → TreeCo mailing-list extraction. Run on go.quotientapp.com.
(async () => {
  const ORG = 31059;
  const api = async (path) => {
    const r = await fetch(\`/\${ORG}/api-1/\${path}\`, {
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
    });
    if (!r.ok) throw new Error(\`\${path} → HTTP \${r.status}\`);
    return r.json();
  };
  const sleep  = (ms) => new Promise((r) => setTimeout(r, ms));
  const normKey = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // 1. Accepted quotes → quote numbers per customer. \`quote_no\` is the same
  //    number that appears in Xero's invoice line items ("Quote Number: 5515"),
  //    which is how the two systems get joined on a real key.
  const quotesByName = new Map();
  for (let page = 1; page <= 100; page++) {
    const d = await api(\`quotes?status=accepted&page=\${page}\`);
    const batch = d.GenQuoteCombo ?? [];
    for (const q of batch) {
      const key = normKey(q._companyOrPerson);
      if (!key) continue;
      const arr = quotesByName.get(key) ?? [];
      arr.push({ no: String(q.quote_no), title: q.title, modified: Number(q.modified) || 0 });
      quotesByName.set(key, arr);
    }
    console.log(\`quotes page \${page}: \${batch.length} (\${quotesByName.size} customers)\`);
    if (batch.length < 100) break;
    await sleep(120);
  }

  // 2. Contact list.
  const list = [];
  for (let page = 1; page <= 100; page++) {
    const d = await api(\`contacts?page=\${page}\`);
    const batch = d.GenContact ?? [];
    // archive_id === 1 means ACTIVE in Quotient, not archived. Verified against
    // the live account: all 4,357 active contacts carry archive_id 1, and the
    // ?archive=archived view returns none. Filtering on \`!c.archive_id\` here
    // silently discards every single contact.
    list.push(...batch.filter((c) => c.archive_id === 1));
    console.log(\`contacts page \${page}: \${batch.length} (\${list.length} total)\`);
    if (batch.length < 100) break;
    await sleep(120);
  }

  // 3. Detail per contact, 4 at a time. Cached on window.__qtRows so a re-run resumes.
  const cache = (window.__qtRows ||= new Map());
  let done = 0;
  const worker = async (queue) => {
    while (queue.length) {
      const c = queue.pop();
      if (!cache.has(c.contact_id)) {
        try { cache.set(c.contact_id, await api(\`contacts/view/\${c.contact_id}\`)); }
        catch (e) { console.warn('skip', c.contact_id, e.message); cache.set(c.contact_id, null); }
        await sleep(80);
      }
      if (++done % 100 === 0) console.log(\`details \${done}/\${list.length}\`);
    }
  };
  const queue = [...list];
  await Promise.all([1, 2, 3, 4].map(() => worker(queue)));

  // 4. Shape the rows. NOTE: for individual contacts the person data is in
  //    GenContact, not PeopleContact. Timestamps are unix SECONDS.
  const out = [];
  for (const c of list) {
    const d = cache.get(c.contact_id);
    if (!d) continue;
    const g  = d.GenContact?.[0] ?? {};
    const ad = d.GenContactAddress?.[0] ?? {};
    const ph = d.GenContactPhone?.[0] ?? {};
    const st = d.GenContactQuoteStats?.[0] ?? {};
    const email = String(g.email ?? '').trim().toLowerCase();
    if (!email) continue;                       // nothing to mail

    const name = [g.name_first ?? c.name_first, g.name_last].filter(Boolean).join(' ');
    const qs = (quotesByName.get(normKey(name)) ?? []).sort((a, b) => b.modified - a.modified);

    out.push({
      source_ref:     String(c.contact_id),
      first_name:     g.name_first ?? c.name_first ?? null,
      last_name:      g.name_last ?? null,
      email,
      phone:          ph.phoneOther ?? null,
      address:        ad.address ?? null,
      city:           ad.city ?? null,          // only ~43% of contacts have one
      first_quoted:   st.first_quoted ?? null,
      last_quoted:    st.last_quoted ?? null,
      quote_count:    Number(st.quote_count ?? 0),
      accepted_count: Number(st.accepted_count ?? 0),
      accepted_total: Number(st.accepted_total ?? 0),
      type:           c.type ?? null,
      quote_nos:      qs.map((q) => q.no).slice(0, 40),
      last_job_title: qs[0]?.title ?? null,
    });
  }

  window.__qtExport = out;
  console.log(\`✅ \${out.length} contacts with an email address.\`);
  const payload = JSON.stringify(out);
  try { await navigator.clipboard.writeText(payload); console.log('📋 Copied to clipboard.'); }
  catch { console.log('Clipboard blocked — run  copy(JSON.stringify(window.__qtExport))'); }
  console.log(payload.length > 2_000_000 ? '(large — paste in batches, see below)' : payload);
})();`

// Where the snippet has to be run. Anywhere else and the same-origin fetch to
// /31059/api-1/... has no session cookie and every page 401s.
export const QUOTIENT_CONSOLE_HOST = 'go.quotientapp.com'
