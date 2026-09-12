;(() => {
  const root = document.querySelector('[data-static-search]')
  const input = root?.querySelector('#site-search')
  const count = root?.querySelector('[data-search-count]')
  if (!(input instanceof HTMLInputElement) || !count) return
  const rows = [...root.querySelectorAll('[data-search-text]')]
  const update = () => {
    const query = input.value.trim().toLocaleLowerCase()
    let visible = 0
    for (const row of rows) {
      const match = !query || (row.dataset.searchText ?? '').includes(query)
      row.hidden = !match
      if (match) visible += 1
    }
    count.textContent = `${visible} result${visible === 1 ? '' : 's'}`
  }
  input.addEventListener('input', update)
  update()
})()
