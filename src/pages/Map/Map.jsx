import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './Map.css'
import Camera from '../Camera/Camera.jsx' // NOVO: componente de câmera

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
function savePointToStorage({ lat, lng, label, description, photoUrl }) {
  const id = genId()
  const all = loadPointsFromStorage()
  const baseSlug = slugify(label) || `p-${lat.toFixed(5)}-${lng.toFixed(5)}`
  const slug = ensureUniqueSlug(all, baseSlug, id)
  const doc = {
    id, slug, lat, lng,
    label: label || '',
    createdAt: new Date().toISOString(),
    photoUrl: photoUrl || '',
    description: description || ''
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

// Data para NASA GIBS (usa “ontem” para garantir disponibilidade)
function getGibsDate() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}
// Limites de data GIBS
const GIBS_MIN_DATE = '2000-02-24'
function clampGibsDate(str) {
  if (!str) return getGibsDate()
  const min = new Date(GIBS_MIN_DATE).getTime()
  const max = new Date(getGibsDate()).getTime()
  const t = new Date(str).getTime()
  if (Number.isNaN(t)) return getGibsDate()
  if (t < min) return GIBS_MIN_DATE
  if (t > max) return getGibsDate()
  return new Date(t).toISOString().slice(0, 10)
}

// Helpers para camadas base (OSM e NASA GIBS)
function buildOsmLayer() {
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  })
}
function buildGibsLayer(date = getGibsDate()) {
  return L.tileLayer(
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
    { tileSize: 256, minZoom: 1, maxZoom: 9, attribution: 'Imagery © NASA GIBS/ESDIS' }
  )
}
function buildBaseLayer(kind, date) {
  return kind === 'gibs' ? buildGibsLayer(date) : buildOsmLayer()
}

// NOVO: overlays NASA GIBS voltados a blooms (Chlorophyll-a)
function buildNasaOverlay(kind, date = getGibsDate()) {
  if (!kind || kind === 'none') return null
  const base = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'
  const byKind = {
    viirs_chla: `${base}/VIIRS_SNPP_Chlorophyll_A/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`,
    modis_chla: `${base}/MODIS_Aqua_Chlorophyll_A/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`,
  }
  const url = byKind[kind]
  if (!url) return null
  return L.tileLayer(url, {
    tileSize: 256, minZoom: 1, maxZoom: 9,
    attribution: 'Imagery © NASA GIBS/ESDIS'
  })
}

// Conversão graus -> ponto cardeal simples
function degToCompass(deg) {
  if (deg == null || Number.isNaN(deg)) return '—'
  const dirs = ['N','NNE','NE','ENE','L','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'] // L=Les(N/E), O=Oeste
  return dirs[Math.round(((deg % 360) / 22.5)) % 16]
}

export default function MapPage() {
  const mapRef = useRef(null)
  const mapInst = useRef(null)
  const userLayer = useRef(null)
  const baseLayerRef = useRef(null)
  const boundariesLayerRef = useRef(null)
  const nasaOverlayRef = useRef(null) // NOVO: overlay NASA prioritário
  const centerRef = useRef({ lat: 0, lng: 0 })

  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [label, setLabel] = useState('')
  // NOVO: estado da lista e visibilidade do popup
  const [points, setPoints] = useState([])
  const [showList, setShowList] = useState(false)
  const [basemap, setBasemap] = useState('gibs') // 'osm' | 'gibs'
  const [gibsDate, setGibsDate] = useState(getGibsDate()) // nova data selecionável
  const [showBoundaries, setShowBoundaries] = useState(true) // NOVO: controle de exibição
  const [envInfo, setEnvInfo] = useState(null)
  const [loadingEnv, setLoadingEnv] = useState(false)
  // NOVO: camada NASA (blooms)
  const [nasaLayer, setNasaLayer] = useState('viirs_chla') // 'none' | 'viirs_chla' | 'modis_chla'

  // NOVO: refs e estados para captura de foto
  const cameraInputRef = useRef(null)
  const uploadInputRef = useRef(null)
  const pendingCoordRef = useRef(null) // NOVO: fonte da verdade da coordenada selecionada
  const [pendingCoord, setPendingCoord] = useState(null) // {lat,lng}
  const [captureOpen, setCaptureOpen] = useState(false)
  const [photoDataUrl, setPhotoDataUrl] = useState('')
  const [photoExifCoord, setPhotoExifCoord] = useState(null) // {lat,lng}
  const [descDraft, setDescDraft] = useState('')
  const [titleDraft, setTitleDraft] = useState('')

  // NOVO: controle do componente de câmera
  const [cameraOpen, setCameraOpen] = useState(false)
  // NOVO: flag de largura da tela para responsividade
  const [isNarrow, setIsNarrow] = useState(false)
  // NOVO: minimizar/expandir painel ambiental
  const [envCollapsed, setEnvCollapsed] = useState(false)
  const ENV_COLLAPSED_KEY = 'bloomstack.ui/envPanelCollapsed'

  // NOVO: estados para vegetação (OSM/Overpass)
  const [loadingVeg, setLoadingVeg] = useState(false)
  const [vegInfo, setVegInfo] = useState(null)

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 768) // < 768px = mobile/tablet pequeno
    onResize()
    window.addEventListener('resize', onResize)
    // NOVO: carrega preferencia do painel
    try {
      const saved = localStorage.getItem(ENV_COLLAPSED_KEY)
      if (saved != null) setEnvCollapsed(saved === '1')
    } catch {}
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    // NOVO: persiste preferencia do painel
    try { localStorage.setItem(ENV_COLLAPSED_KEY, envCollapsed ? '1' : '0') } catch {}
  }, [envCollapsed])

  // Util: ler arquivo, reduzir e retornar dataURL
  async function fileToDataUrlResized(file, maxW = 1280, maxH = 1280) {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = reject
      r.readAsDataURL(file)
    })
    // cria imagem e canvas
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = dataUrl
    })
    let { width, height } = img
    const ratio = Math.min(maxW / width, maxH / height, 1)
    const w = Math.round(width * ratio)
    const h = Math.round(height * ratio)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.85)
  }

  // Util: tentar extrair GPS via EXIF (exifr ESM por CDN)
  async function extractExifLatLng(file) {
    try {
      const exifr = await import('https://unpkg.com/exifr/dist/full.esm.js')
      const gps = await exifr.gps(file)
      if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
        return { lat: gps.latitude, lng: gps.longitude }
      }
    } catch (e) {
      console.warn('EXIF/GPS não disponível', e)
    }
    return null
  }

  // Processamento comum do arquivo (câmera ou upload)
  async function processSelectedFile(file) {
    // usa o ref para evitar corrida com setState
    const coord = pendingCoordRef.current
    if (!file || !coord) return
    const [dataUrl, exifCoord] = await Promise.all([
      fileToDataUrlResized(file),
      extractExifLatLng(file)
    ])
    setPhotoDataUrl(dataUrl)
    setPhotoExifCoord(exifCoord)
    if (exifCoord) {
      const replace = confirm('A foto possui coordenadas no EXIF. Deseja substituir pelas coordenadas da foto?')
      if (replace) {
        pendingCoordRef.current = exifCoord
        setPendingCoord(exifCoord) // sincroniza para exibir na UI do modal
      }
    }
    setCaptureOpen(true)
  }

  async function onCameraChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    await processSelectedFile(file)
  }
  async function onUploadChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    await processSelectedFile(file)
  }

  // Captura de foto pela câmera (getUserMedia)
  function startCameraCapture(coord) {
    // aceita coord explícita e usa ref para não depender do estado ainda não comitado
    if (coord) {
      pendingCoordRef.current = coord
      setPendingCoord(coord) // opcional: mantém UI em sincronia
    }
    if (!pendingCoordRef.current) return
    setCameraOpen(true)
  }

  async function handleCameraCapture(blob) {
    try {
      const file = blob instanceof File ? blob : new File([blob], 'capture.jpg', { type: blob?.type || 'image/jpeg' })
      await processSelectedFile(file)
    } finally {
      setCameraOpen(false)
    }
  }

  function handleCameraClose() {
    setCameraOpen(false)
  }

  // Popup ao clicar no mapa para oferecer: Bater foto ou Upload
  function openAddPointPopup(latlng) {
    // atualiza ref e estado imediatamente
    const coord = { lat: latlng.lat, lng: latlng.lng }
    pendingCoordRef.current = coord
    setPendingCoord(coord)

    const wrap = document.createElement('div')
    wrap.style.minWidth = '200px'

    const title = document.createElement('div')
    title.style.fontWeight = '600'
    title.style.marginBottom = '6px'
    title.textContent = 'Adicionar ponto aqui?'
    wrap.appendChild(title)

    const coords = document.createElement('div')
    coords.style.fontSize = '12px'
    coords.style.color = '#64748b'
    coords.style.marginBottom = '8px'
    coords.textContent = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`
    wrap.appendChild(coords)

    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.gap = '6px'

    const btnCam = document.createElement('button')
    btnCam.textContent = 'Bater foto (câmera)'
    btnCam.style.padding = '4px 8px'
    btnCam.style.border = '1px solid #e5e7eb'
    btnCam.style.borderRadius = '6px'
    btnCam.style.background = '#aaff00ff'
    btnCam.onclick = () => {
      mapInst.current?.closePopup()
      // passa a coord explícita para evitar depender do estado
      startCameraCapture(coord)
    }

    const btnUpload = document.createElement('button')
    btnUpload.textContent = 'Fazer upload'
    btnUpload.style.padding = '4px 8px'
    btnUpload.style.border = '1px solid #e5e7eb'
    btnUpload.style.borderRadius = '6px'
    btnUpload.style.background = '#f8fafc'
    btnUpload.onclick = () => {
      mapInst.current?.closePopup()
      // coord já está no ref; apenas abre o input
      uploadInputRef.current?.click()
    }

    const btnCancel = document.createElement('button')
    btnCancel.textContent = 'Cancelar'
    btnCancel.style.padding = '4px 8px'
    btnCancel.style.border = '1px solid #e5e7eb'
    btnCancel.style.borderRadius = '6px'
    btnCancel.style.background = '#fee2e2'
    btnCancel.onclick = () => mapInst.current?.closePopup()

    row.appendChild(btnCam)
    row.appendChild(btnUpload)
    row.appendChild(btnCancel)
    wrap.appendChild(row)

    L.popup().setLatLng(latlng).setContent(wrap).openOn(mapInst.current)
  }

  // Substitui o antigo handler condicionado por "selectingCoord" – agora sempre mostra popup
  useEffect(() => {
    if (!mapInst.current) return
    const onMapClick = (evt) => {
      openAddPointPopup(evt.latlng)
    }
    mapInst.current.on('click', onMapClick)
    return () => { mapInst.current && mapInst.current.off('click', onMapClick) }
  }, [mapInst.current])

  function cancelCapture() {
    setCaptureOpen(false)
    setPhotoDataUrl('')
    setPhotoExifCoord(null)
    setDescDraft('')
    setTitleDraft('')
    setPendingCoord(null)
    pendingCoordRef.current = null // NOVO
  }

  function saveCapturedPoint() {
    const coord = pendingCoordRef.current // NOVO
    if (!coord) return cancelCapture()
    const label = titleDraft?.trim() || '(sem título)'
    const description = descDraft?.trim() || ''
    savePointToStorage({
      lat: coord.lat,
      lng: coord.lng,
      label,
      description,
      photoUrl: photoDataUrl
    })
    setCaptureOpen(false)
    setPhotoDataUrl(''); setPhotoExifCoord(null); setDescDraft(''); setTitleDraft('')
    setPendingCoord(null)
    pendingCoordRef.current = null // NOVO
    refreshPoints({ pan: true })
  }

  // Buscar dados ambientais (vento, umidade, AQ, pólen) para lat/lng
  async function fetchEnvInfo(lat, lng) {
    try {
      setLoadingEnv(true)
      const tz = 'auto'

      // Clima atual + umidade horária
      const wUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&hourly=relativehumidity_2m&timezone=${tz}`
      const [wRes] = await Promise.all([fetch(wUrl)])
      const w = await wRes.json()

      const windSpeed = w?.current_weather?.windspeed ?? null
      const windDir = w?.current_weather?.winddirection ?? null

      // Encontrar umidade na hora mais recente
      let humidity = null
      try {
        const times = w?.hourly?.time || []
        const hums = w?.hourly?.relativehumidity_2m || []
        if (times.length && hums.length) {
          const nowIso = new Date().toISOString().slice(0, 13) + ':00'
          let idx = times.lastIndexOf(nowIso)
          if (idx < 0) idx = hums.length - 1
          humidity = hums[idx] ?? null
        }
      } catch {}

      // Qualidade do ar (pm2.5, pm10, ozônio)
      let aq = {}
      try {
        const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&hourly=pm2_5,pm10,ozone&timezone=${tz}`
        const aqRes = await fetch(aqUrl)
        const aqJson = await aqRes.json()
        const t = aqJson?.hourly?.time || []
        const last = t.length ? t.length - 1 : -1
        aq = {
          pm25: last >= 0 ? aqJson?.hourly?.pm2_5?.[last] ?? null : null,
          pm10: last >= 0 ? aqJson?.hourly?.pm10?.[last] ?? null : null,
          o3:   last >= 0 ? aqJson?.hourly?.ozone?.[last] ?? null : null,
        }
      } catch { aq = {} }

      // Pólen (gramíneas/árvores/ervas) – pode não estar disponível em todas regiões
      let pollen = {}
      try {
        const polUrl = `https://pollen-api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=grass_pollen,tree_pollen,weed_pollen&timezone=${tz}`
        const polRes = await fetch(polUrl)
        const polJson = await polRes.json()
        const t = polJson?.hourly?.time || []
        const last = t.length ? t.length - 1 : -1
        pollen = {
          grass: last >= 0 ? polJson?.hourly?.grass_pollen?.[last] ?? null : null,
          tree:  last >= 0 ? polJson?.hourly?.tree_pollen?.[last] ?? null : null,
          weed:  last >= 0 ? polJson?.hourly?.weed_pollen?.[last] ?? null : null,
        }
      } catch { pollen = {} }

      setEnvInfo({
        lat: Number(lat), lng: Number(lng),
        windSpeed, windDir, humidity,
        pm25: aq.pm25 ?? null, pm10: aq.pm10 ?? null, o3: aq.o3 ?? null,
        pollen,
        at: new Date().toISOString()
      })
    } catch (e) {
      console.warn('Falha ao obter dados ambientais', e)
      setEnvInfo(null)
    } finally {
      setLoadingEnv(false)
    }
  }

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

    // Camada base inicial
    baseLayerRef.current = buildBaseLayer(basemap, gibsDate)
    baseLayerRef.current.addTo(map)

    userLayer.current = L.layerGroup().addTo(map)

    // Overlay de limites (opcional)
    if (showBoundaries) {
      boundariesLayerRef.current = buildBoundariesOverlay()
      boundariesLayerRef.current.addTo(map)
    }

    // NOVO: overlay NASA de blooms (prioridade)
    if (nasaLayer && nasaLayer !== 'none') {
      nasaOverlayRef.current = buildNasaOverlay(nasaLayer, gibsDate)
      nasaOverlayRef.current && nasaOverlayRef.current.addTo(map)
    }

    // Guardar centro do mapa
    centerRef.current = map.getCenter()
    map.on('moveend', () => { centerRef.current = map.getCenter() })

    // NOVO: clique no mapa abre popup para adicionar ponto (câmera/upload)
    const onMapClick = (evt) => {
      openAddPointPopup(evt.latlng)
    }
    map.on('click', onMapClick)

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
          centerRef.current = { lat: latitude, lng: longitude }
          fetchEnvInfo(latitude, longitude)
        },
        () => {
          console.warn('Não foi possível obter a localização.')
          const c = map.getCenter()
          centerRef.current = c
          fetchEnvInfo(c.lat, c.lng)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    } else {
      const c = map.getCenter()
      centerRef.current = c
      fetchEnvInfo(c.lat, c.lng)
    }

    // Carrega e desenha do storage (com slugs/popups de detalhes)
    refreshPoints({ pan: false })

    return () => {
      // ...existing cleanup...
      try { map.off('click', onMapClick) } catch {}
      map.remove()
    }
  }, []) // init

  // Troca dinâmica da camada base quando o usuário alternar ou mudar a data GIBS
  useEffect(() => {
    if (!mapInst.current) return
    if (baseLayerRef.current) {
      try { mapInst.current.removeLayer(baseLayerRef.current) } catch {}
    }
    baseLayerRef.current = buildBaseLayer(basemap, gibsDate)
    baseLayerRef.current.addTo(mapInst.current)
  }, [basemap, gibsDate])

  // NOVO: atualizar overlay NASA quando camada/data mudarem
  useEffect(() => {
    if (!mapInst.current) return
    // remove anterior
    if (nasaOverlayRef.current) {
      try { mapInst.current.removeLayer(nasaOverlayRef.current) } catch {}
      nasaOverlayRef.current = null
    }
    // adiciona novo se houver seleção
    if (nasaLayer && nasaLayer !== 'none') {
      nasaOverlayRef.current = buildNasaOverlay(nasaLayer, gibsDate)
      nasaOverlayRef.current && nasaOverlayRef.current.addTo(mapInst.current)
    }
  }, [nasaLayer, gibsDate])

  // NOVO: overlay de limites (países, estados e cidades) – transparente
  function buildBoundariesOverlay() {
    return L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community'
      }
    )
  }

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

    // Abre popup com nome do ponto (e coords/link)
    const html = `
      <div style="min-width:180px">
        <div style="font-weight:600;margin-bottom:4px">${escapeHtml(doc.label?.trim() || '(sem rótulo)')}</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:6px">${doc.lat.toFixed(5)}, ${doc.lng.toFixed(5)}</div>
        <a href="/${encodeURIComponent(doc.slug)}"
           style="display:inline-block;padding:4px 8px;border:1px solid #e5e7eb;border-radius:6px;background:#f8fafc;text-decoration:none;color:#111827">
           Ver detalhes
        </a>
      </div>
    `
    L.popup().setLatLng([doc.lat, doc.lng]).setContent(html).openOn(mapInst.current)
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

  // NOVO: consulta vegetação próxima via Overpass (OSM)
  async function fetchVegetationInfo(lat, lng, radius = 500) {
    try {
      setLoadingVeg(true)
      setVegInfo(null)
      // Seleciona usos do solo/natural/lazer que indicam vegetação
      const q = `
[out:json][timeout:25];
(
  nwr(around:${radius},${lat},${lng})[landuse~"^(forest|meadow|grass|orchard|vineyard|allotments|farmland)$"];
  nwr(around:${radius},${lat},${lng})[natural~"^(wood|scrub|heath|grassland)$"];
  nwr(around:${radius},${lat},${lng})[leisure~"^(park|garden|nature_reserve)$"];
);
out tags center 100;`
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: 'data=' + encodeURIComponent(q)
      })
      const json = await res.json()
      const els = Array.isArray(json?.elements) ? json.elements : []

      const categories = {}
      const names = new Set()

      const pushCat = (k) => { categories[k] = (categories[k] || 0) + 1 }
      const friendly = (tags = {}) => {
        if (tags.landuse === 'forest') return 'Floresta'
        if (tags.natural === 'wood') return 'Mata'
        if (tags.natural === 'scrub') return 'Arbustos'
        if (tags.natural === 'heath') return 'Charneca'
        if (tags.natural === 'grassland') return 'Campos'
        if (tags.landuse === 'meadow' || tags.landuse === 'grass') return 'Prado/Grama'
        if (tags.leisure === 'park') return 'Parque'
        if (tags.leisure === 'garden') return 'Jardim'
        if (tags.leisure === 'nature_reserve') return 'Reserva'
        if (tags.landuse === 'orchard') return 'Pomar'
        if (tags.landuse === 'vineyard') return 'Vinhedo'
        if (tags.landuse === 'allotments') return 'Hortas'
        if (tags.landuse === 'farmland') return 'Agrícola'
        return null
      }

      els.forEach(e => {
        const k = friendly(e.tags || {})
        if (k) pushCat(k)
        const nm = (e.tags?.name || e.tags?.['name:pt'] || e.tags?.['name:en'])?.trim()
        if (nm) names.add(nm)
      })

      setVegInfo({
        lat: Number(lat), lng: Number(lng),
        radius,
        total: els.length,
        categories,
        names: Array.from(names).slice(0, 8),
        at: new Date().toISOString()
      })
    } catch (e) {
      console.warn('Falha ao obter vegetação (Overpass)', e)
      setVegInfo(null)
    } finally {
      setLoadingVeg(false)
    }
  }

  return (
    <div className="map-page" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <form
        onSubmit={onSubmit}
        className="map-form"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}
      >
        {/* Alternador de mapa base */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, color: '#cfdbedff' }}>Visão</span>
          <select value={basemap} onChange={(e) => setBasemap(e.target.value)} style={{ padding: '6px 8px' }}>
            <option value="osm">Mapa padrão (OSM)</option>
            <option value="gibs">Satélite (NASA)</option>
          </select>
        </label>

        {/* Seletor de data (habilitado se basemap GIBS ou overlay NASA ativo) */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, color: '#64748b' }}>Data</span>
          <input
            type="date"
            value={gibsDate}
            min={GIBS_MIN_DATE}
            max={getGibsDate()}
            onChange={(e) => setGibsDate(clampGibsDate(e.target.value))}
            disabled={basemap !== 'gibs' && nasaLayer === 'none'}
            style={{ padding: '6px 8px' }}
          />
        </label>

        {/* NOVO: overlay NASA prioridade (blooms) */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, color: '#64748b' }}>NASA (blooms)</span>
          <select
            value={nasaLayer}
            onChange={(e) => setNasaLayer(e.target.value)}
            style={{ padding: '6px 8px' }}
          >
            <option value="viirs_chla">VIIRS SNPP Chlorophyll-a</option>
            <option value="modis_chla">MODIS Aqua Chlorophyll-a</option>
            <option value="none">Sem overlay</option>
          </select>
        </label>

        <input
          type="text" inputMode="decimal" placeholder="Lat (-90 a 90)"
          value={lat} onChange={(e) => setLat(e.target.value)}
          style={{ padding: '6px 8px', flex: '1 1 150px', minWidth: 120, boxSizing: 'border-box' }}
        />
        <input
          type="text" inputMode="decimal" placeholder="Lng (-180 a 180)"
          value={lng} onChange={(e) => setLng(e.target.value)}
          style={{ padding: '6px 8px', flex: '1 1 150px', minWidth: 120, boxSizing: 'border-box' }}
        />
        <input
          type="text" placeholder="Rótulo (opcional)"
          value={label} onChange={(e) => setLabel(e.target.value)}
          style={{ padding: '6px 8px', flex: '2 1 220px', minWidth: 160, boxSizing: 'border-box' }}
        />
        <button type="submit" style={{ padding: '6px 10px', flex: '0 0 auto' }}>Cadastrar ponto</button>
        <button type="button" onClick={clearPoints} style={{ padding: '6px 10px', flex: '0 0 auto' }}>Limpar</button>
        <button type="button" onClick={() => setShowList(true)} style={{ padding: '6px 10px', marginLeft: 8, flex: '0 0 auto' }}>
          Meus pontos
        </button>
      </form>

      {/* Inputs ocultos: câmera (fallback) e upload */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onCameraChange}
        style={{ display: 'none' }}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        onChange={onUploadChange}
        style={{ display: 'none' }}
      />

      <div
        ref={mapRef}
        className="map-root"
        role="img"
        aria-label="Mapa com localização e pontos"
        style={{ flex: 1, minHeight: 320, width: '100%' }}
      />

      {/* Componente de câmera */}
      <Camera
        open={cameraOpen}
        onClose={handleCameraClose}
        onCapture={handleCameraCapture}
        facingMode="environment"
      />

      {/* Modal de captura/descrição */}
      {captureOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) cancelCapture() }}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Novo ponto por foto"
            style={{ width: 'min(640px, 96vw)' }}
          >
            <div className="modal__header">
              <strong>Novo ponto</strong>
              <button className="modal__btn" onClick={cancelCapture}>Cancelar</button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div>
                <small style={{ color: '#64748b' }}>Coordenadas selecionadas</small><br />
                <span>{pendingCoord ? `${pendingCoord.lat.toFixed(6)}, ${pendingCoord.lng.toFixed(6)}` : '—'}</span>
                {photoExifCoord && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                    EXIF: {photoExifCoord.lat.toFixed(6)}, {photoExifCoord.lng.toFixed(6)} (já aplicado se confirmado)
                  </div>
                )}
              </div>

              {photoDataUrl && (
                <img src={photoDataUrl} alt="Pré-visualização da foto" style={{ width: '100%', borderRadius: 8, border: '1px solid #e5e7eb' }} />
              )}

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Título (opcional)</span>
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  placeholder="Ex.: Ipê amarelo na praça"
                  style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Descrição</span>
                <textarea
                  rows={4}
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  placeholder="Escreva uma descrição da flor/local..."
                  style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
              </label>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="modal__btn" onClick={cancelCapture}>Cancelar</button>
                <button className="modal__btn modal__btn--ok" onClick={saveCapturedPoint}>Salvar ponto</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Painel de condições ambientais (flutuante) */}
      <div
        style={{
          position: isNarrow ? 'fixed' : 'absolute',
          right: isNarrow ? 8 : 16,
          left: isNarrow ? 8 : 'auto',
          bottom: isNarrow ? 8 : 16,
          zIndex: 1000,
          color: '#0f172a',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.92))',
          backdropFilter: 'blur(8px)',
          border: '1px solid #e2e8f0',
          borderRadius: 14,
          padding: envCollapsed ? 8 : 12,
          minWidth: isNarrow ? 'auto' : 280,
          maxWidth: isNarrow ? 'calc(100vw - 16px)' : 360,
          boxShadow: '0 10px 30px rgba(2,6,23,.12)',
          transition: 'all 0.3s ease',
          opacity: 0.6, // Transparente por padrão
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} // Opaco ao passar o mouse
        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'} // Volta transparente
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true">🌤️</span>
            <strong style={{ fontSize: 14 }}>Condições ambientais</strong>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* NOVO: botão minimizar/expandir */}
            <button
              type="button"
              onClick={() => setEnvCollapsed(v => !v)}
              aria-expanded={!envCollapsed}
              aria-controls="env-panel-content"
              title={envCollapsed ? 'Expandir' : 'Minimizar'}
              style={{
                padding: '6px 10px',
                border: '1px solid #cbd5e1',
                borderRadius: 10,
                background: '#ffffff',
                color: '#0f172a',
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              {envCollapsed ? 'Expandir' : 'Minimizar'}
            </button>

            <button
              onClick={() => fetchEnvInfo(centerRef.current.lat, centerRef.current.lng)}
              disabled={loadingEnv}
              style={{
                padding: '6px 10px',
                border: '1px solid #cbd5e1',
                borderRadius: 10,
                background: loadingEnv ? '#e2e8f0' : '#f8fafc',
                color: '#0f172a',
                fontSize: 12,
                cursor: loadingEnv ? 'default' : 'pointer'
              }}
              title="Atualizar pelas coordenadas do centro do mapa"
            >
              {loadingEnv ? 'Atualizando…' : 'Atualizar (centro)'}
            </button>

            {/* NOVO: Vegetação (500 m) */}
            <button
              onClick={() => fetchVegetationInfo(centerRef.current.lat, centerRef.current.lng, 500)}
              disabled={loadingVeg}
              style={{
                padding: '6px 10px',
                border: '1px solid #cbd5e1',
                borderRadius: 10,
                background: loadingVeg ? '#e2e8f0' : '#f8fafc',
                color: '#0f172a',
                fontSize: 12,
                cursor: loadingVeg ? 'default' : 'pointer'
              }}
              title="Buscar tipos de vegetação num raio de 500 m (OSM)"
            >
              {loadingVeg ? 'Buscando…' : 'Vegetação (500 m)'}
            </button>
          </div>
        </div>

        {/* NOVO: conteúdo colapsável (mantido) */}
        {!envCollapsed && (
          <div id="env-panel-content">
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
              Centro: {centerRef.current.lat.toFixed(4)}, {centerRef.current.lng.toFixed(4)}
            </div>

            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {/* Vento */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: '#64748b', minWidth: 64, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden="true">🌬️</span> Vento
                </span>
                <span
                  style={{
                    background: '#ecfeff',
                    border: '1px solid #bae6fd',
                    color: '#075985',
                    padding: '4px 8px',
                    borderRadius: 999,
                    fontSize: 12
                  }}
                >
                  {envInfo?.windSpeed != null ? `${envInfo.windSpeed} km/h` : '—'}
                </span>
                <span
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    color: '#334155',
                    padding: '4px 8px',
                    borderRadius: 999,
                    fontSize: 12
                  }}
                >
                  {envInfo?.windDir != null ? `${degToCompass(envInfo.windDir)} (${Math.round(envInfo.windDir)}°)` : '—'}
                </span>
              </div>

              {/* Umidade */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: '#64748b', minWidth: 64, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden="true">💧</span> Umidade
                </span>
                <span
                  style={{
                    background: '#eef2ff',
                    border: '1px solid #c7d2fe',
                    color: '#3730a3',
                    padding: '4px 8px',
                    borderRadius: 999,
                    fontSize: 12
                  }}
                >
                  {envInfo?.humidity != null ? `${envInfo.humidity}%` : '—'}
                </span>
              </div>

              {/* Qualidade do ar */}
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden="true">🫧</span> Qualidade do ar
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#0f172a',
                      padding: '4px 8px',
                      borderRadius: 999,
                      fontSize: 12
                    }}
                  >
                    PM2.5 {envInfo?.pm25 != null ? `${envInfo.pm25} µg/m³` : '—'}
                  </span>
                  <span
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#0f172a',
                      padding: '4px 8px',
                      borderRadius: 999,
                      fontSize: 12
                    }}
                  >
                    PM10 {envInfo?.pm10 != null ? `${envInfo.pm10} µg/m³` : '—'}
                  </span>
                  <span
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#0f172a',
                      padding: '4px 8px',
                      borderRadius: 999,
                      fontSize: 12
                    }}
                  >
                    O₃ {envInfo?.o3 != null ? `${envInfo.o3} µg/m³` : '—'}
                  </span>
                </div>
              </div>

              {/* Pólen */}
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden="true">🌿</span> Pólen
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      background: '#ecfccb',
                      border: '1px solid #d9f99d',
                      color: '#365314',
                      padding: '4px 8px',
                      borderRadius: 999,
                      fontSize: 12
                    }}
                  >
                    Grama {envInfo?.pollen?.grass ?? '—'}
                  </span>
                  <span
                    style={{
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      color: '#14532d',
                      padding: '4px 8px',
                      borderRadius: 999,
                      fontSize: 12
                    }}
                  >
                    Árvores {envInfo?.pollen?.tree ?? '—'}
                  </span>
                  <span
                    style={{
                      background: '#fff7ed',
                      border: '1px solid #fed7aa',
                      color: '#7c2d12',
                      padding: '4px 8px',
                      borderRadius: 999,
                      fontSize: 12
                    }}
                  >
                    Ervas {envInfo?.pollen?.weed ?? '—'}
                  </span>
                </div>
              </div>

              {/* NOVO: Vegetação próxima (OSM) */}
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden="true">🌳</span> Vegetação próxima (OSM)
                </span>

                {vegInfo ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Raio: ~{Math.round(vegInfo.radius)} m • Itens: {vegInfo.total}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {Object.keys(vegInfo.categories).length === 0 && (
                        <span style={{ color: '#94a3b8' }}>Nenhuma classe encontrada.</span>
                      )}
                      {Object.entries(vegInfo.categories).map(([k, v]) => (
                        <span
                          key={k}
                          style={{
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            color: '#14532d',
                            padding: '4px 8px',
                            borderRadius: 999,
                            fontSize: 12
                          }}
                        >
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                    {!!vegInfo.names?.length && (
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Próximos: {vegInfo.names.join(' · ')}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      Fonte: OpenStreetMap (Overpass) • {new Date(vegInfo.at).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    {loadingVeg ? 'Carregando vegetação…' : 'Clique em “Vegetação (500 m)” para buscar.'}
                  </div>
                )}
              </div>

              {/* Atualizado em */}
              <div style={{ fontSize: 11, color: '#8ca1bfff', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: envInfo?.at ? '#22c55e' : '#cbd5e1',
                    display: 'inline-block'
                  }}
                />
                {envInfo?.at ? `Atualizado: ${new Date(envInfo.at).toLocaleString()}` : 'Aguardando dados…'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* NOVO: Popup com a lista de pontos */}
      {showList && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowList(false) }}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Pontos cadastrados"
            style={{ width: 'min(640px, 96vw)' }}
          >
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