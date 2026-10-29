import { Link } from 'react-router-dom'
import { MOCK_PLANS } from '../services/mockData.js'

export default function ResultsPage() {
  const plans = MOCK_PLANS.slice(0, 3)

  return (
    <section>
      <h2>Related results</h2>
      <div className="cards">
        {plans.map((p, i) => (
          <article key={p.id} className="card">
            <div className="img-wrap">
              <img src={p.image} alt={p.destination}
                onError={(e) => { e.currentTarget.style.display = 'none' }} />
            </div>
            <h3>Destination {i + 1}: {p.destination}</h3>
            <div className={`badge badge-${p.status}`}>{p.status}</div>
            {p.status === 'INFEASIBLE' ? (
              <p>Fail: {p.failReason}</p>
            ) : (
              <>
                <p>Fit: {p.fit.join(', ') || '-'}</p>
                <p>Not fit: {p.notFit.join(', ') || '-'}</p>
                {p.missing.length > 0 && (
                  <p className="unverified">Unverified: {p.missing.join(', ')}</p>
                )}
              </>
            )}
            <Link className="btn" to={`/selected?id=${p.id}`}>View plan</Link>
          </article>
        ))}
      </div>
      <p className="muted small">Placeholder: PlanComparison table (TPVA-30).</p>
    </section>
  )
}