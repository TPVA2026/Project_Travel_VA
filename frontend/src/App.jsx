import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import Navbar from './components/common/Navbar.jsx'
import Footer from './components/common/Footer.jsx'
import HomePage from './pages/HomePage.jsx'
import ResultsPage from './pages/ResultsPage.jsx'
import SelectedPlanPage from './pages/SelectedPlanPage.jsx'

function Shell() {
  return (
    <div className="shell">
      <Navbar />
      <main className="main">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/selected" element={<SelectedPlanPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}