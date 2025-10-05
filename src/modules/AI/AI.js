import * as tf from '@tensorflow/tfjs'
const tflite = window.tflite;


  // === IA: upload + pre-process + inferência ===
  const IMG_SIZE = 224
  const TOP_K = 3
const MODEL_IS_UINT8 = true;     // seu .tflite atual é quantizado
const INPUT_SIZE = 224;     
  function onFileChange(e) {
    const f = e.target.files?.[0]
    if (!f || !imgRef.current) return
    setPreds([])
    const url = URL.createObjectURL(f)
    imgRef.current.src = url
  }


function preprocessFromImageEl_centerCrop() {
  if (!imgRef.current || !canvasRef.current) return null
  const img = imgRef.current
  const canvas = canvasRef.current
  const ctx = canvas.getContext('2d')

  // 1) quadrado central
  const vw = img.naturalWidth, vh = img.naturalHeight
  const side = Math.min(vw, vh)
  const sx = Math.floor((vw - side) / 2)
  const sy = Math.floor((vh - side) / 2)

  // 2) redimensiona para 224×224
  canvas.width = INPUT_SIZE
  canvas.height = INPUT_SIZE
  ctx.drawImage(img, sx, sy, side, side, 0, 0, INPUT_SIZE, INPUT_SIZE)

  // 3) pixels crus (0..255) → ok para uint8
  let t = tf.browser.fromPixels(canvas)     // int32
  if (!MODEL_IS_UINT8) {
    t = t.toFloat().div(255)                // só se for modelo float
    // ou: t = t.toFloat().sub(127.5).div(127.5) // MobileNetV2 float
  }
  const batched = t.expandDims(0)           // [1,224,224,3]
  t.dispose()
  return batched
}

function looksLikeProbs(arr) {
  let s = 0; for (const v of arr) { if (v < -1e-3 || v > 1+1e-3) return false; s += v }
  return s > 0.98 && s < 1.02
}

async function runInference() {
  if (!model || labelsArr.length === 0) return alert('Modelo/labels ainda não carregados.')
  if (!imgRef.current?.complete) return alert('Imagem ainda não carregada.')

  setStatus('processando...')
  const x = preprocessFromImageEl_centerCrop()
  const y = model.predict(x)
  const data = await y.data()   // Float32Array
  x.dispose(); y.dispose()

  const probs = looksLikeProbs(data)
    ? Array.from(data)
    : (() => {                   // trata como logits
        const a = Array.from(data), m = Math.max(...a)
        const e = a.map(v => Math.exp(v - m)), s = e.reduce((p,c)=>p+c,0)
        return e.map(v => v/s)
      })()

  const top = probs.map((p,i)=>({i,p}))
    .sort((a,b)=>b.p-a.p).slice(0,5)        // top-5 p/ depurar
    .map(({i,p}) => ({ label: labelsArr[i] ?? `classe_${i}`, prob: p }))

  setPreds(top)
  setStatus('pronto')
}

  // === IA: estados e refs (upload + modelo)
  const [status, setStatus] = useState('carregando modelo...')
  const [model, setModel] = useState(null)

  const [labelsArr, setLabelsArr] = useState([])
  const [preds, setPreds] = useState([])
  const imgRef = useRef(null)
  const canvasRef = useRef(null)
  const tfliteRef = useRef(null)
  // === IA: carregar modelo/labels uma vez (Vite-friendly)
 useEffect(() => {
  let alive = true;

  (async () => {
    try {
      const base = import.meta.env.BASE_URL || '/';

      // pega a lib global carregada via <script> no index.html
      const tfl = window.tflite;
      if (!tfl) {
        setStatus('tfjs-tflite não carregado (window.tflite indefinido)');
        return;
      }

      // importante: indicar o caminho dos WASM antes de carregar o modelo
      tfl.setWasmPath('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite/dist/');

      setStatus('baixando modelo (.tflite)...');
      const modelUrl = `${base}models/models.tflite`; // ajuste o nome se necessário
      const m = await tfl.loadTFLiteModel(modelUrl);
      if (!alive) return;
      setModel(m);

      setStatus('carregando labels...');
      async function loadLabels() {
        // 1) tenta CSV (formato do vision-classifier-plants-v1)
        const csvUrl = `${base}models/labels2.csv`;
        const csvResp = await fetch(csvUrl);
        if (csvResp.ok) {
          const csvText = await csvResp.text();
          const lines = csvText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          const body = lines.slice(1);
          const labels = body.map(line => {
            // divide de forma robusta: id, label (label pode ter vírgulas e aspas)
            // exemplos válidos:
            //   0,Abelia chinensis
            //   123,"Bidens, sp."
            const m = line.match(/^\s*"?(\d+)"?\s*,\s*"?(.+?)"?\s*$/);
            return m ? m[2] : line; // fallback se não casar
          });
          return labels;
        }

      }

      const labels = await loadLabels();
      if (!alive) return;
      setLabelsArr(labels);

      setStatus('pronto');

    } catch (e) {
      console.error(e);
      setStatus('erro ao carregar modelo/labels');
    }
  })();

  return () => { alive = false; };
}, []);


//   {/* ===== BLOCO IA: upload + predição ===== */}
//       <div style={{ marginTop: 16, padding: 12, border: '1px solid #e5e7eb', borderRadius: 8 }}>
//         <h3 style={{ margin: 0, marginBottom: 8 }}>Identificar espécie pela imagem (on-device)</h3>
//         <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
//           <input type="file" accept="image/*" onChange={onFileChange} />
//           <button
//             type="button"
//             disabled={!model || labelsArr.length === 0}
//             onClick={runInference}
//             style={{ padding: '6px 10px' }}
//             title={!model ? 'Carregando modelo...' : ''}
//           >
//             Processar imagem
//           </button>
//           <span style={{ color: '#64748b' }}>status: {status}</span>
//         </div>

//         <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
//           <img ref={imgRef} alt="preview" style={{ maxWidth: 260, borderRadius: 8, border: '1px solid #e5e7eb' }} />
//           <canvas ref={canvasRef} width={IMG_SIZE} height={IMG_SIZE} style={{ display: 'none' }} />
//           <div style={{ minWidth: 220 }}>
//             <div style={{ fontWeight: 600, marginBottom: 6 }}>Top {TOP_K}</div>
//             {preds.length === 0 && <div style={{ color: '#94a3b8' }}>Envie uma imagem e clique em “Processar imagem”.</div>}
//             <ul style={{ margin: 0, paddingLeft: 16 }}>
//               {preds.map((p, i) => (
//                 <li key={i}>{i+1}. {p.label} — {(p.prob * 100).toFixed(1)}%</li>
//               ))}
//             </ul>
//           </div>
//         </div>

//         <small style={{ display: 'block', marginTop: 8, color: '#64748b' }}>
//           Se seu modelo esperar <code>[0,1]</code>, troque a normalização em <em>preprocessFromImageEl</em> por <code>x/255</code>.
//         </small>
//       </div>