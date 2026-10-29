import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MOCK_PLANS, fmtMoney, knownTotal } from '../services/mockData.js'

export default function SelectedPlanPage() {
  const [params] = useSearchParams()
  const [chosen, setChosen] = useState(false)
  const plan = MOCK_PLANS.find((p) => p.id === params.get('id')) ?? MOCK_PLANS[0]
  const { total, missing } = knownTotal(plan)

  return (
    <section className="selected">
      <div className="selected-left">
        <div className="img-wrap">
          <img src={plan.image} alt={plan.destination}
            onError={(e) => { e.currentTarget.style.display = 'none' }} />
        </div>
        <h2>{plan.destination}</h2>
        <div className={`badge badge-${plan.status}`}>{plan.status}</div>
        <h4>Reasons:</h4>
        <ul>{plan.fit.map((r) => <li key={r}>{r}</li>)}</ul>

        {plan.status === 'INFEASIBLE' && (
          <p className="field-error">Cannot be chosen: {plan.failReason}</p>
        )}
        {plan.status === 'UNVERIFIED' && (
          <p className="unverified">Unverified: {plan.missing.join(', ')}</p>
        )}

        <button className="btn btn-primary"
          disabled={plan.status === 'INFEASIBLE'}
          onClick={() => setChosen(true)}>
          Choose this plan
        </button>
        {chosen && <p className="ok">This plan is selected.</p>}
      </div>

      <div className="selected-right">
        <div className="timeline">
          {plan.days.map((d) => (
            <div key={d.day}>
              <div className="tl-day">Day {d.day}</div>
              {d.activities.map((a, i) => (
                <div key={i}>
                  {i > 0 && (
                    <div className="tl-leg">
                      🚌 {a.travelMin == null ? 'Unverified' : `${a.travelMin} min`}
                    </div>
                  )}
                  <div className="tl-item">
                    {a.start}–{a.end} · {a.name} ({a.type}) ·{' '}
                    <span className={a.cost == null ? 'unverified' : ''}>{fmtMoney(a.cost)}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="total-box">TOTAL: {total.toLocaleString('en-US')} VND</div>
        {missing.length > 0 && (
          <p className="muted small">Known costs only. Unverified: {missing.join(', ')}</p>
        )}
      </div>

      <details className="box selected-wide">
        <summary>Request a change</summary>
        <p className="muted small">Placeholder: RevisionForm (TPVA-31).</p>
      </details>
    </section>
  )
}