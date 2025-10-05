// Conversão graus -> ponto cardeal simples
export function degToCompass(deg) {
  if (deg == null || Number.isNaN(deg)) return '—'
  const dirs = ['N','NNE','NE','ENE','L','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO']
  return dirs[Math.round(((deg % 360) / 22.5)) % 16]
}

// Clima + Umidade + Qualidade do ar + Pólen (Open-Meteo)
export async function fetchEnvInfo(lat, lng) {
  const tz = 'auto'
  const out = {
    lat: Number(lat), lng: Number(lng),
    windSpeed: null, windDir: null, humidity: null,
    pm25: null, pm10: null, o3: null,
    pollen: { grass: null, tree: null, weed: null },
    at: new Date().toISOString()
  }

  // Clima atual + umidade horária
  try {
    const wUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&hourly=relativehumidity_2m&timezone=${tz}`
    const wRes = await fetch(wUrl)
    const w = await wRes.json()
    out.windSpeed = w?.current_weather?.windspeed ?? null
    out.windDir = w?.current_weather?.winddirection ?? null

    try {
      const times = w?.hourly?.time || []
      const hums = w?.hourly?.relativehumidity_2m || []
      if (times.length && hums.length) {
        const nowIso = new Date().toISOString().slice(0, 13) + ':00'
        let idx = times.lastIndexOf(nowIso)
        if (idx < 0) idx = hums.length - 1
        out.humidity = hums[idx] ?? null
      }
    } catch {}
  } catch {}

  // Qualidade do ar
  try {
    const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&hourly=pm2_5,pm10,ozone&timezone=${tz}`
    const aqRes = await fetch(aqUrl)
    const aqJson = await aqRes.json()
    const t = aqJson?.hourly?.time || []
    const last = t.length ? t.length - 1 : -1
    out.pm25 = last >= 0 ? aqJson?.hourly?.pm2_5?.[last] ?? null : null
    out.pm10 = last >= 0 ? aqJson?.hourly?.pm10?.[last] ?? null : null
    out.o3   = last >= 0 ? aqJson?.hourly?.ozone?.[last]   ?? null : null
  } catch {}

  // Pólen
  try {
    const polUrl = `https://pollen-api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=grass_pollen,tree_pollen,weed_pollen&timezone=${tz}`
    const polRes = await fetch(polUrl)
    const polJson = await polRes.json()
    const t = polJson?.hourly?.time || []
    const last = t.length ? t.length - 1 : -1
    out.pollen = {
      grass: last >= 0 ? polJson?.hourly?.grass_pollen?.[last] ?? null : null,
      tree:  last >= 0 ? polJson?.hourly?.tree_pollen?.[last]  ?? null : null,
      weed:  last >= 0 ? polJson?.hourly?.weed_pollen?.[last]  ?? null : null,
    }
  } catch {}

  out.at = new Date().toISOString()
  return out
}

// Vegetação próxima via Overpass (OSM)
export async function fetchVegetationInfo(lat, lng, radius = 500) {
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

  return {
    lat: Number(lat), lng: Number(lng),
    radius,
    total: els.length,
    categories,
    names: Array.from(names).slice(0, 8),
    at: new Date().toISOString()
  }
}
