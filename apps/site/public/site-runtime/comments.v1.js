;(() => {
  const sections = document.querySelectorAll('[data-comments]')
  if (!sections.length) return

  const safeText = (value, maximum) =>
    String(value ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .trim()
      .slice(0, maximum)

  const initialize = (section) => {
    const origin = section.dataset.commentOrigin?.replace(/\/$/, '')
    const slug = section.dataset.comments
    const status = section.querySelector('[data-comment-status]')
    const list = section.querySelector('[data-comment-list]')
    const form = section.querySelector('[data-comment-form]')
    if (!origin || !slug || !status || !list) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 4_000)
    fetch(`${origin}/v1/threads/${encodeURIComponent(slug)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error()),
      )
      .then((payload) => {
        const comments = Array.isArray(payload.comments) ? payload.comments : []
        list.replaceChildren(
          ...comments.map((comment) => {
            const item = document.createElement('li')
            const author = document.createElement('strong')
            const body = document.createElement('p')
            author.textContent = safeText(comment.authorName, 80)
            body.textContent = safeText(comment.body, 2_000)
            item.append(author, body)
            return item
          }),
        )
        status.textContent = comments.length
          ? `${comments.length} approved comment${comments.length === 1 ? '' : 's'}`
          : 'No approved comments yet.'
      })
      .catch(() => {
        status.textContent = 'Comments are temporarily unavailable.'
      })
      .finally(() => window.clearTimeout(timeout))

    if (!(form instanceof HTMLFormElement)) return
    let verificationToken = ''
    section.addEventListener('publisher:verification-token', (event) => {
      verificationToken = safeText(event.detail?.token, 4096)
      const input = form.elements.namedItem('verificationToken')
      if (input instanceof HTMLInputElement) input.value = verificationToken
    })
    const resetVerification = () => {
      verificationToken = ''
      const input = form.elements.namedItem('verificationToken')
      if (input instanceof HTMLInputElement) input.value = ''
      section.dispatchEvent(new CustomEvent('publisher:verification-reset'))
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const formData = new FormData(form)
      const submitStatus = form.querySelector('[data-comment-submit-status]')
      verificationToken = safeText(
        formData.get('verificationToken') || verificationToken,
        4096,
      )
      if (!verificationToken) {
        if (submitStatus)
          submitStatus.textContent = 'Complete human verification first.'
        return
      }
      fetch(`${origin}/v1/threads/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorName: formData.get('authorName'),
          body: formData.get('body'),
          verificationToken,
        }),
      })
        .then((response) => {
          if (!response.ok) throw new Error()
          form.reset()
          resetVerification()
          if (submitStatus)
            submitStatus.textContent = 'Submitted for moderation.'
        })
        .catch(() => {
          resetVerification()
          if (submitStatus)
            submitStatus.textContent = 'Comment submission failed. Try again.'
        })
    })
  }

  if (typeof IntersectionObserver === 'undefined') {
    for (const section of sections) initialize(section)
    return
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      observer.unobserve(entry.target)
      initialize(entry.target)
    }
  })
  for (const section of sections) observer.observe(section)
})()
