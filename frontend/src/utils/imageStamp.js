// Resize a photo and (optionally) burn a location + date/time stamp into it,
// returning a JPEG Blob. Downer jobs stamp every uploaded image with the job
// address and capture date/time (plus GPS) — the MyWork guide requires it.
// Spencers (and residential) photos are uploaded without a stamp.

export function getGPS() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }),
      () => resolve(null),
      { timeout: 8000, enableHighAccuracy: true },
    )
  })
}

// Build the stamp for a portal job: { address, coords, datetime }.
export async function buildStamp(address) {
  const gps = await getGPS()
  const now = new Date()
  const datetime = now.toLocaleString('en-NZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  return { address: address || '', coords: gps ? `${gps.lat}, ${gps.lng}` : null, datetime }
}

// Resize to max 1600px wide and, if `stamp` is given, draw a two-line caption:
//   line 1: date/time  ·  GPS coords (when available)
//   line 2: job address (location)
// Returns a JPEG Blob (quality 0.75). Falls back to the original file on error.
export function stampImage(file, stamp = null) {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1600
      let { naturalWidth: w, naturalHeight: h } = img
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)

      if (stamp) {
        const line1 = [stamp.datetime, stamp.coords].filter(Boolean).join('   ·   ')
        const line2 = stamp.address || ''
        const lines = [line1, line2].filter(Boolean)
        const pad = 8
        const fh = Math.max(14, Math.round(w / 55))
        ctx.font = `bold ${fh}px monospace`
        const stripH = lines.length * (fh + 4) + pad * 2
        ctx.fillStyle = 'rgba(0,0,0,0.72)'
        ctx.fillRect(0, h - stripH, w, stripH)
        ctx.fillStyle = '#ffffff'
        ctx.textBaseline = 'top'
        lines.forEach((line, i) => {
          ctx.fillText(line, pad, h - stripH + pad + i * (fh + 4), w - pad * 2)
        })
      }

      canvas.toBlob(blob => { URL.revokeObjectURL(url); resolve(blob) }, 'image/jpeg', 0.75)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}
