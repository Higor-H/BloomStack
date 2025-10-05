import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './Map.css'
import Camera from '../Camera/Camera.jsx'
import { initPlantId, classifyImage } from '../../services/plantRecognition.js'
import {
  initImageNetGate,
  classifyImageNet,
  isPlantLike
} from '../../services/isPlant.js'

// IMPORTS NOVOS: camadas do mapa (OSM/GIBS/overlays) e datas GIBS
import {
  buildBaseLayer,
  buildBoundariesOverlay,
  buildNasaOverlay,
  getGibsDate,
  clampGibsDate,
  GIBS_MIN_DATE,
} from '../../services/mapLayers.js'

// IMPORTS NOVOS: CRUD/Storage dos pontos
import {
  loadPoints,
  savePoint,
  clearAllPoints,
  updatePoint,
  removePoint,
} from '../../services/pointsStorage.js'

// IMPORTS NOVOS: APIs ambientais e util de direção do vento
import {
  fetchEnvInfo,
  fetchVegetationInfo,
  degToCompass,
} from '../../api/envApi.js'
import { Link } from 'react-router-dom'

// Helper: formatação de data US <-> ISO
function pad2(n) { return String(n).padStart(2, '0') }
function isoToUS(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}
function usToISO(us) {
  const m = String(us || '').match(/^\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*$/)
  if (!m) return null
  const mm = pad2(+m[1]); const dd = pad2(+m[2]); const yyyy = m[3]
  // validação simples
  const dt = new Date(`${yyyy}-${mm}-${dd}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return null
  return `${yyyy}-${mm}-${dd}`
}

// MANTER somente helpers de UI necessários no Map (ex.: escapeHtml)
function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}

export default function MapPage() {
  const mapRef = useRef(null)
  const mapInst = useRef(null)
  const userLayer = useRef(null)
  const baseLayerRef = useRef(null)
  const boundariesLayerRef = useRef(null)
  const nasaOverlayRef = useRef(null)
  const centerRef = useRef({ lat: 0, lng: 0 })
  const initialFocusDoneRef = useRef(false) // NOVO: evita que geoloc “desfaça” o foco por slug

  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [label, setLabel] = useState('')
  const [points, setPoints] = useState([])
  const [showList, setShowList] = useState(false)
  const [basemap, setBasemap] = useState('gibs')
  const [gibsDate, setGibsDate] = useState(getGibsDate())
  const [showBoundaries, setShowBoundaries] = useState(true)
  const [envInfo, setEnvInfo] = useState(null)
  const [loadingEnv, setLoadingEnv] = useState(false)
  const [nasaLayer, setNasaLayer] = useState('viirs_chla') // 'none' | 'viirs_chla' | 'modis_chla'
  const [plantPredLoading, setPlantPredLoading] = useState(false)
  const [plantPred, setPlantPred] = useState(null) // { label, prob, topK[] }

  const cameraInputRef = useRef(null)
  const uploadInputRef = useRef(null)
  const pendingCoordRef = useRef(null)
  const [pendingCoord, setPendingCoord] = useState(null)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [photoDataUrl, setPhotoDataUrl] = useState('')
  const [photoExifCoord, setPhotoExifCoord] = useState(null)
  const [descDraft, setDescDraft] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [sciNameDraft, setSciNameDraft] = useState('')
  const [sciProbDraft, setSciProbDraft] = useState(null)
  const [sciSuggestedName, setSciSuggestedName] = useState('');
  const [sciSuggestedProb, setSciSuggestedProb] = useState(null);


  const [cameraOpen, setCameraOpen] = useState(false)
  const [isNarrow, setIsNarrow] = useState(false)
  const [envCollapsed, setEnvCollapsed] = useState(false)
  const ENV_COLLAPSED_KEY = 'bloomstack.ui/envPanelCollapsed'

  const [loadingVeg, setLoadingVeg] = useState(false)
  const [vegInfo, setVegInfo] = useState(null)

  // Popup “imagem não é planta”
  const [gateOpen, setGateOpen] = useState(false);
  const [gateMsg, setGateMsg] = useState('');
  const [gateBypass, setGateBypass] = useState(false);

  useEffect(() => {
    if (captureOpen && photoDataUrl) {
      setGateBypass(false);
    }
  }, [captureOpen, photoDataUrl]);

  useEffect(() => {
    (async () => {
      try {
        await initPlantId()
        await initImageNetGate() 
      } catch (e) {
        console.error('Falha ao inicializar PlantID:', e)
      }
    })()
  }, [])


  useEffect(() => {
  if (!captureOpen || !photoDataUrl) {
    setPlantPred(null)
    setPlantPredLoading(false)
    return
  }
  const imgEl = document.getElementById('imgPlant')
  if (!imgEl) return

  const run = async () => {
    try {
      setPlantPredLoading(true);
      if (!imgEl.complete || imgEl.naturalWidth === 0) {
        try { await imgEl.decode?.(); } catch {}
      }
      if (imgEl.naturalWidth === 0) throw new Error('Imagem não decodificada');

      // 1) GATE: ImageNet — só bloqueia se reprovar E não houver bypass
      const gatePred = await classifyImageNet(imgEl, 5);
      const decision = isPlantLike(gatePred, {
        minProbAny: 0.01,  // ajuste fino
        minProbTop: 0.02,
      });

      if (!decision.ok && !gateBypass) {
        setGateMsg('A imagem não parece ser uma planta. Você pode sair ou continuar mesmo assim.');
        setGateOpen(true);
        // Não fecha a captura, apenas mostra o popup e aguarda ação do usuário
        return;
      }

      // 2) Se passou no gate (ou usuário optou por continuar), classifique a espécie
      const res = await classifyImage(imgEl, 5);
      
      // normalização: trate "Nenhum nome científico encontrado" como vazio
      const rawLabel = (res?.label || '').trim();
      const noneLike = /No scientific name found/i.test(rawLabel);
      const suggested = noneLike ? '' : rawLabel;
      const prob = Number.isFinite(res?.prob) ? res.prob : null;

      setPlantPred(res);

      // fixa a SUGESTÃO da IA (não muda com digitação)
      setSciSuggestedName(suggested);
      setSciSuggestedProb(prob);

      // inicializa o campo editável com a sugestão (ou vazio)
      setSciNameDraft(suggested);
      setSciProbDraft(prob);
    } catch (e) {
      console.error('Erro ao classificar:', e);
      setPlantPred(null);
    } finally {
      setPlantPredLoading(false);
    }
  };

  if (imgEl.complete) run()
  else {
    imgEl.onload = () => run()
    imgEl.onerror = () => setPlantPredLoading(false)
  }

  return () => { if (imgEl) { imgEl.onload = null; imgEl.onerror = null } }
}, [captureOpen, photoDataUrl, gateBypass])

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
    setSciSuggestedName('');
    setSciSuggestedProb(null);
    setSciNameDraft('');
    setSciProbDraft(null);
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

  // Popup ao clicar no mapa (textos em inglês)
  function openAddPointPopup(latlng) {
    const coord = { lat: latlng.lat, lng: latlng.lng }
    pendingCoordRef.current = coord
    setPendingCoord(coord)

    const wrap = document.createElement('div')
    wrap.style.minWidth = '200px'

    const title = document.createElement('div')
    title.style.fontWeight = '600'
    title.style.marginBottom = '6px'
    title.textContent = 'Add point here?'
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
    btnCam.className = 'button'
    btnCam.textContent = 'Take photo (camera)'
    btnCam.onclick = () => {
      mapInst.current?.closePopup()
      startCameraCapture(coord)
    }

    const btnUpload = document.createElement('button')
    btnUpload.className = 'button'
    btnUpload.textContent = 'Upload photo'
    btnUpload.onclick = () => {
      mapInst.current?.closePopup()
      uploadInputRef.current?.click()
    }

    row.appendChild(btnCam)
    row.appendChild(btnUpload)
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
     setSciSuggestedName('');
    setSciSuggestedProb(null);
    setSciNameDraft('');
    setSciProbDraft(null);
    pendingCoordRef.current = null // NOVO
  }

  async function saveCapturedPoint() {
    const coord = pendingCoordRef.current
    if (!coord) return cancelCapture()
    const label = titleDraft?.trim() || '(sem título)'
    const description = descDraft?.trim() || ''
    const scientificName = (sciNameDraft || '').trim()

    let envSnap = null
    try {
      envSnap = await fetchEnvInfo(coord.lat, coord.lng)
    } catch { envSnap = null }

    savePoint({
      lat: coord.lat,
      lng: coord.lng,
      label,
      description,
      photoUrl: photoDataUrl,
      // NOVO: snapshot do momento da foto
      capturedAt: envSnap?.at || new Date().toISOString(),
      captureEnv: envSnap,
      scientificName
    })
    setCaptureOpen(false)
    setPhotoDataUrl(''); setPhotoExifCoord(null); setDescDraft(''); setTitleDraft('')
    setPendingCoord(null)
    pendingCoordRef.current = null
    refreshPoints({ pan: true })
  }

  // Wrapper local para carregar condições ambientais (controla loading e estado)
  async function loadEnv(lat, lng) {
    try {
      setLoadingEnv(true)
      const info = await fetchEnvInfo(lat, lng)
      setEnvInfo(info)
    } catch (e) {
      console.warn('Falha ao obter dados ambientais', e)
      setEnvInfo(null)
    } finally {
      setLoadingEnv(false)
    }
  }

  // Wrapper local para vegetação (Overpass)
  async function loadVeg(lat, lng, radius = 500) {
    try {
      setLoadingVeg(true)
      const v = await fetchVegetationInfo(lat, lng, radius)
      setVegInfo(v)
    } catch (e) {
      console.warn('Falha ao obter vegetação', e)
      setVegInfo(null)
    } finally {
      setLoadingVeg(false)
    }
  }

  // NOVO: recarrega pontos do storage e redesenha marcadores
  function refreshPoints({ pan = false } = {}) {
    const all = loadPoints() // garante slug e migra se necessário
    setPoints?.(all)
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

    // Overlay NASA (prioritário)
    if (nasaLayer && nasaLayer !== 'none') {
      nasaOverlayRef.current = buildNasaOverlay(nasaLayer, gibsDate)
      nasaOverlayRef.current && nasaOverlayRef.current.addTo(map)
    }

    // Guardar centro do mapa
    centerRef.current = map.getCenter()
    map.on('moveend', () => { centerRef.current = map.getCenter() })

    // Clique no mapa abre popup
    const onMapClick = (evt) => {
      openAddPointPopup(evt.latlng)
    }
    map.on('click', onMapClick)

    // Carrega e desenha do storage
    refreshPoints({ pan: false })

    // NOVO: focar por slug vindo da URL (?slug=...) e travar geoloc de recenter
    try {
      const sp = new URLSearchParams(window.location.search)
      const qsSlug = sp.get('slug')
      if (qsSlug) {
        const docs = loadPoints()
        const doc = docs.find(p => p.slug === qsSlug)
        if (doc) {
          const focusZoom = basemap === 'gibs' ? 9 : 15
          map.setView([doc.lat, doc.lng], focusZoom)
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
          L.popup().setLatLng([doc.lat, doc.lng]).setContent(html).openOn(map)
          centerRef.current = { lat: doc.lat, lng: doc.lng }
          initialFocusDoneRef.current = true
        }
      }
    } catch {}

    // Geolocalização do usuário (não “rouba” foco se já focou por slug)
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (initialFocusDoneRef.current) {
            // Ainda assim atualiza dados ambientais para o centro atual
            fetchEnvInfo(centerRef.current.lat, centerRef.current.lng).then(setEnvInfo).catch(() => setEnvInfo(null))
            return
          }
          const { latitude, longitude, accuracy } = pos.coords
          const here = [latitude, longitude]
          const focusZoom = basemap === 'gibs' ? 9 : 15
          map.setView(here, focusZoom)
          L.circleMarker(here, {
            radius: 8, color: '#2563eb', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.7
          }).addTo(map).bindPopup('You are here').openPopup()
          if (Number.isFinite(accuracy)) {
            L.circle(here, { radius: accuracy, color: '#60a5fa', weight: 1, fillOpacity: 0.12 }).addTo(map)
          }
          centerRef.current = { lat: latitude, lng: longitude }
          loadEnv(latitude, longitude)
        },
        () => {
          if (initialFocusDoneRef.current) {
            fetchEnvInfo(centerRef.current.lat, centerRef.current.lng).then(setEnvInfo).catch(() => setEnvInfo(null))
            return
          }
          const c = map.getCenter()
          centerRef.current = c
          loadEnv(c.lat, c.lng)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    } else {
      if (!initialFocusDoneRef.current) {
        const c = map.getCenter()
        centerRef.current = c
        loadEnv(c.lat, c.lng)
      } else {
        fetchEnvInfo(centerRef.current.lat, centerRef.current.lng).then(setEnvInfo).catch(() => setEnvInfo(null))
      }
    }

    return () => {
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

  // Atualizar overlay NASA quando camada/data mudarem
  useEffect(() => {
    if (!mapInst.current) return
    if (nasaOverlayRef.current) {
      try { mapInst.current.removeLayer(nasaOverlayRef.current) } catch {}
      nasaOverlayRef.current = null
    }
    if (nasaLayer && nasaLayer !== 'none') {
      nasaOverlayRef.current = buildNasaOverlay(nasaLayer, gibsDate)
      nasaOverlayRef.current && nasaOverlayRef.current.addTo(mapInst.current)
    }
  }, [nasaLayer, gibsDate])

  // Adiciona ponto e salva, depois redesenha
  function addPoint(latNum, lngNum, lbl, opts = { save: true, pan: true }) {
    if (!mapInst.current || !userLayer.current) return
    if (opts.save) {
      savePoint({ lat: latNum, lng: lngNum, label: lbl })
      refreshPoints({ pan: opts.pan })
    } else {
      const marker = L.circleMarker([latNum, lngNum], {
        radius: 7, color: '#059669', weight: 2, fillColor: '#10b981', fillOpacity: 0.7
      }).addTo(userLayer.current)
      if (lbl) marker.bindPopup(escapeHtml(lbl))
      if (opts.pan) mapInst.current.setView([latNum, lngNum], 15)
    }
  }

  // Submissão
  function onSubmit(e) {
    e.preventDefault()
    const latNum = parseFloat(String(lat).replace(',', '.'))
    const lngNum = parseFloat(String(lng).replace(',', '.'))
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return alert('Invalid coordinates.')
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return alert('Out of valid range.')
    addPoint(latNum, lngNum, label?.trim(), { save: true, pan: true })
  }

  // NOVO: focar no mapa e abrir popup (se ausente)
  function handleShow(id) {
    const doc = points.find(p => p.id === id)
    if (!doc || !mapInst.current) return
    mapInst.current.setView([doc.lat, doc.lng], 15)
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

  // Utilitários no console
  useEffect(() => {
    window.addMapPoint = (a, b, c) => addPoint(a, b, c)
    window.listMapPoints = () => loadPoints()
    return () => { delete window.addMapPoint; delete window.listMapPoints }
  }, [])

  function clearPoints() {
    if (userLayer.current) userLayer.current.clearLayers()
    if (confirm('Também remover os pontos salvos no navegador?')) {
      clearAllPoints()
    }
    refreshPoints({ pan: false })
  }

  // Editar ponto (slug recalculado no service)
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
    const ok = updatePoint(id, { label: newLabel.trim(), lat: latNum, lng: lngNum })
    if (!ok) return alert('Falha ao atualizar o ponto.')
    refreshPoints({ pan: true })
  }

  // Excluir ponto
  function handleDelete(id) {
    const doc = points.find(p => p.id === id)
    if (!doc) return
    if (!confirm(`Excluir o ponto "${doc.label || '(sem rótulo)'}"?`)) return
    removePoint(id)
    refreshPoints({ pan: false })
  }
  function handleGateExit() {
    setGateOpen(false);
    setGateBypass(false);
    cancelCapture(); // fecha a modal de captura e limpa estados
  }

  function handleGateContinue() {
    setGateOpen(false);
    setGateBypass(true); // permite continuar; o efeito acima roda de novo e classifica
  }





















  // Início do código!




















  return (
      <div className="map-page" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>

          {/* camada de vidro */}
          <div className="glass-card"></div>

          {/* conteúdo da página */}
          <form
              onSubmit={onSubmit}
              className="map-form"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8, zIndex: 20 }}
          >
        {/* Alternador de mapa base */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, color: '#cfdbedff' }}>View</span>
          <select value={basemap} onChange={(e) => setBasemap(e.target.value)} style={{ padding: '6px 8px' }}>
            <option value="osm">Default map (OSM)</option>
            <option value="gibs">Satellite (NASA)</option>
          </select>
        </label>

        {/* Data (abre calendário nativo) */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, color: '#cbe1ffff' }}>Date</span>
          <input
            type="date"
            value={gibsDate}
            min={GIBS_MIN_DATE}
            max={getGibsDate()}
            onFocus={() => { if (basemap !== 'gibs') setBasemap('gibs') }}
            onChange={(e) => setGibsDate(clampGibsDate(e.target.value))}
            style={{ padding: '6px 8px' }}
            title="Select date to update NASA satellite imagery"
          />
        </label>

        {/* NOVO: overlay NASA prioridade (blooms) */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, color: '#cbe1ffff'}}>NASA (blooms)</span>
          <select
            value={nasaLayer}
            onChange={(e) => setNasaLayer(e.target.value)}
            style={{ padding: '6px 8px' }}
          >
            <option value="viirs_chla">VIIRS SNPP Chlorophyll-a</option>
            <option value="modis_chla">MODIS Aqua Chlorophyll-a</option>
            <option value="none">No overlay</option>
          </select>
        </label>

        <input
          type="text" inputMode="decimal" placeholder="Lat (-90 to 90)"
          value={lat} onChange={(e) => setLat(e.target.value)}
          style={{ padding: '6px 8px', flex: '1 1 150px', minWidth: 120, boxSizing: 'border-box' }}
        />
        <input
          type="text" inputMode="decimal" placeholder="Lng (-180 to 180)"
          value={lng} onChange={(e) => setLng(e.target.value)}
          style={{ padding: '6px 8px', flex: '1 1 150px', minWidth: 120, boxSizing: 'border-box' }}
        />
        <input
          type="text" placeholder="Label (optional)"
          value={label} onChange={(e) => setLabel(e.target.value)}
          style={{ padding: '6px 8px', flex: '2 1 220px', minWidth: 160, boxSizing: 'border-box' }}
        />
        <button type="submit" style={{ padding: '6px 10px', flex: '0 0 auto' }}>Add point</button>
        <button type="button" onClick={clearPoints} style={{ padding: '6px 10px', flex: '0 0 auto' }}>Clear</button>
        <button type="button" onClick={() => setShowList(true)} style={{ padding: '6px 10px', marginLeft: 8, flex: '0 0 auto' }}>
          My points
        </button>
          <Link to="/">
            <button type="button" style={{ padding: '6px 10px', marginLeft: 8, flex: '0 0 auto' }}>
          Back to home
            </button>
          </Link>
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
            aria-label="New point by photo"
            style={{ width: 'min(640px, 96vw)' }}
          >
            <div className="modal__header">
              <strong>New point</strong>
              <button className="modal__btn" onClick={cancelCapture}>Cancel</button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div>
                <small style={{ color: '#64748b' }}>Selected coordinates</small><br />
                <span>{pendingCoord ? `${pendingCoord.lat.toFixed(6)}, ${pendingCoord.lng.toFixed(6)}` : '—'}</span>
                {photoExifCoord && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                    EXIF: {photoExifCoord.lat.toFixed(6)}, {photoExifCoord.lng.toFixed(6)} (already applied if confirmed)
                  </div>
                )}
              </div>

              {photoDataUrl && (
                <>
                <img id='imgPlant' src={photoDataUrl} alt="Pré-visualização da foto" style={{ width: '100%', borderRadius: 8, border: '1px solid #e5e7eb' }} />
               {!plantPredLoading && (
                        <label style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                          <span>Scientific Name</span>

                          {/* badges */}
                          {(() => {
                            const hasSuggestion = !!sciSuggestedName?.trim();
                            if (hasSuggestion && Number.isFinite(sciSuggestedProb)) {
                              return (
                                <span className="modal__btn--ok badge_suggestion">
                                  Probable scientific name found ({(sciSuggestedProb * 100).toFixed(1)}%)
                                </span>
                              );
                            }
                            return (
                              <span className="modal__btn--warn badge_suggestion">
                                No suggestions found
                              </span>
                            );
                          })()}

                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              type="text"
                              placeholder="Ex.: Handroanthus albus"
                              value={sciNameDraft === 'No scientific name found' ? '' : sciNameDraft}
                              onChange={(e) => setSciNameDraft(e.target.value)}
                              style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                            />
                          </div>
                        </label>
                      )}
                </>
              )}

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Title (optional)</span>
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  placeholder="e.g., Golden trumpet tree at the square"
                  style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Description</span>
                <textarea
                  rows={4}
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  placeholder="Write a description of the flower/place..."
                  style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
              </label>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="modal__btn" onClick={cancelCapture}>Cancel</button>
                <button className="modal__btn modal__btn--ok" onClick={saveCapturedPoint}>Save point</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Painel ambiental (textos em inglês) */}
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
          opacity: 0.6
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true">🌤️</span>
            <strong style={{ fontSize: 14 }}>Environmental conditions</strong>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* NOVO: botão minimizar/expandir */}
            <button
              type="button"
              onClick={() => setEnvCollapsed(v => !v)}
              aria-expanded={!envCollapsed}
              aria-controls="env-panel-content"
              title={envCollapsed ? 'Expand' : 'Minimize'}
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
              {envCollapsed ? 'Expand' : 'Minimize'}
            </button>

            <button
              onClick={() => loadEnv(centerRef.current.lat, centerRef.current.lng)}
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
              title="Refresh using the map center coordinates"
            >
              {loadingEnv ? 'Refreshing…' : 'Refresh (center)'}
            </button>

            {/* NOVO: Vegetação (500 m) */}
            <button
              onClick={() => loadVeg(centerRef.current.lat, centerRef.current.lng, 500)}
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
              title="Fetch vegetation types within a 500 m radius (OSM)"
            >
              {loadingVeg ? 'Fetching…' : 'Vegetation (500 m)'}
            </button>
          </div>
        </div>

        {/* NOVO: conteúdo colapsável (mantido) */}
        {!envCollapsed && (
          <div id="env-panel-content">
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
              Center: {centerRef.current.lat.toFixed(4)}, {centerRef.current.lng.toFixed(4)}
            </div>

            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {/* Vento */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: '#64748b', minWidth: 64, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden="true">🌬️</span> Wind
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
                  <span aria-hidden="true">💧</span> Humidity
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
                  <span aria-hidden="true">🫧</span> Air quality
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
                  <span aria-hidden="true">🌿</span> Pollen
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
                    Grass {envInfo?.pollen?.grass ?? '—'}
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
                    Trees {envInfo?.pollen?.tree ?? '—'}
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
                    Weed {envInfo?.pollen?.weed ?? '—'}
                  </span>
                </div>
              </div>

              {/* NOVO: Vegetação próxima (OSM) */}
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden="true">🌳</span> Nearby vegetation (OSM)
                </span>

                {vegInfo ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Radius: ~{Math.round(vegInfo.radius)} m • Items: {vegInfo.total}
                    </div>

                    {/* CORREÇÃO: agrupar os dois blocos com um fragmento */}
                    <>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {Object.keys(vegInfo.categories).length === 0 && (
                          <span style={{ color: '#94a3b8' }}>No classes found.</span>
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

                      {vegInfo.names?.length > 0 && (
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          Nearby: {vegInfo.names.join(' · ')}
                        </div>
                      )}
                    </>

                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      Source: OpenStreetMap (Overpass) • {new Date(vegInfo.at).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    {loadingVeg ? 'Loading vegetation…' : 'Click “Vegetation (500 m)” to fetch.'}
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
                {envInfo?.at ? `Updated: ${new Date(envInfo.at).toLocaleString()}` : 'Waiting for data…'}
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
            aria-label="Saved points"
            style={{ width: 'min(640px, 96vw)' }}
          >
            <div className="modal__header">
              <strong>Saved points</strong>
              <button className="modal__btn" onClick={() => setShowList(false)}>Close</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <small style={{ color: '#64748b' }}>{points.length} items</small>
              <button className="modal__btn" onClick={() => refreshPoints({ pan: false })}>Refresh</button>
            </div>

            {points.length === 0 && <div style={{ color: '#94a3b8' }}>No points saved.</div>}

            {points.map(p => (
              <div key={p.id} className="modal__list-item">
                <div style={{ display: 'grid' }}>
                  <span style={{ fontWeight: 600 }}>{p.label?.trim() || '(no label)'}</span>
                  <small style={{ color: '#64748b' }}>{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</small>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="modal__btn modal__btn--ok" onClick={() => handleShow(p.id)}>Show</button>
                  <button className="modal__btn" onClick={() => handleEdit(p.id)}>Edit</button>
                  <button className="modal__btn modal__btn--warn" onClick={() => handleDelete(p.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
     {gateOpen && (
        <div
          className="modal-overlay isplant-overlay"
          onClick={(e) => {
            // clique fora da caixa só fecha o aviso (sem bypass)
            if (e.target === e.currentTarget) setGateOpen(false);
          }}
        >
          <div
            className="modal isplant-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Image not recognized as plant"
          >
            <div className="modal__header isplant-modal__header">
              <div className="isplant-header-left">
                <div aria-hidden="true" className="isplant-icon">🌱</div>
                <strong>Doesn’t look like a plant</strong>
              </div>
            </div>

            <div className="isplant-modal__content">
              <p className="isplant-text">{gateMsg}</p>

              <ul className="isplant-tips">
                <li>Fill the frame with the plant (avoid dominant background).</li>
                <li>Prefer good lighting and focus on leaves/flowers.</li>
                <li>Avoid people/animais/objetos ocupando a maior área.</li>
              </ul>

              <div className="isplant-actions">
                <button className="modal__btn" onClick={handleGateExit}>
                  Exit
                </button>
                <button className="modal__btn modal__btn--ok" onClick={handleGateContinue}>
                  Continue anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}