import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './Home.jsx'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MapPage from './pages/Map/Map.jsx'
import PointPage from './pages/Point/Point.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/maps" element={<MapPage />} />
        <Route path="/:slug" element={<PointPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
)
