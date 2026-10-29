import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-brand">
          <strong>Site name</strong>
          <p className="muted small">Personalized Travel Planning Virtual Assistant</p>
        </div>

        <div className="footer-columns">
          <div className="footer-col">
            <span className="footer-heading">Topic</span>
            <Link to="/" className="footer-link">Page</Link>
            <Link to="/results" className="footer-link">Page</Link>
          </div>
          <div className="footer-col">
            <span className="footer-heading">Topic</span>
            <Link to="/selected" className="footer-link">Page</Link>
            <span className="footer-link muted">Page</span>
          </div>
          <div className="footer-col">
            <span className="footer-heading">Topic</span>
            <span className="footer-link muted">Page</span>
            <span className="footer-link muted">Page</span>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <p className="muted small">
          Prices and times shown as "Unverified" are not counted as 0.
        </p>
      </div>
    </footer>
  )
}