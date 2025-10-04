import { useEffect, useRef, useState } from 'react'
import './Camera.css'

export default function Camera({ open, onClose, onCapture, facingMode = 'environment' }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [error, setError] = useState('')

  function isLocalhost() {
    const h = window.location.hostname
    return h === 'localhost' || h === '127.0.0.1' || h === '::1'
  }

  useEffect(() => {
    let stopped = false
    async function start() {
      setError('')
      if (!open) return
      if (!window.isSecureContext && !isLocalhost()) {
        setError('A câmera só pode ser acessada via HTTPS. Abra o app em https:// ou use localhost.')
        return
      }
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Câmera indisponível neste dispositivo/ambiente.')
          return
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
          audio: false
        })
        if (stopped) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      } catch (e) {
        console.warn('Erro ao abrir câmera', e)
        setError('Não foi possível acessar a câmera.')
      }
    }
    start()
    return () => {
      stopped = true
      try {
        const s = streamRef.current
        if (s) s.getTracks().forEach(t => t.stop())
      } catch {}
      streamRef.current = null
    }
  }, [open, facingMode])

  async function takePhoto() {
    try {
      const video = videoRef.current
      if (!video) return
       console.log("📸 Capturando foto...") // <-- teste
      const w = video.videoWidth || 1280
      const h = video.videoHeight || 720
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, w, h)
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
      if (blob && onCapture) onCapture(blob)
    } catch (e) {
      console.warn('Falha ao capturar foto', e)
      setError('Não foi possível capturar a foto.')
    }
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Capturar foto da câmera">
        <div className="modal__header">
          <strong>Capturar foto</strong>
          <button className="modal__btn" onClick={onClose}>Fechar</button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: 'auto' }} />
          </div>
          {error && <small style={{ color: '#ef4444' }}>{error}</small>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="modal__btn" onClick={onClose}>Cancelar</button>
            <button className="modal__btn modal__btn--ok" onClick={takePhoto}>Tirar foto</button>
          </div>
        </div>
      </div>
    </div>
  )
}
