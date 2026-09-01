import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { COMPANY, MARKETING } from '../config/company'
import Skeleton, { SkeletonRows } from '../components/Skeleton'
import { Toast, useToast } from '../components/Toast'
import { CAMPAIGN_TEMPLATES, DEFAULT_OFFER, CTA_URL } from '../config/campaignTemplates'
import {
  MERGE_TAGS, SERVICE_LABELS, CAMPAIGN_STATUS, MONTH_BUCKETS, SEGMENT_PRESETS,
  renderPreview, mergeDataFor, formatDateNz, emptyTagsIn, unknownTagsIn,
  validateCampaign, describeAudience, matchesAudience, bucketFor,
  chooseSubject, suburbCoverage,
  IMPORT_SOURCES, IMPORT_MAX_ROWS, importSource, parseQuotientPaste, pasteFingerprint,
  summaryRows, mailableFromSummary, describeImportOutcome, sampleName, explainImportError,
} from '../utils/campaigns'
import { QUOTIENT_SNIPPET, QUOTIENT_CONSOLE_HOST } from '../config/quotientSnippet'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const FN = SUPABASE_URL + '/functions/v1'

// The only columns the page needs off campaign_audience_eligible. That view has
// already applied every legal exclusion (consent, suppressions, commercial
// accounts), so nothing else here needs to think about who may be emailed.
// lifetime_value is here because the sender filters on it (min_lifetime_value);
// without it the page couldn't count the same audience the send resolves.
const AUDIENCE_COLS = 'id, email, first_name, last_name, suburb, services, job_count, lifetime_value, last_job_at, last_job_summary, months_since_job'

// A campaign in one of these states must not have its copy or audience
// overwritten. `sending` is the dangerous one: part of the list already has the
// current copy in their inbox and campaign_sends.body_sent records it, so
// editing now sends the second half something different from the first and the
// compliance record no longer matches the campaign row. `sent` is the same
// problem after the fact — the row IS the record of what went out.
const EDIT_LOCKED = ['sending', 'sent']
function isLocked(c) { return !!c?.id && EDIT_LOCKED.includes(c.status) }

const TABS = [
  ['audience', 'Audience'],
  ['compose',  'Compose'],
  ['preview',  'Preview'],
  ['send',     'Send'],
  ['results',  'Results'],
]

// The "start from blank" body. Satisfies the two hard rules (personalised, and
// carries the CTA link) so a new campaign opens in a sendable shape, and uses
// only {{first_name}} — the one tag with a fallback — so it still reads
// correctly for a contact with no suburb or job summary on file.
const STARTER_BODY = `Hi {{first_name}},

Josh here from Urban Tree Services.

Write the note here. Keep it short and specific — name the actual tree if you
can, and say what happens if it's left. Every sentence has to still read
correctly when a merge tag comes back empty.

Free quote, no obligation:
${MARKETING.siteUrl}

Cheers,
Josh Micallef
${COMPANY.shortName}`

function blankDraft() {
  return {
    id: null,
    name: '', subject: '', preheader: '', body: STARTER_BODY,
    from_name: 'Josh at Urban Tree Services',
    from_email: 'office@urbantreeservices.net',
    reply_to: COMPANY.email,
    audience: {},
    offer_code: '', offer_percent: '', offer_expires_on: '', offer_terms: '',
    cta_label: MARKETING.defaultCtaLabel, cta_url: MARKETING.siteUrl,
    status: 'draft', scheduled_at: null, stats: {},
  }
}

// The subset of validateCampaign's rules that actually block a send. Everything
// else is advice — the office can send a shouty subject line if they insist, but
// they cannot send an email with no subject, no body, or no way to act on it.
//
// "The CTA url must appear in the body" used to block here too. It no longer
// does: renderCampaignEmail appends the CTA line when the body doesn't already
// carry the link, so a body without it still goes out with exactly one way to
// act on the email. What remains blocking is cta_url being unset — that really
// does produce an email with no link at all.
function hardProblems(c) {
  const out = []
  if (!(c.subject ?? '').trim())  out.push('no subject line')
  if (!(c.body ?? '').trim())     out.push('no body')
  if (!(c.cta_url ?? '').trim())  out.push('no call-to-action link')
  return out
}

async function callCampaignSend(payload) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${FN}/campaign-send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? 'Send failed')
  return body
}

function fmtWhen(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function localToIso(v) {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function StatusChip({ status }) {
  const meta = CAMPAIGN_STATUS[status] ?? CAMPAIGN_STATUS.draft
  return <span style={{ ...s.chipBadge, background: meta.bg, color: meta.fg }}>{meta.label}</span>
}

// ── Audience ─────────────────────────────────────────────────────────────────
function AudienceTab({ contacts, loading, audience, setAudience }) {
  const [suburbSearch, setSuburbSearch] = useState('')

  const stats = useMemo(() => {
    const buckets = Object.fromEntries(MONTH_BUCKETS.map(b => [b.key, 0]))
    let noHistory = 0
    const services = {}
    const suburbs = {}
    for (const c of contacts) {
      const b = bucketFor(c.months_since_job)
      if (b) buckets[b] += 1; else noHistory += 1
      for (const sv of c.services ?? []) services[sv] = (services[sv] ?? 0) + 1
      // Key on the RAW stored value. The chip's label becomes the audience
      // filter, and the sender compares it to the column with plain SQL
      // equality — so trimming here would build "Karori" out of " Karori " and
      // then match nobody. Blank-only values are skipped; the label is trimmed
      // for display below, never for the value.
      const sub = c.suburb ?? ''
      if (sub.trim()) suburbs[sub] = (suburbs[sub] ?? 0) + 1
    }
    return {
      buckets, noHistory,
      services: Object.entries(services).sort((a, b) => b[1] - a[1]),
      suburbs: Object.entries(suburbs).sort((a, b) => b[1] - a[1]),
    }
  }, [contacts])

  const matched = useMemo(() => contacts.filter(c => matchesAudience(c, audience)), [contacts, audience])

  function set(patch) { setAudience({ ...audience, ...patch }) }
  function toggleIn(key, value) {
    const cur = audience[key] ?? []
    set({ [key]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value] })
  }

  const presetKey = SEGMENT_PRESETS.find(p => JSON.stringify(p.audience) === JSON.stringify(audience))?.key
  const visibleSuburbs = stats.suburbs.filter(([name]) =>
    !suburbSearch || name.toLowerCase().includes(suburbSearch.toLowerCase()))

  if (loading) {
    return (
      <>
        <Skeleton block height={110} style={{ marginBottom: 16 }} />
        <SkeletonRows count={3} height={90} />
      </>
    )
  }

  return (
    <>
      <div style={s.card}>
        <div style={s.cardTitle}>Who we can email</div>
        <div style={s.bigNum}>{contacts.length.toLocaleString('en-NZ')}</div>
        <div style={s.subtle}>
          eligible contacts — residential, consented, not unsubscribed or bounced.
          Anyone who has opted out is excluded before this page ever sees them.
        </div>

        <div style={s.tileRow}>
          {MONTH_BUCKETS.map(b => (
            <div key={b.key} style={s.tile}>
              <div style={s.tileNum}>{stats.buckets[b.key].toLocaleString('en-NZ')}</div>
              <div style={s.tileLabel}>{b.label}</div>
            </div>
          ))}
          {stats.noHistory > 0 && (
            <div style={s.tile}>
              <div style={s.tileNum}>{stats.noHistory.toLocaleString('en-NZ')}</div>
              <div style={s.tileLabel}>No job on record</div>
            </div>
          )}
        </div>

        {stats.services.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={s.label}>By service</div>
            <div style={s.chipRow}>
              {stats.services.map(([key, n]) => (
                <span key={key} style={s.countChip}>{SERVICE_LABELS[key] ?? key} · {n}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}>Segment</div>
        <div style={s.chipRow}>
          {SEGMENT_PRESETS.map(p => (
            <button key={p.key} type="button" title={p.hint}
              onClick={() => setAudience({ ...p.audience })}
              style={{ ...s.chip, ...(presetKey === p.key ? s.chipOn : {}) }}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={s.row2}>
          <div style={s.field}>
            <label style={s.label}>Last job at least (months ago)</label>
            <input style={s.input} type="number" min="0" placeholder="any"
              value={audience.min_months_since_job ?? ''}
              onChange={e => set({ min_months_since_job: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
          <div style={s.field}>
            <label style={s.label}>…and at most (months ago)</label>
            <input style={s.input} type="number" min="0" placeholder="any"
              value={audience.max_months_since_job ?? ''}
              onChange={e => set({ max_months_since_job: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
          <div style={s.field}>
            <label style={s.label}>Minimum jobs with us</label>
            <input style={s.input} type="number" min="1" placeholder="any"
              value={audience.min_job_count ?? ''}
              onChange={e => set({ min_job_count: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
          {/* The sender has always applied min_lifetime_value; it had no field
              here, so a filter set any other way was invisible on this page. */}
          <div style={s.field}>
            <label style={s.label}>Minimum spend with us ($)</label>
            <input style={s.input} type="number" min="0" step="50" placeholder="any"
              value={audience.min_lifetime_value ?? ''}
              onChange={e => set({ min_lifetime_value: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
        </div>

        <div style={s.subtle}>
          Suburbs are matched exactly as they're spelled on the contact record — the sender does a
          plain comparison, so this count is the count that gets mailed.
        </div>

        <div style={s.field}>
          <label style={s.label}>Services they've had done {(audience.services ?? []).length > 0 && `· ${audience.services.length} selected`}</label>
          <div style={s.chipRow}>
            {(stats.services.length ? stats.services.map(([k]) => k) : Object.keys(SERVICE_LABELS)).map(key => (
              <button key={key} type="button" onClick={() => toggleIn('services', key)}
                style={{ ...s.chip, ...((audience.services ?? []).includes(key) ? s.chipOn : {}) }}>
                {SERVICE_LABELS[key] ?? key}
              </button>
            ))}
          </div>
        </div>

        <div style={s.field}>
          <label style={s.label}>Suburbs {(audience.suburbs ?? []).length > 0 && `· ${audience.suburbs.length} selected`}</label>
          <input style={{ ...s.input, maxWidth: 260 }} placeholder="Search suburbs…"
            value={suburbSearch} onChange={e => setSuburbSearch(e.target.value)} />
          <div style={{ ...s.chipRow, maxHeight: 132, overflowY: 'auto' }}>
            {visibleSuburbs.length === 0 && <span style={s.subtle}>No suburbs on the list yet.</span>}
            {visibleSuburbs.map(([name, n]) => (
              <button key={name} type="button" onClick={() => toggleIn('suburbs', name)}
                title={name !== name.trim() ? `Stored as "${name}" — matched exactly, spaces and all` : name}
                style={{ ...s.chip, ...((audience.suburbs ?? []).includes(name) ? s.chipOn : {}) }}>
                {name.trim()} · {n}
              </button>
            ))}
          </div>
        </div>

        <div style={s.matchBar}>
          <div>
            <div style={s.matchNum}>{matched.length.toLocaleString('en-NZ')} recipients match</div>
            <div style={s.subtle}>{describeAudience(audience)}</div>
          </div>
          <button type="button" style={s.btnGhost} onClick={() => setAudience({})}>Clear filters</button>
        </div>
      </div>
    </>
  )
}

// ── Import ───────────────────────────────────────────────────────────────────
// The mailing list has to come from somewhere, and that somewhere is three
// systems: Xero (paid invoices, and the line items that produce a real job
// summary), Quotient (the widest coverage of email addresses) and the app's own
// clients table. This panel drives the import-marketing-contacts function.
//
// Two rules shape the whole thing:
//
//   1. A dry run always comes first. The function computes every insert, merge
//      and classification and writes nothing, so the office can read the numbers
//      and the sample rows before anything touches the list. "Import for real"
//      stays disabled until that has happened for THIS source and THIS payload.
//   2. The numbers need explaining. `scanned` is the whole customer history;
//      what can actually be mailed is much smaller, because commercial accounts
//      are imported and then permanently excluded, and anyone without a
//      completed job is imported suppressed. Left unexplained, "4,357 scanned →
//      1,900 mailable" reads like the import broke.
const IMPORT_TIMEOUT_MS = 240_000

function ImportPanel({ onImported, showToast }) {
  const [source, setSource] = useState('xero')
  const [paste, setPaste] = useState('')
  const [pasteError, setPasteError] = useState('')
  const [snippetOpen, setSnippetOpen] = useState(false)
  const [busy, setBusy] = useState(null)          // 'dry' | 'live' | null
  // Everything below is keyed by source, so a Xero dry run can never hand its
  // approval to a Quotient import, and switching tabs doesn't lose a result.
  const [dry, setDry] = useState({})              // source → { result, fingerprint }
  const [live, setLive] = useState({})            // source → result
  const [failure, setFailure] = useState({})      // source → { message, advice, settingsLink }

  const meta = importSource(source)
  const needsPaste = !!meta?.needsPaste

  // For a pasted source the dry run approves one exact payload. Edit the
  // textarea and that approval is void — otherwise a person could dry-run 40
  // rows and then import 4,000 nobody has looked at.
  const fingerprint = needsPaste ? pasteFingerprint(paste) : source
  const held = dry[source]
  const dryResult = held && held.fingerprint === fingerprint ? held.result : null
  const staleDry = !!held && held.fingerprint !== fingerprint
  const liveResult = live[source] ?? null
  const err = failure[source] ?? null
  const shown = liveResult ?? dryResult

  const parsed = needsPaste && paste.trim() ? parseQuotientPaste(paste) : null

  function pick(key) {
    setSource(key)
    setPasteError('')
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(QUOTIENT_SNIPPET)
      showToast('Snippet copied — paste it into the console on ' + QUOTIENT_CONSOLE_HOST)
    } catch {
      showToast('Could not reach the clipboard — select the snippet and copy it manually', true)
    }
  }

  async function run(dryRun) {
    const body = { source, dry_run: dryRun }
    if (needsPaste) {
      const check = parseQuotientPaste(paste)
      if (!check.ok) { setPasteError(check.error); return }
      setPasteError('')
      body.contacts = check.contacts
    }

    setBusy(dryRun ? 'dry' : 'live')
    setFailure(f => ({ ...f, [source]: null }))
    if (dryRun) setLive(l => ({ ...l, [source]: null }))

    // A full Xero import walks every contact and every invoice page; the
    // function itself budgets 110s before it stops paging. Give it room, but
    // don't leave a spinner up forever if the connection has quietly died.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), IMPORT_TIMEOUT_MS)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${FN}/import-marketing-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setFailure(f => ({ ...f, [source]: explainImportError(res.status, json.error ?? `The import failed (HTTP ${res.status}).`) }))
        return
      }

      if (dryRun) {
        setDry(d => ({ ...d, [source]: { result: json, fingerprint } }))
        showToast(`Dry run · ${describeImportOutcome(json)}`)
      } else {
        setLive(l => ({ ...l, [source]: json }))
        // The list on this page is now out of date by exactly the number we
        // just wrote, so refresh it rather than making anyone reload.
        await onImported()
        showToast(`Imported from ${meta?.label ?? source} · ${describeImportOutcome(json)}`)
      }
    } catch (e) {
      const timedOut = e?.name === 'AbortError'
      setFailure(f => ({
        ...f,
        [source]: explainImportError(0, timedOut
          ? `No response after ${IMPORT_TIMEOUT_MS / 60000} minutes — the connection timed out.`
          : (e?.message ?? 'The import could not be reached.')),
      }))
    } finally {
      clearTimeout(timer)
      setBusy(null)
    }
  }

  const running = busy !== null
  const canDryRun = !running && (!needsPaste || !!paste.trim())
  const canImport = !running && !!dryResult && !liveResult

  return (
    <div style={s.card}>
      <div style={s.cardHead}>
        <div>
          <div style={s.cardTitle}>Import contacts</div>
          <div style={s.subtle}>
            Pulls customer history into the mailing list. Safe to re-run — a contact already on the
            list is merged, never duplicated, and consent is never overwritten by an import.
          </div>
        </div>
      </div>

      <div style={s.chipRow}>
        {IMPORT_SOURCES.map(src => (
          <button key={src.key} type="button" onClick={() => pick(src.key)}
            style={{ ...s.chip, ...(source === src.key ? s.chipOn : {}) }}>
            {src.label}
          </button>
        ))}
      </div>

      <div style={s.subtle}>{meta?.blurb}</div>

      {/* Said once, up front, because it is the reason the mailable number is
          so much smaller than the scanned one. */}
      <div style={s.warnBox}>
        Everything found gets imported, but not everything can be mailed.
        Contacts classified <strong>commercial</strong> — councils, <em>Ltd</em> names, property managers,
        schools, trusts, <em>*.govt.nz</em> — are kept on the record and <strong>never marketed to</strong>.
        Contacts with <strong>no completed job</strong> are imported as <strong>suppressed</strong>: on the list,
        but not mailable until a person decides otherwise. That is why “scanned 4,357” becomes a much
        smaller audience.
      </div>

      {needsPaste && (
        <>
          <div style={s.field}>
            <div style={s.inlineRow}>
              <span style={s.label}>Step 1 — extract from Quotient</span>
              <button type="button" style={s.smallBtn} onClick={copySnippet}>Copy snippet</button>
              <button type="button" style={s.btnGhost} onClick={() => setSnippetOpen(o => !o)}>
                {snippetOpen ? 'Hide snippet' : 'Show snippet'}
              </button>
            </div>
            <div style={s.subtle}>
              Sign in to <strong>{QUOTIENT_CONSOLE_HOST}</strong>, open DevTools → Console on that tab,
              paste this and wait — there are around 4,400 contacts, so it takes a few minutes. It copies
              the JSON to your clipboard when it finishes.
            </div>
            {snippetOpen && <pre style={s.code}>{QUOTIENT_SNIPPET}</pre>}
          </div>

          <div style={s.field}>
            <label style={s.label}>Step 2 — paste the JSON array here</label>
            <textarea style={{ ...s.textarea, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, minHeight: 96 }}
              rows={5} placeholder='[{"source_ref":"1001","first_name":"Colleen", …}]'
              value={paste} onChange={e => { setPaste(e.target.value); setPasteError('') }} />
            <div style={s.subtle}>
              Maximum {IMPORT_MAX_ROWS.toLocaleString('en-NZ')} contacts per import — split a bigger export
              into batches and paste one at a time.
            </div>
            {pasteError && <div style={s.errBox}>{pasteError}</div>}
            {!pasteError && parsed?.ok && (
              <div style={s.okBox}>
                {parsed.count.toLocaleString('en-NZ')} contacts read
                {parsed.withEmail < parsed.count && ` · ${parsed.withEmail.toLocaleString('en-NZ')} with an email address`}
              </div>
            )}
            {!pasteError && parsed && !parsed.ok && <div style={s.errBox}>{parsed.error}</div>}
          </div>
        </>
      )}

      {err && (
        <div style={s.gapBox}>
          <div style={s.gapTitle}>The import didn’t run</div>
          {/* Verbatim. The Xero scope failure names the exact missing scope and
              paraphrasing it throws away the only actionable part. */}
          <div style={s.gapSample}>{err.message}</div>
          {err.advice && <div style={s.gapBody}>{err.advice}</div>}
          {err.settingsLink && (
            <Link to="/settings" style={s.killLink}>Open Settings → Integrations</Link>
          )}
        </div>
      )}

      <div style={s.sectionRule} />

      <div style={s.inlineRow}>
        <button type="button" style={s.btnGhost} disabled={!canDryRun} onClick={() => run(true)}>
          {busy === 'dry' ? 'Dry running…' : dryResult ? 'Dry run again' : 'Dry run'}
        </button>
        <button type="button"
          style={{ ...s.btnPrimary, ...(canImport ? {} : s.btnDisabled) }}
          disabled={!canImport} onClick={() => run(false)}>
          {busy === 'live'
            ? 'Importing…'
            : dryResult
              ? `Import for real — ${Number(dryResult.inserted ?? 0).toLocaleString('en-NZ')} new, ${Number(dryResult.updated ?? 0).toLocaleString('en-NZ')} merged`
              : 'Import for real'}
        </button>
      </div>

      {!dryResult && !busy && (
        <div style={s.subtle}>
          A dry run works out every insert and merge and writes <strong>nothing</strong>. It has to happen
          before an import — read the numbers and the sample rows first.
        </div>
      )}
      {staleDry && (
        <div style={s.warnBox}>
          The pasted list changed since the last dry run, so those numbers no longer describe what would
          be imported. Dry run again.
        </div>
      )}
      {liveResult && (
        <div style={s.okBox}>
          Imported. {describeImportOutcome(liveResult)} The audience counts below have been refreshed.
        </div>
      )}

      {shown && <ImportSummary result={shown} />}
    </div>
  )
}

// The function's response as a table rather than raw JSON, plus the sample rows
// it returns so the office can eyeball real names, emails, suburbs and — above
// all — last_job_summary, which is the field every personalised sentence in a
// campaign is built out of.
function ImportSummary({ result }) {
  const rows = summaryRows(result)
  const { scanned, dropped, commercial, suppressed, mailable } = mailableFromSummary(result)
  const errors = Array.isArray(result.errors) ? result.errors : []
  const sample = Array.isArray(result.sample) ? result.sample : []

  return (
    <div style={s.importResult}>
      <div style={s.inlineRow}>
        <span style={{ ...s.chipBadge, ...(result.dry_run ? s.badgeDry : s.badgeLive) }}>
          {result.dry_run ? 'Dry run — nothing written' : 'Imported'}
        </span>
        <span style={s.subtle}>{importSource(result.source)?.label ?? result.source}</span>
      </div>

      <table style={s.sumTable}>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}>
              <th scope="row" style={s.sumKey}>{r.label}</th>
              <td style={{ ...s.sumVal, ...(r.key === 'error_count' && r.value > 0 ? s.sumValBad : {}) }}>
                {r.value.toLocaleString('en-NZ')}
              </td>
              <td style={s.sumHint}>{r.hint}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* The arithmetic, spelled out, so nobody has to work out why the two
          big numbers disagree. */}
      <div style={s.warnBox}>
        Of {scanned.toLocaleString('en-NZ')} scanned: {dropped.toLocaleString('en-NZ')} had no usable email
        address, {commercial.toLocaleString('en-NZ')} are commercial and are never marketed to,
        and {suppressed.toLocaleString('en-NZ')} have no completed job so arrive suppressed.
        That leaves roughly <strong>{mailable.toLocaleString('en-NZ')}</strong> who could be emailed.
      </div>

      {errors.length > 0 && (
        <div style={s.field}>
          <div style={s.label}>
            First {Math.min(5, errors.length)} of {Number(result.error_count ?? errors.length).toLocaleString('en-NZ')} row errors
          </div>
          {errors.slice(0, 5).map((e, i) => (
            <div key={i} style={s.errRow}>
              <span style={s.errRef}>{e.source_ref ? `#${e.source_ref}` : `row ${Number(e.index) + 1}`}</span>
              <span>{e.error}</span>
            </div>
          ))}
          <div style={s.subtle}>
            Each bad row is reported on its own and the rest of the batch still imports.
          </div>
        </div>
      )}

      <div style={s.field}>
        <div style={s.label}>Sample — the first {sample.length} contacts, exactly as they’ll be written</div>
        {sample.length === 0 && <div style={s.subtle}>Nothing to write from this source.</div>}
        {sample.map((row, i) => (
          <div key={i} style={s.sampleCard}>
            <div style={s.sampleTop}>
              <span style={s.sampleName}>{sampleName(row)}</span>
              <span style={s.countChip}>{row.action === 'update' ? 'merge' : 'new'}</span>
              {row.contact_type && <span style={s.countChip}>{row.contact_type}</span>}
              {row.consent_status && <span style={s.countChip}>{row.consent_status}</span>}
            </div>
            <div style={s.sampleLine}>{row.email ?? '(no email)'}</div>
            <div style={s.sampleLine}>{[row.suburb, row.city].filter(Boolean).join(' · ') || 'no suburb on file'}</div>
            {/* The whole point of the import: the copy says "we pruned your
                magnolia in March 2023" out of this one field. */}
            <div style={s.sampleSummary}>
              {row.last_job_summary
                ? <>last job: <strong>{row.last_job_summary}</strong></>
                : <span style={s.sampleMissing}>no job summary — the templates read correctly without one</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Compose ──────────────────────────────────────────────────────────────────
function ComposeTab({ draft, set, problems, templateId, onApplyTemplate, onStartBlank, onApplyOffer, recipients }) {
  const bodyRef = useRef(null)

  // Tags the sender cannot resolve, anywhere in the copy. Called out on its own
  // rather than buried in the advisory list, because unlike everything else in
  // that list this one is guaranteed to reach every single recipient as a hole.
  const badTags = useMemo(() => [...new Set([
    ...unknownTagsIn(draft.subject ?? ''),
    ...unknownTagsIn(draft.preheader ?? ''),
    ...unknownTagsIn(draft.body ?? ''),
  ])], [draft.subject, draft.preheader, draft.body])

  function insertTag(tag) {
    const token = `{{${tag}}}`
    const el = bodyRef.current
    if (!el) { set({ body: (draft.body ?? '') + token }); return }
    const start = el.selectionStart ?? el.value.length
    const end   = el.selectionEnd ?? start
    set({ body: el.value.slice(0, start) + token + el.value.slice(end) })
    const caret = start + token.length
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret) })
  }

  const subjectLen = (draft.subject ?? '').length

  return (
    <>
    <div style={s.card}>
      <div style={s.cardTitle}>Start from a template</div>
      <div style={s.subtle}>
        These are modelled line by line on emails past customers have sent Josh unprompted asking
        to come back. Picking one sets the copy <em>and</em> the segment it was written for, so the
        two stay coherent.
      </div>
      <div style={s.templateGrid}>
        {CAMPAIGN_TEMPLATES.map(t => (
          <button key={t.id} type="button" onClick={() => onApplyTemplate(t)}
            style={{ ...s.templateCard, ...(templateId === t.id ? s.templateCardOn : {}) }}>
            <span style={s.templateName}>{t.name}</span>
            <span style={s.templateSubject}>{t.subject}</span>
            <span style={s.templateAudience}>{describeAudience(t.audience)}</span>
          </button>
        ))}
        <button type="button" onClick={onStartBlank}
          style={{ ...s.templateCard, ...(templateId === null ? s.templateCardOn : {}) }}>
          <span style={s.templateName}>Start from blank</span>
          <span style={s.templateSubject}>Write your own copy</span>
          <span style={s.templateAudience}>Keeps the segment you've already chosen</span>
        </button>
      </div>
      <div style={s.matchBar}>
        <div>
          <div style={s.matchNum}>{recipients.toLocaleString('en-NZ')} recipients match</div>
          <div style={s.subtle}>{describeAudience(draft.audience)}</div>
        </div>
      </div>
    </div>

    <div style={s.card}>
      <div style={s.cardTitle}>The email</div>

      <div style={s.field}>
        <label style={s.label}>Campaign name (internal — nobody else sees this)</label>
        <input style={s.input} placeholder="Winter pruning 2026 — lapsed customers"
          value={draft.name} onChange={e => set({ name: e.target.value })} />
      </div>

      <div style={s.field}>
        <label style={s.label}>
          Subject line
          <span style={{ ...s.counter, color: subjectLen > 60 ? 'var(--danger)' : '#bbb' }}> {subjectLen}/60</span>
        </label>
        <input style={s.input} placeholder="Time to book your winter pruning, {{first_name}}?"
          value={draft.subject} onChange={e => set({ subject: e.target.value })} />
      </div>

      <div style={s.field}>
        <label style={s.label}>Preheader (the grey line after the subject in the inbox)</label>
        <input style={s.input} placeholder="A quick check-in about the trees at your place."
          value={draft.preheader ?? ''} onChange={e => set({ preheader: e.target.value })} />
      </div>

      <div style={s.field}>
        <label style={s.label}>Body</label>
        <div style={s.chipRow}>
          {MERGE_TAGS.map(t => (
            <button key={t.tag} type="button" style={s.tagChip} title={`Inserts {{${t.tag}}} — e.g. ${t.example}`}
              onClick={() => insertTag(t.tag)}>
              + {t.label}
            </button>
          ))}
        </div>
        <textarea ref={bodyRef} style={s.textarea} rows={16} value={draft.body}
          onChange={e => set({ body: e.target.value })} />
        {badTags.length > 0 && (
          <div style={s.errBox}>
            ⚠ {badTags.map(t => `{{${t}}}`).join(', ')} {badTags.length === 1 ? 'is not a merge tag' : 'are not merge tags'} —
            {' '}the sender doesn't know {badTags.length === 1 ? 'it' : 'them'}, so {badTags.length === 1 ? 'it arrives' : 'they arrive'} as
            a blank for <em>every</em> recipient. Use the buttons above to insert a real one
            ({MERGE_TAGS.map(t => `{{${t.tag}}}`).join(', ')}).
          </div>
        )}
        <div style={s.subtle}>
          Plain text on purpose — a note that reads like it came from a person outperforms a
          template blast, and is far less likely to be filtered.
        </div>
      </div>

      <div style={s.row2}>
        <div style={s.field}>
          <label style={s.label}>From name</label>
          <input style={s.input} value={draft.from_name} onChange={e => set({ from_name: e.target.value })} />
        </div>
        <div style={s.field}>
          <label style={s.label}>Reply-to</label>
          <input style={s.input} value={draft.reply_to} onChange={e => set({ reply_to: e.target.value })} />
        </div>
      </div>
      <div style={s.subtle}>Sent from <strong>{draft.from_email}</strong> — the verified sending address.</div>

      <div style={s.row2}>
        <div style={s.field}>
          <label style={s.label}>Button text</label>
          <input style={s.input} value={draft.cta_label} onChange={e => set({ cta_label: e.target.value })} />
        </div>
        <div style={s.field}>
          <label style={s.label}>Button link</label>
          <input style={s.input} value={draft.cta_url} onChange={e => set({ cta_url: e.target.value })} />
        </div>
      </div>

      <div style={s.sectionRule} />
      <div style={s.cardHead}>
        <div style={s.cardTitle}>Offer (optional)</div>
        <button type="button" style={s.btnGhost} onClick={onApplyOffer}>Apply the 5% offer</button>
      </div>
      <div style={s.subtle}>
        The standard offer is framed as a thank-you for being a past customer, not a promotion —
        it has to be mentioned at booking, which is also how the campaign gets attributed.
        Pick the expiry date yourself: a discount with no stated end date isn't compliant.
      </div>
      <div style={s.row2}>
        <div style={s.field}>
          <label style={s.label}>Code</label>
          <input style={s.input} placeholder="WINTER15" value={draft.offer_code ?? ''}
            onChange={e => set({ offer_code: e.target.value })} />
        </div>
        <div style={s.field}>
          <label style={s.label}>Discount %</label>
          <input style={s.input} type="number" min="0" max="100" placeholder="—" value={draft.offer_percent ?? ''}
            onChange={e => set({ offer_percent: e.target.value === '' ? '' : Number(e.target.value) })} />
        </div>
        <div style={s.field}>
          <label style={s.label}>Expires on</label>
          <input style={s.input} type="date" value={draft.offer_expires_on ?? ''}
            onChange={e => set({ offer_expires_on: e.target.value })} />
        </div>
      </div>
      <div style={s.field}>
        <label style={s.label}>Offer terms</label>
        <textarea style={{ ...s.textarea, fontSize: 12.5 }} rows={3}
          placeholder="One job per household. Quoted work only. Not with any other offer."
          value={draft.offer_terms ?? ''} onChange={e => set({ offer_terms: e.target.value })} />
      </div>

      {problems.length > 0 && (
        <div style={s.problemBox}>
          <div style={s.problemHead}>Worth fixing before this goes out</div>
          {problems.map(p => <div key={p} style={s.problemLine}>⚠ {p}</div>)}
        </div>
      )}
    </div>
    </>
  )
}

// ── Preview ──────────────────────────────────────────────────────────────────
function PreviewTab({ draft, sample, sampleIsReal, template, suburbGap, onUseFallbackSubject, onSendTest, busy }) {
  const [testTo, setTestTo] = useState('')
  const data = useMemo(() => mergeDataFor(sample, draft), [sample, draft])

  // The sender resolves an empty merge tag to an empty string, so a subject like
  // "Your trees at {{suburb}}" reaches a suburb-less contact as a visible hole.
  // The subject is the line that decides whether the email gets opened, so a gap
  // there is called out loudly; a gap in the body is a softer note.
  const subjectGaps = useMemo(() => emptyTagsIn(draft.subject, data), [draft.subject, data])
  const bodyGaps    = useMemo(() => emptyTagsIn(draft.body, data), [draft.body, data])

  // The previewed contact is only one person. Warn on the whole segment too —
  // otherwise a sample who happens to have a suburb hides the problem for the
  // several hundred who don't.
  const usesSuburb  = /\{\{\s*suburb\s*\}\}/.test(draft.subject ?? '')
  const audienceGap = usesSuburb ? (suburbGap?.without ?? 0) : 0
  const showGap = subjectGaps.length > 0 || audienceGap > 0
  const canSwap = (subjectGaps.includes('suburb') || audienceGap > 0) && !!template?.subjectFallback

  return (
    <>
      {showGap && (
        <div style={s.gapBox}>
          <div style={s.gapTitle}>This subject line would arrive with a gap in it</div>
          <div style={s.gapBody}>
            {audienceGap > 0
              ? `${audienceGap.toLocaleString('en-NZ')} of the ${(suburbGap?.total ?? 0).toLocaleString('en-NZ')} people in this segment have no suburb on file. They would receive:`
              : `${sampleIsReal ? 'This contact has' : 'A contact with'} no ${subjectGaps.map(t => `{{${t}}}`).join(', ')} on file, so they'd receive:`}
          </div>
          <div style={s.gapSample}>
            {renderPreview(draft.subject, audienceGap > 0 ? { ...data, suburb: '' } : data)}
          </div>
          {canSwap && (
            <button type="button" style={s.btnDanger} onClick={onUseFallbackSubject}>
              Use “{template.subjectFallback}” instead
            </button>
          )}
        </div>
      )}

      <div style={s.card}>
        <div style={s.cardHead}>
          <div style={s.cardTitle}>Preview</div>
          <div style={s.subtle}>
            {sampleIsReal
              ? `Rendered against a real contact: ${sample.first_name ?? '—'} ${sample.last_name ?? ''} · ${sample.suburb ?? 'no suburb'}`
              : 'No contacts on the list yet — rendered against example values.'}
          </div>
        </div>

        <div style={s.mail}>
          <div style={s.mailHead}>
            <div style={s.mailFrom}>{draft.from_name} <span style={s.mailAddr}>&lt;{draft.from_email}&gt;</span></div>
            <div style={s.mailSubject}>{renderPreview(draft.subject, data) || <span style={{ color: '#bbb' }}>(no subject)</span>}</div>
            {draft.preheader && <div style={s.mailPre}>{renderPreview(draft.preheader, data)}</div>}
          </div>
          <div style={s.mailBody}>
            {renderPreview(draft.body, data) || <span style={{ color: '#bbb' }}>(empty)</span>}
          </div>
          <div style={s.mailCta}>
            <span style={s.mailCtaBtn}>{draft.cta_label || 'Get a free quote'}</span>
            <div style={s.mailCtaUrl}>{draft.cta_url}</div>
          </div>
          {(draft.offer_code || draft.offer_percent) && (
            <div style={s.mailOffer}>
              {draft.offer_percent ? `${draft.offer_percent}% off` : 'Offer'}
              {draft.offer_code ? ` — quote code ${draft.offer_code}` : ''}
              {draft.offer_expires_on ? `. Valid until ${formatDateNz(draft.offer_expires_on)}.` : ''}
              {draft.offer_terms ? ` ${draft.offer_terms}` : ''}
            </div>
          )}
          <div style={s.mailFooter}>
            You're receiving this because {COMPANY.name} has done tree work at your property.
            <br />
            {COMPANY.name} · {COMPANY.phone} · {COMPANY.email}
            <br />
            <span style={s.mailUnsub}>Unsubscribe</span> — one click, no login, actioned immediately.
          </div>
        </div>

        {bodyGaps.length > 0 && (
          <div style={s.problemBox}>
            <div style={s.problemLine}>
              ⚠ For this contact {bodyGaps.map(t => `{{${t}}}`).join(', ')} resolves to nothing —
              check the sentences around it still read correctly above.
            </div>
          </div>
        )}

        <div style={s.subtle}>
          The footer and unsubscribe link are added by the sender, not typed here — every message
          carries them, which is what the Unsolicited Electronic Messages Act requires.
        </div>
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}>Send a test</div>
        <div style={s.subtle}>Goes to one address only. Nothing is recorded against the campaign.</div>
        <div style={s.inlineRow}>
          <input style={{ ...s.input, maxWidth: 320 }} type="email" placeholder="you@urbantreeservices.net"
            value={testTo} onChange={e => setTestTo(e.target.value)} />
          <button style={s.btnPrimary} disabled={busy || !testTo.includes('@')}
            onClick={() => onSendTest(testTo)}>
            {busy ? 'Sending…' : 'Send test'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Send ─────────────────────────────────────────────────────────────────────
// What the sender actually reported, in words. Everything shown here comes from
// the campaign row's stats (maintained by campaign_stats after every run) or
// from the send response — nothing is inferred, and nothing is promised.
function SendProgress({ draft, lastSend, dailyCap }) {
  const st = draft.stats ?? {}
  const sent      = Number(st.sent ?? lastSend?.sent ?? 0)
  const queued    = Number(st.queued ?? lastSend?.remaining ?? 0)
  const failed    = Number(st.failed ?? lastSend?.failed ?? 0)
  const skipped   = Number(st.skipped ?? lastSend?.skipped ?? 0)
  const capped    = lastSend?.capped === true
  const capNow    = lastSend?.daily_cap ?? dailyCap

  // `queued` counts QUEUED ROWS. Under the daily cap the rest of the audience
  // has no row at all — the run stops queueing once the day's allowance is
  // gone — so `queued` is 0 while hundreds of people are still to be mailed.
  // The sender reports those separately as `unqueued`, and the two together
  // are the only honest answer to "how many are left".
  const unqueued  = Number(lastSend?.unqueued ?? 0)
  const stillToGo = queued + unqueued

  // Only render once there is something real to report.
  if (!lastSend && !st.recipients) return null

  // st.recipients counts rows made so far, NOT the campaign's audience, so it
  // is 50 after a capped first run. Using it as the denominator drew a full
  // bar over a quarter-finished send.
  const total = sent + stillToGo + failed + skipped
  const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0

  // The backend is the only thing that knows whether the audience is drained —
  // it does an anti-join before flipping the status. The page used to second-
  // guess it with `queued === 0`, which is exactly the condition the daily cap
  // produces, and so announced "This campaign has been sent" mid-send.
  const done = draft.status === 'sent'

  return (
    <div style={s.card}>
      <div style={s.cardHead}>
        <div style={s.cardTitle}>
          {done ? 'This campaign has been sent'
            : draft.status === 'paused' ? 'Paused part-way through'
            : 'Part-way through sending'}
        </div>
        <StatusChip status={draft.status} />
      </div>

      <div style={s.progressTrack}>
        <div style={{ ...s.progressFill, width: `${pct}%` }} />
      </div>

      <div style={s.tileRow}>
        <div style={s.tile}>
          <div style={s.tileNum}>{sent.toLocaleString('en-NZ')}</div>
          <div style={s.tileLabel}>Sent</div>
        </div>
        <div style={s.tile}>
          <div style={s.tileNum}>{stillToGo.toLocaleString('en-NZ')}</div>
          <div style={s.tileLabel}>Still to go</div>
        </div>
        {failed > 0 && (
          <div style={s.tile}>
            <div style={{ ...s.tileNum, color: '#C0392B' }}>{failed.toLocaleString('en-NZ')}</div>
            <div style={s.tileLabel}>Failed</div>
          </div>
        )}
        {skipped > 0 && (
          <div style={s.tile}>
            <div style={s.tileNum}>{skipped.toLocaleString('en-NZ')}</div>
            <div style={s.tileLabel}>Skipped</div>
          </div>
        )}
      </div>

      {capped && (
        <div style={s.warnBox}>
          <strong>Paused on the daily cap.</strong>{' '}
          {/* The sender's own message already ends with "…they go out on the
              next run", so appending the same sentence printed it twice. */}
          {lastSend?.message
            ?? `The cap of ${capNow} sends a day was reached, so the run stopped there. `
             + `${stillToGo.toLocaleString('en-NZ')} still to go — they go out on the sender's `
             + `next run, or when you press Send again.`}
        </div>
      )}
      {!capped && queued > 0 && draft.status === 'sending' && (
        <div style={s.subtle}>
          {queued.toLocaleString('en-NZ')} still queued. The run stopped before the queue was empty
          (time limit or per-run limit) — it picks up from here next time.
        </div>
      )}
      {skipped > 0 && (
        <div style={s.subtle}>
          Skipped = queued earlier but no longer eligible when their turn came — they unsubscribed,
          bounced or were suppressed in between.
        </div>
      )}
    </div>
  )
}

function SendTab({
  draft, recipients, sendEnabled, dailyCap, problems, blockers, busy,
  lastSend, locked, onSendNow, onSchedule, onPause,
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [when, setWhen] = useState('')

  const resuming  = draft.status === 'sending' && !!draft.id
  const alreadySent = draft.status === 'sent' && !!draft.id
  const blocked = (blockers.length > 0 && !resuming) || (recipients === 0 && !resuming) || !sendEnabled || alreadySent
  const confirmed = confirmText.trim().toUpperCase() === 'SEND'

  return (
    <>
      {!sendEnabled && (
        <div style={s.killBox}>
          <div style={s.killTitle}>Sending is switched OFF</div>
          <div style={s.killBody}>
            Nothing will go out while the campaign kill switch is off — you can build, preview and
            schedule campaigns safely. Turn on <strong>Allow campaign sending</strong> under{' '}
            <Link to="/settings" style={s.killLink}>Settings → Integrations</Link> when you're ready
            to mail people. Only a full-access user can switch it on.
          </div>
        </div>
      )}

      <SendProgress draft={draft} lastSend={lastSend} dailyCap={dailyCap} />

      <div style={s.card}>
        <div style={s.cardTitle}>{resuming ? 'Send the rest' : alreadySent ? 'Already sent' : 'Ready to send?'}</div>

        <div style={s.summaryGrid}>
          <div style={s.summaryRow}><span style={s.summaryKey}>Campaign</span><span style={s.summaryVal}>{draft.name || <em style={{ color: '#bbb' }}>unnamed</em>}</span></div>
          <div style={s.summaryRow}><span style={s.summaryKey}>Subject</span><span style={s.summaryVal}>{draft.subject || <em style={{ color: '#bbb' }}>none</em>}</span></div>
          <div style={s.summaryRow}><span style={s.summaryKey}>Audience</span><span style={s.summaryVal}>{describeAudience(draft.audience)}</span></div>
          <div style={s.summaryRow}><span style={s.summaryKey}>Recipients</span><span style={s.summaryVal}><strong>{recipients.toLocaleString('en-NZ')}</strong></span></div>
        </div>

        {alreadySent && (
          <div style={s.okBox}>
            This campaign has already gone out. The sender refuses to send it a second time — start
            a new campaign, or copy this one to a fresh draft from Compose.
          </div>
        )}
        {!alreadySent && blockers.length > 0 && !resuming && (
          <div style={s.errBox}>Can't send yet — {blockers.join(', ')}.</div>
        )}
        {!alreadySent && blockers.length === 0 && recipients === 0 && !resuming && (
          <div style={s.errBox}>Can't send yet — the audience filter matches nobody.</div>
        )}
        {/* Advisory problems only once the blocking ones are cleared — otherwise
            the same fault is stated twice, in two different boxes. */}
        {!alreadySent && blockers.length === 0 && problems.length > 0 && (
          <div style={s.problemBox}>
            <div style={s.problemHead}>Worth fixing first — you can send anyway</div>
            {problems.map(p => <div key={p} style={s.problemLine}>⚠ {p}</div>)}
          </div>
        )}
        {/* What the daily cap actually does, stated as mechanism rather than as
            a promise. The sender mails up to the cap ACROSS ALL campaigns for
            the NZ day, leaves the rest queued, and this campaign stays
            "Sending…" until the queue is empty. The Send tab above reports the
            real sent/remaining figures once a run has happened — so this box
            only has to explain what is about to happen, not assert what did. */}
        {!alreadySent && dailyCap != null && recipients > dailyCap && (
          <div style={s.warnBox}>
            {recipients.toLocaleString('en-NZ')} recipients is more than the daily cap of {dailyCap},
            which applies across every campaign for the day. This run will mail at most {dailyCap} of
            them — fewer if something else has already sent today — and leave the rest queued with the
            campaign showing “Sending…”. The remainder goes out on the sender's next run, or when you
            come back here and press Send again. You'll see the real sent / still-to-go figures on
            this tab as soon as the first run finishes.
          </div>
        )}

        {!confirmOpen ? (
          <div style={s.actions}>
            {resuming && (
              <button style={s.btnGhost} disabled={busy} onClick={onPause}>Pause this campaign</button>
            )}
            <button style={s.btnPrimary} disabled={blocked || busy} onClick={() => { setConfirmText(''); setConfirmOpen(true) }}>
              {resuming ? 'Send the rest' : 'Send now'}
            </button>
          </div>
        ) : (
          <div style={s.confirmBox}>
            <div style={s.confirmLine}>
              {resuming
                ? <>This will carry on sending <strong>the same copy</strong> to whoever is still queued. Type SEND to confirm.</>
                : <>This will email <strong>{recipients.toLocaleString('en-NZ')} people</strong>. Type SEND to confirm.</>}
            </div>
            <div style={s.inlineRow}>
              <input style={{ ...s.input, maxWidth: 160, letterSpacing: '0.1em', fontWeight: 700 }}
                placeholder="SEND" value={confirmText} autoFocus
                onChange={e => setConfirmText(e.target.value)} />
              <button style={s.btnDanger} disabled={!confirmed || busy}
                onClick={() => { setConfirmOpen(false); setConfirmText(''); onSendNow() }}>
                {busy ? 'Sending…' : resuming ? 'Carry on sending' : `Email ${recipients.toLocaleString('en-NZ')} people`}
              </button>
              <button style={s.btnGhost} onClick={() => { setConfirmOpen(false); setConfirmText('') }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {!alreadySent && !resuming && (
        <div style={s.card}>
          <div style={s.cardTitle}>Schedule for later</div>
          <div style={s.subtle}>Tuesday to Thursday, mid-morning, tends to land best.</div>
          <div style={s.inlineRow}>
            <input style={{ ...s.input, maxWidth: 240 }} type="datetime-local" value={when}
              onChange={e => setWhen(e.target.value)} />
            <button style={s.btnGhost} disabled={blocked || busy || !when || locked}
              onClick={() => onSchedule(localToIso(when))}>
              Schedule
            </button>
          </div>
          {draft.status === 'scheduled' && draft.scheduled_at && (
            <div style={s.okBox}>Scheduled for {fmtWhen(draft.scheduled_at)}.</div>
          )}
        </div>
      )}
    </>
  )
}

// ── Results ──────────────────────────────────────────────────────────────────
const EVENT_LABELS = {
  queued: 'Queued', sent: 'Sent', delivered: 'Delivered', opened: 'Opened',
  clicked: 'Clicked', bounced: 'Bounced', complained: 'Complained',
  unsubscribed: 'Unsubscribed', failed: 'Failed',
}

function CampaignDetail({ campaign, onBack }) {
  const [events, setEvents] = useState(null)
  const [stats, setStats] = useState(campaign.stats ?? {})
  const [quoteReqs, setQuoteReqs] = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      const { data, error } = await supabase.rpc('campaign_stats', { p_campaign_id: campaign.id })
      if (alive && !error && data) setStats(data)

      // Prefer the embedded contact so the log reads with names; fall back to a
      // plain select if the relationship isn't resolvable.
      let rows = null
      const withContact = await supabase.from('campaign_events')
        .select('id, kind, url, created_at, marketing_contacts(first_name, last_name, email)')
        .eq('campaign_id', campaign.id).order('created_at', { ascending: false }).limit(200)
      if (withContact.error) {
        const plain = await supabase.from('campaign_events')
          .select('id, kind, url, created_at')
          .eq('campaign_id', campaign.id).order('created_at', { ascending: false }).limit(200)
        rows = plain.data ?? []
      } else {
        rows = withContact.data ?? []
      }
      if (alive) setEvents(rows)

      // Quote requests attributed to this campaign. The table is new (migration
      // 040) so a missing table must not blank the whole panel — leave it null
      // and the tile simply does not render.
      const qr = await supabase.from('quote_requests')
        .select('id, name, email, service, created_at, matched_by, job_id')
        .eq('campaign_id', campaign.id).order('created_at', { ascending: false }).limit(100)
      if (alive) setQuoteReqs(qr.error ? null : (qr.data ?? []))
    }
    load()
    return () => { alive = false }
  }, [campaign.id])

  // campaign_stats counts DISTINCT PEOPLE; the activity list below shows every
  // event. One person opening five times is 1 opened and 5 rows, which reads as
  // a broken counter unless the card says so. Unique-opens is the right metric
  // to keep — it is what "open rate" means everywhere else — so label it rather
  // than change it.
  const openEvents  = (events ?? []).filter(e => e.kind === 'opened').length
  const clickEvents = (events ?? []).filter(e => e.kind === 'clicked').length

  // The only figure on this card that is worth money. Opens are inflated by
  // Apple's Mail Privacy Protection and clicks stop at the website — a quote
  // request is a person actually asking for work.
  const cells = [
    ...(quoteReqs ? [['Quote requests', quoteReqs.length,
        quoteReqs.length ? `${quoteReqs.filter(q => q.matched_by === 'utm').length} via the link` : null]] : []),
    ['Recipients', stats.recipients], ['Sent', stats.sent],
    ['Opened', stats.opened, openEvents > (stats.opened ?? 0) ? `${openEvents} opens in total` : null],
    ['Clicked', stats.clicked, clickEvents > (stats.clicked ?? 0) ? `${clickEvents} clicks in total` : null],
    ['Unsubscribed', stats.unsubscribed], ['Failed', stats.failed],
  ]

  return (
    <div style={s.card}>
      <div style={s.cardHead}>
        <div>
          <div style={s.cardTitle}>{campaign.name}</div>
          <div style={s.subtle}>{campaign.subject}</div>
        </div>
        <button style={s.btnGhost} onClick={onBack}>← All campaigns</button>
      </div>

      <div style={s.tileRow}>
        {cells.map(([label, n, note]) => (
          <div key={label} style={s.tile}>
            <div style={s.tileNum}>{(n ?? 0).toLocaleString('en-NZ')}</div>
            <div style={s.tileLabel}>{label}</div>
            {note && <div style={{ ...s.tileLabel, opacity: 0.65, fontSize: 11 }}>{note}</div>}
          </div>
        ))}
      </div>

      <div style={s.label}>Activity</div>
      {events === null ? <SkeletonRows count={4} height={38} />
        : events.length === 0 ? <div style={s.empty}>No activity recorded yet.</div>
        : (
          <div>
            {events.map(e => {
              const c = e.marketing_contacts
              const who = c ? [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email : ''
              return (
                <div key={e.id} style={s.eventRow}>
                  <span style={s.eventKind}>{EVENT_LABELS[e.kind] ?? e.kind}</span>
                  <span style={s.eventWho}>{who}</span>
                  {e.url && <span style={s.eventUrl}>{e.url}</span>}
                  <span style={s.eventWhen}>{fmtWhen(e.created_at)}</span>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

function ResultsTab({ campaigns, loading, onOpen, onEdit, contacts }) {
  if (loading) return <SkeletonRows count={4} height={72} />
  if (campaigns.length === 0) return <div style={s.empty}>No campaigns yet — compose one and it'll show up here.</div>

  return (
    <>
      {campaigns.map(c => {
        const st = c.stats ?? {}
        return (
          <div key={c.id} style={s.listRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.listTitleRow}>
                <span style={s.listName}>{c.name || '(unnamed)'}</span>
                <StatusChip status={c.status} />
              </div>
              <div style={s.listSubject}>{c.subject}</div>
              <div style={s.listMeta}>
                <span>{(st.sent ?? 0).toLocaleString('en-NZ')} sent</span>
                <span>{(st.opened ?? 0).toLocaleString('en-NZ')} opened</span>
                <span>{(st.clicked ?? 0).toLocaleString('en-NZ')} clicked</span>
                <span>{(st.unsubscribed ?? 0).toLocaleString('en-NZ')} unsubscribed</span>
                {/* "Sending..." is honest but it reads as "in progress right now"
                    when a capped campaign is actually sitting still until the cap
                    resets at NZ midnight. Say how many are left, so the chip is a
                    status rather than a riddle. Computed from the audience the
                    page already holds, minus rows the campaign has made. */}
                {(c.status === 'sending' || c.status === 'paused') && (() => {
                  const left = (contacts ?? []).filter(x => matchesAudience(x, c.audience)).length
                             - Number(st.recipients ?? 0)
                  return left > 0
                    ? <span style={{ fontWeight: 600 }}>· {left.toLocaleString('en-NZ')} still to go</span>
                    : null
                })()}
                {c.sent_at && <span>· {fmtWhen(c.sent_at)}</span>}
                {c.status === 'scheduled' && c.scheduled_at && <span>· for {fmtWhen(c.scheduled_at)}</span>}
              </div>
            </div>
            <div style={s.listActions}>
              <button style={s.smallBtn} onClick={() => onOpen(c)}>Details</button>
              <button style={s.btnGhost} onClick={() => onEdit(c)}>Open</button>
            </div>
          </div>
        )
      })}
    </>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Campaigns() {
  const { profile } = useAuth()
  const { toast, showToast } = useToast(4000)

  const [tab, setTab] = useState('audience')
  const [draft, setDraft] = useState(blankDraft)
  const [templateId, setTemplateId] = useState(null)
  const [contacts, setContacts] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [detail, setDetail] = useState(null)
  const [sendEnabled, setSendEnabled] = useState(false)
  const [dailyCap, setDailyCap] = useState(null)
  const [loadingAudience, setLoadingAudience] = useState(true)
  const [loadingList, setLoadingList] = useState(true)
  const [busy, setBusy] = useState(false)
  // The last thing the sender actually told us about this campaign. Kept so the
  // Send tab can report `capped` / `message`, which the campaign row doesn't
  // carry. Cleared whenever a different campaign is loaded.
  const [lastSend, setLastSend] = useState(null)

  const locked = isLocked(draft)

  function set(patch) { setDraft(d => ({ ...d, ...patch })) }

  async function loadAudience() {
    // PAGED, and the order is part of the correctness, not a preference.
    //
    // This used to be a single .limit(5000). PostgREST caps every response at
    // its own db-max-rows (1000 here) and does NOT report that it truncated —
    // so the page silently held the first 1000 of 2,133 contacts and every
    // "N recipients match" count on screen was computed against that slice.
    //
    // The ordering made it far worse than a random 47% sample. Sorted by
    // last_job_at DESC the rows that survived were the most RECENT customers —
    // precisely the ones a "last job 9+ months ago" filter is designed to
    // exclude. The hedge audience read 111 when it was really 207: not a small
    // undercount, a systematic one that hid exactly the people being mailed.
    //
    // Also note the .order() below is what makes range paging safe at all.
    // Postgres gives no stable row order without ORDER BY, so an unordered
    // limit/offset scan can hand back the same row twice and never show
    // another. id is the tiebreak so the sort is total, not just on a column
    // with thousands of ties and NULLs.
    const PAGE = 1000
    const all = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from('campaign_audience_eligible')
        .select(AUDIENCE_COLS)
        .order('last_job_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) {
        showToast('Could not load the mailing list: ' + error.message, true)
        break
      }
      const page = data ?? []
      all.push(...page)
      if (page.length < PAGE) break
    }
    setContacts(all)
    setLoadingAudience(false)
  }
  async function loadCampaigns() {
    const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(100)
    const rows = data ?? []
    setCampaigns(rows)
    setLoadingList(false)

    // campaigns.stats is a SNAPSHOT written when a send run finishes. Opens and
    // clicks keep arriving for days afterwards, so the list sat there reporting
    // "1 opened" while the detail view — which calls campaign_stats live —
    // showed 9. Same campaign, two numbers, and the stale one is the one you
    // see first. Re-ask for anything that has actually been sent.
    const live = rows.filter(c => c.status !== 'draft' && c.status !== 'scheduled')
    if (!live.length) return
    const fresh = await Promise.all(live.map(async c => {
      const { data: st, error } = await supabase.rpc('campaign_stats', { p_campaign_id: c.id })
      return error ? null : { id: c.id, stats: st }
    }))
    const byId = new Map(fresh.filter(Boolean).map(r => [r.id, r.stats]))
    if (byId.size) setCampaigns(cs => cs.map(c => byId.has(c.id) ? { ...c, stats: byId.get(c.id) } : c))
  }
  async function loadSettings() {
    const { data } = await supabase.from('app_settings').select('key, value')
      .in('key', ['campaign_send_enabled', 'campaign_daily_cap'])
    for (const r of data ?? []) {
      if (r.key === 'campaign_send_enabled') setSendEnabled(r.value === true)
      if (r.key === 'campaign_daily_cap')    setDailyCap(Number(r.value) || null)
    }
  }

  useEffect(() => { loadAudience(); loadCampaigns(); loadSettings() }, [])

  const matched   = useMemo(() => contacts.filter(c => matchesAudience(c, draft.audience)), [contacts, draft.audience])
  const problems  = useMemo(() => validateCampaign(draft), [draft])
  const blockers  = useMemo(() => hardProblems(draft), [draft])
  const sample    = matched[0] ?? contacts[0] ?? null
  const suburbGap = useMemo(() => suburbCoverage(matched), [matched])
  const exampleContact = useMemo(
    () => Object.fromEntries(MERGE_TAGS.map(t => [t.tag, t.example])), [])

  const template = CAMPAIGN_TEMPLATES.find(t => t.id === templateId) ?? null

  // True when the body is still boilerplate — blank, the starter, or the
  // untouched copy of whichever template is currently loaded. Anything else is
  // the office's own writing and must not be thrown away without asking.
  function bodyIsUnedited() {
    const cur = (draft.body ?? '').trim()
    return cur === ''
      || cur === STARTER_BODY.trim()
      || cur === (template?.body ?? '').trim()
      || CAMPAIGN_TEMPLATES.some(t => cur === t.body.trim())
  }

  function applyTemplate(tpl) {
    if (!bodyIsUnedited() && !window.confirm(
      `Replace the copy you've written with “${tpl.name}”?\n\n`
      + 'The subject, preheader, body and audience will all be overwritten.'
    )) return

    const audience = { ...(tpl.audience ?? {}) }
    // Choose the subject against the audience this template actually targets,
    // not whatever was selected before — the two are being set together.
    const forThisTemplate = contacts.filter(c => matchesAudience(c, audience))
    const { subject, usedFallback, without } = chooseSubject(tpl, forThisTemplate)

    setTemplateId(tpl.id)
    setDraft(d => ({
      ...d,
      name: d.name || tpl.name,
      subject,
      preheader: tpl.preheader ?? '',
      body: tpl.body,
      audience,
      cta_url: CTA_URL,
    }))

    showToast(usedFallback
      ? `${tpl.name} · ${forThisTemplate.length.toLocaleString('en-NZ')} recipients — using the no-suburb subject (${without} have none on file)`
      : `${tpl.name} · ${forThisTemplate.length.toLocaleString('en-NZ')} recipients match`)
  }

  function startBlank() {
    if (!bodyIsUnedited() && !window.confirm('Clear the copy you\'ve written and start from blank?')) return
    setTemplateId(null)
    set({ subject: '', preheader: '', body: STARTER_BODY })
  }

  // Fills the code, percent and terms but deliberately NOT the expiry —
  // validateCampaign requires an explicit end date for a discount claim, and
  // auto-filling one would defeat the check it exists to make.
  function applyDefaultOffer() {
    set({
      offer_code: DEFAULT_OFFER.offer_code,
      offer_percent: DEFAULT_OFFER.offer_percent,
      offer_terms: DEFAULT_OFFER.offer_terms,
    })
    showToast('5% offer applied — now pick an expiry date')
  }

  // Persist the draft and return its id. Every send path goes through here, so
  // what went out is always the row that's on screen.
  async function persist(patch = {}) {
    // Hard backstop for the edit lock. The UI disables the fields, but every
    // send path funnels through here, so this is the one place that can
    // guarantee a mid-send campaign's copy is never rewritten underneath the
    // half of the list that already has it.
    if (isLocked(draft)) {
      throw new Error(draft.status === 'sending'
        ? 'This campaign is part-way through sending. Pause it first if you need to change anything.'
        : 'This campaign has already been sent — its row is the record of what went out. Copy it to a new draft instead.')
    }

    const row = {
      name: draft.name || 'Untitled campaign',
      subject: draft.subject,
      preheader: draft.preheader || null,
      body: draft.body,
      from_name: draft.from_name,
      from_email: draft.from_email,
      reply_to: draft.reply_to,
      audience: draft.audience ?? {},
      offer_code: draft.offer_code || null,
      offer_percent: draft.offer_percent === '' || draft.offer_percent == null ? null : Number(draft.offer_percent),
      offer_expires_on: draft.offer_expires_on || null,
      offer_terms: draft.offer_terms || null,
      cta_label: draft.cta_label,
      cta_url: draft.cta_url,
      ...patch,
    }
    if (draft.id) {
      const { error } = await supabase.from('campaigns').update(row).eq('id', draft.id)
      if (error) throw error
      set(patch)
      return draft.id
    }
    const { data, error } = await supabase.from('campaigns')
      .insert({ ...row, created_by: profile?.id ?? null }).select('id').single()
    if (error) throw error
    set({ id: data.id, ...patch })
    return data.id
  }

  async function saveDraft() {
    setBusy(true)
    try { await persist(); await loadCampaigns(); showToast('Saved') }
    catch (err) { showToast('Could not save: ' + err.message, true) }
    finally { setBusy(false) }
  }

  async function sendTest(email) {
    setBusy(true)
    try {
      const id = await persist()
      await callCampaignSend({ campaign_id: id, test_to: email })
      showToast(`Test sent to ${email}`)
    } catch (err) {
      showToast('Test send failed: ' + err.message, true)
    } finally { setBusy(false) }
  }

  // The edge function owns the status lifecycle once a real send starts
  // (sending → sent/failed), so we save the copy and hand over rather than
  // stamping a status here — otherwise a refused send (kill switch off) would
  // leave the row stuck reading "Sending…" forever.
  async function sendNow() {
    setBusy(true)
    let id = draft.id
    try {
      // Resuming a part-sent campaign deliberately does NOT re-save: the copy
      // the first half received has to be the copy the second half receives.
      const resuming = !!draft.id && draft.status === 'sending'
      id = resuming ? draft.id : await persist()
      const res = await callCampaignSend({ campaign_id: id })
      setLastSend(res)

      // Report what the sender said happened, not what we hoped would.
      const sent = Number(res.sent ?? 0)
      const left = Number(res.remaining ?? 0)
      if (res.capped) {
        showToast(res.message
          ?? `Sent ${sent.toLocaleString('en-NZ')} — daily cap reached, ${left.toLocaleString('en-NZ')} still queued`)
      } else if (left > 0) {
        showToast(`Sent ${sent.toLocaleString('en-NZ')} — ${left.toLocaleString('en-NZ')} still queued, it'll carry on`)
      } else {
        showToast(`Sent to ${sent.toLocaleString('en-NZ')} ${sent === 1 ? 'recipient' : 'recipients'}`)
      }
    } catch (err) {
      showToast('Send failed: ' + err.message, true)
    } finally {
      setBusy(false)
      await loadCampaigns()
      if (id) {
        // Pull stats as well as status: the Send tab reports sent / still-to-go
        // off this row, so a stale copy would show the wrong progress.
        const { data } = await supabase.from('campaigns').select('status, stats').eq('id', id).maybeSingle()
        if (data) set({ id, status: data.status ?? draft.status, stats: data.stats ?? {} })
      }
    }
  }

  // The explicit pause the edit lock asks for. Stops the scheduler picking the
  // campaign back up (it only resumes rows with status 'sending'), and unlocks
  // the composer.
  async function pauseCampaign() {
    if (!draft.id) return
    setBusy(true)
    try {
      const { error } = await supabase.from('campaigns').update({ status: 'paused' }).eq('id', draft.id)
      if (error) throw error
      set({ status: 'paused' })
      await loadCampaigns()
      showToast('Paused — nothing more goes out. You can edit the copy now, but anyone already mailed got the old version.')
    } catch (err) {
      showToast('Could not pause: ' + err.message, true)
    } finally { setBusy(false) }
  }

  // A sent campaign's row is the record of what went out, so it can't be
  // edited. Reusing the copy means taking a fresh, unsaved draft from it.
  function copyToNewDraft() {
    setDraft(d => ({
      ...d,
      id: null,
      name: `${d.name || 'Untitled campaign'} (copy)`,
      status: 'draft', scheduled_at: null, started_at: null, sent_at: null, stats: {},
    }))
    setLastSend(null)
    showToast('Copied to a new draft — nothing is saved until you hit Save draft')
  }

  async function schedule(iso) {
    if (!iso) { showToast('Pick a date and time first', true); return }
    setBusy(true)
    try {
      await persist({ status: 'scheduled', scheduled_at: iso })
      await loadCampaigns()
      showToast('Scheduled — it will go out automatically')
    } catch (err) {
      showToast('Could not schedule: ' + err.message, true)
    } finally { setBusy(false) }
  }

  function openForEdit(c) {
    // Re-attach the template a saved campaign came from, matched on its body, so
    // the picker highlights it and the suburb-fallback swap stays available.
    setTemplateId(CAMPAIGN_TEMPLATES.find(t => t.body.trim() === (c.body ?? '').trim())?.id ?? null)
    setDraft({
      ...blankDraft(), ...c,
      preheader: c.preheader ?? '', offer_code: c.offer_code ?? '',
      offer_percent: c.offer_percent ?? '', offer_expires_on: c.offer_expires_on ?? '',
      offer_terms: c.offer_terms ?? '', audience: c.audience ?? {},
    })
    setLastSend(null)
    setDetail(null)
    setTab('compose')
    if (isLocked(c)) {
      showToast(c.status === 'sending'
        ? 'Open for reading only — this campaign is part-way through sending. Pause it on the Send tab to edit.'
        : 'Open for reading only — this campaign has already gone out. Copy it to a new draft to reuse the copy.')
    }
  }

  return (
    <div style={s.shell}>
      <div style={s.header}>
        <div style={s.headerRow}>
          <h1 style={s.h1}>Campaigns</h1>
          <div style={s.headerRight}>
            {!sendEnabled && <span style={s.offPill}>Sending OFF</span>}
            {locked && <span style={s.lockPill}>Read-only · {CAMPAIGN_STATUS[draft.status]?.label ?? draft.status}</span>}
            <button style={s.btnGhost} onClick={() => { setDraft(blankDraft()); setTemplateId(null); setDetail(null); setLastSend(null); setTab('compose') }}>
              New campaign
            </button>
            <button style={s.btnPrimary} onClick={saveDraft} disabled={busy || locked}>{busy ? 'Saving…' : 'Save draft'}</button>
          </div>
        </div>
        <div style={s.tabs}>
          {TABS.map(([id, label]) => (
            <button key={id} style={{ ...s.tab, ...(tab === id ? s.tabActive : {}) }} onClick={() => setTab(id)}>
              {label}
              {id === 'send' && <span style={s.tabCount}> {matched.length.toLocaleString('en-NZ')}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={s.body}>
        {/* One banner, shown on whichever editing tab you land on, so the
            read-only state is never a mystery. */}
        {locked && (tab === 'audience' || tab === 'compose' || tab === 'preview') && (
          <div style={s.lockBox}>
            <div style={s.lockTitle}>
              {draft.status === 'sending'
                ? 'Locked — this campaign is part-way through sending'
                : 'Locked — this campaign has already been sent'}
            </div>
            <div style={s.lockBody}>
              {draft.status === 'sending'
                ? <>Some of the list already has this exact copy in their inbox, and each of those sends stores
                    a copy of what it said. Changing the subject, body or audience now would send the rest of the
                    list something different and break that record. Pause it first if you have to.</>
                : <>This row is the record of what went out. Copy it to a new draft if you want to reuse the copy.</>}
            </div>
            <div style={s.inlineRow}>
              {draft.status === 'sending'
                ? <button style={s.btnDanger} disabled={busy} onClick={pauseCampaign}>Pause so I can edit</button>
                : <button style={s.btnGhost} onClick={copyToNewDraft}>Copy to a new draft</button>}
              <button style={s.btnGhost} onClick={() => setTab('send')}>See send progress</button>
            </div>
          </div>
        )}

        {/* Importing the mailing list has nothing to do with the campaign
            being edited, so it sits outside the lock fieldset below — a
            part-sent campaign must not stop the office topping up the list. */}
        {tab === 'audience' && (
          <ImportPanel onImported={loadAudience} showToast={showToast} />
        )}

        {/* fieldset[disabled] disables every control inside it natively — the
            template picker, the chips and every input at once — so there is no
            way to type into a locked campaign and then be told "no" on save. */}
        <fieldset disabled={locked} style={s.lockFieldset}>
        {tab === 'audience' && (
          <AudienceTab
            contacts={contacts} loading={loadingAudience}
            audience={draft.audience ?? {}} setAudience={a => set({ audience: a })}
          />
        )}

        {tab === 'compose' && (
          <ComposeTab
            draft={draft} set={set} problems={problems}
            templateId={templateId} recipients={matched.length}
            onApplyTemplate={applyTemplate} onStartBlank={startBlank} onApplyOffer={applyDefaultOffer}
          />
        )}

        {tab === 'preview' && (
          <PreviewTab
            draft={draft}
            sample={sample ?? exampleContact}
            sampleIsReal={!!sample}
            template={template}
            suburbGap={suburbGap}
            onUseFallbackSubject={() => {
              set({ subject: template.subjectFallback })
              showToast('Subject swapped to the version that works without a suburb')
            }}
            onSendTest={sendTest}
            busy={busy}
          />
        )}

        </fieldset>

        {tab === 'send' && (
          <SendTab
            draft={draft} recipients={matched.length} sendEnabled={sendEnabled} dailyCap={dailyCap}
            problems={problems} blockers={blockers} busy={busy}
            lastSend={lastSend} locked={locked}
            onSendNow={sendNow} onSchedule={schedule} onPause={pauseCampaign}
          />
        )}

        {tab === 'results' && (
          detail
            ? <CampaignDetail campaign={detail} onBack={() => setDetail(null)} />
            : <ResultsTab campaigns={campaigns} loading={loadingList} onOpen={setDetail} onEdit={openForEdit} contacts={contacts} />
        )}
      </div>

      <Toast toast={toast} />
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = {
  shell:  { display: 'flex', flexDirection: 'column', height: '100%', background: '#F5F3F0', overflow: 'hidden' },
  header: { padding: '18px 32px 0', background: '#fff', borderBottom: '1px solid var(--line)', flexShrink: 0 },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
  h1:     { fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: '0 0 14px' },
  offPill:{ fontSize: 11, fontWeight: 800, color: '#C0392B', background: '#FDECEA', padding: '4px 10px', borderRadius: 'var(--radius-pill)' },
  tabs:   { display: 'flex', gap: 0, flexWrap: 'wrap' },
  tab:    { padding: '10px 16px', border: 'none', borderBottom: '2px solid transparent', background: 'none', fontSize: 13, fontWeight: 600, color: '#aaa', cursor: 'pointer', fontFamily: 'var(--font)', marginBottom: '-1px' },
  // The "on" variants repeat the full `border`/`borderBottom` shorthand rather
  // than overriding just the colour — mixing shorthand with longhand on a
  // rerender makes React warn and can drop the border entirely.
  tabActive: { color: 'var(--ink)', borderBottom: '2px solid var(--ink)' },
  tabCount:  { fontSize: 11, color: 'var(--terra)', fontWeight: 800 },
  body:   { flex: 1, overflowY: 'auto', padding: '20px 32px 60px', maxWidth: 820, width: '100%' },

  card:      { background: '#fff', border: '1.5px solid var(--border)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 },
  cardHead:  { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  cardTitle: { fontSize: 14, fontWeight: 800, color: 'var(--ink)' },
  sectionRule: { height: 1, background: 'var(--line)', margin: '4px 0' },
  subtle:    { fontSize: 12, color: '#8a8a8a', lineHeight: 1.55 },
  empty:     { color: '#bbb', fontSize: 13, padding: '18px 0' },
  counter:   { fontWeight: 700 },

  bigNum: { fontSize: 34, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 },
  tileRow:  { display: 'flex', gap: 8, flexWrap: 'wrap' },
  tile:     { flex: '1 1 110px', background: '#FAF8F5', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' },
  tileNum:  { fontSize: 19, fontWeight: 800, color: 'var(--ink)' },
  tileLabel:{ fontSize: 11, color: '#8a8a8a', marginTop: 2 },

  textarea: { padding: '12px 14px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13.5, color: 'var(--ink)', fontFamily: 'var(--font)', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.6 },
  input:    { padding: '9px 12px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--font)', outline: 'none', width: '100%', boxSizing: 'border-box' },
  field:    { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 160 },
  label:    { fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' },
  row2:     { display: 'flex', gap: 12, flexWrap: 'wrap' },
  inlineRow:{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },

  chipRow:  { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  chip:     { padding: '6px 12px', borderRadius: 'var(--radius-pill)', border: '1.5px solid var(--line)', background: '#fff', color: 'var(--ink)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  chipOn:   { border: '1.5px solid var(--terra)', background: 'var(--terra)', color: '#fff' },
  tagChip:  { padding: '5px 10px', borderRadius: 6, border: '1px dashed var(--line)', background: '#FAF8F5', color: 'var(--terra)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  countChip:{ padding: '4px 10px', borderRadius: 'var(--radius-pill)', background: '#F3EFEA', color: '#777', fontSize: 11.5, fontWeight: 600 },
  chipBadge:{ fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 'var(--radius-pill)' },

  matchBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 4 },
  matchNum: { fontSize: 16, fontWeight: 800, color: 'var(--terra)' },

  templateGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 },
  templateCard:     { display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left', padding: '11px 13px', borderRadius: 10, border: '1.5px solid var(--line)', background: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' },
  templateCardOn:   { border: '1.5px solid var(--terra)', background: 'var(--terra-wash)' },
  templateName:     { fontSize: 13, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3 },
  templateSubject:  { fontSize: 12, color: '#777', lineHeight: 1.4 },
  templateAudience: { fontSize: 11, color: '#a09a92', lineHeight: 1.4 },

  gapBox:    { background: '#FDECEA', border: '1.5px solid #F5C6C0', borderRadius: 12, padding: 16, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' },
  gapTitle:  { fontSize: 14, fontWeight: 800, color: '#C0392B' },
  gapBody:   { fontSize: 13, color: '#8f3a30', lineHeight: 1.6 },
  gapSample: { fontSize: 14, fontWeight: 700, color: 'var(--ink)', background: '#fff', border: '1px solid #F5C6C0', borderRadius: 8, padding: '10px 12px', whiteSpace: 'pre-wrap', width: '100%', boxSizing: 'border-box' },

  problemBox: { background: '#FDF3E3', border: '1px solid #F0DCB8', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 },
  problemHead:{ fontSize: 11, fontWeight: 800, color: '#7a5a12', textTransform: 'uppercase', letterSpacing: '0.05em' },
  problemLine:{ fontSize: 12.5, color: '#7a5a12', lineHeight: 1.5 },
  errBox:   { background: '#FDECEA', border: '1px solid #F5C6C0', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: '#C0392B', fontWeight: 600 },
  warnBox:  { background: '#FDF3E3', border: '1px solid #F0DCB8', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: '#7a5a12', lineHeight: 1.55 },
  okBox:    { background: '#E8F0E6', border: '1px solid #CFE0C9', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: '#3A5C2E', fontWeight: 600 },

  // Progress bar for a part-sent campaign.
  progressTrack: { height: 8, borderRadius: 'var(--radius-pill)', background: '#F0EDE8', overflow: 'hidden' },
  progressFill:  { height: '100%', background: 'var(--terra)', borderRadius: 'var(--radius-pill)', transition: 'width .3s' },

  // Read-only state for a campaign that is mid-send or already sent.
  lockPill:  { fontSize: 11, fontWeight: 800, color: '#7a5a12', background: '#FDF3E3', padding: '4px 10px', borderRadius: 'var(--radius-pill)' },
  // display:contents so the disabled wrapper adds no layout of its own; the
  // `disabled` attribute still propagates to every control inside it.
  lockFieldset: { display: 'contents', border: 'none', padding: 0, margin: 0, minWidth: 0 },
  lockBox:   { background: '#FDF3E3', border: '1.5px solid #F0DCB8', borderRadius: 12, padding: 16, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 },
  lockTitle: { fontSize: 14, fontWeight: 800, color: '#7a5a12' },
  lockBody:  { fontSize: 13, color: '#7a5a12', lineHeight: 1.6 },

  killBox:  { background: '#FDECEA', border: '1.5px solid #F5C6C0', borderRadius: 12, padding: 16, marginBottom: 20 },
  killTitle:{ fontSize: 14, fontWeight: 800, color: '#C0392B', marginBottom: 5 },
  killBody: { fontSize: 13, color: '#8f3a30', lineHeight: 1.6 },
  killLink: { color: '#C0392B', fontWeight: 800, textDecoration: 'underline' },

  summaryGrid: { display: 'flex', flexDirection: 'column', gap: 6 },
  summaryRow:  { display: 'flex', gap: 12, fontSize: 13, alignItems: 'baseline' },
  summaryKey:  { width: 96, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' },
  summaryVal:  { color: 'var(--ink)', lineHeight: 1.5, minWidth: 0 },

  confirmBox:  { border: '1.5px solid #C0392B', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: '#FFF9F8' },
  confirmLine: { fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 },

  // Import panel
  code:        { margin: 0, padding: '12px 14px', background: '#1E1B18', color: '#E8E2DA', borderRadius: 8, fontSize: 11, lineHeight: 1.55, fontFamily: 'ui-monospace, Menlo, monospace', whiteSpace: 'pre', overflowX: 'auto', maxHeight: 260, overflowY: 'auto' },
  btnDisabled: { background: '#DCD6CE', color: '#fff', cursor: 'not-allowed' },
  importResult:{ border: '1px solid var(--line)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, background: '#FAF8F5' },
  badgeDry:    { background: '#F3EFEA', color: '#777' },
  badgeLive:   { background: '#E8F0E6', color: '#3A5C2E' },
  sumTable:    { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  sumKey:      { textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '5px 10px 5px 0', whiteSpace: 'nowrap', verticalAlign: 'top' },
  sumVal:      { fontSize: 14, fontWeight: 800, color: 'var(--ink)', padding: '5px 12px 5px 0', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' },
  sumValBad:   { color: '#C0392B' },
  sumHint:     { fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.5, padding: '5px 0', width: '100%' },
  errRow:      { display: 'flex', gap: 8, fontSize: 12, color: '#C0392B', lineHeight: 1.5 },
  errRef:      { fontWeight: 800, flexShrink: 0 },
  sampleCard:  { background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 3 },
  sampleTop:   { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  sampleName:  { fontSize: 13, fontWeight: 800, color: 'var(--ink)' },
  sampleLine:  { fontSize: 12, color: '#777' },
  sampleSummary: { fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5, marginTop: 2 },
  sampleMissing: { color: '#bbb', fontStyle: 'italic' },

  actions:   { display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  btnPrimary:{ padding: '9px 18px', borderRadius: 7, border: 'none', background: 'var(--terra)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  btnDanger: { padding: '9px 18px', borderRadius: 7, border: 'none', background: '#C0392B', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font)' },
  btnGhost:  { padding: '9px 16px', borderRadius: 7, border: '1.5px solid var(--line)', background: '#fff', color: '#666', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  smallBtn:  { padding: '7px 12px', borderRadius: 6, border: '1.5px solid var(--terra)', background: 'var(--terra)', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },

  // Email preview
  mail:        { border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: '#fff' },
  mailHead:    { padding: '12px 16px', background: '#FAF8F5', borderBottom: '1px solid var(--line)' },
  mailFrom:    { fontSize: 12, color: '#8a8a8a', fontWeight: 600 },
  mailAddr:    { color: '#bbb', fontWeight: 400 },
  mailSubject: { fontSize: 15.5, fontWeight: 800, color: 'var(--ink)', marginTop: 4, lineHeight: 1.35 },
  mailPre:     { fontSize: 12.5, color: '#8a8a8a', marginTop: 3 },
  mailBody:    { padding: '18px 16px', fontSize: 14, color: 'var(--ink)', lineHeight: 1.65, whiteSpace: 'pre-wrap' },
  mailCta:     { padding: '0 16px 16px', textAlign: 'center' },
  mailCtaBtn:  { display: 'inline-block', background: 'var(--terra)', color: '#fff', padding: '11px 24px', borderRadius: 8, fontWeight: 800, fontSize: 14 },
  mailCtaUrl:  { fontSize: 11, color: '#bbb', marginTop: 6, wordBreak: 'break-all' },
  mailOffer:   { margin: '0 16px 16px', padding: '10px 12px', background: 'var(--terra-wash)', borderRadius: 8, fontSize: 12.5, color: 'var(--terra-deep)', lineHeight: 1.5, fontWeight: 600 },
  mailFooter:  { padding: '12px 16px', borderTop: '1px solid var(--line)', background: '#FAF8F5', fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.7 },
  mailUnsub:   { textDecoration: 'underline', color: '#666', fontWeight: 600 },

  // Results list
  listRow:      { display: 'flex', gap: 12, alignItems: 'center', padding: 14, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, marginBottom: 8 },
  listTitleRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  listName:     { fontSize: 14, fontWeight: 800, color: 'var(--ink)' },
  listSubject:  { fontSize: 12.5, color: '#777', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  listMeta:     { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6, fontSize: 11.5, color: '#999' },
  listActions:  { display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 },

  eventRow:  { display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid #F5F1EB', fontSize: 12.5 },
  eventKind: { fontWeight: 700, color: 'var(--ink)', width: 96, flexShrink: 0 },
  eventWho:  { color: '#666', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  eventUrl:  { color: '#aaa', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  eventWhen: { color: '#bbb', fontSize: 11, flexShrink: 0 },
}
