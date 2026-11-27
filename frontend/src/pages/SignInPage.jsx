import { useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import busImage from './images/image 6.png'

const TRIP_EXAMPLES = [
  {
    title: 'Huế heritage & food',
    meta: '2 days · 10 activities',
    chip: 'Ready',
    chipClass: 'ready',
    color: '#b5562a',
  },
  {
    title: 'Đà Nẵng & Hội An',
    meta: '4 days · 18 activities',
    chip: 'Planning',
    chipClass: 'planning',
    color: '#d98a4f',
  },
  {
    title: 'Sapa in autumn',
    meta: '3 days · 12 activities',
    chip: 'Planning',
    chipClass: 'planning',
    color: '#3b6a8f',
  },
]

export default function SignInPage() {
  const { user, authError, clearAuthError, renderGoogleButton } = useAuth()
  const googleBtnRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from || '/my-trips'

  useEffect(() => {
    if (user) navigate(redirectTo, { replace: true })
  }, [user, navigate, redirectTo])

  useEffect(() => {
    clearAuthError()
    const frameWidth = googleBtnRef.current?.parentElement?.clientWidth || 360
    const buttonWidth = Math.max(280, Math.min(400, frameWidth))
    const cleanup = renderGoogleButton(googleBtnRef.current, {
      width: buttonWidth,
      size: 'large',
      theme: 'outline',
      shape: 'pill',
      text: 'continue_with',
    })
    return cleanup
  }, [clearAuthError, renderGoogleButton])

  return (
    <section className="signin-page" aria-labelledby="signin-title">
      <div className="signin-card">
        <aside className="signin-brand" aria-label="About My Trips">
          <p className="signin-eyebrow">My Trips</p>
          <h2>Sign in to save your favorite itineraries.</h2>
          <p className="signin-lede">
            Sign in with Google to save your itineraries in My Trips. No booking or payment needed.
          </p>

          <section className="signin-trips" aria-label="Example of saved trips">
            <div className="signin-trips-head">
              <span>My Trips</span>
              <span className="signin-synced"><i aria-hidden="true" />Synced</span>
            </div>
            <ul>
              {TRIP_EXAMPLES.map((trip) => (
                <li className="signin-trip" key={trip.title}>
                  <span className="signin-thumb" style={{ background: trip.color }} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </span>
                  <span className="signin-trip-text">
                    <span className="signin-trip-title">{trip.title}</span>
                    <span className="signin-trip-meta">{trip.meta}</span>
                  </span>
                  <span className={`signin-chip ${trip.chipClass}`}>{trip.chip}</span>
                </li>
              ))}
            </ul>
            <hr />
            <p className="signin-trips-foot">Open them on your phone, tablet or laptop.</p>
          </section>

          <img className="signin-brand-visual" src={busImage} alt="" width="260" height="139" loading="lazy" />
        </aside>

        <div className="signin-form" aria-label="Sign in form">
          <div>
            <p className="signin-eyebrow signin-eyebrow-form">Welcome back</p>
            <h1 id="signin-title">Sign in</h1>
            <p className="signin-sub">Continue with your Google account to open My Trips.</p>
          </div>

          {authError && (
            <p className="signin-error" role="alert">{authError}</p>
          )}

          <div className="signin-action">
            <div className="signin-google-frame">
              <div ref={googleBtnRef} className="signin-google-btn" aria-label="Continue with Google" />
            </div>
            <p className="signin-note">A secure Google window will open. We never see your password.</p>
          </div>

          <div className="signin-divider" role="separator"><span>or</span></div>

          <div className="signin-action">
            <Link to="/" className="signin-guest-btn">Continue planning without an account</Link>
            <p className="signin-note">You can still compare plans. Sign in when you want to save to My Trips.</p>
          </div>

          <p className="signin-legal">
            By continuing, you agree to the project&apos;s terms and privacy notice.
          </p>
        </div>
      </div>
    </section>
  )
}
