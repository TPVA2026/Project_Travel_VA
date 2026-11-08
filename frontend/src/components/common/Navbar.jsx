import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { clearSelectedPlan } from '../../services/api.js'
import Icon from './Icon.jsx'

const STEPS = [
  { to: '/', end: true, step: '1', label: 'Plan a trip', hint: 'Dates, budget and style' },
  { to: '/results', step: '2', label: 'Compare', hint: 'Verified plans side by side' },
  { to: '/selected', step: '3', label: 'Your trip', hint: 'Schedule, costs and changes' },
]

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const headerRef = useRef(null)
  const toggleRef = useRef(null)
  const firstLinkRef = useRef(null)
  const isHome = location.pathname === '/'
  const isWelcome = location.pathname === '/welcome'
  const isWide = isWelcome
  const showCta = !isHome && !isWelcome

  useEffect(() => {
    setOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    const onPointerDown = (event) => {
      if (headerRef.current && !headerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    const desktop = window.matchMedia('(min-width: 861px)')
    const onDesktop = (event) => {
      if (event.matches) setOpen(false)
    }
    const header = headerRef.current
    const onFocusOut = (event) => {
      if (!header?.contains(event.relatedTarget)) setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    desktop.addEventListener?.('change', onDesktop)
    header?.addEventListener('focusout', onFocusOut)
    document.body.style.overflow = 'hidden'
    firstLinkRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
      desktop.removeEventListener?.('change', onDesktop)
      header?.removeEventListener('focusout', onFocusOut)
      document.body.style.overflow = ''
    }
  }, [open])

  const startNewTrip = () => {
    sessionStorage.removeItem('tpva-travel-request')
    sessionStorage.removeItem('tpva-ai-plan')
    clearSelectedPlan()
    setOpen(false)
    navigate('/')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="site-header no-print" ref={headerRef}>
        <div className={`site-header-inner${isWide ? ' is-wide' : ''}`}>
          <NavLink to="/" className="site-brand">
            <span className="brand-mark" aria-hidden="true">
              <Icon name="compass" size={20} />
            </span>
            <span className="brand-copy">
              <strong>Travel Assistant</strong>
              <span>Personal trip planner</span>
            </span>
          </NavLink>

          <nav className="header-nav" aria-label="Trip steps">
            {STEPS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `header-nav-link${isActive ? ' is-active' : ''}`
                }
              >
                <span className="nav-step" aria-hidden="true">
                  {item.step}
                </span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {showCta && (
            <button
              type="button"
              className="header-cta"
              onClick={startNewTrip}
              title="Clear this trip and open a fresh planning form"
            >
              <Icon name="refresh" size={16} />
              Start a new trip
            </button>
          )}

          <button
            type="button"
            ref={toggleRef}
            className="menu-toggle"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name={open ? 'close' : 'menu'} size={22} />
          </button>
        </div>

        <div id="mobile-menu" className={`mobile-menu${open ? ' is-open' : ''}`}>
          <nav className="mobile-nav" aria-label="Trip steps">
            {STEPS.map((item, index) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                ref={index === 0 ? firstLinkRef : undefined}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `mobile-nav-link${isActive ? ' is-active' : ''}`
                }
              >
                <span className="nav-step" aria-hidden="true">
                  {item.step}
                </span>
                <span className="mobile-nav-copy">
                  <strong>{item.label}</strong>
                  <span>{item.hint}</span>
                </span>
                <Icon name="arrowRight" size={17} />
              </NavLink>
            ))}
          </nav>

          {showCta && (
            <button type="button" className="mobile-cta" onClick={startNewTrip}>
              <Icon name="refresh" size={17} />
              Start a new trip
            </button>
          )}
        </div>
      </header>
    </>
  )
}
