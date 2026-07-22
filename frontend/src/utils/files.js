// Shared file-type helpers for the upload surfaces.
//
// Attachments are no longer image-only — arborist reports, council consents and
// site plans arrive as PDFs — so anywhere that used to assume "uploaded file =
// image" now has to branch on type.

// Value for an <input type="file"> accept attribute. image/* keeps the camera
// option on mobile; the explicit extensions are there because some Android
// browsers ignore the application/pdf MIME on its own.
export const FILE_ACCEPT = 'image/*,application/pdf,.pdf'

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp']

export function extOf(nameOrUrl = '') {
  // Strip query/hash first — Supabase public URLs can carry a ?token=.
  const clean = String(nameOrUrl).split(/[?#]/)[0]
  const last = clean.split('/').pop() ?? ''
  if (!last.includes('.')) return ''
  return last.split('.').pop().toLowerCase()
}

export function isPdf(nameOrUrl = '') {
  return extOf(nameOrUrl) === 'pdf'
}

export function isImage(nameOrUrl = '') {
  return IMAGE_EXTS.includes(extOf(nameOrUrl))
}

// Files that must not go through the canvas resize pipeline — that path decodes
// via <img>, which fails on a PDF and silently yields a corrupt .jpg.
export function isResizableImage(file) {
  if (!file) return false
  if (file.type === 'application/pdf') return false
  if (file.type?.startsWith('image/')) return true
  return isImage(file.name)
}
