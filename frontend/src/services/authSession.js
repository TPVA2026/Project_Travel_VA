const TOKEN_KEY = 'tpva-google-id-token'

function decodeClaims(token) {
  try {
    const encoded = token.split('.')[1]
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(normalized))
  } catch {
    return null
  }
}

export function getAuthToken() {
  const token = sessionStorage.getItem(TOKEN_KEY)
  if (!token) return null
  const claims = decodeClaims(token)
  if (!claims?.sub || !claims.exp || claims.exp * 1000 <= Date.now()) {
    sessionStorage.removeItem(TOKEN_KEY)
    return null
  }
  return token
}

export function getTokenUser(token = getAuthToken()) {
  const claims = token ? decodeClaims(token) : null
  if (!claims?.sub) return null
  return {
    id: claims.sub,
    name: claims.name || claims.email || 'Google user',
    email: claims.email || '',
    picture: claims.picture || '',
  }
}

export function setAuthToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearAuthToken() {
  sessionStorage.removeItem(TOKEN_KEY)
}
