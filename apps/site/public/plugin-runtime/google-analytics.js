;(() => {
  const measurementId = document
    .querySelector('meta[name="publisher-google-analytics-id"]')
    ?.getAttribute('content')
  if (!measurementId || !/^G-[A-Z0-9]{4,32}$/.test(measurementId)) return
  if (document.querySelector('script[data-publisher-google-analytics]')) return

  const loadGoogleTag = () => {
    if (document.querySelector('script[data-publisher-google-analytics]'))
      return
    window.dataLayer = window.dataLayer || []
    window.gtag =
      window.gtag ||
      function () {
        window.dataLayer.push(arguments)
      }
    window.gtag('js', new Date())
    window.gtag('config', measurementId)

    const tag = document.createElement('script')
    tag.async = true
    tag.dataset.publisherGoogleAnalytics = 'true'
    tag.src =
      'https://www.googletagmanager.com/gtag/js?id=' +
      encodeURIComponent(measurementId)
    tag.addEventListener('error', () => {})
    document.head.append(tag)
  }

  if (window.__publisherConsent?.analytics !== false) loadGoogleTag()
  window.addEventListener('publisher:consent', (event) => {
    if (event.detail?.analytics === true) loadGoogleTag()
  })
})()
