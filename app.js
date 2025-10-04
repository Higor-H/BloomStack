(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // Tema
  function initTheme() {
    const root = document.documentElement;
    const btn = $('#themeToggle');
    const saved = localStorage.getItem('theme') || 'light';
    root.setAttribute('data-theme', saved);
    if (btn) {
      btn.setAttribute('aria-pressed', saved === 'dark' ? 'true' : 'false');
      btn.addEventListener('click', () => {
        const cur = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        root.setAttribute('data-theme', cur);
        btn.setAttribute('aria-pressed', cur === 'dark' ? 'true' : 'false');
        localStorage.setItem('theme', cur);
      });
    }
    const y = new Date().getFullYear();
    const yearEl = $('#year'); if (yearEl) yearEl.textContent = y;
  }

  // NASA GIBS layers (WMTS)
  const GIBS = {
    endpoint: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
    layers: {
      truecolor: { id: 'MODIS_Terra_CorrectedReflectance_TrueColor', fmt: 'jpg', tms: 'GoogleMapsCompatible_Level9', z: { min: 1, max: 9 } },
      ndvi:      { id: 'MODIS_Terra_NDVI_16Day',                     fmt: 'png', tms: 'GoogleMapsCompatible_Level7', z: { min: 1, max: 7 } },
      evi:       { id: 'MODIS_Terra_EVI_16Day',                      fmt: 'png', tms: 'GoogleMapsCompatible_Level7', z: { min: 1, max: 7 } },
    },
    attribution: 'Imagery © NASA GIBS/ESDIS'
  };

  function isoDate(d) {
    const dt = new Date(d);
    return dt.toISOString().slice(0, 10);
  }
  function clampToTerraStart(d) {
    // Terra: 1999-12-18 (produtos globais práticos após 2000). Usamos 2000-02-24 como padrão seguro.
    const min = new Date('2000-02-24');
    const nd = new Date(d);
    return nd < min ? min : nd;
  }
  function snap16Day(d) {
    // Ajusta para ciclos de 16 dias (próximo passado)
    const base = new Date('2000-02-24');
    const ms = 16 * 24 * 3600 * 1000;
    const t = new Date(d).getTime();
    const snapped = new Date(base.getTime() + Math.floor((t - base.getTime()) / ms) * ms);
    return snapped;
  }

  let map, activeLayer;
  function buildLayer(layerKey, date) {
    const meta = GIBS.layers[layerKey];
    const day = layerKey === 'truecolor' ? isoDate(date) : isoDate(snap16Day(date));
    const url = `${GIBS.endpoint}/${meta.id}/default/${day}/${meta.tms}/{z}/{y}/{x}.${meta.fmt}`;
    return L.tileLayer(url, {
      tileSize: 256, updateWhenIdle: true, keepBuffer: 2,
      minZoom: meta.z.min, maxZoom: meta.z.max,
      attribution: GIBS.attribution
    });
  }

  function initMap() {
    const mapEl = $('#map');
    if (!mapEl) return;

    const today = new Date();
    const dateInput = $('#datePicker');
    const layerSel = $('#gibsLayerSelect');

    // Defaults
    const startDate = isoDate(clampToTerraStart(today));
    if (dateInput) {
      dateInput.min = '2000-02-24';
      dateInput.max = isoDate(today);
      dateInput.value = startDate;
    }

    map = L.map('map', {
      center: [0, 0],
      zoom: 2,
      zoomControl: true
    });

    // Inicializar camada
    activeLayer = buildLayer(layerSel?.value || 'truecolor', startDate);
    activeLayer.addTo(map);

    // Eventos de UI
    layerSel?.addEventListener('change', () => {
      const d = dateInput?.value || startDate;
      map.removeLayer(activeLayer);
      activeLayer = buildLayer(layerSel.value, d);
      activeLayer.addTo(map);
    });

    dateInput?.addEventListener('change', () => {
      const d = dateInput.value;
      map.removeLayer(activeLayer);
      const key = layerSel?.value || 'truecolor';
      activeLayer = buildLayer(key, d);
      activeLayer.addTo(map);
    });

    // Acesso rápido à busca com '/'
    const search = $('#searchInput');
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && search) {
        e.preventDefault();
        search.focus();
      }
    });
  }

  // Série temporal demo com detecção de picos
  async function initTimeseriesDemo() {
    try {
      const res = await fetch('./data/sample_timeseries.json');
      const data = await res.json();
      renderTimeseries(data);
    } catch (e) {
      console.warn('Falha ao carregar série temporal demo', e);
    }
  }

  function movingAvg(arr, k = 3) {
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const s = Math.max(0, i - Math.floor(k / 2));
      const e = Math.min(arr.length, i + Math.ceil(k / 2));
      const slice = arr.slice(s, e);
      out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    return out;
  }

  function detectPeaks(series, opts = { smooth: 3, minProm: 0.05 }) {
    const vals = series.map(p => p.value);
    const sm = movingAvg(vals, opts.smooth);
    const peaks = [];
    for (let i = 1; i < sm.length - 1; i++) {
      const isPeak = sm[i] > sm[i - 1] && sm[i] > sm[i + 1];
      const prom = Math.min(sm[i] - sm[i - 1], sm[i] - sm[i + 1]);
      if (isPeak && prom >= opts.minProm) peaks.push({ idx: i, date: series[i].date, value: series[i].value });
    }
    return peaks;
  }

  function linearTrend(xs, ys) {
    const n = xs.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      den += (xs[i] - meanX) ** 2;
    }
    const slope = den ? num / den : 0;
    return slope;
  }

  function renderTimeseries(payload) {
    const { aoi, units, series } = payload;
    const metaEl = $('#tsMeta');
    const insightEl = $('#tsInsights');
    const canvas = $('#tsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Preparar dados
    const points = series.map(p => ({ t: new Date(p.date), v: p.value }));
    const dates = points.map(p => p.t);
    const vals = points.map(p => p.v);

    // Dimensões
    const W = canvas.clientWidth || canvas.width; canvas.width = W;
    const H = canvas.height;
    const pad = { l: 36, r: 8, t: 10, b: 24 };

    // Escalas
    const tMin = +dates[0], tMax = +dates[dates.length - 1];
    const vMin = Math.min(...vals, 0), vMax = Math.max(...vals, 1);
    const x = (t) => pad.l + (W - pad.l - pad.r) * ((+t - tMin) / (tMax - tMin));
    const y = (v) => H - pad.b - (H - pad.t - pad.b) * ((v - vMin) / (vMax - vMin));

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Grade leve
    ctx.strokeStyle = 'rgba(128,128,128,.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const yy = pad.t + i * (H - pad.t - pad.b) / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(W - pad.r, yy); ctx.stroke();
    }

    // Linha
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#7c3aed';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const xx = x(p.t), yy = y(p.v);
      if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    // Picos
    const peaks = detectPeaks(series);
    ctx.fillStyle = '#22c55e';
    peaks.forEach(pk => {
      const xx = x(new Date(pk.date)), yy = y(pk.value);
      ctx.beginPath(); ctx.arc(xx, yy, 3, 0, Math.PI * 2); ctx.fill();
    });

    // Eixos simples
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#b6bbc6';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const v = vMin + i * (vMax - vMin) / 4;
      const yy = y(v);
      ctx.fillText(v.toFixed(2), pad.l - 6, yy);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const mid = dates[Math.floor(dates.length / 2)];
    ctx.fillText(new Date(series[0].date).getFullYear() + '–' + new Date(series[series.length - 1].date).getFullYear(), (W - pad.r + pad.l) / 2, H - pad.b + 6);

    // Metadados
    metaEl.textContent = `${aoi.name} • ${units}`;

    // Insights
    const years = {};
    peaks.forEach(p => {
      const y = new Date(p.date).getFullYear();
      years[y] = Math.max(years[y] || 0, p.value);
    });
    const yKeys = Object.keys(years).map(Number).sort((a, b) => a - b);
    const slope = yKeys.length > 1 ? linearTrend(yKeys, yKeys.map(y => years[y])) : 0;
    const lastPeak = peaks[peaks.length - 1];
    insightEl.innerHTML = `
      Último pico: ${lastPeak ? new Date(lastPeak.date).toLocaleDateString() + ' (' + lastPeak.value.toFixed(2) + ')' : '—'} • 
      Tendência anual: ${slope >= 0 ? 'alta' : 'baixa'} (${slope.toFixed(3)}/ano) •
      Picos detectados: ${peaks.length}
    `;
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMap();
    initTimeseriesDemo();
  });
})();
