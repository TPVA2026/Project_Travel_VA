import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../components/common/Icon.jsx'
import FlightIntro from '../components/intro/FlightIntro.jsx'
import { INTRO_STORAGE_KEY } from '../components/intro/introAssets.js'
import TravelForm from '../components/input/TravelForm.jsx'
import TripProgress from '../components/TripProgress.jsx'

export default function HomePage() {
  const [showIntro, setShowIntro] = useState(false)
  const formPanelRef = useRef(null)

  useEffect(() => {
    if (showIntro) return
    const first = formPanelRef.current?.querySelector('.request-step:not([hidden]) [data-step-focus]:not([disabled])')
    first?.focus({ preventScroll: true })
  }, [showIntro])

  useEffect(() => {
    let shouldPlay = false
    try {
      shouldPlay = sessionStorage.getItem(INTRO_STORAGE_KEY) === '1'
      if (shouldPlay) sessionStorage.removeItem(INTRO_STORAGE_KEY)
    } catch {}
    if (!shouldPlay) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduce) return
    setShowIntro(true)
  }, [])

  useEffect(() => {
    if (!showIntro) return undefined
    document.body.classList.add('intro-playing')
    return () => {
      document.body.classList.remove('intro-playing')
      document.body.classList.remove('intro-flying')
    }
  }, [showIntro])

  const finishIntro = useCallback(() => {
    document.body.classList.remove('intro-playing')
    document.body.classList.remove('intro-flying')
    setShowIntro(false)
  }, [])

  return (
    <div className="plan-page">
      {showIntro && <FlightIntro onDone={finishIntro} />}
      <header className="plan-intro">
        <p className="page-eyebrow">Plan a trip</p>
        <h1 className="plan-title">Tell us the trip. We’ll build the plan.</h1>
        <p className="plan-lead">
          Share your dates, budget, and travel style. Compare verified itineraries, then keep
          the one that fits.
        </p>
      </header>

      <div className="plan-layout">
        <aside className="plan-aside" aria-label="Planning help">
          <TripProgress currentStep={1} variant="sidebar" />

          <section className="plan-prep" aria-labelledby="plan-prep-title">
            <div className="plan-prep-body">
              <p className="preview-kicker">Before you start</p>
              <h2 id="plan-prep-title">Three quick basics</h2>
              <ul className="plan-prep-list">
                <li>
                  <Icon name="calendar" size={16} />
                  <span>Pick dates (1 to 3 days)</span>
                </li>
                <li>
                  <Icon name="wallet" size={16} />
                  <span>Set a budget in VND</span>
                </li>
                <li>
                  <Icon name="clock" size={16} />
                  <span>Pick your travel style</span>
                </li>
              </ul>
            </div>
          </section>

          <section className="plan-outcomes">
            <h2>What you get</h2>
            <ul>
              <li>
                <Icon name="calendar" size={16} />
                <span>Day-by-day route &amp; timings</span>
              </li>
              <li>
                <Icon name="wallet" size={16} />
                <span>Verified costs, no guessing</span>
              </li>
              <li>
                <Icon name="route" size={16} />
                <span>Save, print, or copy</span>
              </li>
            </ul>
          </section>
        </aside>

        <div className="plan-workspace">
          <div id="trip-form-panel" className="input-panel plan-panel" ref={formPanelRef}>
            <TravelForm />
          </div>
        </div>
      </div>
    </div>
  )
}
