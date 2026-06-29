export async function downloadPdf(elementRef, filename = 'quote.pdf') {
  const el = elementRef.current
  if (!el) return

  // Load the heavy PDF libs on demand — only when the user actually downloads,
  // so they never weigh down initial page load.
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  // Capture at 2× scale for sharp text
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
  })

  const imgData = canvas.toDataURL('image/jpeg', 0.95)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgW = pageW
  const imgH = (canvas.height * imgW) / canvas.width

  let yPos = 0
  let remaining = imgH

  // Paginate: slice canvas across A4 pages
  while (remaining > 0) {
    pdf.addImage(imgData, 'JPEG', 0, -yPos, imgW, imgH)
    remaining -= pageH
    yPos += pageH
    if (remaining > 0) pdf.addPage()
  }

  pdf.save(filename)
}
