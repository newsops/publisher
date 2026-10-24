;(() => {
  const KEY = 'publisher.consent.analytics'
  const readStored = () => {
    try {
      const stored = localStorage.getItem(KEY)
      return stored === 'granted' || stored === 'denied' ? stored : null
    } catch {
      return null
    }
  }
  const store = (decision) => {
    try {
      localStorage.setItem(KEY, decision)
    } catch {}
  }

  const apply = (granted) => {
    window.__publisherConsent = Object.assign({}, window.__publisherConsent, {
      analytics: granted,
    })
    window.dispatchEvent(
      new CustomEvent('publisher:consent', { detail: { analytics: granted } }),
    )
  }

  const button = (label, key) => {
    const element = document.createElement('button')
    element.setAttribute('type', 'button')
    element.className = 'consent-action'
    element.dataset[key] = 'true'
    element.textContent = label
    return element
  }

  const removeLayer = () => {
    document.querySelector('[data-consent-layer]')?.remove()
  }

  const mountReopen = () => {
    if (document.querySelector('[data-consent-reopen]')) return
    const control = button('Privacy settings', 'consentReopen')
    control.className = ''
    control.addEventListener('click', () => open(readStored()))
    const host = document.querySelector('.footer-bar-inner') ?? document.body
    host.append(control)
  }

  const decide = (decision) => {
    store(decision)
    apply(decision === 'granted')
    removeLayer()
    mountReopen()
  }

  function open(current) {
    removeLayer()
    const layer = document.createElement('div')
    layer.dataset.consentLayer = 'true'
    layer.setAttribute('role', 'region')
    layer.setAttribute('aria-label', 'Analytics consent')
    const message = document.createElement('p')
    message.textContent =
      'We load Google Analytics only if you allow it. Nothing is sent before you choose.'
    const actions = document.createElement('div')
    actions.className = 'consent-actions'
    const allow = button('Allow analytics', 'consentAllow')
    allow.addEventListener('click', () => decide('granted'))
    const reject = button('Reject', 'consentReject')
    reject.addEventListener('click', () => decide('denied'))
    const settings = button('Settings', 'consentSettings')
    settings.addEventListener('click', () => {
      if (layer.querySelector('[data-consent-state]')) return
      const state = document.createElement('p')
      state.dataset.consentState = 'true'
      state.textContent =
        'Stored choice: ' +
        (current === 'granted'
          ? 'analytics allowed'
          : current === 'denied'
            ? 'analytics rejected'
            : 'not set') +
        '. Only this preference is stored, on this site, in your browser.'
      layer.append(state)
    })
    actions.append(allow, reject, settings)
    layer.append(message, actions)
    document.body.append(layer)
  }

  const stored = readStored()
  if (stored === 'granted') apply(true)
  if (stored === null) open(null)
  else mountReopen()
})()