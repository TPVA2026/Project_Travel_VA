import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { fetchMyTrips } from '../services/api.js'
import Loading from '../components/common/Loading.jsx'
import ErrorMessage from '../components/common/ErrorMessage.jsx'
import { resetCurrentTrip } from '../services/planSelection.js'

function formatSavedAt(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export default function MyTripsPage() {
  const navigate = useNavigate()
  const { user, requestSignIn } = useAuth()
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(Boolean(user))
  const [error, setError] = useState(null)

  const loadTrips = useCallback(async () => {
    if (!user) {
      setTrips([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setTrips(await fetchMyTrips())
    } catch (err) {
      setTrips([])
      setError(err?.message || 'Could not load your saved trips.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { loadTrips() }, [loadTrips])

  const startNewTrip = () => {
    resetCurrentTrip()
    navigate('/')
  }

  if (!user) {
    return (
      <section className="my-trips-page empty-chosen-view">
        <p className="page-eyebrow">My Trips</p>
        <h1>Your saved itineraries</h1>
        <p className="muted">Sign in to see trips saved to your account.</p>
        <button type="button" className="btn btn-primary" onClick={requestSignIn}>Sign in with Google</button>
      </section>
    )
  }

  return (
    <section className="my-trips-page">
      <header className="results-head">
        <div>
          <p className="page-eyebrow">My Trips</p>
          <h1>Welcome back, {user.name}</h1>
          <p className="muted">Open a saved itinerary without generating it again.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={startNewTrip}>Start a new trip</button>
      </header>
      {loading && <Loading message="Loading your saved trips…" />}
      {!loading && error && <ErrorMessage title="Could not load My Trips" message={error} onRetry={loadTrips} />}
      {!loading && !error && trips.length === 0 && (
        <div className="empty-chosen-view">
          <h2>No saved trips yet</h2>
          <p className="muted">Plan a trip, choose an itinerary, then save it here.</p>
          <button type="button" className="btn btn-primary" onClick={startNewTrip}>Plan your first trip</button>
        </div>
      )}
      {!loading && !error && trips.length > 0 && (
        <div className="my-trips-grid" aria-label="Saved trips">
          {trips.map((trip) => (
            <article className="card my-trip-card" key={trip.id}>
              <p className="page-eyebrow">{trip.destination || 'Saved itinerary'}</p>
              <h2>{trip.title}</h2>
              <p className="muted small">Updated {formatSavedAt(trip.updatedAt)}</p>
              <Link className="btn btn-primary" to={`/selected?trip=${encodeURIComponent(trip.id)}`}>Open trip</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
