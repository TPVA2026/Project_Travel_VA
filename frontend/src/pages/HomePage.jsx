import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../components/common/Icon.jsx'
import { TravelSkyIllustration } from '../components/common/Illustrations.jsx'
import FlightIntro from '../components/intro/FlightIntro.jsx'
import { INTRO_STORAGE_KEY } from '../components/intro/introAssets.js'
import DescribeChat from '../components/input/DescribeChat.jsx'
import TravelForm from '../components/input/TravelForm.jsx'

function SwitchMode({ label, onClick }) {
  return (
    <div className="mode-switch">
      <p>Change your mind?</p>
      <button type="button" onClick={onClick}>{label}</button>
    </div>
  )
}

export default function HomePage() {
  const [mode, setMode] = useState('choose')
  const [showIntro, setShowIntro] = useState(false)
  const formPanelRef = useRef(null)
  const describePanelRef = useRef(null)

  useEffect(() => {
    const panel = mode === 'form' ? formPanelRef.current : mode === 'describe' ? describePanelRef.current : null
    if (!panel) return
    const first = panel.querySelector('input:not([type="hidden"]), select, textarea, button')
    first?.focus({ preventScroll: true })
  }, [mode])

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
        <p className="page-eyebrow">Step 1 of 3 · Plan</p>
        <h1 className="plan-title">Tell us the trip. We’ll build the plan.</h1>
        <p className="plan-lead">
          Share your dates, budget, and travel style. Compare verified itineraries, then keep
          the one that fits.
        </p>
        <ul className="plan-facts">
          <li>
            <Icon name="check" size={15} />
            No account needed
          </li>
          <li>
            <Icon name="check" size={15} />
            Saved in this browser
          </li>
          <li>
            <Icon name="check" size={15} />
            Unverified costs excluded
          </li>
        </ul>
      </header>

      <div className="plan-layout">
        <div className="plan-workspace">
          <div className="entry-choice" hidden={mode !== 'choose'}>
            <div className="entry-choice-head">
              <h2>How would you like to start?</h2>
              <p>Use the form for exact details, or describe the trip in your own words.</p>
            </div>
            <div className="entry-choice-actions">
              <button type="button" className="entry-choice-card" onClick={() => setMode('form')}>
                <span className="entry-choice-icon">
                  <Icon name="edit" size={20} />
                </span>
                <strong>Fill in the form</strong>
                <span>Set departure, dates, travelers, and budget.</span>
                <span className="entry-choice-meta">
                  Best for exact dates and costs
                  <Icon name="arrowRight" size={15} />
                </span>
              </button>
              <button type="button" className="entry-choice-card" onClick={() => setMode('describe')}>
                <span className="entry-choice-icon">
                  <Icon name="sparkle" size={20} />
                </span>
                <strong>Describe the trip</strong>
                <span>Answer four short questions in your own words.</span>
                <span className="entry-choice-meta">
                  Best when you are still deciding
                  <Icon name="arrowRight" size={15} />
                </span>
              </button>
            </div>
          </div>

          <div id="trip-form-panel" className="input-panel plan-panel" hidden={mode !== 'form'} ref={formPanelRef}>
            <TravelForm />
            <SwitchMode label="Switch to describing" onClick={() => setMode('describe')} />
          </div>
          <div id="trip-describe-panel" className="input-panel plan-panel" hidden={mode !== 'describe'} ref={describePanelRef}>
            <DescribeChat />
            <SwitchMode label="Switch to the form" onClick={() => setMode('form')} />
          </div>
        </div>

        <aside className="plan-aside" aria-label="Planning help">
          <section className="plan-prep" aria-labelledby="plan-prep-title">
            <div className="plan-prep-sky">
              <TravelSkyIllustration />
            </div>
            <div className="plan-prep-body">
              <p className="preview-kicker">Before you start</p>
              <h2 id="plan-prep-title">Three things make the first draft easier.</h2>
              <ul className="plan-prep-list">
                <li>
                  <Icon name="calendar" size={16} />
                  <span><strong>Pick a rough date range</strong> Even a week or month is enough.</span>
                </li>
                <li>
                  <Icon name="wallet" size={16} />
                  <span><strong>Set a comfortable budget</strong> We flag missing prices instead of guessing.</span>
                </li>
                <li>
                  <Icon name="clock" size={16} />
                  <span><strong>Choose your pace</strong> Slow mornings or full days; change it later.</span>
                </li>
              </ul>
            </div>
          </section>

          <section className="plan-outcomes">
            <h2>What you get</h2>
            <ul>
              <li>
                <Icon name="calendar" size={17} />
                <span><strong>Day-by-day schedule</strong> with travel times between stops.</span>
              </li>
              <li>
                <Icon name="wallet" size={17} />
                <span><strong>Known costs</strong>, with missing prices flagged, not counted as zero.</span>
              </li>
              <li>
                <Icon name="route" size={17} />
                <span><strong>A plan you can revise</strong>, print, or copy.</span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
