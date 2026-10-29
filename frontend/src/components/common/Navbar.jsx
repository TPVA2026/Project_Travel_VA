import { NavLink, useNavigate } from 'react-router-dom'

export default function Navbar() {
  const navigate = useNavigate()
  const cls = ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')

  return (
    <header className="navbar">
      <div className="brand">Your travel personal virtual assistant</div>
      <nav className="nav-links" aria-label="Main">
        <NavLink to="/" end className={cls}>Input</NavLink>
        <NavLink to="/results" className={cls}>Results</NavLink>
        <NavLink to="/selected" className={cls}>Selected</NavLink>
        <button className="btn btn-dark" onClick={() => navigate('/')}>New plan</button>
      </nav>
    </header>
  )
}