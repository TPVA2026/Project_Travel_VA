import { useState } from 'react'
import { AirplaneIllustration } from '../components/common/Illustrations.jsx'
import TravelForm from '../components/input/TravelForm.jsx'

export default function HomePage() {
  const [inputMode, setInputMode] = useState('form')
  return (
    <section className="home-hero">
      <div className="home-layout">
        <div className="hero-header">
          <h1 className="hero-title">Choose your next destination</h1>
          <p className="hero-subtitle">Few steps to choose more place</p>
        </div>
        <div className="destination-form">
          <div className="input-methods" role="group" aria-label="Input method">
            <button type="button" aria-pressed={inputMode === 'form'} aria-controls="trip-form-panel" onClick={() => setInputMode('form')}>Form</button>
            <button type="button" aria-pressed={inputMode === 'words'} aria-controls="trip-words-panel" onClick={() => setInputMode('words')}>Describe in words</button>
          </div>
          <div id="trip-form-panel" className="input-panel" hidden={inputMode !== 'form'}><TravelForm /></div>
          <div id="trip-words-panel" className="input-panel" hidden={inputMode !== 'words'}>
            <div className="box prompt-box">
              <textarea rows="5" aria-label="Describe your trip in words" aria-describedby="prompt-contract-status" placeholder="e.g. 3 days in the mountains in December, 2 people, 5 million VND" />
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-primary" type="button" disabled aria-describedby="prompt-contract-status" title="Free-text submission is not defined in the current API contract.">Submit</button>
              </div>
              <p className="muted small" id="prompt-contract-status">Placeholder: PromptInput.jsx, connected in TPVA-29.</p>
            </div>
          </div>
        </div>
        <div className="home-illustration-pane"><AirplaneIllustration /></div>
      </div>
    </section>
  )
}
