import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './Map.css'

// "Prefixo" para simular arquivos JSON no storage (uma chave por arquivo)
const STORE_PREFIX = 'bloomstack.points/'
// Helpers de slug/escape
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
function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}

// Gera um ID simples para nome de arquivo
function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Salva um ponto como JSON em uma chave separada do localStorage (agora com slug, foto e descrição)
function savePointToStorage({ lat, lng, label }) {
  const id = genId()
  const all = loadPointsFromStorage()
  const baseSlug = slugify(label) || `p-${lat.toFixed(5)}-${lng.toFixed(5)}`
  const slug = ensureUniqueSlug(all, baseSlug, id)
  const doc = {
    id, slug, lat, lng,
    label: label || '',
    createdAt: new Date().toISOString(),
    photoUrl: '', description: ''
  }
  try {
    localStorage.setItem(`${STORE_PREFIX}${id}.json`, JSON.stringify(doc))
  } catch (e) {
    console.warn('Falha ao salvar ponto no storage', e)
  }
  return doc
}

// Lista todos os pontos salvos (cada um é um JSON separado)
function loadPointsFromStorage() {
  const out = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(STORE_PREFIX)) {
      try {
        const raw = localStorage.getItem(key)
        const doc = raw ? JSON.parse(raw) : null
        if (doc && typeof doc.lat === 'number' && typeof doc.lng === 'number') out.push(doc)
      } catch { /* ignora JSON inválido */ }
    }
  }
  return out.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
}

// Remove todos os “arquivos” de pontos
function clearPointsFromStorage() {
  const toDel = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(STORE_PREFIX)) toDel.push(key)
  }
  toDel.forEach((k) => localStorage.removeItem(k))
}

// NOVO: atualizar um ponto no storage (já existente no arquivo)
function updatePointInStorage(id, patch) {
  const key = `${STORE_PREFIX}${id}.json`
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    const current = JSON.parse(raw)
    const next = { ...current, ...patch }
    localStorage.setItem(key, JSON.stringify(next))
    return next
  } catch { return null }
}

// NOVO: remover um ponto específico do storage (já existente no arquivo)
function removePointFromStorage(id) {
  localStorage.removeItem(`${STORE_PREFIX}${id}.json`)
}

export default function MapPage() {
  const mapRef = useRef(null)
  const mapInst = useRef(null)
  const userLayer = useRef(null)

  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [label, setLabel] = useState('')
  // NOVO: estado da lista e visibilidade do popup
  const [points, setPoints] = useState([])
  const [showList, setShowList] = useState(false)

  // NOVO: recarrega pontos do storage e redesenha marcadores (com migração de slug)
  function refreshPoints({ pan = false } = {}) {
    const all = loadPointsFromStorage().map((p) => {
      if (!p.slug) {
        const allNoSelf = loadPointsFromStorage().filter(d => d.id !== p.id)
        const base = p.label ? slugify(p.label) : `p-${p.lat.toFixed(5)}-${p.lng.toFixed(5)}`
        const slug = ensureUniqueSlug(allNoSelf, base, p.id)
        const fixed = { ...p, slug }
        localStorage.setItem(`${STORE_PREFIX}${p.id}.json`, JSON.stringify(fixed))
        return fixed
      }
      return p
    })

    setPoints?.(all) // se existir no arquivo (em versões com lista)
    if (!userLayer.current) return

    userLayer.current.clearLayers()
    all.forEach(p => {
      const m = L.circleMarker([p.lat, p.lng], {
        radius: 7, color: '#059669', weight: 2, fillColor: '#10b981', fillOpacity: 0.7
      }).addTo(userLayer.current)

      const html = `
        <div style="min-width:180px">
          <div style="font-weight:600;margin-bottom:4px">${escapeHtml(p.label || '(sem rótulo)')}</div>
          <div style="font-size:12px;color:#64748b;margin-bottom:6px">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>
          <a href="/${encodeURIComponent(p.slug)}"
             style="display:inline-block;padding:4px 8px;border:1px solid #e5e7eb;border-radius:6px;background:#f8fafc;text-decoration:none;color:#111827">
             Ver detalhes
          </a>
        </div>
      `
      m.bindPopup(html)
    })

    if (pan && all.length && mapInst.current) {
      const last = all[all.length - 1]
      mapInst.current.setView([last.lat, last.lng], 15)
    }
  }

  useEffect(() => {
    if (!mapRef.current) return
    const map = L.map(mapRef.current).setView([0, 0], 2)
    mapInst.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)

    userLayer.current = L.layerGroup().addTo(map)

    // Geolocalização do usuário (não persiste)
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords
          const here = [latitude, longitude]
          map.setView(here, 15)
          L.circleMarker(here, {
            radius: 8, color: '#2563eb', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.7
          }).addTo(map).bindPopup('Você está aqui').openPopup()
          if (Number.isFinite(accuracy)) {
            L.circle(here, { radius: accuracy, color: '#60a5fa', weight: 1, fillOpacity: 0.12 }).addTo(map)
          }
        },
        () => console.warn('Não foi possível obter a localização.'),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    }

    // Carrega e desenha do storage (com slugs/popups de detalhes)
    refreshPoints({ pan: false })

    return () => { map.remove() }
  }, [])

  // Adiciona ponto e salva, depois redesenha (popups já terão o botão)
  function addPoint(latNum, lngNum, lbl, opts = { save: true, pan: true }) {
    if (!mapInst.current || !userLayer.current) return
    if (opts.save) {
      savePointToStorage({ lat: latNum, lng: lngNum, label: lbl })
      refreshPoints({ pan: opts.pan })
    } else {
      // ...existing code for non-saved marker if needed...
      const marker = L.circleMarker([latNum, lngNum], {
        radius: 7, color: '#059669', weight: 2, fillColor: '#10b981', fillOpacity: 0.7
      }).addTo(userLayer.current)
      if (lbl) marker.bindPopup(escapeHtml(lbl))
      if (opts.pan) mapInst.current.setView([latNum, lngNum], 15)
    }
  }

  // Utilitários no console
  useEffect(() => {
    window.addMapPoint = (a, b, c) => addPoint(a, b, c) // window.addMapPoint(lat, lng, label?)
    window.listMapPoints = () => loadPointsFromStorage()
    return () => { delete window.addMapPoint; delete window.listMapPoints }
  }, [])

  function onSubmit(e) {
    e.preventDefault()
    const latNum = parseFloat(String(lat).replace(',', '.'))
    const lngNum = parseFloat(String(lng).replace(',', '.'))
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return alert('Coordenadas inválidas.')
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return alert('Fora do intervalo válido.')
    addPoint(latNum, lngNum, label?.trim(), { save: true, pan: true })
  }

  function clearPoints() {
    if (userLayer.current) userLayer.current.clearLayers()
    if (confirm('Também remover os pontos salvos no navegador?')) {
      clearPointsFromStorage()
    }
    // Após limpar storage (se confirmado), também atualiza lista
    refreshPoints({ pan: false })
  }

  // NOVO: focar no mapa
  function handleShow(id) {
    const doc = points.find(p => p.id === id)
    if (!doc || !mapInst.current) return
    mapInst.current.setView([doc.lat, doc.lng], 15)
  }

  // NOVO: editar ponto
  function handleEdit(id) {
    const doc = points.find(p => p.id === id)
    if (!doc) return
    const newLabel = prompt('Rótulo', doc.label || '')
    if (newLabel === null) return
    const newLat = prompt('Latitude (-90..90)', String(doc.lat)); if (newLat === null) return
    const newLng = prompt('Longitude (-180..180)', String(doc.lng)); if (newLng === null) return
    const latNum = parseFloat(String(newLat).replace(',', '.'))
    const lngNum = parseFloat(String(newLng).replace(',', '.'))
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return alert('Coordenadas inválidas.')
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return alert('Fora do intervalo válido.')

    const others = loadPointsFromStorage().filter(p => p.id !== id)
    const base = slugify(newLabel)
    const newSlug = base ? ensureUniqueSlug(others, base, id) : doc.slug
    const updated = updatePointInStorage(id, { label: newLabel.trim(), lat: latNum, lng: lngNum, slug: newSlug })
    if (!updated) return alert('Falha ao atualizar o ponto.')
    refreshPoints({ pan: true })
  }

  // NOVO: excluir ponto
  function handleDelete(id) {
    const doc = points.find(p => p.id === id)
    if (!doc) return
    if (!confirm(`Excluir o ponto "${doc.label || '(sem rótulo)'}"?`)) return
    removePointFromStorage(id)
    refreshPoints({ pan: false })
  }

  return (
    <div className="map-page">
      <form onSubmit={onSubmit} className="map-form" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input
          type="text" inputMode="decimal" placeholder="Lat (-90 a 90)"
          value={lat} onChange={(e) => setLat(e.target.value)}
          style={{ padding: '6px 8px' }}
        />
        <input
          type="text" inputMode="decimal" placeholder="Lng (-180 a 180)"
          value={lng} onChange={(e) => setLng(e.target.value)}
          style={{ padding: '6px 8px' }}
        />
        <input
          type="text" placeholder="Rótulo (opcional)"
          value={label} onChange={(e) => setLabel(e.target.value)}
          style={{ padding: '6px 8px' }}
        />
        <button type="submit" style={{ padding: '6px 10px' }}>Cadastrar ponto</button>
        <button type="button" onClick={clearPoints} style={{ padding: '6px 10px' }}>Limpar</button>
        {/* NOVO: botão para abrir popup de lista */}
        <button type="button" onClick={() => setShowList(true)} style={{ padding: '6px 10px', marginLeft: 8 }}>
          Meus pontos
        </button>
      </form>

      <div ref={mapRef} className="map-root" role="img" aria-label="Mapa com localização e pontos" />

      {/* NOVO: Popup com a lista de pontos */}
      {showList && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowList(false) }}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Pontos cadastrados">
            <div className="modal__header">
              <strong>Pontos cadastrados</strong>
              <button className="modal__btn" onClick={() => setShowList(false)}>Fechar</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <small style={{ color: '#64748b' }}>{points.length} itens</small>
              <button className="modal__btn" onClick={() => refreshPoints({ pan: false })}>Atualizar</button>
            </div>

            {points.length === 0 && <div style={{ color: '#94a3b8' }}>Nenhum ponto cadastrado.</div>}

            {points.map(p => (
              <div key={p.id} className="modal__list-item">
                <div style={{ display: 'grid' }}>
                  <span style={{ fontWeight: 600 }}>{p.label?.trim() || '(sem rótulo)'}</span>
                  <small style={{ color: '#64748b' }}>{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</small>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="modal__btn modal__btn--ok" onClick={() => handleShow(p.id)}>Mostrar</button>
                  <button className="modal__btn" onClick={() => handleEdit(p.id)}>Editar</button>
                  <button className="modal__btn modal__btn--warn" onClick={() => handleDelete(p.id)}>Excluir</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
