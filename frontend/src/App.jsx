import React from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import DonorView from './pages/DonorView.jsx'
import Catalog from './pages/Catalog.jsx'
import Cabinet from './pages/Cabinet.jsx'

export default function App() {
  return (
    <div className="pd-app">
      <header className="pd-header">
        <NavLink to="/" className="pd-logo">⚙️ PartsDonor</NavLink>
        <nav className="pd-nav">
          <NavLink to="/" end>Каталог</NavLink>
          <NavLink to="/cabinet">Кабинет</NavLink>
        </nav>
      </header>
      <main className="pd-main">
        <Routes>
          <Route path="/" element={<Catalog />} />
          <Route path="/donor/:device" element={<DonorView />} />
          <Route path="/cabinet" element={<Cabinet />} />
        </Routes>
      </main>
    </div>
  )
}
