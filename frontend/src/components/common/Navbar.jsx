import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { resetCurrentTrip } from '../../services/api.js'
import Icon from './Icon.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'

const NAV_LINKS = [
  { to: '/', label: 'Plan a trip', icon: 'sparkle' },
  { to: '/results', label: 'Compare plans', icon: 'route' },
  { to: '/selected', label: 'Your itinerary', icon: 'check' },
  { to: '/my-trips', label: 'My Trips', icon: 'bookmark' },
]

export default function Navbar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const headerRef = useRef(null)
  const toggleRef = useRef(null)
  const firstLinkRef = useRef(null)
  const isWelcome = location.pathname === '/welcome'

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
    const desktop = window.matchMedia('(min-width: 961px)')
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
    resetCurrentTrip()
    setOpen(false)
    navigate('/')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const navClass = ({ isActive }) => `header-nav-link${isActive ? ' is-active' : ''}`

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="site-header no-print" ref={headerRef}>
        <div className={`site-header-inner${isWelcome ? ' is-wide' : ''}`}>
          <NavLink to="/welcome" className="site-brand" aria-label="Travel Assistant home">
            <span className="brand-mark" aria-hidden="true">
              <Icon name="compass" size={20} />
            </span>
            <span className="brand-copy">
              <strong>Travel Assistant</strong>
              <span>Plan, compare, save</span>
            </span>
          </NavLink>

          <nav className="header-nav" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} className={navClass}>
                <Icon name={link.icon} size={16} />
                <span>{link.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="header-actions">
            {user ? (
              <button type="button" className="header-account-button" onClick={signOut}>
                Sign out
              </button>
            ) : (
              <NavLink to="/signin" className="header-account-button header-account-button--signin">
                Sign in
              </NavLink>
            )}
            <button type="button" className="header-cta" onClick={startNewTrip} title="Start planning a new trip">
              <Icon name="refresh" size={16} />
              New trip
            </button>
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
        </div>

        <div id="mobile-menu" className={`mobile-menu${open ? ' is-open' : ''}`}>
          <nav className="mobile-nav" aria-label="Mobile">
            {NAV_LINKS.map((link, index) => (
              <NavLink
                key={link.to}
                to={link.to}
                ref={index === 0 ? firstLinkRef : undefined}
                className={({ isActive }) => `mobile-nav-link${isActive ? ' is-active' : ''}`}
                onClick={() => setOpen(false)}
              >
                <Icon name={link.icon} size={18} />
                <span className="mobile-nav-copy">
                  <strong>{link.label}</strong>
                </span>
                <Icon name="arrowRight" size={16} />
              </NavLink>
            ))}
          </nav>

          <div className="mobile-account">
            {user ? (
              <button type="button" className="mobile-auth-btn" onClick={() => { signOut(); setOpen(false) }}>
                Sign out
              </button>
            ) : (
              <NavLink to="/signin" className="mobile-auth-btn mobile-auth-btn--primary" onClick={() => setOpen(false)}>
                Sign in
              </NavLink>
            )}
            <button type="button" className="mobile-cta" onClick={startNewTrip}>
              <Icon name="refresh" size={17} />
              Start a new trip
            </button>
          </div>
        </div>
      </header>
    </>
  )
}
