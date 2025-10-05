// src/services/plantId.js
import * as tf from '@tensorflow/tfjs'

// Cache interno (singleton do módulo)
let _model = null
let _labels = null
let _ready = false
let _initPromise = null

// Config do modelo "vision-classifier-plants-v1"
const INPUT_SIZE = 224
const MODEL_IS_UINT8 = true // esse modelo LiteRT normalmente é quantizado

// Parser robusto para labels.csv (formato: id,label — com/sem aspas, com/sem header)
function parseLabelsCSV(csvText) {
  const lines = csvText.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const body = /^\s*"?\d+"?\s*,/.test(lines[0]) ? lines : lines.slice(1)
  const labels = body.map(line => {
    const m = line.match(/^\s*"?(\d+)"?\s*,\s*"?(.+?)"?\s*$/)
    return m ? m[2] : line
  })
  return labels
}

// Pré-processamento: center-crop quadrado + resize 224 → tensor [1,224,224,3] (uint8/int32)
function preprocessFromImageEl_centerCrop(imgEl) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const vw = imgEl.naturalWidth
  const vh = imgEl.naturalHeight
  const side = Math.min(vw, vh)
  const sx = Math.floor((vw - side) / 2)
  const sy = Math.floor((vh - side) / 2)

  canvas.width = INPUT_SIZE
  canvas.height = INPUT_SIZE
  ctx.drawImage(imgEl, sx, sy, side, side, 0, 0, INPUT_SIZE, INPUT_SIZE)

  let t = tf.browser.fromPixels(canvas) // int32 0..255
  if (!MODEL_IS_UINT8) {
    // (para modelos float, ajuste aqui)
    t = t.toFloat().div(255)
  }
  const batched = t.expandDims(0) // [1,H,W,3]
  t.dispose()
  return batched
}

function looksLikeProbabilities(arr) {
  let s = 0
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i]
    if (v < -1e-3 || v > 1 + 1e-3) return false
    s += v
  }
  return s > 0.98 && s < 1.02
}

/**
 * Inicializa TFLite + carrega modelo e labels (executar 1x na app).
 * Espera encontrar:
 *  - /models/models.tflite
 *  - /models/labels.csv
 */
export async function initPlantId() {
  if (_ready) return true
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    const base = import.meta.env.BASE_URL || '/'

    // TFLite global via <script> no index.html
    const tfl = window.tflite
    if (!tfl) throw new Error('tfjs-tflite não carregado (window.tflite indefinido)')

    // AVISO: definir o path dos WASM antes do loadTFLiteModel
    tfl.setWasmPath('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite/dist/')

    // Modelo
    const modelUrl = `${base}models/models.tflite`
    _model = await tfl.loadTFLiteModel(modelUrl)

    // Labels (CSV)
    const labelsUrl = `${base}models/labels.csv`
    const txt = await fetch(labelsUrl).then(r => {
      if (!r.ok) throw new Error(`labels.csv não encontrado em ${labelsUrl}`)
      return r.text()
    })
    _labels = parseLabelsCSV(txt)

    _ready = true
    return true
  })()

  return _initPromise
}

/**
 * Classifica uma imagem HTML (já carregada).
 * Retorna { label, prob, topK } onde topK = array dos N primeiros.
 */
export async function classifyImage(imgEl, topK = 3) {
  if (!_ready) throw new Error('initPlantId() ainda não foi chamado/concluído')
  if (!imgEl || !imgEl.complete) throw new Error('Imagem ainda não está carregada')

  const input = preprocessFromImageEl_centerCrop(imgEl)
  const out = _model.predict(input)
  const data = await out.data() // Float32Array
  input.dispose()
  out.dispose()

  let probs
  if (looksLikeProbabilities(data)) {
    probs = Array.from(data)
  } else {
    const a = Array.from(data)
    const m = Math.max(...a)
    const e = a.map(v => Math.exp(v - m))
    const s = e.reduce((p, c) => p + c, 0)
    probs = e.map(v => v / s)
  }

  const ranked = probs
    .map((p, i) => ({ i, p }))
    .sort((a, b) => b.p - a.p)

  const top = ranked.slice(0, topK).map(({ i, p }) => ({
    index: i,
    label: _labels?.[i] ?? `classe_${i}`,
    prob: p
  }))

  return { label: top[0]?.label ?? '—', prob: top[0]?.prob ?? 0, topK: top }
}
