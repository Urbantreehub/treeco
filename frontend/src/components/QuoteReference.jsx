import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../config/supabase'

export default function QuoteReference({ jobId, readOnly = false }) {
  const [loading, setLoading] = useState(true)
  const [images, setImages] = useState([])
  const [description, setDescription] = useState('')
  const [saveState, setSaveState] = useState('idle') // 'idle' | 'saving' | 'saved'
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(null) // url of image being viewed

  const fetchImages = useCallback(async () => {
    const { data, error: imgErr } = await supabase
      .from('job_photos')
      .select('id, url, caption')
      .eq('job_id', jobId)
      .order('created_at')
    if (!imgErr) setImages(data ?? [])
  }, [jobId])

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      const { data: job, error: jobErr } = await supabase
        .from('jobs').select('description').eq('id', jobId).single()
      await fetchImages()
      if (cancelled) return
      if (jobErr) setError('Could not load reference data.')
      else if (job) setDescription(job.description ?? '')
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [jobId, fetchImages])

  async function handleSave() {
    setSaveState('saving')
    setError('')
    const { error: upErr } = await supabase
      .from('jobs')
      .update({ description })
      .eq('id', jobId)
    if (upErr) {
      setError(`Save failed: ${upErr.message}`)
      setSaveState('idle')
      return
    }
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 2000)
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploading(true)
    setError('')
    for (const file of files) {
      try {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `reference/${jobId}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('quote-images')
          .upload(path, file, { contentType: file.type || undefined })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from('quote-images').getPublicUrl(path)
        const url = pub.publicUrl
        const { error: insErr } = await supabase
          .from('job_photos')
          .insert({ job_id: jobId, url, caption: file.name })
        if (insErr) throw insErr
      } catch (err) {
        setError(`Upload failed: ${err.message || err}`)
      }
    }
    await fetchImages()
    setUploading(false)
    e.target.value = '' // allow re-selecting the same file
  }

  if (!jobId) return null

  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>Quote Reference</div>
        <span style={styles.badge}>Internal — not shown on the quote</span>
      </div>

      {loading ? (
        <div style={styles.muted}>Loading…</div>
      ) : (
        <>
          {/* Images */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Reference Images</div>
            {images.length > 0 ? (
              <div style={styles.grid}>
                {images.map(img => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setLightbox(img.url)}
                    style={styles.thumbBtn}
                    title={img.caption || 'View image'}
                  >
                    <img src={img.url} alt={img.caption || 'reference'} style={styles.thumb} />
                  </button>
                ))}
              </div>
            ) : (
              <div style={styles.muted}>No reference images yet.</div>
            )}

            {!readOnly && (
              <div style={{ marginTop: '10px' }}>
                <label style={styles.uploadBtn}>
                  {uploading ? 'Uploading…' : '+ Add images'}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={uploading}
                    onChange={handleUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Description */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Description</div>
            {readOnly ? (
              description
                ? <div style={styles.textBlock}>{description}</div>
                : <div style={styles.muted}>No description recorded.</div>
            ) : (
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                placeholder="Access notes, scope, tree details, hazards, equipment needed…"
                style={styles.textarea}
              />
            )}
          </div>

          {/* Save (editable only) */}
          {!readOnly && (
            <div style={styles.section}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saveState === 'saving'}
                style={styles.primaryBtn}
              >
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : 'Save'}
              </button>
            </div>
          )}

          {error && <div style={styles.error}>{error}</div>}
        </>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div style={styles.lightboxBackdrop} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="reference" style={styles.lightboxImg} onClick={e => e.stopPropagation()} />
          <button type="button" onClick={() => setLightbox(null)} style={styles.lightboxClose}>✕</button>
        </div>
      )}
    </div>
  )
}

const styles = {
  card: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '18px 20px',
  },
  header: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
    marginBottom: '4px',
  },
  title: { fontSize: '16px', fontWeight: '700', color: 'var(--bark)' },
  badge: {
    fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px',
    color: '#B26A00', background: '#FDF3E3', border: '1px solid #E8C98A',
    borderRadius: '20px', padding: '3px 10px',
  },
  section: {
    borderTop: '1px solid var(--border)', paddingTop: '14px', marginTop: '14px',
  },
  sectionTitle: {
    fontSize: '11px', fontWeight: '600', color: '#888', marginBottom: '8px',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: '8px',
  },
  thumbBtn: {
    padding: 0, border: '1px solid var(--border)', borderRadius: '8px',
    overflow: 'hidden', cursor: 'pointer', background: 'var(--cream)', aspectRatio: '1',
  },
  thumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  uploadBtn: {
    display: 'inline-block', background: 'none', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: '600',
    color: 'var(--bark)', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  textBlock: {
    fontSize: '14px', color: 'var(--bark)', lineHeight: 1.5, whiteSpace: 'pre-wrap',
  },
  textarea: {
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    border: '1px solid var(--border)', fontSize: '14px',
    fontFamily: 'var(--font)', color: 'var(--bark)',
    background: 'var(--cream)', boxSizing: 'border-box', resize: 'vertical',
  },
  primaryBtn: {
    background: 'var(--moss)', color: '#fff', border: 'none',
    borderRadius: '8px', padding: '9px 20px', fontSize: '14px',
    fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  summary: {
    fontSize: '13px', fontWeight: '600', color: 'var(--bark)', cursor: 'pointer',
  },
  enquiry: {
    marginTop: '8px', fontSize: '12px', color: 'var(--bark)', lineHeight: 1.5,
    whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    background: 'var(--cream)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '10px 12px', overflowX: 'auto',
  },
  muted: { fontSize: '13px', color: '#aaa', fontStyle: 'italic' },
  error: {
    marginTop: '12px', fontSize: '13px', color: '#C0392B',
    background: '#FFF0EE', border: '1px solid #C0392B33',
    borderRadius: '8px', padding: '8px 12px',
  },
  lightboxBackdrop: {
    position: 'fixed', inset: 0, background: 'rgba(44,36,22,0.75)',
    zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '24px', cursor: 'zoom-out',
  },
  lightboxImg: {
    maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.4)', cursor: 'default',
  },
  lightboxClose: {
    position: 'fixed', top: '20px', right: '24px', background: 'rgba(255,255,255,0.9)',
    border: 'none', borderRadius: '50%', width: '36px', height: '36px',
    fontSize: '16px', cursor: 'pointer', color: '#2C2416',
  },
}
