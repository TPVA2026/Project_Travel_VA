import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { resetCurrentTrip } from '../../services/api.js'
import Icon from './Icon.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'

export default function Navbar() {
  const { user, requestSignIn, signOut } = useAuth()
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
    resetCurrentTrip()
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
          <NavLink to="/welcome" className="site-brand">
            <span className="brand-mark" aria-hidden="true">
              <Icon name="compass" size={20} />
            </span>
            <span className="brand-copy">
              <strong>Travel Assistant</strong>
              <span>Personal trip planner</span>
            </span>
          </NavLink>

          <div className="header-account">
            <NavLink to="/my-trips" className="header-account-link">My Trips</NavLink>
            {user ? (
              <button type="button" className="header-account-button" onClick={signOut}>Sign out</button>
            ) : (
              <button type="button" className="header-account-button" onClick={requestSignIn}>Sign in</button>
            )}
          </div>

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

          {showCta && (
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
          )}
        </div>

        {showCta && (
          <div id="mobile-menu" className={`mobile-menu${open ? ' is-open' : ''}`}>
            <div className="mobile-account">
              <NavLink to="/my-trips" onClick={() => setOpen(false)}>My Trips</NavLink>
              {user ? (
                <button type="button" onClick={() => { signOut(); setOpen(false) }}>Sign out</button>
              ) : (
                <button type="button" onClick={() => { requestSignIn(); setOpen(false) }}>Sign in</button>
              )}
            </div>
            <button
              type="button"
              ref={firstLinkRef}
              className="mobile-cta"
              onClick={startNewTrip}
            >
              <Icon name="refresh" size={17} />
              Start a new trip
            </button>
          </div>
        )}
      </header>
    </>
  )
}
