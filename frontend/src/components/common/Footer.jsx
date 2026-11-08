import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'

const TRIP_LINKS = [
  { to: '/', label: 'Plan a trip' },
  { to: '/results', label: 'Compare plans' },
  { to: '/selected', label: 'Review your trip' },
]

const NOTES = [
  {
    icon: 'wallet',
    text: 'Costs marked "Unverified" are left out of totals, never counted as zero.',
  },
  {
    icon: 'check',
    text: 'Your trip stays in this browser. No account or sign-in is needed.',
  },
  {
    icon: 'clock',
    text: 'Times and prices are planning estimates, not live bookings.',
  },
]

export default function Footer() {
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  const year = new Date().getFullYear()

  const backToTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <footer className="site-footer no-print">
      <div className={`site-footer-inner${isHome ? ' is-wide' : ''}`}>
        {!isHome && (
          <section className="footer-cta" aria-labelledby="footer-cta-title">
            <div>
              <p className="footer-eyebrow">Ready when you are</p>
              <h2 id="footer-cta-title">Plan the next trip in a few steps.</h2>
              <p>
                Start with your dates and budget, compare the plans that fit, and keep the one
                you like.
              </p>
            </div>
            <Link to="/" className="footer-cta-btn">
              Plan a trip
              <Icon name="arrowRight" size={17} />
            </Link>
          </section>
        )}

        <div className="footer-grid">
          <div className="footer-brand-col">
            <Link to="/" className="site-brand">
              <span className="brand-mark" aria-hidden="true">
                <Icon name="compass" size={18} />
              </span>
              <span className="brand-copy">
                <strong>Travel Assistant</strong>
                <span>Personal trip planner</span>
              </span>
            </Link>
            <p className="footer-about">
              Tell us the trip you want, compare verified itineraries, and keep the one that
              fits.
            </p>
          </div>

          <nav className="footer-col" aria-labelledby="footer-trip-title">
            <h2 id="footer-trip-title">Your trip</h2>
            <div className="footer-nav">
              {TRIP_LINKS.map((link) => (
                <Link key={link.to} to={link.to}>
                  {link.label}
                  <Icon name="arrowRight" size={14} />
                </Link>
              ))}
            </div>
          </nav>

          <section className="footer-col" aria-labelledby="footer-notes-title">
            <h2 id="footer-notes-title">Good to know</h2>
            <ul className="footer-notes">
              {NOTES.map((note) => (
                <li key={note.text}>
                  <Icon name={note.icon} size={16} />
                  <span>{note.text}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="footer-col" aria-labelledby="footer-about-title">
            <h2 id="footer-about-title">About</h2>
            <p className="footer-about">
              Built as a Computational Thinking course project. Itineraries are planning
              suggestions, not live bookings.
            </p>
            <button type="button" className="footer-top-btn" onClick={backToTop}>
              <Icon name="arrowUp" size={16} />
              Back to top
            </button>
          </section>
        </div>

        <div className="footer-bottom">
          <p>© {year} Travel Assistant · Computational Thinking course project</p>
          <p>Prices in VND · Itineraries are suggestions</p>
        </div>
      </div>
    </footer>
  )
}
