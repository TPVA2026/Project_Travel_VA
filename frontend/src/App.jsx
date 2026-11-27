import { useEffect } from 'react'
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Navbar from './components/common/Navbar.jsx'
import Footer from './components/common/Footer.jsx'
import HomePage from './pages/HomePage.jsx'
import ResultsPage from './pages/ResultsPage.jsx'
import SelectedPlanPage from './pages/SelectedPlanPage.jsx'
import WelcomePage from './pages/WelcomePage.jsx'
import MyTripsPage from './pages/MyTripsPage.jsx'
import SignInPage from './pages/SignInPage.jsx'

function ScrollToTop() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname, search])

  return null
}

function AuthRequiredRedirect() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const onRequired = () => {
      if (location.pathname !== '/signin') {
        navigate('/signin', { state: { from: location.pathname + location.search } })
      }
    }
    window.addEventListener('tpva-auth-required', onRequired)
    return () => window.removeEventListener('tpva-auth-required', onRequired)
  }, [location.pathname, location.search, navigate])

  return null
}

function Shell() {
  return (
    <div className="shell">
      <ScrollToTop />
      <AuthRequiredRedirect />
      <Navbar />
      <main className="main" id="main-content" tabIndex={-1}>
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
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/result" element={<Navigate to="/results" replace />} />
        <Route path="/selected" element={<SelectedPlanPage />} />
        <Route path="/my-trips" element={<MyTripsPage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/describe" element={<Navigate to="/" replace />} />
        <Route path="/describe/*" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
