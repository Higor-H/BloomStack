const STORE_PREFIX = 'bloomstack.points/'

// Helpers de slug
function slugify(s = '') {
  return String(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
function ensureUniqueSlug(allDocs, baseSlug, idHint) {
  let slug = baseSlug || `p-${Date.now()}`
  const taken = new Set(allDocs.filter(d => d.id !== idHint).map(d => d.slug))
  let i = 1
  while (taken.has(slug)) slug = `${baseSlug}-${i++}`
  return slug
}
function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Salvar ponto
export function savePoint({ lat, lng, label, description, photoUrl, capturedAt, captureEnv }) {
  const id = genId()
  const all = loadPoints()
  const baseSlug = slugify(label) || `p-${Number(lat).toFixed(5)}-${Number(lng).toFixed(5)}`
  const slug = ensureUniqueSlug(all, baseSlug, id)
  const doc = {
    id, slug, lat: Number(lat), lng: Number(lng),
    label: label || '',
    createdAt: new Date().toISOString(),
    photoUrl: photoUrl || '',
    description: description || '',
    // NOVO: informações da captura
    capturedAt: capturedAt || new Date().toISOString(),
    captureEnv: captureEnv || null
  }
  try {
    localStorage.setItem(`${STORE_PREFIX}${id}.json`, JSON.stringify(doc))
  } catch (e) {
    console.warn('Falha ao salvar ponto no storage', e)
  }
  return doc
}

// Carregar pontos (garante slug e migra se faltar)
export function loadPoints() {
  const list = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(STORE_PREFIX)) {
      try {
        const raw = localStorage.getItem(key)
        const doc = raw ? JSON.parse(raw) : null
        if (doc && typeof doc.lat === 'number' && typeof doc.lng === 'number') list.push(doc)
      } catch {}
    }
  }
  // migração de slug ausente
  const out = list.map(p => {
    if (!p.slug) {
      const others = list.filter(d => d.id !== p.id)
      const base = p.label ? slugify(p.label) : `p-${p.lat.toFixed(5)}-${p.lng.toFixed(5)}`
      const slug = ensureUniqueSlug(others, base, p.id)
      const fixed = { ...p, slug }
      try { localStorage.setItem(`${STORE_PREFIX}${p.id}.json`, JSON.stringify(fixed)) } catch {}
      return fixed
    }
    return p
  })
  return out.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
}

export function clearAllPoints() {
  const toDel = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(STORE_PREFIX)) toDel.push(key)
  }
  toDel.forEach(k => localStorage.removeItem(k))
}

export function updatePoint(id, patch) {
  const key = `${STORE_PREFIX}${id}.json`
  const raw = localStorage.getItem(key)
  if (!raw) return false
  try {
    const current = JSON.parse(raw)
    const next = { ...current, ...patch }
    // se label alterado e não veio slug, recalcula
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'label') && (!patch.slug || patch.slug === current.slug)) {
      const others = loadPoints().filter(p => p.id !== id)
      const base = slugify(next.label || '')
      if (base) next.slug = ensureUniqueSlug(others, base, id)
    }
    localStorage.setItem(key, JSON.stringify(next))
    return true
  } catch (e) {
    console.warn('Falha ao atualizar ponto', e)
    return false
  }
}

export function removePoint(id) {
  localStorage.removeItem(`${STORE_PREFIX}${id}.json`)
}
