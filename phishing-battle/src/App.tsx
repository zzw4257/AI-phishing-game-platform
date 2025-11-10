import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import AdminPage from './pages/AdminPage'
import PhisherPage from './pages/PhisherPage'
import CitizenPage from './pages/CitizenPage'
import CityLeaderPage from './pages/CityLeaderPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/phisher" element={<PhisherPage />} />
        <Route path="/citizen" element={<CitizenPage />} />
        <Route path="/leader" element={<CityLeaderPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
