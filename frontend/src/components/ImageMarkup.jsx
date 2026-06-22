import { useRef, useState, useEffect, useCallback } from 'react'
import { supabase } from '../config/supabase'
import { v4 as uuid } from 'uuid'

const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#fff', '#000']
const WIDTHS = [2, 4, 7, 12]
const TOOLS = [
  { id: 'arrow',   label: '↗ Arrow' },
  { id: 'line',    label: '— Line' },
  { id: 'rect',    label: '□ Box' },
  { id: 'free',    label: '✏ Draw' },
  { id: 'text',    label: 'T Text' },
]

function drawArrow(ctx, from, to, color, lw) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const angle = Math.atan2(dy, dx)
  const head = Math.max(14, lw * 3.5)

  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'round'

  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawLine(ctx, from, to, color, lw) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.restore()
}

function drawRect(ctx, from, to, color, lw) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y)
  ctx.restore()
}

function drawFree(ctx, points, color, lw) {
  if (points.length < 2) return
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  points.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
  ctx.stroke()
  ctx.restore()
}

function drawText(ctx, text, pos, color, size) {
  ctx.save()
  ctx.fillStyle = color
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'
  ctx.lineWidth = 3
  ctx.font = `bold ${size}px -apple-system, sans-serif`
  ctx.strokeText(text, pos.x, pos.y)
  ctx.fillText(text, pos.x, pos.y)
  ctx.restore()
}

function renderShape(ctx, shape) {
  if (shape.type === 'arrow') drawArrow(ctx, shape.from, shape.to, shape.color, shape.lw)
  else if (shape.type === 'line') drawLine(ctx, shape.from, shape.to, shape.color, shape.lw)
  else if (shape.type === 'rect') drawRect(ctx, shape.from, shape.to, shape.color, shape.lw)
  else if (shape.type === 'free') drawFree(ctx, shape.points, shape.color, shape.lw)
  else if (shape.type === 'text') drawText(ctx, shape.text, shape.pos, shape.color, shape.lw * 6 + 12)
}

export default function ImageMarkup({ imageUrl, onSave, onClose }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const [tool, setTool] = useState('arrow')
  const [color, setColor] = useState('#FF3B30')
  const [lw, setLw] = useState(4)
  const [shapes, setShapes] = useState([])
  const [drawing, setDrawing] = useState(false)
  const [current, setCurrent] = useState(null)
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 })
  const [saving, setSaving] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [textPos, setTextPos] = useState(null)
  const [showTextInput, setShowTextInput] = useState(false)

  // Load image and size canvas
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imgRef.current = img
      const maxW = window.innerWidth * 0.82
      const maxH = window.innerHeight * 0.72
      const ratio = Math.min(maxW / img.width, maxH / img.height, 1)
      setCanvasSize({ w: Math.round(img.width * ratio), h: Math.round(img.height * ratio) })
    }
    img.src = imageUrl
  }, [imageUrl])

  // Redraw canvas whenever shapes or current shape changes
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    shapes.forEach(s => renderShape(ctx, s))
    if (current) renderShape(ctx, current)
  }, [shapes, current])

  useEffect(() => { redraw() }, [redraw, canvasSize])

  function getPos(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY }
  }

  function onMouseDown(e) {
    e.preventDefault()
    if (tool === 'text') {
      setTextPos(getPos(e))
      setShowTextInput(true)
      return
    }
    const pos = getPos(e)
    setDrawing(true)
    if (tool === 'free') {
      setCurrent({ type: 'free', points: [pos], color, lw })
    } else {
      setCurrent({ type: tool, from: pos, to: pos, color, lw })
    }
  }

  function onMouseMove(e) {
    e.preventDefault()
    if (!drawing || !current) return
    const pos = getPos(e)
    if (tool === 'free') {
      setCurrent(prev => ({ ...prev, points: [...prev.points, pos] }))
    } else {
      setCurrent(prev => ({ ...prev, to: pos }))
    }
  }

  function onMouseUp(e) {
    e.preventDefault()
    if (!drawing || !current) return
    setDrawing(false)
    setShapes(prev => [...prev, current])
    setCurrent(null)
  }

  function commitText() {
    if (!textInput.trim() || !textPos) { setShowTextInput(false); return }
    setShapes(prev => [...prev, { type: 'text', pos: textPos, text: textInput, color, lw }])
    setTextInput('')
    setShowTextInput(false)
    setTextPos(null)
  }

  function undo() {
    setShapes(prev => prev.slice(0, -1))
  }

  function clear() {
    setShapes([])
    setCurrent(null)
  }

  async function handleSave() {
    setSaving(true)
    const canvas = canvasRef.current
    // Make sure final state is drawn
    const img = imgRef.current
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    shapes.forEach(s => renderShape(ctx, s))

    canvas.toBlob(async (blob) => {
      const path = `${uuid()}.jpg`
      const { error } = await supabase.storage.from('quote-images').upload(path, blob, { contentType: 'image/jpeg' })
      if (!error) {
        const { data } = supabase.storage.from('quote-images').getPublicUrl(path)
        onSave(data.publicUrl)
      }
      setSaving(false)
    }, 'image/jpeg', 0.92)
  }

  return (
    <div style={m.overlay}>
      <div style={m.modal}>
        {/* Top toolbar */}
        <div style={m.toolbar}>
          <div style={m.toolGroup}>
            <span style={m.groupLabel}>Tool</span>
            {TOOLS.map(t => (
              <button
                key={t.id}
                style={{ ...m.toolBtn, ...(tool === t.id ? m.toolBtnActive : {}) }}
                onClick={() => setTool(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={m.toolGroup}>
            <span style={m.groupLabel}>Colour</span>
            {COLORS.map(c => (
              <button
                key={c}
                style={{
                  ...m.colorBtn,
                  background: c,
                  border: color === c ? '3px solid #007AFF' : '2px solid rgba(0,0,0,0.2)',
                  boxShadow: color === c ? '0 0 0 2px #fff' : 'none',
                }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          <div style={m.toolGroup}>
            <span style={m.groupLabel}>Weight</span>
            {WIDTHS.map(w => (
              <button
                key={w}
                style={{ ...m.weightBtn, ...(lw === w ? m.weightBtnActive : {}) }}
                onClick={() => setLw(w)}
              >
                <span style={{ display: 'block', background: '#fff', height: `${w}px`, width: '22px', borderRadius: '2px' }} />
              </button>
            ))}
          </div>

          <div style={m.toolGroup}>
            <button style={m.actionBtn} onClick={undo} disabled={shapes.length === 0} title="Undo">↩ Undo</button>
            <button style={m.actionBtn} onClick={clear} disabled={shapes.length === 0}>✕ Clear</button>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button style={m.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={m.saveBtn} onClick={handleSave} disabled={saving || shapes.length === 0}>
              {saving ? 'Saving…' : '✓ Save markup'}
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div style={m.canvasWrap}>
          <canvas
            ref={canvasRef}
            width={canvasSize.w}
            height={canvasSize.h}
            style={{
              ...m.canvas,
              cursor: tool === 'text' ? 'text' : tool === 'free' ? 'crosshair' : 'crosshair',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onMouseDown}
            onTouchMove={onMouseMove}
            onTouchEnd={onMouseUp}
          />

          {/* Text input overlay */}
          {showTextInput && textPos && (
            <div style={{
              position: 'absolute',
              left: `${textPos.x * (canvasRef.current?.getBoundingClientRect().width / canvasSize.w || 1) + canvasRef.current?.getBoundingClientRect().left - (canvasRef.current?.parentElement?.getBoundingClientRect().left || 0)}px`,
              top: `${textPos.y * (canvasRef.current?.getBoundingClientRect().height / canvasSize.h || 1) + canvasRef.current?.getBoundingClientRect().top - (canvasRef.current?.parentElement?.getBoundingClientRect().top || 0)}px`,
              zIndex: 10,
            }}>
              <div style={{ display: 'flex', gap: '6px', background: '#2C2416', padding: '6px', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
                <input
                  autoFocus
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setShowTextInput(false) }}
                  placeholder="Type label…"
                  style={{ padding: '6px 10px', borderRadius: '5px', border: 'none', fontSize: '14px', width: '160px', outline: 'none' }}
                />
                <button onClick={commitText} style={{ background: '#007AFF', color: '#fff', border: 'none', borderRadius: '5px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Add</button>
              </div>
            </div>
          )}
        </div>

        <div style={m.hint}>
          {tool === 'text' ? 'Click on the image to place text' : 'Click and drag to draw'}
          {shapes.length > 0 && <span style={{ marginLeft: '16px', color: '#4A9EFF' }}>{shapes.length} mark{shapes.length !== 1 ? 's' : ''} added</span>}
        </div>
      </div>
    </div>
  )
}

const m = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 500,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: '#1C1C1E', borderRadius: '14px', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', maxHeight: '96vh', maxWidth: '96vw',
    boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
  },
  toolbar: {
    background: '#2C2C2E', padding: '10px 14px', display: 'flex',
    alignItems: 'center', gap: '16px', flexWrap: 'wrap', flexShrink: 0,
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  toolGroup: { display: 'flex', alignItems: 'center', gap: '6px' },
  groupLabel: { fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '2px' },
  toolBtn: {
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px', padding: '5px 10px', color: 'rgba(255,255,255,0.7)',
    fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: '500',
    transition: 'background 0.15s',
  },
  toolBtnActive: { background: '#007AFF', border: '1px solid #007AFF', color: '#fff' },
  colorBtn: { width: '22px', height: '22px', borderRadius: '50%', cursor: 'pointer', transition: 'transform 0.1s' },
  weightBtn: {
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px', padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center',
  },
  weightBtnActive: { background: '#333', border: '1px solid #007AFF' },
  actionBtn: {
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px', padding: '5px 10px', color: 'rgba(255,255,255,0.7)',
    fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  cancelBtn: {
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '7px', padding: '7px 14px', color: 'rgba(255,255,255,0.7)',
    fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  saveBtn: {
    background: '#34C759', border: 'none', borderRadius: '7px',
    padding: '7px 16px', color: '#fff', fontSize: '13px', fontWeight: '700',
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  canvasWrap: {
    position: 'relative', overflow: 'auto', flex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
  },
  canvas: {
    display: 'block', borderRadius: '4px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    touchAction: 'none',
  },
  hint: {
    padding: '8px 14px', fontSize: '11px', color: 'rgba(255,255,255,0.35)',
    background: '#2C2C2E', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
  },
}
