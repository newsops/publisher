;(() => {
  const widgets = document.querySelectorAll('[data-turnstile-widget]')
  if (!widgets.length) return

  const scriptOrigin = 'https://challenges.cloudflare.com'
  let apiPromise

  const loadApi = () => {
    if (window.turnstile?.render) return Promise.resolve(window.turnstile)
    if (apiPromise) return apiPromise
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `${scriptOrigin}/turnstile/v0/api.js?render=explicit`
      script.async = true
      script.defer = true
      script.onload = () =>
        window.turnstile?.render
          ? resolve(window.turnstile)
          : reject(new Error('Turnstile API unavailable'))
      script.onerror = () => reject(new Error('Turnstile API unavailable'))
      document.head.append(script)
    })
    return apiPromise
  }

  for (const widget of widgets) {
    const section = widget.closest('[data-comments]')
    const sitekey = widget.dataset.turnstileSiteKey
    const status = section?.querySelector('[data-turnstile-status]')
    if (!section || !sitekey) continue
    let widgetId
    const reset = () => {
      if (widgetId !== undefined && window.turnstile?.reset)
        window.turnstile.reset(widgetId)
    }
    section.addEventListener('publisher:verification-reset', reset)
    loadApi()
      .then((turnstile) => {
        widgetId = turnstile.render(widget, {
          sitekey,
          callback: (token) => {
            section.dispatchEvent(
              new CustomEvent('publisher:verification-token', {
                detail: { token },
              }),
            )
            if (status) status.textContent = ''
          },
          'error-callback': () => {
            if (status)
              status.textContent =
                'Human verification is unavailable. Try again.'
          },
          'expired-callback': reset,
        })
      })
      .catch(() => {
        if (status)
          status.textContent = 'Human verification is unavailable. Try again.'
      })
  }
})()
