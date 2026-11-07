import { useState } from 'react'
import { AirplaneIllustration } from '../components/common/Illustrations.jsx'
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
  return (
    <section className="home-hero">
      <div className="home-layout">
        <div className="hero-header">
          <h1 className="hero-title">Choose your next destination</h1>
          <p className="hero-subtitle">Few steps to choose more place</p>
        </div>
        <div className="destination-form">
          <div className="entry-choice" hidden={mode !== 'choose'}>
            <h2>Do you want to fill in the form, or are you not sure where to go?</h2>
            <div className="entry-choice-actions">
              <button type="button" className="entry-choice-card" onClick={() => setMode('form')}>
                <strong>Fill in the form</strong>
                <span>Departure, dates, travelers, and budget</span>
              </button>
              <button type="button" className="entry-choice-card" onClick={() => setMode('describe')}>
                <strong>I'm not sure where to go</strong>
                <span>Tell us a few things so we can understand the trip</span>
              </button>
            </div>
          </div>
          <div id="trip-form-panel" className="input-panel" hidden={mode !== 'form'}>
            <TravelForm />
            <SwitchMode label="Switch to describing" onClick={() => setMode('describe')} />
          </div>
          <div id="trip-describe-panel" className="input-panel" hidden={mode !== 'describe'}>
            <DescribeChat />
            <SwitchMode label="Switch to the form" onClick={() => setMode('form')} />
          </div>
        </div>
        <div className="home-illustration-pane"><AirplaneIllustration /></div>
      </div>
    </section>
  )
}
