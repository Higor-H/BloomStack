import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './Map.css'

// "Prefixo" para simular arquivos JSON no storage (uma chave por arquivo)
const STORE_PREFIX = 'bloomstack.points/'

// Gera um ID simples para nome de arquivo
function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Salva um ponto como JSON em uma chave separada do localStorage
function savePointToStorage({ lat, lng, label }) {
  const id = genId()
  const doc = { id, lat, lng, label: label || '', createdAt: new Date().toISOString() }
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

export default function MapPage() {
  const mapRef = useRef(null)
  const mapInst = useRef(null)
  const userLayer = useRef(null)

  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [label, setLabel] = useState('')

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

    // Carrega pontos salvos do storage e renderiza (sem pan e sem salvar de novo)
    const saved = loadPointsFromStorage()
    saved.forEach(p => addPoint(p.lat, p.lng, p.label, { save: false, pan: false }))

    return () => { map.remove() }
  }, [])

  // Adiciona ponto no mapa. Opções:
  // - save: salva no storage como JSON
  // - pan: centraliza o mapa no ponto
  function addPoint(latNum, lngNum, lbl, opts = { save: true, pan: true }) {
    if (!mapInst.current || !userLayer.current) return
    const marker = L.circleMarker([latNum, lngNum], {
      radius: 7, color: '#059669', weight: 2, fillColor: '#10b981', fillOpacity: 0.7
    }).addTo(userLayer.current)
    if (lbl) marker.bindPopup(lbl)
    if (opts.pan) mapInst.current.setView([latNum, lngNum], 15)
    if (opts.save) savePointToStorage({ lat: latNum, lng: lngNum, label: lbl })
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
      </form>

      <div ref={mapRef} className="map-root" role="img" aria-label="Mapa com localização e pontos" />
    </div>
  )
}
