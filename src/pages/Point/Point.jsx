import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'

// Utils de storage (iguais aos usados no Map.jsx)
const STORE_PREFIX = 'bloomstack.points/'
function loadPointsFromStorage() {
  const out = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(STORE_PREFIX)) {
      try {
        const raw = localStorage.getItem(key)
        const doc = raw ? JSON.parse(raw) : null
        if (doc && typeof doc.lat === 'number' && typeof doc.lng === 'number') out.push(doc)
      } catch {}
    }
  }
  return out
}
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
function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const A = Math.sin(dLat/2)**2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng/2)**2
  const c = 2 * Math.atan2(Math.sqrt(A), Math.sqrt(1 - A))
  return R * c
}

export default function PointPage() {
  const { slug } = useParams()
  const all = useMemo(loadPointsFromStorage, [])
  const point = all.find(p => p.slug === slug)

  const [photoUrl, setPhotoUrl] = useState(point?.photoUrl || '')
  const [description, setDescription] = useState(point?.description || '')
  const [distanceKm, setDistanceKm] = useState(null)

  useEffect(() => {
    if (!point) return
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const d = haversineKm(latitude, longitude, point.lat, point.lng)
        setDistanceKm(d)
      },
      () => setDistanceKm(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }, [point?.id])

  function saveMeta() {
    if (!point) return
    const updated = updatePointInStorage(point.id, { photoUrl: photoUrl.trim(), description: description.trim() })
    if (!updated) return alert('Falha ao salvar.')
    alert('Salvo!')
  }

  if (!point) {
    return (
      <div style={{ padding: 16 }}>
        <p>Ponto não encontrado.</p>
        <Link to="/maps">Voltar ao mapa</Link>
      </div>
    )
  }

  const title = point.label?.trim() || '(sem rótulo)'
  const img = photoUrl || point.photoUrl || `https://placehold.co/1200x480?text=${encodeURIComponent(title)}`
  const capAt = point.capturedAt ? new Date(point.capturedAt) : null
  const capEnv = point.captureEnv || null

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        {/* Alterado: ações agrupadas incluindo "Ver no mapa" */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link to={`/maps?slug=${encodeURIComponent(point.slug)}`}>Ver no mapa</Link>
          <Link to="/maps">Voltar ao mapa</Link>
        </div>
      </header>

      <img src={img} alt={`Foto de ${title}`} style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid #e5e7eb' }} />

      {/* NOVO: Condições no momento da foto */}
      <section style={{ display: 'grid', gap: 8, padding: 12, border: '1px solid #e5e7eb', borderRadius: 12, background: '#ffffff' }}>
        <strong>Condições no momento da foto</strong>
        <div style={{ color: '#64748b', fontSize: 13 }}>
          Capturada em: {capAt ? capAt.toLocaleString() : '—'}
        </div>
        {capEnv ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ background:'#ecfeff', border:'1px solid #bae6fd', color:'#075985', padding:'4px 8px', borderRadius:999, fontSize:12 }}>
              Vento: {capEnv.windSpeed != null ? `${capEnv.windSpeed} km/h` : '—'}
            </span>
            <span style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', color:'#334155', padding:'4px 8px', borderRadius:999, fontSize:12 }}>
              Dir.: {capEnv.windDir != null ? `${Math.round(capEnv.windDir)}°` : '—'}
            </span>
            <span style={{ background:'#eef2ff', border:'1px solid #c7d2fe', color:'#3730a3', padding:'4px 8px', borderRadius:999, fontSize:12 }}>
              Umidade: {capEnv.humidity != null ? `${capEnv.humidity}%` : '—'}
            </span>
            <span style={{ background:'#f8fafc', border:'1px solid #e2e8f0', color:'#0f172a', padding:'4px 8px', borderRadius:999, fontSize:12 }}>
              PM2.5 {capEnv.pm25 != null ? `${capEnv.pm25} µg/m³` : '—'}
            </span>
            <span style={{ background:'#f8fafc', border:'1px solid #e2e8f0', color:'#0f172a', padding:'4px 8px', borderRadius:999, fontSize:12 }}>
              PM10 {capEnv.pm10 != null ? `${capEnv.pm10} µg/m³` : '—'}
            </span>
            <span style={{ background:'#f8fafc', border:'1px solid #e2e8f0', color:'#0f172a', padding:'4px 8px', borderRadius:999, fontSize:12 }}>
              O₃ {capEnv.o3 != null ? `${capEnv.o3} µg/m³` : '—'}
            </span>
            <span style={{ background:'#ecfccb', border:'1px solid #d9f99d', color:'#365314', padding:'4px 8px', borderRadius:999, fontSize:12 }}>
              Pólen (Grama): {capEnv?.pollen?.grass ?? '—'}
            </span>
            <span style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', color:'#14532d', padding:'4px 8px', borderRadius:999, fontSize:12 }}>
              Pólen (Árvores): {capEnv?.pollen?.tree ?? '—'}
            </span>
            <span style={{ background:'#fff7ed', border:'1px solid #fed7aa', color:'#7c2d12', padding:'4px 8px', borderRadius:999, fontSize:12 }}>
              Pólen (Ervas): {capEnv?.pollen?.weed ?? '—'}
            </span>
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>Sem dados de clima na captura.</div>
        )}
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <strong>Descrição</strong>
        <textarea
          rows={4}
          placeholder="Escreva uma descrição..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
        />
        <label style={{ display: 'grid', gap: 6 }}>
          <span>URL da foto</span>
          <input
            type="url"
            placeholder="https://..."
            value={photoUrl}
            onChange={e => setPhotoUrl(e.target.value)}
            style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
        </label>
        <button onClick={saveMeta} style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#00ff22ff', width: 'fit-content' }}>
          Salvar
        </button>
      </section>

      <section style={{ color: '#475569' }}>
        <div><strong>Coordenadas:</strong> {point.lat.toFixed(6)}, {point.lng.toFixed(6)}</div>
        <div><strong>Distância até você:</strong> {distanceKm == null ? '—' : `${distanceKm.toFixed(2)} km`}</div>
      </section>
    </div>
  )
}
