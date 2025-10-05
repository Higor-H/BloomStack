import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './Feed.css'
import { loadPoints } from '../../services/pointsStorage.js'

export default function FeedPage() {
  const [items, setItems] = useState([])

  function refresh() {
    const pts = loadPoints()
    const sorted = pts.slice().sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime()
      const tb = new Date(b.createdAt || 0).getTime()
      return tb - ta // mais recentes primeiro
    })
    setItems(sorted)
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <>
      {/* fundo com pétalas, estilo semelhante à Home */}
      <div className="petals-container">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="petal"
            style={{
              left: `${Math.random() * 100}vw`,
              animationDuration: `${4 + Math.random() * 6}s`,
              animationDelay: `${Math.random() * 5}s`
            }}
          />
        ))}
      </div>

      <div className="glass-card feed-card">
        <div className="feed-header">
          <h1>Feed de flores</h1>
          <div className="feed-actions">
            <Link to="/" className="btn-link">Início</Link>
            <Link to="/maps" className="btn-link">Mapa</Link>
            <button className="btn" onClick={refresh}>Atualizar</button>
          </div>
        </div>

        <small className="feed-subtitle">{items.length} registros</small>

        {items.length === 0 && (
          <div className="feed-empty">Nenhum ponto cadastrado.</div>
        )}

        <div className="feed-grid">
          {items.map(p => (
            <Link key={p.id} to={`/${encodeURIComponent(p.slug)}`} className="feed-item">
              <div className="thumb">
                {p.photoUrl
                  ? <img src={p.photoUrl} alt={p.label || 'sem rótulo'} />
                  : <div className="thumb-placeholder">Sem foto</div>}
              </div>
              <div className="meta">
                <div className="title">{(p.label || '(sem rótulo)').trim()}</div>
                <div className="coords">{Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
