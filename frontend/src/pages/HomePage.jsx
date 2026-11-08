import { AirplaneIllustration } from '../components/common/Illustrations.jsx'
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
        <div className="home-illustration-pane"><AirplaneIllustration /></div>
      </div>
    </section>
  )
}
