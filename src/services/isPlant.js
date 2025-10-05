import * as tf from '@tensorflow/tfjs'

let _model = null
let _labels = null
let _ready = false
let _initPromise = null

const INPUT_SIZE = 224

function parseLabelsTXT(txt) {
  // 1 rótulo por linha; algumas versões têm 1001 (com "background" na linha 0)
  return txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
}

function preprocessCenterCropFloat(imgEl) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const vw = imgEl.naturalWidth, vh = imgEl.naturalHeight
  const side = Math.min(vw, vh)
  const sx = Math.floor((vw - side) / 2)
  const sy = Math.floor((vh - side) / 2)
  canvas.width = INPUT_SIZE
  canvas.height = INPUT_SIZE
  ctx.drawImage(imgEl, sx, sy, side, side, 0, 0, INPUT_SIZE, INPUT_SIZE)

  // Para MobileNet v2 float: normalizar para [-1, 1]
  let t = tf.browser.fromPixels(canvas).toFloat()
  t = t.sub(127.5).div(127.5)         // [-1, 1]
  const batched = t.expandDims(0)     // [1,224,224,3]
  t.dispose()
  return batched
}

function softmax(arr) {
  const m = Math.max(...arr)
  const exps = arr.map(v => Math.exp(v - m))
  const s = exps.reduce((a, b) => a + b, 0)
  return exps.map(v => v / s)
}

export async function initImageNetGate() {
  if (_ready) return true
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    const base = import.meta.env.BASE_URL || '/'
    const tfl = window.tflite
    if (!tfl) throw new Error('tfjs-tflite não disponível (window.tflite)')

    // Garantir path dos WASM
    tfl.setWasmPath('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite/dist/')

    // Modelo
    _model = await tfl.loadTFLiteModel(`${base}models/isPlant/mobilenet_v2_1.0_224.tflite`)

    // Labels
    const txt = await fetch(`${base}models/isPlant/labels.txt`).then(r => {
      if (!r.ok) throw new Error('imagenet_labels.txt não encontrado')
      return r.text()
    })
    _labels = parseLabelsTXT(txt)

    _ready = true
    return true
  })()

  return _initPromise
}

export function isImageNetReady() {
  return _ready
}

/**
 * Classifica via ImageNet (topK padrão 5).
 * Retorna: { topK: [{ index, label, prob }], label, prob }
 */
export async function classifyImageNet(imgEl, topK = 5) {
  if (!_ready) throw new Error('initImageNetGate() ainda não foi concluído')
  if (!imgEl || !imgEl.complete || imgEl.naturalWidth === 0) {
    throw new Error('Imagem não está carregada/decodificada')
  }
  const x = preprocessCenterCropFloat(imgEl)
  const out = _model.predict(x)
  const raw = await out.data()   // Float32Array (logits ou probs)
  x.dispose(); out.dispose()

  // Alguns tflite já devolvem probabilidades; aplicamos softmax por segurança
  const probs = (() => {
    // heurística: se soma ~1, já é prob.
    const s = Array.from(raw).reduce((a, b) => a + b, 0)
    return (s > 0.98 && s < 1.02) ? Array.from(raw) : softmax(Array.from(raw))
  })()

  // Algumas listas têm 1001 classes (idx 0 = background). Ajuste aqui se preciso.
  const startIdx = (_labels?.length === probs.length) ? 0
                  : (_labels && _labels.length + 1 === probs.length ? 1 : 0)

  const ranked = probs
    .map((p, i) => ({ i, p }))
    .sort((a, b) => b.p - a.p)
    .slice(0, topK)
    .map(({ i, p }) => ({
      index: i,
      label: _labels?.[i - startIdx] ?? `cls_${i}`,
      prob: p
    }))

  return { topK: ranked, label: ranked[0]?.label ?? '—', prob: ranked[0]?.prob ?? 0 }
}

/**
 * Heurística: decide se topK "parece planta" por palavras-chave.
 * Ajuste thresholds conforme necessário.
 */
const PLANT_KEYWORDS = [
  'acorn', 'acorn squash', 'anemone', 'artichoke', 'banana',
  'bell pepper', 'broccoli', 'buckeye', 'butternut squash',
  'cabbage', 'cardoon', 'cauliflower', 'corn', 'cucumber',
  'custard apple', 'daisy', 'fig', 'granny smith', 'hip',
  'jackfruit', 'lemon', 'orange', 'pineapple', 'pomegranate',
  'potato', 'rapeseed', 'sorrel', 'spaghetti squash',
  'strawberry', 'vine', 'yellow lady\'s slipper', 'zucchini', 'pot'
]
// termos a evitar (falsos positivos comuns)
const NEGATIVE_HINTS = ['sea anemone', 'coral', 'fungus', 'mushroom', 'jellyfish']

export function isPlantLike(pred, {
  minProbAny = 0.18,     // prob mínima em qualquer classe "planta"
  minProbTop = 0.12,     // fallback mais permissivo em top-5
} = {}) {
  if (!pred || !pred.topK?.length) return { ok: false, hit: null }

  for (const item of pred.topK) {
    const lbl = (item.label || '').toLowerCase()
    if (NEGATIVE_HINTS.some(n => lbl.includes(n))) continue
    if (PLANT_KEYWORDS.some(k => lbl.includes(k))) {
      if (item.prob >= minProbAny) return { ok: true, hit: item }
    }
  }

  // fallback: se houver algum termo de planta no top-5, mesmo que com prob menor
  const softHit = pred.topK.find(({ label }) =>
    PLANT_KEYWORDS.some(k => (label || '').toLowerCase().includes(k))
  )
  if (softHit && softHit.prob >= minProbTop) {
    return { ok: true, hit: softHit }
  }

  return { ok: false, hit: null }
}
