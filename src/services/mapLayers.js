import L from 'leaflet'

// Datas GIBS
export const GIBS_MIN_DATE = '2000-02-24'
export function getGibsDate() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}
export function clampGibsDate(str) {
  if (!str) return getGibsDate()
  const min = new Date(GIBS_MIN_DATE).getTime()
  const max = new Date(getGibsDate()).getTime()
  const t = new Date(str).getTime()
  if (Number.isNaN(t)) return getGibsDate()
  if (t < min) return GIBS_MIN_DATE
  if (t > max) return getGibsDate()
  return new Date(t).toISOString().slice(0, 10)
}

// Camadas base
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
export function buildBaseLayer(kind, date) {
  return kind === 'gibs' ? buildGibsLayer(date) : buildOsmLayer()
}

// Overlay de limites
export function buildBoundariesOverlay() {
  return L.tileLayer(
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community'
    }
  )
}

// Overlays NASA (blooms – Chlorophyll-a)
export function buildNasaOverlay(kind, date = getGibsDate()) {
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
