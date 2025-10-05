import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './Home.jsx'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MapPage from './pages/Map/Map.jsx'
import PointPage from './pages/Point/Point.jsx'
import FeedPage from './pages/Feed/Feed.jsx'
import Story from './pages/Story/Story.jsx'
import ChartsPage from './pages/Charts/Charts.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/story" element={<Story />} />
        <Route path="/charts" element={<ChartsPage />} />
        <Route path="/maps" element={<MapPage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/:slug" element={<PointPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
)
