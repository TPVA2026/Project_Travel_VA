import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { clearSelectedPlan } from '../services/planSelection.js'
import {
  clearAuthToken,
  getTokenUser,
  setAuthToken,
} from '../services/authSession.js'

const anonymousAuth = {
  user: null,
  requestSignIn: () => window.dispatchEvent(new window.CustomEvent('tpva-auth-required')),
  signOut: () => {},
  authError: null,
  clearAuthError: () => {},
  renderGoogleButton: () => {},
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
  const [authError, setAuthError] = useState(null)
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const googleReadyRef = useRef(false)

  const requestSignIn = useCallback(() => {
    setAuthError(null)
    window.dispatchEvent(new CustomEvent('tpva-auth-required'))
  }, [])

  const clearAuthError = useCallback(() => setAuthError(null), [])

  const signOut = useCallback(() => {
    const current = getTokenUser()
    if (current?.email) window.google?.accounts?.id?.disableAutoSelect?.()
    clearAuthToken()
    clearSelectedPlan()
    setUser(null)
    window.dispatchEvent(new CustomEvent('tpva-auth-changed'))
  }, [])

  const renderGoogleButton = useCallback((container, options = {}) => {
    if (!container) return () => {}
    if (!clientId) {
      setAuthError('Google Sign-In is not configured. Set VITE_GOOGLE_CLIENT_ID.')
      return () => {}
    }
    let cancelled = false
    loadGoogleIdentity().then(() => {
      if (cancelled || !container) return
      if (!googleReadyRef.current) {
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
            setAuthError(null)
            window.dispatchEvent(new CustomEvent('tpva-auth-changed'))
          },
        })
        googleReadyRef.current = true
      }
      container.replaceChildren()
      window.google.accounts.id.renderButton(container, {
        theme: options.theme || 'outline',
        size: options.size || 'large',
        width: options.width || 320,
        shape: options.shape || 'pill',
        text: options.text || 'continue_with',
        logo_alignment: options.logo_alignment || 'left',
      })
    }).catch(() => {
      if (!cancelled) setAuthError('Could not load Google Sign-In. Check your connection.')
    })
    return () => { cancelled = true }
  }, [clientId])

  return (
    <AuthContext.Provider value={{ user, requestSignIn, signOut, authError, clearAuthError, renderGoogleButton }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
