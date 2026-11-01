import { AirplaneIllustration, BusIllustration } from '../components/common/Illustrations.jsx'
import TravelForm from '../components/input/TravelForm.jsx'

export default function HomePage() {
  return (
    <section className="home-hero">
      <div className="home-layout">
        <div className="hero-header">
          <h1 className="hero-title">Choose your next destination</h1>
          <p className="hero-subtitle">Few steps to choose more place</p>
        </div>

        <div className="destination-form">
          <TravelForm />
        </div>

        <div className="home-illustration-pane">
          <AirplaneIllustration />
        </div>
      </div>

      <div className="home-bottom-bus">
        <BusIllustration />
      </div>

      <details className="box prompt-box">
        <summary>Or describe your trip in words</summary>
        <textarea
          rows="3"
          placeholder="e.g. 3 days in the mountains in December, 2 people, 5 million VND"
        />
        <p className="muted small">Placeholder: PromptInput.jsx, connected in TPVA-29.</p>
      </details>
    </section>
  )
}