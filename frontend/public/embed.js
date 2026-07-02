/* Urban Tree Services — website quote form embed.
 * Paste this on any website to show the "Request a free quote" form:
 *   <script src="https://app.urbantreeservices.net/embed.js" async></script>
 * The form is an isolated iframe (won't clash with your site's CSS) and
 * auto-resizes to fit. Submissions land straight in the TreeCo pipeline. */
(function () {
  var ORIGIN = 'https://app.urbantreeservices.net'
  var current = document.currentScript
  var iframe = document.createElement('iframe')
  iframe.src = ORIGIN + '/book?embed=1'
  iframe.title = 'Request a free quote — Urban Tree Services'
  iframe.setAttribute('scrolling', 'no')
  iframe.style.cssText = 'width:100%;max-width:560px;margin:0 auto;display:block;border:none;overflow:hidden;min-height:1050px;'
  if (current && current.parentNode) current.parentNode.insertBefore(iframe, current)
  else document.body.appendChild(iframe)

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data || e.data.type !== 'uts-book-height') return
    if (typeof e.data.height === 'number' && e.data.height > 200) {
      iframe.style.height = (e.data.height + 24) + 'px'
    }
  })
})();
