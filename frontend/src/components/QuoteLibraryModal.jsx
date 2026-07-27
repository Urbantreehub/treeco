import { useState, useEffect, useCallback } from 'react'
import { v4 as uuid } from 'uuid'
import { supabase } from '../config/supabase'

function nzd(v) {
  if (v == null || v === '') return '—'
  return '$' + Number(v).toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// Turn a library item into a fresh quote line item.
function itemFromSaved(si) {
  return { id: uuid(), description: si.description, detail: si.detail ?? '', qty: 1, rate: si.rate ?? '', optional: false, selected: true, images: [], image_url: null }
}
function lineTotal(items) {
  return (items ?? []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0)
}

// Reusable content picker: apply/save quote templates, and insert/save
// price-library items. Self-contained data layer; calls back to mutate the
// quote being built.
export default function QuoteLibraryModal({ open, onClose, items, notes, onInsertItems, onApplyTemplate, userId }) {
  const [tab, setTab] = useState('templates')
  const [templates, setTemplates] = useState([])
  const [library, setLibrary] = useState([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // Inline "new" forms
  const [tplName, setTplName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newRate, setNewRate] = useState('')

  const load = useCallback(async () => {
    const [tRes, lRes] = await Promise.all([
      supabase.from('quote_templates').select('*').order('name'),
      supabase.from('saved_items').select('*').order('description'),
    ])
    setTemplates(tRes.data ?? [])
    setLibrary(lRes.data ?? [])
  }, [])

  useEffect(() => { if (open) { load(); setMsg('') } }, [open, load])

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  // ── Templates ───────────────────────────────────────────────────────────
  async function saveAsTemplate() {
    const name = tplName.trim()
    if (!name) { flash('Name the template first'); return }
    if (!items?.length) { flash('Add some line items first'); return }
    setBusy(true)
    const { error } = await supabase.from('quote_templates').insert({
      name, line_items: items, notes: notes ?? null, created_by: userId ?? null,
    })
    setBusy(false)
    if (error) { flash(error.message); return }
    setTplName('')
    flash('Template saved')
    load()
  }

  function applyTemplate(t) {
    const fresh = (t.line_items ?? []).map(i => ({ ...i, id: uuid() }))
    onApplyTemplate({ line_items: fresh, notes: t.notes })
    flash(`Applied “${t.name}” — ${fresh.length} item${fresh.length === 1 ? '' : 's'}`)
  }

  async function deleteTemplate(id) {
    if (!window.confirm('Delete this template?')) return
    await supabase.from('quote_templates').delete().eq('id', id)
    load()
  }

  // ── Library ─────────────────────────────────────────────────────────────
  async function addLibraryItem() {
    const description = newDesc.trim()
    if (!description) { flash('Enter a description'); return }
    setBusy(true)
    const { error } = await supabase.from('saved_items').insert({
      description, rate: newRate === '' ? 0 : Number(newRate), created_by: userId ?? null,
    })
    setBusy(false)
    if (error) { flash(error.message); return }
    setNewDesc(''); setNewRate('')
    flash('Added to library')
    load()
  }

  async function saveCurrentToLibrary() {
    const rows = (items ?? []).filter(i => (i.description || '').trim())
    if (!rows.length) { flash('No line items to save'); return }
    setBusy(true)
    const { error } = await supabase.from('saved_items').insert(
      rows.map(i => ({ description: i.description, detail: i.detail ?? null, rate: Number(i.rate) || 0, created_by: userId ?? null }))
    )
    setBusy(false)
    if (error) { flash(error.message); return }
    flash(`Saved ${rows.length} item${rows.length === 1 ? '' : 's'} to library`)
    load()
  }

  async function deleteLibraryItem(id) {
    await supabase.from('saved_items').delete().eq('id', id)
    load()
  }

  if (!open) return null

  const term = search.trim().toLowerCase()
  const filteredLib = term
    ? library.filter(i => (i.description + ' ' + (i.category ?? '')).toLowerCase().includes(term))
    : library

  return (
    <div style={st.scrim} onClick={onClose}>
      <div style={st.modal} onClick={e => e.stopPropagation()}>
        <div style={st.head}>
          <span style={st.title}>Quote library</span>
          <button onClick={onClose} style={st.x}>✕</button>
        </div>

        <div style={st.tabs}>
          <button style={{ ...st.tab, ...(tab === 'templates' ? st.tabOn : null) }} onClick={() => setTab('templates')}>
            Templates <span style={st.tabCount}>{templates.length}</span>
          </button>
          <button style={{ ...st.tab, ...(tab === 'library' ? st.tabOn : null) }} onClick={() => setTab('library')}>
            Item library <span style={st.tabCount}>{library.length}</span>
          </button>
        </div>

        {msg && <div style={st.msg}>{msg}</div>}

        <div style={st.body}>
          {tab === 'templates' ? (
            <>
              <div style={st.newRow}>
                <input style={st.input} placeholder="Save current quote as a template — name it…"
                  value={tplName} onChange={e => setTplName(e.target.value)} />
                <button style={st.primaryBtn} disabled={busy} onClick={saveAsTemplate}>Save template</button>
              </div>
              {templates.length === 0 ? (
                <div style={st.empty}>No templates yet. Build a quote, then save it here to reuse.</div>
              ) : templates.map(t => (
                <div key={t.id} style={st.row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={st.rowTitle}>{t.name}</div>
                    <div style={st.rowSub}>
                      {(t.line_items?.length ?? 0)} item{(t.line_items?.length ?? 0) === 1 ? '' : 's'} · {nzd(lineTotal(t.line_items))}
                      {t.description ? ` · ${t.description}` : ''}
                    </div>
                  </div>
                  <button style={st.applyBtn} onClick={() => applyTemplate(t)}>Apply</button>
                  <button style={st.trash} title="Delete" onClick={() => deleteTemplate(t.id)}>🗑</button>
                </div>
              ))}
            </>
          ) : (
            <>
              <div style={st.newRow}>
                <input style={{ ...st.input, flex: 2 }} placeholder="New item description…"
                  value={newDesc} onChange={e => setNewDesc(e.target.value)} />
                <input style={{ ...st.input, width: 90 }} placeholder="Rate" type="number"
                  value={newRate} onChange={e => setNewRate(e.target.value)} />
                <button style={st.primaryBtn} disabled={busy} onClick={addLibraryItem}>Add</button>
              </div>
              <div style={st.toolRow}>
                <input style={{ ...st.input, flex: 1 }} placeholder="Search library…"
                  value={search} onChange={e => setSearch(e.target.value)} />
                <button style={st.ghostBtn} disabled={busy} onClick={saveCurrentToLibrary}>Save current items →</button>
              </div>
              {filteredLib.length === 0 ? (
                <div style={st.empty}>{library.length === 0 ? 'Library is empty. Add reusable priced items here.' : 'No items match.'}</div>
              ) : filteredLib.map(i => (
                <div key={i.id} style={st.row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={st.rowTitle}>{i.description}</div>
                    <div style={st.rowSub}>{nzd(i.rate)}{i.category ? ` · ${i.category}` : ''}</div>
                  </div>
                  <button style={st.applyBtn} onClick={() => { onInsertItems([itemFromSaved(i)]); flash('Added to quote') }}>Add</button>
                  <button style={st.trash} title="Delete" onClick={() => deleteLibraryItem(i.id)}>🗑</button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const st = {
  scrim: { position: 'fixed', inset: 0, background: 'rgba(44,36,22,0.42)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { background: '#fff', borderRadius: 14, width: 560, maxWidth: '96vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden', fontFamily: 'var(--font)' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 18px', borderBottom: '1px solid var(--border)' },
  title: { fontSize: 15, fontWeight: 800, color: 'var(--bark)' },
  x: { background: 'none', border: 'none', fontSize: 18, color: '#bbb', cursor: 'pointer' },
  tabs: { display: 'flex', gap: 6, padding: '10px 18px 0' },
  tab: { background: 'none', border: 'none', borderBottom: '2px solid transparent', padding: '7px 6px', fontSize: 13.5, fontWeight: 700, color: '#8A857D', cursor: 'pointer', fontFamily: 'var(--font)' },
  tabOn: { color: 'var(--bark)', borderBottomColor: 'var(--terra)' },
  tabCount: { fontSize: 11, fontWeight: 700, background: 'var(--bg)', color: '#8A857D', borderRadius: 999, padding: '1px 7px', marginLeft: 4 },
  msg: { margin: '10px 18px 0', background: '#E8F0E6', color: '#4A6741', fontSize: 12.5, fontWeight: 600, padding: '7px 11px', borderRadius: 7 },
  body: { padding: '12px 18px 18px', overflowY: 'auto' },
  newRow: { display: 'flex', gap: 8, marginBottom: 10 },
  toolRow: { display: 'flex', gap: 8, marginBottom: 12 },
  input: { flex: 1, border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13, color: 'var(--bark)', fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box' },
  primaryBtn: { background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' },
  ghostBtn: { background: '#fff', color: 'var(--bark)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)' },
  rowTitle: { fontSize: 13.5, fontWeight: 600, color: 'var(--bark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowSub: { fontSize: 11.5, color: '#8A857D', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  applyBtn: { background: '#fff', border: '1px solid var(--moss)', color: 'var(--moss)', borderRadius: 6, padding: '6px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0 },
  trash: { background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', opacity: 0.55, flexShrink: 0 },
  empty: { color: '#8A857D', fontSize: 13, padding: '20px 4px', textAlign: 'center' },
}
