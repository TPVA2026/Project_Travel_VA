import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { clearSelectedPlan } from '../services/planSelection.js'
import {
  clearAuthToken,
  getAuthToken,
  getTokenUser,
  setAuthToken,
} from '../services/authSession.js'

const anonymousAuth = {
  user: null,
  requestSignIn: () => window.dispatchEvent(new window.CustomEvent('tpva-auth-required')),
  signOut: () => {},
}
const AuthContext = createContext(anonymousAuth)
const GOOGLE_SCRIPT_ID = 'google-identity-services'

function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID)
    if (existing) {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', reject, { once: true })
      return
    }
    const script = document.createElement('script')
    script.id = GOOGLE_SCRIPT_ID
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getTokenUser())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [authError, setAuthError] = useState(null)
  const buttonRef = useRef(null)
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  const requestSignIn = useCallback(() => {
    setAuthError(null)
    setDialogOpen(true)
  }, [])

  const signOut = useCallback(() => {
    const current = getTokenUser()
    if (current?.email) window.google?.accounts?.id?.disableAutoSelect?.()
    clearAuthToken()
    clearSelectedPlan()
    setUser(null)
    window.dispatchEvent(new CustomEvent('tpva-auth-changed'))
  }, [])

  useEffect(() => {
    const open = () => requestSignIn()
    window.addEventListener('tpva-auth-required', open)
    return () => window.removeEventListener('tpva-auth-required', open)
  }, [requestSignIn])

  useEffect(() => {
    if (!dialogOpen || !buttonRef.current) return
    if (!clientId) {
      setAuthError('Google Sign-In is not configured. Set VITE_GOOGLE_CLIENT_ID.')
      return
    }
    let cancelled = false
    loadGoogleIdentity().then(() => {
      if (cancelled || !buttonRef.current) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => {
          if (!credential) {
            setAuthError('Google did not return a sign-in credential.')
            return
          }
          setAuthToken(credential)
          clearSelectedPlan()
          setUser(getTokenUser(credential))
          setDialogOpen(false)
          window.dispatchEvent(new CustomEvent('tpva-auth-changed'))
        },
      })
      buttonRef.current.replaceChildren()
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 280,
      })
    }).catch(() => setAuthError('Could not load Google Sign-In. Check your connection.'))
    return () => { cancelled = true }
  }, [clientId, dialogOpen])

  return (
    <AuthContext.Provider value={{ user, requestSignIn, signOut }}>
      {children}
      {dialogOpen && (
        <div className="auth-dialog-backdrop" role="presentation" onMouseDown={() => setDialogOpen(false)}>
          <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="auth-dialog-close" type="button" onClick={() => setDialogOpen(false)} aria-label="Close">×</button>
            <p className="page-eyebrow">Travel VA account</p>
            <h2 id="auth-title">Sign in to save your trips</h2>
            <p className="muted">Your current itinerary will stay open. Sign in, then choose it again to save it to My Trips.</p>
            <div ref={buttonRef} className="google-signin-button" />
            {authError && <p className="field-error-text" role="alert">{authError}</p>}
          </section>
        </div>
      )}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
