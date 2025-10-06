import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import '../Map/Map.css'
import './Charts.css'

// Leitura direta do storage (mesmo prefixo usado pelo app)
const STORE_PREFIX = 'bloomstack.points/'
function loadPointsFromStorage() {
  const out = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(STORE_PREFIX)) continue
      try {
        const raw = localStorage.getItem(key)
        const doc = raw ? JSON.parse(raw) : null
        if (doc && typeof doc.lat === 'number' && typeof doc.lng === 'number') out.push(doc)
      } catch {}
    }
  } catch {}
  return out
}

function formatMonth(iso) {
  try {
    const d = iso ? new Date(iso) : null
    if (!d || Number.isNaN(d.getTime())) return null
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  } catch { return null }
}

function toCsvValue(v) {
  const s = v == null ? '' : String(v)
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(toCsvValue).join(';')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function BarList({ data, valueSuffix = '', maxBarWidth = 360 }) {
  const max = Math.max(1, ...data.map(d => d.value || 0))
  return (
    <div className="barlist">
      {data.map((d, i) => {
        const pct = Math.round(((d.value || 0) / max) * 100)
        return (
          <div key={i} className="chart-bar">
            <div className="chart-bar__row">
              <span className="chart-bar__label" title={d.label}>{d.label}</span>
              <strong className="chart-bar__value">{d.value}{valueSuffix}</strong>
            </div>
            <div className="chart-bar__track" style={{ maxWidth: maxBarWidth }}>
              <div className="chart-bar__fill" style={{ width: `${pct}%` }} aria-label={`${d.label}: ${d.value}${valueSuffix}`} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ChartsPage() {
  const allPoints = useMemo(loadPointsFromStorage, [])

  // NOVO: limites de data (min/max) baseados nos dados
  const { minDateISO, maxDateISO } = useMemo(() => {
    let min = null, max = null
    for (const p of allPoints) {
      const dtIso = p.capturedAt || p.createdAt
      if (!dtIso) continue
      const d = new Date(dtIso)
      if (Number.isNaN(d.getTime())) continue
      const iso = d.toISOString().slice(0, 10)
      if (!min || iso < min) min = iso
      if (!max || iso > max) max = iso
    }
    // fallback para hoje se não houver dados
    const today = new Date().toISOString().slice(0, 10)
    return { minDateISO: min || today, maxDateISO: max || today }
  }, [allPoints])

  // Filtros com calendário (ISO YYYY-MM-DD)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [groupMode, setGroupMode] = useState('month') // 'month' | 'season'

  const points = useMemo(() => {
    const s = startDate ? new Date(startDate).getTime() : null
    const e = endDate ? new Date(endDate).getTime() : null
    return allPoints.filter(p => {
      const ts = new Date(p.capturedAt || p.createdAt || p.updatedAt || Date.now()).getTime()
      if (s && ts < s) return false
      if (e && ts > e + 24*60*60*1000 - 1) return false
      return true
    })
  }, [allPoints, startDate, endDate])

  const {
    total, withSci, withoutSci, uniqueSpecies,
    speciesTop, monthsSeries, seasonsSeries, envAverages
  } = useMemo(() => {
    const total = points.length
    const norm = (s) => (s || '').trim().toLowerCase()

    // nomes científicos
    const withSci = points.filter(p => norm(p.scientificName)).length
    const withoutSci = total - withSci

    // espécies únicas
    const set = new Set(points.map(p => norm(p.scientificName)).filter(Boolean))
    const uniqueSpecies = set.size

    // top espécies
    const map = new Map()
    for (const p of points) {
      const key = norm(p.scientificName) || '(unknown)'
      map.set(key, (map.get(key) || 0) + 1)
    }
    const speciesTop = [...map.entries()].map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12)

    // capturas por mês
    const monthMap = new Map()
    for (const p of points) {
      const m = formatMonth(p.capturedAt || p.createdAt)
      if (!m) continue
      monthMap.set(m, (monthMap.get(m) || 0) + 1)
    }
    const monthsSeries = [...monthMap.entries()].map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label))

    // Série por estação em inglês
    const seasonMap = new Map()
    const addSeason = (label) => seasonMap.set(label, (seasonMap.get(label) || 0) + 1)
    for (const p of points) {
      const dtIso = p.capturedAt || p.createdAt
      if (!dtIso) continue
      const d = new Date(dtIso); if (Number.isNaN(d.getTime())) continue
      const m = d.getMonth() // 0..11
      const south = typeof p.lat === 'number' && p.lat < 0
      let season
      if (south) {
        // Sul: Summer(12-2), Autumn(3-5), Winter(6-8), Spring(9-11)
        if (m === 11 || m === 0 || m === 1) season = 'Summer'
        else if (m >= 2 && m <= 4) season = 'Autumn'
        else if (m >= 5 && m <= 7) season = 'Winter'
        else season = 'Spring'
      } else {
        // Norte: Winter(12-2), Spring(3-5), Summer(6-8), Autumn(9-11)
        if (m === 11 || m === 0 || m === 1) season = 'Winter'
        else if (m >= 2 && m <= 4) season = 'Spring'
        else if (m >= 5 && m <= 7) season = 'Summer'
        else season = 'Autumn'
      }
      addSeason(season)
    }
    const order = ['Spring', 'Summer', 'Autumn', 'Winter']
    const seasonsSeries = order.filter(l => seasonMap.has(l)).map(l => ({ label: l, value: seasonMap.get(l) }))

    // médias ambientais
    const acc = { windSpeed: 0, windDir: 0, humidity: 0, pm25: 0, pm10: 0, o3: 0, count: 0 }
    for (const p of points) {
      const e = p.captureEnv || {}
      const hasAny = ['windSpeed','windDir','humidity','pm25','pm10','o3'].some(k => Number.isFinite(e?.[k]))
      if (!hasAny) continue
      acc.count++
      if (Number.isFinite(e.windSpeed)) acc.windSpeed += e.windSpeed
      if (Number.isFinite(e.windDir)) acc.windDir += e.windDir
      if (Number.isFinite(e.humidity)) acc.humidity += e.humidity
      if (Number.isFinite(e.pm25)) acc.pm25 += e.pm25
      if (Number.isFinite(e.pm10)) acc.pm10 += e.pm10
      if (Number.isFinite(e.o3)) acc.o3 += e.o3
    }
    const avg = (v) => (acc.count ? Math.round((v / acc.count) * 10) / 10 : null)
    const envAverages = {
      windSpeed: avg(acc.windSpeed),
      windDir: acc.count ? Math.round(acc.windDir / acc.count) : null,
      humidity: avg(acc.humidity),
      pm25: avg(acc.pm25),
      pm10: avg(acc.pm10),
      o3: avg(acc.o3),
      samples: acc.count
    }

    return { total, withSci, withoutSci, uniqueSpecies, speciesTop, monthsSeries, seasonsSeries, envAverages }
  }, [points])

  function handleExportCsv() {
    const header = [
      'id','slug','label','lat','lng','capturedAt','scientificName','description',
      'windSpeed','windDir','humidity','pm25','pm10','o3',
      'pollen.grass','pollen.tree','pollen.weed'
    ]
    const rows = [header]
    for (const p of points) {
      const e = p.captureEnv || {}
      const pol = e.pollen || {}
      rows.push([
        p.id ?? '',
        p.slug ?? '',
        p.label ?? '',
        Number.isFinite(p.lat) ? p.lat : '',
        Number.isFinite(p.lng) ? p.lng : '',
        p.capturedAt ?? '',
        p.scientificName ?? '',
        p.description ?? '',
        Number.isFinite(e.windSpeed) ? e.windSpeed : '',
        Number.isFinite(e.windDir) ? e.windDir : '',
        Number.isFinite(e.humidity) ? e.humidity : '',
        Number.isFinite(e.pm25) ? e.pm25 : '',
        Number.isFinite(e.pm10) ? e.pm10 : '',
        Number.isFinite(e.o3) ? e.o3 : '',
        pol.grass ?? '',
        pol.tree ?? '',
        pol.weed ?? ''
      ])
    }
    downloadCsv('bloomstack-collected-data.csv', rows)
  }

  return (
    <div className="map-page map-page-charts" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', zIndex: 1 }}>
      {/* camada de vidro para manter o “look” */}
      <div className="glass-card-charts"></div>

      {/* toolbar com o mesmo estilo do Map.jsx */}
      <form className="map-form" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, color: '#cfdbedff' }}>Start</span>
          <input
            type="date"
            value={startDate}
            min={minDateISO}
            max={maxDateISO}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: '6px 8px' }}
            title="Select start date"
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, color: '#cfdbedff' }}>End</span>
          <input
            type="date"
            value={endDate}
            min={minDateISO}
            max={maxDateISO}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: '6px 8px' }}
            title="Select end date"
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, color: '#cfdbedff' }}>Group by</span>
          <select value={groupMode} onChange={(e) => setGroupMode(e.target.value)} style={{ padding: '6px 8px' }}>
            <option value="month">Month</option>
            <option value="season">Season</option>
          </select>
        </label>

        <button type="button" onClick={handleExportCsv} style={{ padding: '6px 10px' }}>
          Export CSV
        </button>
        <Link to="/">
          <button type="button" style={{ padding: '6px 10px' }}>
            Back to home
          </button>
        </Link>
      </form>

      {/* conteúdo com cartões no mesmo espírito da UI do app */}
      <div style={{ display: 'grid', gap: 12 }}>
        {/* Resumo */}
        <section style={{ display:'grid', gap: 8, padding:12, border:'1px solid #e2e8f0', borderRadius:12, background:'#ffffff', color: 'black' }}>
          <strong>Summary</strong>
          <div style={{ display:'flex', gap: 10, flexWrap:'wrap' }}>
            <span style={{ background:'#f8fafc', border:'1px solid #e2e8f0', padding:'6px 10px', borderRadius:999, fontSize:12, color:'#0f172a' }}>
              Total: <strong>{total}</strong>
            </span>
            <span style={{ background:'#ecfccb', border:'1px solid #d9f99d', padding:'6px 10px', borderRadius:999, fontSize:12, color:'#365314' }}>
              With scientific name: <strong>{withSci}</strong>
            </span>
            <span style={{ background:'#fff7ed', border:'1px solid #fed7aa', padding:'6px 10px', borderRadius:999, fontSize:12, color:'#7c2d12' }}>
              Without scientific name: <strong>{withoutSci}</strong>
            </span>
            <span style={{ background:'#eef2ff', border:'1px solid #c7d2fe', padding:'6px 10px', borderRadius:999, fontSize:12, color:'#3730a3' }}>
              Unique species: <strong>{uniqueSpecies}</strong>
            </span>
          </div>
        </section>

        {/* Linha do tempo de floração (capturas por mês) */}
        <section className="charts-section">
          <strong className="charts-title">Observations by {groupMode === 'season' ? 'season' : 'month'}</strong>
          {(() => {
            const series = groupMode === 'season' ? seasonsSeries : monthsSeries
            return series.length === 0
              ? <div className="charts-empty">No capture dates recorded.</div>
              : <BarList data={series} />
          })()}
          <small className="charts-hint">
            Uses the date recorded at capture time{groupMode === 'season' ? ' and latitude to determine the hemisphere.' : '.'}
          </small>
        </section>

        {/* Distribuição por espécie */}
        <section style={{ display:'grid', gap: 8, padding:12, border:'1px solid #e2e8f0', borderRadius:12, background:'#ffffff' }}>
          <strong className="charts-title">Top species (by observations)</strong>
          {speciesTop.length === 0 ? (
            <div style={{ color:'#94a3b8' }}>No scientific names saved.</div>
          ) : (
            <BarList data={speciesTop} />
          )}
          <small className="charts-hint">Considers the “Scientific Name” field saved in each point.</small>
        </section>

        {/* Condições ambientais médias na captura */}
        <section style={{ display:'grid', gap: 8, padding:12, border:'1px solid #e2e8f0', borderRadius:12, background:'#ffffff' }}>
          <strong className="charts-title">Average environmental conditions (at capture)</strong>
          {envAverages.samples ? (
            <div style={{ display:'flex', gap: 8, flexWrap:'wrap' }}>
              <span style={{ background:'#ecfeff', border:'1px solid #bae6fd', color:'#075985', padding:'6px 10px', borderRadius:999, fontSize:12 }}>
                Wind: {envAverages.windSpeed ?? '—'} km/h
              </span>
              <span style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', color:'#334155', padding:'6px 10px', borderRadius:999, fontSize:12 }}>
                Direction: {envAverages.windDir != null ? `${envAverages.windDir}°` : '—'}
              </span>
              <span style={{ background:'#eef2ff', border:'1px solid #c7d2fe', color:'#3730a3', padding:'6px 10px', borderRadius:999, fontSize:12 }}>
                Humidity: {envAverages.humidity ?? '—'}%
              </span>
              <span style={{ background:'#f8fafc', border:'1px solid #e2e8f0', color:'#0f172a', padding:'6px 10px', borderRadius:999, fontSize:12 }}>
                PM2.5: {envAverages.pm25 ?? '—'} µg/m³
              </span>
              <span style={{ background:'#f8fafc', border:'1px solid #e2e8f0', color:'#0f172a', padding:'6px 10px', borderRadius:999, fontSize:12 }}>
                PM10: {envAverages.pm10 ?? '—'} µg/m³
              </span>
              <span style={{ background:'#f8fafc', border:'1px solid #e2e8f0', color:'#0f172a', padding:'6px 10px', borderRadius:999, fontSize:12 }}>
                O₃: {envAverages.o3 ?? '—'} µg/m³
              </span>
            </div>
          ) : (
            <div style={{ color:'#94a3b8' }}>Not enough environmental samples.</div>
          )}
          <small className="charts-hint">
            Based on {envAverages.samples || 0} observations with environmental data.
          </small>
        </section>
      </div>
    </div>
  )
}
